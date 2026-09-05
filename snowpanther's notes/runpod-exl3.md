# Running an EXL3 model on RunPod — TabbyAPI or text-generation-webui

A walkthrough from an empty RunPod account to a Formamorph preset that works, for the case where the
model you want is too big for the card you own. It reads top to bottom and assumes nothing.

The long-form reasoning behind most of these choices is in `FORMAMORPH-ENDPOINT-NOTES.md` — section
numbers like **§15.9** below point there. This file is the procedure; that file is the argument.

**The two scripts live beside this one**, in `pod-scripts/`:

| | |
|---|---|
| `rp.sh` | run one command on the pod, get clean text back, never open a session |
| `pod-setup.sh` | bring up **TabbyAPI** unattended — **verified end to end** |
| `textgen-setup.sh` | bring up **text-generation-webui** unattended — **written from docs, never run** |

---

## 0. What this gets you, and what it costs

Two rented A40s (48 GB each, 96 GB total) hold a ~125B-parameter roleplay finetune at 4.25 bits per
weight with a 32k context, and serve it to Formamorph over an encrypted tunnel at roughly **12 tokens
per second**. That is a measured figure, not an estimate (§15.8) — and a pessimistic one, because the
pod it was measured on had broken GPU-to-GPU transfers (§15.9).

Twelve tokens a second is readable-aloud speed, not typing speed. A 300-token reply takes about
twenty-five seconds. Whether that is acceptable is the actual decision here; everything else is
mechanics.

The cost is per-second while the pod exists, whether or not it is generating. **A pod you forgot to
stop is the only way this gets expensive.**

### Why EXL3 rather than GGUF

Two reasons, and only one of them is about quality.

- **Tensor parallelism.** Both engines here split a model across two cards and use them *together*.
  llama.cpp splits by layer, which means one card computes while the other waits. On two cards the
  difference is throughput you have already paid for.
- **Quality per bit**, which is real but **concentrated at low bit-rates**. EXL3 is trellis-encoded
  (QTIP-derived) and beats GGUF K-quants clearly at 2–3 bpw. At the 4–6 bpw you can afford on 96 GB
  the gap narrows a lot. Pick this path for the parallelism and for which quants exist, not for an
  expected jump in prose.

### Why not the obvious thing

Three shortcuts that look right and are not:

- **Do not expose the inference port over RunPod's HTTP proxy.** It buffers server-sent events, which
  turns streaming into one lump arriving at the end (§15.3, reproduced against a local koboldcpp).
- **Do not expose it over a bare TCP port either.** What this app sends an endpoint is the world, the
  characters, the scene, and the reply — over plain `http://` across the open internet all of it is
  readable at every hop, along with the API token in the header. Formamorph now warns about exactly
  this in the Endpoint URL field.
- **Do not build from an old TabbyAPI RunPod template.** ExLlamaV2 was removed from TabbyAPI's main
  branch; every third-party template from that era is on the far side of that break, and bumping its
  CUDA tag gives you a newer CUDA running a dead backend (§15.10).

The answer to all three is the same: **expose SSH and nothing else, and tunnel the API port.**

---

## 1. First decide: does an EXL3 quant of your model exist?

This is the gate. Everything downstream assumes the answer is yes.

Search Hugging Face for `<model name> exl3`. For the RP finetune line, **ArtusDev** publishes EXL3
quants of TheDrummer's current Behemoth releases, and **turboderp** publishes small ones useful as
controls.

**The trap is the repository layout.** Some publishers put every bit-rate on its own **git branch**, and
`main` holds only a `config.json` and the measurement file. Clone that without `--revision` and you get
a directory that looks complete, loads nothing, and gives you an error about missing tensors twenty
minutes into a session.

```bash
# wrong — no weights, and it will not look wrong
hf download ArtusDev/<repo> --local-dir models/x

# right
hf download ArtusDev/<repo> --revision 5.0bpw_H6 --local-dir models/x
```

Both setup scripts check for `*.safetensors` after downloading for this reason, and say so in the
failure message.

### Picking a bit-rate

Weights in GB ≈ **parameters (B) × bpw ÷ 8**, then add the KV cache and a working margin.

| | |
|---|---|
| 2.5–3.0 bpw | only when nothing else fits; this is where EXL3's advantage is largest and where quality is still visibly down |
| **4.0–4.5 bpw** | a 125B model on 96 GB. Measured working, prose intact |
| 5.0–6.0 bpw | a 70B model on 96 GB, comfortably |
| 8.0 bpw | effectively lossless, and rarely worth the VRAM |

The `H6`/`H8` suffix is the head bit-rate; take the publisher's default unless you have a reason.

---

## 2. Size the pod

**The number of cards is a harder constraint than the total VRAM.** Tensor parallelism wants a power of
two. Three cards is not a configuration — it is two cards and an idle one, or an error, depending on the
engine. Take **2**, or **4** if the model genuinely needs it.

| Model size | Quant | Cards | Fits |
|---|---|---|---|
| ~24B | 6.0 bpw | 1 × A40 | comfortably, with 32k context |
| ~70B | 5.0 bpw | 2 × A40 | yes |
| ~125B | 4.25 bpw | 2 × A40 | yes — 68.6 GB of weights + 32k Q8 cache inside 90 GB, with headroom (measured) |

The KV cache is the other half of the arithmetic and the part people forget. `cache_mode: Q8` roughly
halves it against FP16 for no quality cost worth measuring; Q6 and Q4 go further and start to matter.

---

## 3. Create the pod

RunPod → **Pods** → **Deploy**. The fields that matter, and why:

| Field | Value | Why |
|---|---|---|
| **Container image** | `runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404` | brings `sshd` and RunPod's `PUBLIC_KEY` injection. The official `ghcr.io/theroyallab/tabbyapi` image is the cleaner artifact and the **wrong one here** — no sshd means no tunnel (§15.10). Check the tag is still current rather than assuming |
| **GPU count** | **2** | see §2 — not 3 |
| **Container disk** | ≥ **100 GB** | local NVMe. The weights go here: a ~14 s load, against an untested and probably slower network volume |
| **Volume disk** | optional, `/workspace` | survives redeploy; good for logs, not for weights |
| **Expose HTTP ports** | *(none)* | nothing should be publicly reachable |
| **Expose TCP ports** | **22** | this is the whole point. It is what makes **Connect → SSH over exposed TCP** available, which is what carries the tunnel |
| **Container start command** | *(leave empty)* | **the failure mode here is a pod you cannot SSH into.** The image's `/start.sh` *is* the CMD; it ends in `sleep infinity` and never runs anything of yours. Override it and `setup_ssh` never runs |
| **Environment** | `HF_TOKEN` if the repo is gated · `HF_HUB_ENABLE_HF_TRANSFER=1` | the second is what makes a 70 GB download finish in minutes rather than an hour |

**Do not use `/pre_start.sh` as the setup hook**, even though the image supports it. It runs
synchronously *before* `setup_ssh`, so a script that spends twenty minutes downloading a model is twenty
minutes in which the pod cannot be reached at all — and if it fails you have no way in to find out why.
On a stock image there is also no way to place a file at `/` before boot. Run the setup script once over
`rp.sh` instead; it has the better failure behaviour anyway.

---

## 4. Talk to the pod without sitting in a session

Two separate problems, and only one of them is about accessibility.

**`ssh.runpod.io` silently ignores exec'd commands.** `ssh pod@ssh.runpod.io "nvidia-smi"` connects,
prints the banner, runs nothing, and exits **successfully**. Anything built on `ssh host "command"` does
nothing and reports no error.

**An interactive session is hostile to a screen reader.** The login banner is ASCII art. `pip` and `hf`
redraw progress bars hundreds of times a second with carriage returns. The prompt redraws on every
keystroke. None of it is readable, and none of it is the engine's fault.

`rp.sh` answers both: it pipes the command into an interactive shell and strips the PTY's output back
off, leaving only what the command printed.

```bash
# Connect -> SSH over exposed TCP gives you the direct form; prefer it, it can forward ports
export RP_HOST=root@69.30.85.59
export RP_ARGS='-p 22062'
./rp.sh 'nvidia-smi -L'
```

Two things that will otherwise cost an hour:

- **A pod's PTY truncates an input line at about 4 KB.** Pasting a script in as one base64 line silently
  loses the tail and leaves you a valid-looking file that is simply short. Fetch scripts with `curl`.
- **`raw.githubusercontent.com` serves a cached copy** for a few minutes after a push. A re-run that
  "ignores your fix" is usually this. Pin the URL to a commit SHA — `.../<owner>/<repo>/<sha>/<path>` —
  and it is immutable.

---

## 5. Check peer-to-peer before downloading anything

**Do this first. It takes two minutes and it decides the configuration.**

On a rented multi-GPU pod, direct card-to-card copies are often silently broken:
`can_device_access_peer` returns `True`, the copy returns **zeros**, and nothing errors. Three A40 pods
out of three, on different machines. Treat it as the expected state rather than bad luck.

The symptom downstream is a model that loads cleanly, checksums clean against Hugging Face's own LFS
hashes, and generates garbage.

```python
import torch
n = 1000000
a = torch.arange(n, dtype=torch.float32, device="cuda:0")
direct = a.to("cuda:1"); torch.cuda.synchronize()
staged = a.cpu().to("cuda:1"); torch.cuda.synchronize()
print("OK" if torch.equal(direct.cpu(), staged.cpu()) else "BROKEN")
```

**The buffer size is not incidental.** A 4 KB copy *passes* on a pod whose 4 MB copies come back 100%
zeros — and passes in some processes and not others on that same pod. 100 KB is worse: it returns
*partially* corrupt data, 83–98% zeros, which is the shape least likely to be noticed. Use a million
elements.

Both setup scripts run this automatically and configure themselves from the result.

**If it says BROKEN**, the fix is `NCCL_P2P_DISABLE=1` with the NCCL backend — verified to produce
correct, coherent prose on cards in exactly this state. Collectives detour through host RAM, which costs
throughput and is why the 12 tok/s figure is a floor.

Note that this **inverts** TabbyAPI's own documented advice, which is `native` for PCIe and `nccl` for
NVLink. On a healthy pod that advice stands. On a pod that fails this check, `native` is the backend
that drives the broken path directly, and NCCL is the fallback that still works.

---

## 6. Path A — TabbyAPI (the verified one)

Headless, OpenAI-compatible, EXL3-only on current main, configured by `config.yml` rather than flags.

### The one-liner

```bash
RP_HOST=... ./rp.sh 'curl -sL <raw-url-pinned-to-a-sha>/pod-setup.sh -o /root/pod-setup.sh \
  && bash /root/pod-setup.sh ArtusDev/<repo> 4.25bpw_H6'
```

It returns in about a second. After that:

```bash
./rp.sh 'cat /workspace/pod-status'          # RUNNING / READY / FAILED
./rp.sh 'tail -30 /workspace/pod-setup.log'  # what it is doing
./rp.sh 'tail -30 /workspace/tabby.log'      # the server's own log, once it is up
```

### What it does, and why each step is there

1. **Peer-to-peer test** (§5), before 70 GB is downloaded.
2. **Installs into a venv at `/root/tabbyenv`** — deliberately, not over the image's Python. TabbyAPI's
   `[cu12]` extra pulls **torch 2.9.0** onto an image pinned at **2.8.0**, which leaves the preinstalled
   `torchao 0.15.0` mismatched, after which `import exllamav3` aborts with
   `terminate called after throwing an instance of 'std::bad_alloc'` — **with 433 GB of RAM free**. The
   allocation error is thrown during extension init and has nothing to do with memory. The official
   TabbyAPI image builds into `/opt/venv` for the same reason.
3. **Downloads the quant** to container disk, and checks for `*.safetensors`, not just `config.json`.
4. **Writes `config.yml`**, leaving `host` at its `127.0.0.1` default.
5. **Starts the server** with `NCCL_P2P_DISABLE=1` if the p2p test failed.
6. **Prints the API key.** TabbyAPI generates one on first start when `api_tokens.yml` has none, and
   prints it nowhere obvious. The preset needs it.

### The config, if you would rather write it by hand

```yaml
network:
  host: 127.0.0.1        # deliberate — reachable only down the tunnel
  port: 5000             # note 5000, not vLLM's 8000
  disable_auth: false
model:
  model_dir: /root/models
  model_name: <the EXL3 folder>
  max_seq_len: 32768
  cache_size: 32768
  cache_mode: Q8         # FP16 / Q8 / Q6 / Q4, or an explicit "k,v" bit pair
  tensor_parallel: true  # the whole point
  tensor_parallel_backend: nccl
  gpu_split_auto: true
  autosplit_reserve: [96]
  chunk_size: 2048
```

`backend:` can be left blank — it is detected from the model's `quantization_config`.

**On keys:** `api_tokens.yml` distinguishes an `api_key` from an `admin_key`. The admin key can load and
unload models over HTTP. Treat it as the sensitive one and **do not paste it into Formamorph** — the
read/generate `api_key` is what belongs in the preset.

---

## 7. Path B — text-generation-webui

Choose this if you already know the UI, or if you want the loader picker and sampler UI in front of you.
It is the same engine underneath.

> **This path is written from documentation and has never been run on a pod.** `pod-setup.sh` is the
> verified one. Two specifics to check on the pod with `python server.py --help`, both called out in
> `textgen-setup.sh`: the exact loader name (`exllamav3` expected), and whether `--enable_tp` — documented
> as "Enable Tensor Parallelism (TP) in **ExLlamaV2**" — reaches the V3 loader. If it does not, you get a
> layer split: correct output, less throughput.

```bash
RP_HOST=... ./rp.sh 'curl -sL <raw-url-pinned-to-a-sha>/textgen-setup.sh -o /root/textgen-setup.sh \
  && bash /root/textgen-setup.sh ArtusDev/<repo> 4.25bpw_H6'
```

It uses the one-click installer (`GPU_CHOICE=A LAUNCH_AFTER_INSTALL=FALSE ./start_linux.sh`) rather than
pip, because the installer builds its own environment under `installer_files/` — the same insulation the
venv gives TabbyAPI, against the same torch conflict.

Then it starts the server headless:

```
server.py --model <name> --model-dir /root/models --loader exllamav3 \
          --max_seq_len 32768 --cache_type q8 --enable_tp \
          --api --api-port 5000 --api-key <generated> --nowebui
```

`--nowebui` matters: nothing here needs Gradio, and the UI is the part that wants a browser and a second
port.

**Two differences from TabbyAPI worth knowing before you pick this path:**

- **It generates no API key.** With no `--api-key` the API is open to anything that can reach it. The
  script makes one and writes it to `/workspace/textgen-api-key`.
- **It binds broadly**, and has no documented loopback-only flag, where TabbyAPI defaults to
  `127.0.0.1`. The containment is therefore the **pod template**, not the config: with the port unmapped
  on RunPod it is not reachable from outside the pod whatever it binds to. This is one more reason not
  to expose an HTTP port in §3.

---

## 8. Tunnel it

Nothing above opened a public port, so the API is reachable only from inside the pod. Bring it to your
own machine over SSH:

```bash
ssh -N -L 5000:127.0.0.1:5000 root@<POD-IP> -p <POD-SSH-PORT> -i ~/.ssh/id_ed25519
```

Leave it running. `-N` means "forward, run nothing".

This is the whole security story: everything Formamorph sends — the world, the characters, the scene,
the reply, the token in the header — travels inside SSH. It costs a little latency and it is not
optional for play text.

**It needs the direct SSH form.** `ssh.runpod.io` is a proxy and does not forward ports; **Connect → SSH
over exposed TCP** is a real `sshd` and does. That is what exposing TCP 22 in §3 bought.

---

## 9. Point Formamorph at it

Settings → **Endpoint**:

| Field | Value |
|---|---|
| Endpoint URL | `http://localhost:5000` — bare host and port; the app completes the path itself (§3 of the endpoint notes) |
| API Token | TabbyAPI: the **`api_key`**, never the admin key. textgen: the contents of `/workspace/textgen-api-key` |
| Model Name | the loaded model's name, as `/v1/models` reports it |
| Context Window | try **Detect**; if it comes back empty, type your `max_seq_len` by hand |
| Max Output Tokens | **raise it from the 1024 default** — the default is short for narration |

Both engines expose the OpenAI v1 schema, so everything the endpoint notes say about presets applies
unchanged.

`http://localhost` is correct here and the app will not warn about it: the warning fires on `http://` to
a genuinely remote host, and loopback is the end of a tunnel, not a hop across the internet.

---

## 10. Verify before you trust it

```bash
# 1. rejected without a key
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5000/v1/models

# 2. 200 with one, and it names the model
curl -s -H "Authorization: Bearer $KEY" http://localhost:5000/v1/models

# 3. streaming — tokens should arrive progressively, not all at once at the end
curl -N -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"model":"<name>","stream":true,"max_tokens":200,
       "messages":[{"role":"user","content":"Describe a harbour at dawn."}]}' \
  http://localhost:5000/v1/chat/completions
```

Check 3 is not a formality. It is the check that distinguishes a working tunnel from the buffering HTTP
proxy this whole shape exists to avoid — if the reply arrives in one lump, something is proxying.

Then take one real measurement, because throughput is the number that decides whether this is usable:
time a 200-token completion. Short requests understate the rate badly (8.1 tok/s at 50 tokens against
12.0 at 200 on the same pod) — the fixed cost of a request is being amortised, not the model speeding up.

---

## 11. When you are done

**Stop the pod.** Billing is per second of existence, not per token.

A stopped pod keeps its volume and loses its container disk, which is where the weights are — so a
restart re-downloads. At `hf_transfer` speeds that is two or three minutes for 70 GB, which is cheaper
than paying to keep it.

**One thing to know about a pod you exposed:** `env` on a running pod includes `RUNPOD_API_KEY`, injected
by RunPod. Anyone with a shell there — or any process you run, including anything a model download drags
in — can read it. Measured: it is 403 against `rest.runpod.io/v1` but authenticates
`api.runpod.io/graphql`, where it returned the pod's own image name and host id. Not an account key, not
decorative either; the scope was not mapped further. Treat an exposed pod as having leaked it.

---

## 12. When it goes wrong

| Symptom | Cause |
|---|---|
| `ssh pod@ssh.runpod.io "cmd"` connects and does nothing | the proxy drops exec'd commands. Use `rp.sh` (§4) |
| Cannot SSH in at all | a **Container start command** was set, so `setup_ssh` never ran (§3) |
| `import exllamav3` → `std::bad_alloc`, with hundreds of GB free | installed over the image's Python; torch 2.9.0 against a 2.8.0 image. Use the venv (§6) |
| Model loads, checksums clean, output is garbage | broken peer-to-peer. Run the §5 test; `NCCL_P2P_DISABLE=1` |
| "no .safetensors" after a download that looked fine | branch-per-bitrate repo, and `--revision` was omitted (§1) |
| Old exl2 `.safetensors` will not load | ExLlamaV2 is gone from TabbyAPI main. Get an EXL3 quant, or the `exl2-checkpoint` branch |
| Streaming arrives in one lump | something is proxying. RunPod's HTTP proxy buffers SSE — tunnel instead (§8) |
| Port 7000 in an old guide | TabbyAPI's default is **5000** |
| A script "ignores your fix" on re-run | `raw.githubusercontent.com` cache. Pin the URL to a SHA (§4) |
| A pasted script runs but behaves as if truncated | it was. The PTY cuts an input line at ~4 KB. `curl` it (§4) |
| Setup never leaves RUNNING, no error in the log | the installer is sitting at an interactive prompt (§7) |

---

## 13. Verification status

Being explicit about this, because half of what is above was measured and half was read.

**Measured on rented pods, 2026-08-20 and 2026-08-23** (2× A40 sm_86, TabbyAPI `e632af4`, exllamav3
1.4.2, torch 2.9.0+cu128, driver 570.195.03):

- The whole TabbyAPI install path end to end, including the venv requirement and the `std::bad_alloc`
  it avoids.
- Current TabbyAPI being EXL3-only, with the backend auto-detected from `quantization_config`.
- EXL3 throughput on Ampere: 8.1 tok/s at 50 tokens, **12.0 tok/s at 200**, Behemoth-128B-v3 at
  4.25 bpw h6, Q8 cache, 32k context, weights split 35.3 / 34.7 GB. ~14 s load from container disk.
- The peer-to-peer corruption, on three pods out of three, including on a 1B control model — and the
  `nccl` + `NCCL_P2P_DISABLE=1` workaround restoring correct output on cards in that state.
- `/start.sh` ending in `sleep infinity`, and the consequences of overriding it.
- The RunPod HTTP proxy buffering SSE, reproduced against a local koboldcpp.
- `RUNPOD_API_KEY` in the pod environment, and which endpoint it authenticates against.

**Verified against vendor documentation, not run:** everything in §7. The `--enable_tp`,
`--loader`, `--cache_type`, `--api-key`, `--api-port` and `--nowebui` flag names come from
text-generation-webui's own documentation; the loader list on the page they were read from is stale
enough not to mention ExLlamaV3 at all, which is precisely why §7 says to check `--help` on the pod.

**Never tested at size:** `pod-setup.sh` reached READY and served coherent prose against a 1B control
model. The 70 GB download, the tensor-parallel split of a real model and the ten-minute health-check
window have not been exercised by the script itself, only by hand.

**Unknown:** how much a pod that *passes* the peer-to-peer check beats 12 tok/s, and whether loading
from the `/workspace` MooseFS volume is tolerable or terrible.
