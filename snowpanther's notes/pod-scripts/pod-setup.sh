#!/bin/bash
# Unattended TabbyAPI bring-up on a fresh RunPod pod. Run it once, walk away, read a log file.
#
# The point is that you never sit in an interactive SSH session. This backgrounds itself immediately, so
# the command you ran returns in about a second, and everything after that is written to a plain log you
# can read a screenful at a time:
#
#   RP_HOST=... ./rp.sh 'cat /workspace/pod-status'          # one word: RUNNING / READY / FAILED
#   RP_HOST=... ./rp.sh 'tail -30 /workspace/pod-setup.log'  # what it is doing now
#
# Every progress bar is turned off deliberately. pip and hf both redraw them hundreds of times a second
# with carriage returns, which fills a log with unreadable noise and makes a screen reader unusable.
#
# Install it and start it (from your own machine, via rp.sh):
#   RP_HOST=... ./rp.sh 'curl -sL <raw-url-of-this-file> -o /root/pod-setup.sh && bash /root/pod-setup.sh MikeRoz/Behemoth-128B-v3-4.25bpw-h6-exl3'
# or paste it in with a heredoc if you would rather not fetch it.
#
# STATUS: written 2026-08-23, NOT yet run end to end on a pod. The individual steps are each verified —
# the install from 15.8, the peer-to-peer expectation from 15.9, the config from the working pod — but
# this script as a whole has not been executed. Treat the first run as the test.

set -uo pipefail

MODEL_REPO="${1:-}"
REVISION="${2:-}"   # branch, for the repos that put each bpw on its own branch (15.0)
WORK="${WORK:-/workspace}"
[ -d "$WORK" ] || WORK=/root
LOG="$WORK/pod-setup.log"
STATUS="$WORK/pod-status"
MODELS="${MODELS:-/root/models}"   # container disk: local NVMe, and far faster to load from than the
                                   # network volume. The model is re-downloadable in minutes; see 15.10.

# --- re-exec into the background so the SSH call that started this returns at once ----------------
if [ "${POD_SETUP_CHILD:-0}" != "1" ]; then
  [ -n "$MODEL_REPO" ] || { echo "usage: pod-setup.sh <hf-repo-id> [branch]   # branch only for repos that put each bpw on its own"; exit 2; }
  echo "RUNNING" > "$STATUS"
  POD_SETUP_CHILD=1 nohup bash "$0" "$MODEL_REPO" "$REVISION" >"$LOG" 2>&1 &
  echo "started; watch $LOG, status in $STATUS"
  exit 0
fi

fail() { echo "FAILED: $*"; echo "FAILED" > "$STATUS"; exit 1; }
step() { echo; echo "=== $* ==="; }

export HF_HUB_DISABLE_PROGRESS_BARS=1     # the whole reason this log stays readable
export HF_HUB_ENABLE_HF_TRANSFER=1        # and the reason 70GB lands in minutes
export PIP_PROGRESS_BAR=off
export PIP_DISABLE_PIP_VERSION_CHECK=1

step "GPUs"
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader || fail "no nvidia-smi"

# --- peer-to-peer, before anything large is downloaded (15.9) -------------------------------------
step "Peer-to-peer copy test"
P2P=$(python3 - <<'PY' 2>&1
import torch
if torch.cuda.device_count() < 2:
    print("SINGLE"); raise SystemExit
a = torch.arange(1000, dtype=torch.float32, device="cuda:0")
direct = a.to("cuda:1"); torch.cuda.synchronize()
staged = a.cpu().to("cuda:1"); torch.cuda.synchronize()
print("OK" if torch.equal(direct.cpu(), staged.cpu()) else "BROKEN")
PY
)
echo "peer-to-peer: $P2P"
case "$P2P" in
  BROKEN) echo "  -> expected on a rented pod (2 of 2 so far). Using tensor parallel + NCCL_P2P_DISABLE=1." ;;
  OK)     echo "  -> healthy. Tensor parallel still used; it is faster than a layer split either way." ;;
  SINGLE) echo "  -> one GPU, nothing to test." ;;
  *)      echo "  -> test did not report cleanly; continuing with the safe configuration." ;;
esac

# --- install (15.8) -------------------------------------------------------------------------------
step "Installing TabbyAPI"
[ -d /root/tabbyAPI ] || git clone --depth 1 https://github.com/theroyallab/tabbyAPI /root/tabbyAPI \
  || fail "clone failed"
cd /root/tabbyAPI || fail "no /root/tabbyAPI"
pip install -e ".[cu12]" -q || fail "pip install failed"
python3 -c "import exllamav3, torch; print('exllamav3 imported; torch', torch.__version__)" \
  || fail "exllamav3 will not import"

# --- model ----------------------------------------------------------------------------------------
step "Downloading $MODEL_REPO${REVISION:+ (branch $REVISION)}"
mkdir -p "$MODELS"
NAME="$(basename "$MODEL_REPO")${REVISION:+-$REVISION}"
hf download "$MODEL_REPO" ${REVISION:+--revision "$REVISION"} --local-dir "$MODELS/$NAME"   || fail "download failed"
# A branch-based repo's main holds only the measurement and config; without --revision you get no
# weights and a config.json that looks fine. Check for the tensors, not just the config (15.0).
[ -f "$MODELS/$NAME/config.json" ] || fail "no config.json in $MODELS/$NAME — wrong repo layout, see 15.0"
ls "$MODELS/$NAME"/*.safetensors >/dev/null 2>&1   || fail "no .safetensors in $MODELS/$NAME — this repo probably keeps each quant on its own branch; pass one (15.0)"
du -sh "$MODELS/$NAME"

# --- config (verified shape, 15.8) -----------------------------------------------------------------
step "Writing config.yml"
cat > /root/tabbyAPI/config.yml <<YAML
network:
  host: 127.0.0.1          # deliberate: reachable only down an SSH tunnel (15.3a), so there is no
  port: 5000               # public listener for the 15.4 /invocations gap to apply to
model:
  model_dir: $MODELS
  model_name: $NAME
  max_seq_len: 32768
  cache_size: 32768
  cache_mode: Q8
  tensor_parallel: true
  tensor_parallel_backend: nccl
  gpu_split_auto: true
  autosplit_reserve: [96]
  chunk_size: 2048
YAML
cat /root/tabbyAPI/config.yml

# --- run -------------------------------------------------------------------------------------------
step "Starting TabbyAPI"
cd /root/tabbyAPI || fail "no /root/tabbyAPI"
NCCL_P2P_DISABLE=1 nohup python3 main.py > "$WORK/tabby.log" 2>&1 &
echo "server starting; its own log is $WORK/tabby.log"

for i in $(seq 1 120); do
  if curl -sf -o /dev/null http://127.0.0.1:5000/health; then
    echo "READY" > "$STATUS"
    step "READY"
    echo "Tunnel from your own machine, then point the preset at http://localhost:5000 :"
    echo "  ssh -N -L 5000:127.0.0.1:5000 root@\$POD_IP -p \$POD_SSH_PORT -i ~/.ssh/id_ed25519"
    exit 0
  fi
  sleep 5
done
fail "server did not answer /health within 10 minutes — read $WORK/tabby.log"
