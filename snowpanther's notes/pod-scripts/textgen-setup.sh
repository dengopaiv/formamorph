#!/bin/bash
# Unattended text-generation-webui bring-up on a fresh RunPod pod, serving an EXL3 quant through its
# OpenAI-compatible API. The sibling of pod-setup.sh, which does the same job with TabbyAPI.
#
# Same shape as pod-setup.sh, for the same reason: you never sit in an interactive SSH session. It
# backgrounds itself immediately, so the command that started it returns in about a second, and
# everything after that is a plain log you read a screenful at a time:
#
#   RP_HOST=... ./rp.sh 'cat /workspace/pod-status'           # one word: RUNNING / READY / FAILED
#   RP_HOST=... ./rp.sh 'tail -30 /workspace/textgen-setup.log'
#
# Progress bars are turned off deliberately. pip and hf redraw them hundreds of times a second with
# carriage returns, which fills a log with noise no screen reader can read.
#
# Install and start it (from your own machine, via rp.sh):
#   RP_HOST=... ./rp.sh 'curl -sL <raw-url-pinned-to-a-sha> -o /root/textgen-setup.sh && bash /root/textgen-setup.sh turboderp/Llama-3.2-1B-Instruct-exl3 4.0bpw'
#
# STATUS: **UNVERIFIED — written from documentation, never run on a pod.** Prefer pod-setup.sh, which is
# verified end to end, unless you specifically need this engine. Two things in here are the reason it is
# marked unverified, and both are one `--help` away on a live pod:
#
#   1. `--enable_tp` is documented as "Enable Tensor Parallelism (TP) in ExLlamaV2". Whether it reaches
#      the ExLlamaV3 loader in the version that installs is not established. If it does not, this serves
#      the model on a layer split across the two cards instead — correct output, less throughput.
#   2. The loader name. `--loader exllamav3` is the expected spelling; older docs list only
#      `ExLlamav2`/`ExLlamav2_HF`. Check `python server.py --help` and read the printed loader list.
#
# One more, and it is the security-relevant one: **text-generation-webui's API binds broadly by default**
# and has no documented loopback-only flag. TabbyAPI defaults to 127.0.0.1 and this does not, so the
# containment here is the pod template rather than the config — do not map the API port on RunPod, and
# reach it only down an SSH tunnel (endpoint notes 15.3a). An unmapped port is not reachable from outside
# the pod whatever it binds to.

set -uo pipefail

MODEL_REPO="${1:-}"
REVISION="${2:-}"   # branch, for the repos that put each bpw on its own branch (15.0)
WORK="${WORK:-/workspace}"
[ -d "$WORK" ] || WORK=/root
LOG="$WORK/textgen-setup.log"
STATUS="$WORK/pod-status"
MODELS="${MODELS:-/root/models}"   # container disk: local NVMe, and far faster to load from than the
                                   # network volume. The model is re-downloadable in minutes; see 15.10.
API_PORT="${API_PORT:-5000}"
CTX="${CTX:-32768}"
CACHE="${CACHE:-q8}"               # textgen spells these lowercase: fp16, fp8, q8, q6, q4

# --- re-exec into the background so the SSH call that started this returns at once ----------------
if [ "${TEXTGEN_SETUP_CHILD:-0}" != "1" ]; then
  [ -n "$MODEL_REPO" ] || { echo "usage: textgen-setup.sh <hf-repo-id> [branch]   # branch only for repos that put each bpw on its own"; exit 2; }
  echo "RUNNING" > "$STATUS"
  TEXTGEN_SETUP_CHILD=1 nohup bash "$0" "$MODEL_REPO" "$REVISION" >"$LOG" 2>&1 &
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
# Same test, same size, same reasoning as pod-setup.sh: 1,000,000 elements. A 4 KB copy passes on a pod
# whose 4 MB copies come back all zeros, and 100 KB returns *partially* corrupt data — the shape least
# likely to be noticed. A small buffer is a false-negative generator, not a quick version of this test.
step "Peer-to-peer copy test"
P2P=$(python3 - <<'PY' 2>&1
import torch
if torch.cuda.device_count() < 2:
    print("SINGLE"); raise SystemExit
n = 1000000
a = torch.arange(n, dtype=torch.float32, device="cuda:0")
direct = a.to("cuda:1"); torch.cuda.synchronize()
staged = a.cpu().to("cuda:1"); torch.cuda.synchronize()
if torch.equal(direct.cpu(), staged.cpu()):
    print("OK")
else:
    print("BROKEN zeros=%d/%d" % (int((direct == 0).sum().item()), n))
PY
)
echo "peer-to-peer: $P2P"
NCCL_FLAG=0
case "$P2P" in
  BROKEN*) echo "  -> expected on a rented pod (3 of 3 so far). Setting NCCL_P2P_DISABLE=1, which is what" ;
           echo "     made a model on cards in exactly this state produce correct output under TabbyAPI." ;
           NCCL_FLAG=1 ;;
  OK)      echo "  -> healthy. Leaving peer-to-peer enabled." ;;
  SINGLE)  echo "  -> one GPU. Tensor parallelism is not applicable; ignore --enable_tp below." ;;
  *)       echo "  -> test did not report cleanly; taking the safe configuration." ; NCCL_FLAG=1 ;;
esac

# --- install --------------------------------------------------------------------------------------
# The one-click installer is used deliberately rather than pip-into-the-image. It builds its own
# environment under installer_files/, which is the same reason pod-setup.sh installs TabbyAPI into a
# venv: installing over the image's Python pulls a torch newer than the image is pinned at, and the
# mismatched torchao then kills `import exllamav3` with a std::bad_alloc that says nothing about memory.
#
# GPU_CHOICE=A is "NVIDIA". LAUNCH_AFTER_INSTALL=FALSE stops it from starting a server we are about to
# start ourselves with our own flags. Both are read by one_click.py; a version that ignores them will
# instead sit at a prompt, which shows up here as a setup that never leaves RUNNING.
step "Installing text-generation-webui"
export GPU_CHOICE=A
export LAUNCH_AFTER_INSTALL=FALSE
export INSTALL_EXTENSIONS=FALSE
[ -d /root/text-generation-webui ] || git clone --depth 1 https://github.com/oobabooga/text-generation-webui /root/text-generation-webui \
  || fail "clone failed"
cd /root/text-generation-webui || fail "no /root/text-generation-webui"
chmod +x start_linux.sh
timeout 3600 ./start_linux.sh || fail "installer failed or timed out — read $LOG"

# The env it just built. Everything after this must run through it, not through the image's python.
PY_BIN=/root/text-generation-webui/installer_files/env/bin/python
[ -x "$PY_BIN" ] || fail "no interpreter at $PY_BIN — the installer put its environment somewhere else; find it before continuing"
"$PY_BIN" -c "import exllamav3, torch; print('exllamav3 imported; torch', torch.__version__)" \
  || fail "exllamav3 will not import in the installer's environment — this build may not carry the EXL3 backend"

# --- model ----------------------------------------------------------------------------------------
step "Downloading $MODEL_REPO${REVISION:+ (branch $REVISION)}"
mkdir -p "$MODELS"
NAME="$(basename "$MODEL_REPO")${REVISION:+-$REVISION}"
"$PY_BIN" -m huggingface_hub.commands.huggingface_cli download "$MODEL_REPO" \
  ${REVISION:+--revision "$REVISION"} --local-dir "$MODELS/$NAME" \
  || fail "download failed"
# A branch-based repo's main holds only the measurement and config; without --revision you get no
# weights and a config.json that looks fine. Check for the tensors, not just the config (15.0).
[ -f "$MODELS/$NAME/config.json" ] || fail "no config.json in $MODELS/$NAME — wrong repo layout, see 15.0"
ls "$MODELS/$NAME"/*.safetensors >/dev/null 2>&1 \
  || fail "no .safetensors in $MODELS/$NAME — this repo probably keeps each quant on its own branch; pass one (15.0)"
du -sh "$MODELS/$NAME"

# --- key ------------------------------------------------------------------------------------------
# Unlike TabbyAPI, textgen generates nothing: with no --api-key the API is open to anything that can
# reach it. Make one, write it where it can be read back, and print it, because the preset needs it.
step "API key"
KEYFILE="$WORK/textgen-api-key"
[ -s "$KEYFILE" ] || head -c 24 /dev/urandom | base64 | tr -d '/+=' > "$KEYFILE"
API_KEY="$(cat "$KEYFILE")"
echo "key written to $KEYFILE"

# --- run -------------------------------------------------------------------------------------------
# --nowebui: no Gradio. Nothing here needs a UI, and the UI is the part that wants a browser and a port.
# --enable_tp: see the STATUS note at the top. If the loader ignores it, this still serves correctly on
#              an automatic layer split — slower, not broken.
step "Starting the server"
cd /root/text-generation-webui || fail "no /root/text-generation-webui"
[ "$NCCL_FLAG" = "1" ] && export NCCL_P2P_DISABLE=1
nohup "$PY_BIN" server.py \
  --model "$NAME" \
  --model-dir "$MODELS" \
  --loader exllamav3 \
  --max_seq_len "$CTX" \
  --cache_type "$CACHE" \
  --enable_tp \
  --api \
  --api-port "$API_PORT" \
  --api-key "$API_KEY" \
  --nowebui \
  > "$WORK/textgen.log" 2>&1 &
echo "server starting; its own log is $WORK/textgen.log"

for i in $(seq 1 120); do
  if curl -sf -o /dev/null -H "Authorization: Bearer $API_KEY" "http://127.0.0.1:$API_PORT/v1/models"; then
    echo "READY" > "$STATUS"
    step "READY"
    echo "API key for the Formamorph preset:"
    echo "  $API_KEY"
    echo "Tunnel from your own machine, then point the preset at http://localhost:$API_PORT :"
    echo "  ssh -N -L $API_PORT:127.0.0.1:$API_PORT root@\$POD_IP -p \$POD_SSH_PORT -i ~/.ssh/id_ed25519"
    exit 0
  fi
  sleep 5
done
fail "server did not answer /v1/models within 10 minutes — read $WORK/textgen.log"
