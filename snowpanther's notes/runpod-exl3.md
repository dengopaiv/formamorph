# Running an EXL3 model on RunPod — TabbyAPI or text-generation-webui

From an empty RunPod account to a Formamorph preset that answers, in order, with nothing assumed.

**How to read this.** §1 is the whole procedure as a list of steps, one line each. If you have done this
before, that section is the entire document and the rest is reference. If you have not, work down from
§2 and do not skip §7 or §8 — those two are where the hours go when they are skipped.

Everything here was done from **Windows, in Git Bash**. Where PowerShell differs, it is called out;
where it is actively the wrong tool, that is called out too (§7).

Companion files, all in `snowpanther's notes/`:

- `pod-scripts/rp.sh` — run one command on the pod, get clean text back
- `pod-scripts/pod-setup.sh` — unattended TabbyAPI bring-up (**verified end to end**)
- `pod-scripts/textgen-setup.sh` — the same for text-generation-webui (**never run on a pod**)
- `FORMAMORPH-ENDPOINT-NOTES.md` — the reasoning behind all of it. This file is the procedure; that one
  is the argument. A reference prefixed *notes* — *(notes §3)*, *(notes 15.3a)* — points there; a bare §number is this file.

---

## 0. What this gets you, and what it costs

A model far larger than a 4 GB local card can hold, answering Formamorph over an encrypted tunnel, on
hardware you stop paying for when you stop using it.

Two A40s run about **$0.80/hr** together at on-demand rates — call it a few dollars for an evening. The
pod bills **per second it exists**, not per token, so an idle pod you forgot about costs exactly as much
as one that is working. §15 is the section that saves you money.

### Why EXL3 rather than GGUF

EXL3 is the quantisation format of the exllamav3 engine, and on a rented multi-GPU box it is the
better-fitting choice:

- **Real tensor parallelism.** Both cards work on every token, rather than each holding half the layers
  and taking turns.
- **Better quality per bit at low bit-rates**, which is what makes a ~125B model fit on 2×48 GB at all.
- **A cache that quantises cleanly.** `Q8` roughly halves KV memory against FP16 for no quality cost
  worth measuring, and the KV cache is half the arithmetic at long context.

GGUF via llama.cpp is the better answer on a single card, on a Mac, or on anything CPU-bound. This
document is about the other case.

### Why not the obvious thing

Three shortcuts look right and are not:

- **The official `ghcr.io/theroyallab/tabbyapi` image.** It is the cleaner artifact and the wrong choice
  here: it carries no `sshd`, so there is no tunnel, and the tunnel is the security story (§12).
- **RunPod's HTTP proxy.** It is the easy way to reach a port, and it **buffers SSE** — streaming
  arrives as one lump at the end. It is also plain HTTP across the internet, which play text may not
  cross (§12).
- **`/pre_start.sh` as the setup hook.** It runs *before* `setup_ssh`, so a script that spends twenty
  minutes downloading is twenty minutes in which the pod cannot be reached at all — and if it fails, you
  have no way in to find out why.

---

## 1. The whole thing in one screen

Each line is a section. Steps 1–3 are one-time; everything after is per pod.

1. **Make an SSH key and put it in your RunPod account.** — §2
2. **Get a Hugging Face token** if the model repo is gated. — §2
3. **Have the scripts on your own machine**, checked out from this repo. — §2
4. **Confirm an EXL3 quant of your model exists**, and note whether the repo puts each bit-rate on its
   own *branch*. — §3
5. **Size it**: how many cards, which bit-rate, how much context. Two cards, not three. — §4
6. **Deploy the pod.** Expose TCP 22. Leave the start command *empty*. — §5
7. **Prove you can run a command on it** with `rp.sh`. — §6
8. **Copy the scripts onto the pod** — the step with no shortcut. — §7
9. **Run the peer-to-peer check** before downloading anything large. — §8
10. **Rehearse on a 1B model** — ten minutes that catch nearly every mistake cheaply. — §9
11. **Run the real setup script** (§10 TabbyAPI, or §11 text-generation-webui) and wait for `READY`.
12. **Open the tunnel** (§12), **point Formamorph at it** (§13), **verify it** (§14).
13. **Stop the pod.** — §15

---

## 2. Before you rent anything

One-time setup on your own machine. Do all of it before deploying, because a pod you cannot reach is
still a pod you are paying for.

### An SSH key

Windows ships OpenSSH, so this works in PowerShell or Git Bash unchanged:

```bash
ssh-keygen -t ed25519 -C "runpod"
```

Accept the default path. That is `C:\Users\<you>\.ssh\id_ed25519` in Windows terms, and
`~/.ssh/id_ed25519` in Git Bash — the same file. A passphrase is fine; you will type it once per
tunnel.

Then paste the **public** half — `id_ed25519.pub`, the one ending `.pub` — into RunPod under
**Settings → SSH Public Keys**. RunPod injects it into every pod you start afterwards, which is what
makes §6 possible.

```bash
cat ~/.ssh/id_ed25519.pub          # this one goes in the web form
```

Never paste the other file anywhere. If you are ever unsure which you are looking at, the public one is
a single line beginning `ssh-ed25519`.

### Credit

RunPod bills prepaid. An empty balance shows up as a deploy button that does nothing useful, not as an
error that explains itself.

### A Hugging Face token, if the repo is gated

Needed only for gated repos, which most EXL3 quants are not. Get one from
**huggingface.co → Settings → Access Tokens**, read scope is enough, and hand it to the pod as the
environment variable `HF_TOKEN` in §5 — not on a command line, where it lands in shell history.

### The scripts

They live in this repo, in `snowpanther's notes/pod-scripts/`. You need them **on your own machine**.
`rp.sh` stays there and drives the pod from outside; only the setup script for the path you pick has to
travel, which is what §7 is about.

```bash
cd "/c/GIT/sodi/formamorph/snowpanther's notes/pod-scripts"
ls
# pod-setup.sh  rp.sh  textgen-setup.sh
```

`.gitattributes` in this repo pins `eol=lf`, so a Windows checkout gives you Unix line endings and the
scripts run on the pod as-is. That is worth knowing because it is the *only* safe route: a script that
picks up CRLF endings on the way over fails on the pod with `$'\r': command not found`, which names
nothing useful. §7 says which transfer methods preserve the file and which do not.

---

## 3. Does an EXL3 quant of your model exist?

Search Hugging Face for `<model name> exl3`. `ArtusDev` and `turboderp` are the two prolific quantisers.
If nothing exists, quantising your own needs a GPU box and hours — a separate errand, not this one.

**The trap that costs an hour: many quant repos put each bit-rate on its own git branch.** The `main`
branch holds only `config.json` and the measurement file. Download it without `--revision` and you get
a directory that looks correct, has a valid `config.json`, and contains **no weights at all**.

```bash
# wrong — no weights, and it will not look wrong
hf download ArtusDev/Some-Model-EXL3 --local-dir /root/models/m

# right
hf download ArtusDev/Some-Model-EXL3 --revision 4.25bpw_H6 --local-dir /root/models/m
```

Check the Hugging Face page's branch dropdown before downloading. Both setup scripts take the branch as
their second argument and fail loudly if no `*.safetensors` arrives, rather than continuing to a load
error that blames the model.

### Picking a bit-rate

`H6` / `H8` in a branch name is the bits used for the *head* layer, which is small; the number in front
is what matters.

| bpw | Verdict |
|---|---|
| 6.0+ | indistinguishable from FP16 for prose; only worth it if it fits easily |
| **5.0** | the safe default when there is room |
| **4.25** | the sweet spot for fitting a big model on two cards — measured coherent |
| 3.0 and below | visible degradation; a smaller model at 5.0 usually reads better |

A bigger model at a lower bit-rate generally beats a smaller model at a higher one, until about 3.0 bpw,
where that stops being true.

---

## 4. Size the pod

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

## 5. Create the pod

RunPod → **Pods** → **Deploy**. The fields that matter, and why:

| Field | Value | Why |
|---|---|---|
| **Container image** | `runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404` | brings `sshd` and RunPod's `PUBLIC_KEY` injection. The official `ghcr.io/theroyallab/tabbyapi` image is the cleaner artifact and the **wrong one here** — no sshd means no tunnel. Check the tag is still current rather than assuming |
| **GPU count** | **2** | see §4 — not 3 |
| **Container disk** | ≥ **100 GB** | local NVMe. The weights go here: a ~14 s load, against an untested and probably slower network volume |
| **Volume disk** | optional, `/workspace` | survives redeploy; good for logs, not for weights |
| **Expose HTTP ports** | *(none)* | nothing should be publicly reachable |
| **Expose TCP ports** | **22** | this is the whole point. It is what makes **Connect → SSH over exposed TCP** available, which is what carries both the file copy (§7) and the tunnel (§12) |
| **Container start command** | *(leave empty)* | **the failure mode here is a pod you cannot SSH into.** The image's `/start.sh` *is* the CMD; it ends in `sleep infinity` and never runs anything of yours. Override it and `setup_ssh` never runs |
| **Environment** | `HF_TOKEN` if the repo is gated · `HF_HUB_ENABLE_HF_TRANSFER=1` | the second is what makes a 70 GB download finish in minutes rather than an hour |

Once it is running, open **Connect**. You want the **SSH over exposed TCP** line, which looks like:

```
ssh root@69.30.85.59 -p 22062 -i ~/.ssh/id_ed25519
```

Write down the IP and the port. Everything below needs them, and they change every time you redeploy.

There are two connection forms on that screen and **they are not interchangeable**:

| | `ssh.runpod.io` (the proxy) | direct, `root@<ip> -p <port>` |
|---|---|---|
| Interactive shell | yes | yes |
| `ssh host 'command'` | **silently does nothing** | yes |
| Copy a file in (§7) | **no** | yes |
| Forward a port (§12) | **no** | yes |

Use the direct form. The proxy form exists in this document only to explain why things fail.

---

## 6. Talk to the pod without sitting in a session

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
cd "/c/GIT/sodi/formamorph/snowpanther's notes/pod-scripts"
export RP_HOST=root@69.30.85.59
export RP_ARGS='-p 22062'
./rp.sh 'nvidia-smi -L'
```

Expect two lines naming two GPUs. **Do not continue until this works** — every remaining step is built
on it.

If it hangs or refuses, the cause is nearly always one of: the pod is still booting (give it a minute),
a **Container start command** was set so `setup_ssh` never ran (§5), or the public key never reached
your RunPod account (§2).

Set those two variables once per shell. If you open a new terminal, set them again — a `rp.sh` that
says `set RP_HOST` is telling you exactly that.

---

## 7. Get the scripts onto the pod

**This is the step with no shortcut, and the one most likely to waste an afternoon.** Both setup scripts
are several kilobytes of bash. They have to arrive on the pod *byte for byte*.

Two obvious routes are closed:

- **Pasting does not work.** A pod's PTY truncates an input line at about 4 KB. Paste a script — or a
  base64 blob of one — and the tail is silently dropped, leaving a valid-looking file that is simply
  short. It will run. It will do part of the job.
- **`curl` from GitHub does not work yet.** The script headers show a `curl -sL <raw-url>` form, and it
  is the right answer *once this branch is pushed*. It is not pushed. There is no raw URL to fetch.

What works is sending the file as a byte stream over the direct SSH connection, where no PTY and no line
limit is involved.

**Only the setup script travels.** `rp.sh` runs on *your* machine and drives the pod from outside —
copying it over would accomplish nothing. Send `pod-setup.sh` (§10) or `textgen-setup.sh` (§11),
whichever path you are taking, and nothing else.

### Method A — pipe it in (recommended; nothing to install)

In Git Bash, from the `pod-scripts` directory:

```bash
ssh -p 22062 -i ~/.ssh/id_ed25519 root@69.30.85.59 'cat > /root/pod-setup.sh' < pod-setup.sh
```

The file arrives on **stdin** as bytes, so the 4 KB line limit never applies. Note there is no `-tt`
here: forcing a PTY is precisely what would reintroduce the problem `rp.sh` normally has to work around.

### Method B — `scp`, if you prefer the familiar tool

```bash
scp -P 22062 -i ~/.ssh/id_ed25519 pod-setup.sh root@69.30.85.59:/root/
```

**`-P` is capital for `scp`** and lower-case for `ssh`; lower-case `-p` here means "preserve timestamps"
and your port will be ignored. Same requirement as Method A: the **direct** form. The `ssh.runpod.io`
proxy carries neither method.

### Then check it arrived whole — do not skip this

```bash
# on your machine
wc -l pod-setup.sh && md5sum pod-setup.sh

# on the pod
./rp.sh 'chmod +x /root/pod-setup.sh; wc -l /root/pod-setup.sh; md5sum /root/pod-setup.sh'
```

The two md5 sums must match. **A truncated script still runs**, which is why this check is worth the
fifteen seconds: it is the difference between a clear failure now and a confusing one in twenty minutes.

### A word about PowerShell

Use **Git Bash** for this section. PowerShell will get it wrong in two ways at once:

- It has no `<` input redirection, so Method A has to become a pipe, and
- `Get-Content file | ssh ...` re-encodes the stream and can plant **CRLF** line endings in the script.
  Bash on the pod then fails with `$'\r': command not found`, which names nothing you can act on.

`scp` (Method B) is byte-exact and safe from PowerShell if you would rather stay there. If you ever
suspect CRLF anyway, the fix on the pod is one line:

```bash
./rp.sh "sed -i 's/\r$//' /root/pod-setup.sh"
```

### Method C — `curl`, once the branch is pushed

The form the script headers assume, and the least work per pod once it is available. It needs
`description-consistency` pushed to `origin` first (chore **C3** in `TODO.md`).

```bash
./rp.sh 'curl -sL https://raw.githubusercontent.com/dengopaiv/formamorph/<sha>/snowpanther%27s%20notes/pod-scripts/pod-setup.sh -o /root/pod-setup.sh'
```

**Pin the URL to a commit SHA**, not a branch name. `raw.githubusercontent.com` serves a cached copy of
a branch path for a few minutes after a push, and a re-run that appears to "ignore your fix" is almost
always that cache. A SHA path is immutable and cannot do this.

Note the `%27` and `%20`: the directory name contains an apostrophe and a space, and both need escaping
in a URL. This is a small argument for keeping a copy of the scripts somewhere with a duller name.

---

## 8. Check peer-to-peer before downloading anything

**Do this first. It takes two minutes and it decides the configuration.**

On a rented multi-GPU pod, direct card-to-card copies are often silently broken:
`can_device_access_peer` returns `True`, the copy returns **zeros**, and nothing errors. Three A40 pods
out of three, on different machines. Treat it as the expected state rather than bad luck.

The symptom downstream is a model that loads cleanly, checksums clean against Hugging Face's own LFS
hashes, and generates garbage.

Send the test over as a file rather than as a quoted one-liner — the same trick as §7, and it avoids
fighting two levels of shell quoting for no benefit:

```bash
ssh -p 22062 -i ~/.ssh/id_ed25519 root@69.30.85.59 'cat > /root/p2p.py' <<'PY'
import torch
n = 1000000
a = torch.arange(n, dtype=torch.float32, device="cuda:0")
direct = a.to("cuda:1"); torch.cuda.synchronize()
staged = a.cpu().to("cuda:1"); torch.cuda.synchronize()
print("OK" if torch.equal(direct.cpu(), staged.cpu()) else "BROKEN")
PY

./rp.sh 'python3 /root/p2p.py'
```

**The buffer size is not incidental.** A 4 KB copy *passes* on a pod whose 4 MB copies come back 100%
zeros — and passes in some processes and not others on that same pod. 100 KB is worse: it returns
*partially* corrupt data, 83–98% zeros, which is the shape least likely to be noticed. Use a million
elements.

Both setup scripts run this automatically and configure themselves from the result, so this manual run
is for your own knowledge of the pod rather than a prerequisite.

**If it says BROKEN**, the fix is `NCCL_P2P_DISABLE=1` with the NCCL backend — verified to produce
correct, coherent prose on cards in exactly this state. Collectives detour through host RAM, which costs
throughput and is why the 12 tok/s figure is a floor.

Note that this **inverts** TabbyAPI's own documented advice, which is `native` for PCIe and `nccl` for
NVLink. On a healthy pod that advice stands. On a pod that fails this check, `native` is the backend
that drives the broken path directly, and NCCL is the fallback that still works.

---

## 9. Rehearse on a 1B model first

**Ten minutes, a few cents, and it exercises every step above except the size of the download.** This is
how `pod-setup.sh` was verified in the first place, and it is worth repeating on each new pod rather
than discovering a typo forty minutes into a 70 GB transfer.

```bash
./rp.sh 'bash /root/pod-setup.sh turboderp/Llama-3.2-1B-Instruct-exl3 4.0bpw'
./rp.sh 'cat /workspace/pod-status'          # RUNNING, then READY
```

When it reaches `READY`, tunnel it (§12) and send it one request (§14). If prose comes back, then the
key, the config, the tensor-parallel split, the health check and the tunnel are all known good, and the
only untested thing left is the size of the real model.

Then unload and run the real one:

```bash
./rp.sh 'pkill -f tabbyenv/bin/python; rm -rf /root/models/Llama-3.2-1B-Instruct-exl3-4.0bpw'
```

Match on the venv's interpreter path, not on "tabbyapi": the script launches `main.py` from inside
`/root/tabbyAPI` using `/root/tabbyenv/bin/python`, so the string "tabbyapi" appears nowhere in the
process's command line. The model directory is `<repo basename>-<branch>`, which is where that name
comes from.

Skip this step only when you are repeating something you did earlier the same day.

---

## 10. Path A — TabbyAPI (the verified one)

Headless, OpenAI-compatible, EXL3-only on current main, configured by `config.yml` rather than flags.
**This is the path that has actually been run.**

```bash
./rp.sh 'bash /root/pod-setup.sh ArtusDev/<repo> 4.25bpw_H6'
```

It returns in about a second, because the script backgrounds itself. After that:

```bash
./rp.sh 'cat /workspace/pod-status'          # RUNNING / READY / FAILED
./rp.sh 'tail -30 /workspace/pod-setup.log'  # what it is doing
./rp.sh 'tail -30 /workspace/tabby.log'      # the server's own log, once it is up
```

A 70 GB download at `hf_transfer` speeds is a few minutes; the load from container disk is about 14
seconds. If `pod-status` still says `RUNNING` after twenty minutes, read the log rather than waiting.

### What it does, and why each step is there

1. **Peer-to-peer test** (§8), before 70 GB is downloaded.
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

Read the key back at any time with:

```bash
./rp.sh 'cat /root/tabbyAPI/api_tokens.yml'
```

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

## 11. Path B — text-generation-webui

Choose this if you already know the UI, or if you want the loader picker and sampler UI in front of you.
It is the same engine underneath.

> **This path is written from documentation and has never been run on a pod.** `pod-setup.sh` is the
> verified one. Two specifics to check on the pod with `python server.py --help`, both called out in
> `textgen-setup.sh`: the exact loader name (`exllamav3` expected), and whether `--enable_tp` — documented
> as "Enable Tensor Parallelism (TP) in **ExLlamaV2**" — reaches the V3 loader. If it does not, you get a
> layer split: correct output, less throughput.

```bash
./rp.sh 'bash /root/textgen-setup.sh ArtusDev/<repo> 4.25bpw_H6'
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
  to expose an HTTP port in §5.

---

## 12. Tunnel it

Nothing above opened a public port, so the API is reachable only from inside the pod. Bring it to your
own machine over SSH, in **its own terminal**, and leave it running:

```bash
ssh -N -L 5000:127.0.0.1:5000 root@69.30.85.59 -p 22062 -i ~/.ssh/id_ed25519
```

`-N` means "forward, run nothing" — it prints nothing and appears to hang. That is success. Closing the
window closes the tunnel and Formamorph stops being able to reach the model.

This is the whole security story: everything Formamorph sends — the world, the characters, the scene,
the reply, the token in the header — travels inside SSH. It costs a little latency and it is not
optional for play text.

**It needs the direct SSH form.** `ssh.runpod.io` is a proxy and does not forward ports; **Connect → SSH
over exposed TCP** is a real `sshd` and does. That is what exposing TCP 22 in §5 bought.

---

## 13. Point Formamorph at it

Settings → **Endpoint**. Add a preset rather than editing Default, so you can switch back.

| Field | Value |
|---|---|
| Endpoint URL | `http://localhost:5000` — bare host and port; the app completes the path itself (notes §3) |
| API Token | TabbyAPI: the **`api_key`**, never the admin key. textgen: the contents of `/workspace/textgen-api-key` |
| Model Name | the loaded model's name, as `/v1/models` reports it |
| Context Window | try **Detect**; if it comes back empty, type your `max_seq_len` by hand |
| Max Output Tokens | tick **Override endpoint limit** and set a real number — see below |

`http://localhost` is correct here and the app will not warn about it: the warning fires on `http://` to
a genuinely remote host, and loopback is the end of a tunnel, not a hop across the internet.

### Max Output Tokens is now a switch, and it has a second effect

The cap is an explicit override with a checkbox in front of it. Left unticked, the field greys out, the
row reads **Endpoint default**, and no limit is sent at all — the model writes until it stops or runs
into the context window.

**Tick it.** Two reasons, and the second is not obvious:

1. A self-hosted endpoint has no opinion about a sensible reply length, so "endpoint default" here means
   "no limit" rather than "something reasonable".
2. **The length guidance in the prompt is sized against this number, and disappears without it.** With
   the override off, Paragraph Limit stops sending anything — *Auto* has no budget to scale a paragraph
   count against, and even *Single* sends no instruction. The setting still reads "Auto" in the UI while
   having no effect on the prompt.

Raise it well above the 1024 default; that is short for narration.

### The Sampling section

The endpoint tab now carries per-endpoint sampler overrides — Temperature, Repetition Penalty, Top P,
Top K, Min P — each behind its own switch, with the app's own note that *"per-prompt settings and
built-in prompt values take priority… leave a switch off to send no endpoint override."*

Leave them all off to begin with. Turn one on only when this particular endpoint needs a value the rest
of the app should not have to know about. Both TabbyAPI and text-generation-webui accept the whole
OpenAI sampler set, so none of these are needed to make the connection work.

If a server does reject one, the app now handles it: a 400 or 422 naming the parameter disables that
override for this preset and raises a toast saying so, with the server's own message. You do not have to
guess which knob was refused.

---

## 14. Verify before you trust it

Run these from your own machine, with the tunnel up:

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

Check 1 should print `401`. A `200` there means auth is off and anything reaching the port can use the
model.

Check 3 is not a formality. It is the check that distinguishes a working tunnel from the buffering HTTP
proxy this whole shape exists to avoid — if the reply arrives in one lump, something is proxying.

Then take one real measurement, because throughput is the number that decides whether this is usable:
time a 200-token completion. Short requests understate the rate badly (8.1 tok/s at 50 tokens against
12.0 at 200 on the same pod) — the fixed cost of a request is being amortised, not the model speeding up.

---

## 15. When you are done

**Stop the pod.** Billing is per second of existence, not per token.

A stopped pod keeps its volume and loses its container disk, which is where the weights are — so a
restart re-downloads. At `hf_transfer` speeds that is two or three minutes for 70 GB, which is cheaper
than paying to keep it. A restarted pod also gets a **new IP and port**, so §6, §7 and §12 all need the
new numbers.

**One thing to know about a pod you exposed:** `env` on a running pod includes `RUNPOD_API_KEY`, injected
by RunPod. Anyone with a shell there — or any process you run, including anything a model download drags
in — can read it. Measured: it is 403 against `rest.runpod.io/v1` but authenticates
`api.runpod.io/graphql`, where it returned the pod's own image name and host id. Not an account key, not
decorative either; the scope was not mapped further. Treat an exposed pod as having leaked it.

---

## 16. When it goes wrong

| Symptom | Cause |
|---|---|
| `ssh pod@ssh.runpod.io "cmd"` connects and does nothing | the proxy drops exec'd commands. Use the direct form and `rp.sh` (§6) |
| Cannot SSH in at all | a **Container start command** was set, so `setup_ssh` never ran (§5) |
| `scp`/file copy refused, or "not a valid command" | you used the `ssh.runpod.io` proxy. Only the direct form carries a file (§7) |
| A pasted script runs but behaves as if truncated | it was. The PTY cuts an input line at ~4 KB. Pipe it in instead (§7) |
| `$'\r': command not found` | CRLF line endings, picked up in transit. `sed -i 's/\r$//'` on the pod (§7) |
| `import exllamav3` → `std::bad_alloc`, with hundreds of GB free | installed over the image's Python; torch 2.9.0 against a 2.8.0 image. Use the venv (§10) |
| Model loads, checksums clean, output is garbage | broken peer-to-peer. Run the §8 test; `NCCL_P2P_DISABLE=1` |
| "no .safetensors" after a download that looked fine | branch-per-bitrate repo, and `--revision` was omitted (§3) |
| Old exl2 `.safetensors` will not load | ExLlamaV2 is gone from TabbyAPI main. Get an EXL3 quant, or the `exl2-checkpoint` branch |
| Streaming arrives in one lump | something is proxying. RunPod's HTTP proxy buffers SSE — tunnel instead (§12) |
| Port 7000 in an old guide | TabbyAPI's default is **5000** |
| A script "ignores your fix" on re-run | `raw.githubusercontent.com` cache. Pin the URL to a SHA (§7) |
| Setup never leaves RUNNING, no error in the log | the installer is sitting at an interactive prompt (§11) |
| Replies run on and on, or Paragraph Limit does nothing | **Override endpoint limit** is unticked, so no cap and no length guidance are sent (§13) |

---

## 17. Verification status

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
- The 4 KB PTY input truncation, and the proxy ignoring exec'd commands, both of which §7 is built
  around.

**Read from this repository, not from a pod:** §7's Method A and Method B are standard OpenSSH
behaviour and have not been exercised against a RunPod host — they replace a `curl` instruction that
could not work at all, since the branch holding these scripts is unpushed. The line-ending claim is
checked against this repo's `.gitattributes`, which pins `eol=lf`.

**Read from the app's own source, 2026-09-07:** everything in §13 about the **Override endpoint limit**
switch, the Sampling section and the rejected-override toast. These arrived in the upstream sync of the
same date and the settings screen has not been walked through by hand since.

**Verified against vendor documentation, not run:** everything in §11. The `--enable_tp`,
`--loader`, `--cache_type`, `--api-key`, `--api-port` and `--nowebui` flag names come from
text-generation-webui's own documentation; the loader list on the page they were read from is stale
enough not to mention ExLlamaV3 at all, which is precisely why §11 says to check `--help` on the pod.

**Never tested at size:** `pod-setup.sh` reached READY and served coherent prose against a 1B control
model. The 70 GB download, the tensor-parallel split of a real model and the ten-minute health-check
window have not been exercised by the script itself, only by hand.

**Unknown:** how much a pod that *passes* the peer-to-peer check beats 12 tok/s, and whether loading
from the `/workspace` MooseFS volume is tolerable or terrible.
