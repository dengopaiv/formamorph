# Two EXL3 recipes — Artemis-31B-v1.2 and Behemoth-128B-v3 at 5.0 bpw

The exact values for running these two quants on RunPod and reaching them from Formamorph. **Written
2026-10-05, and neither recipe has been run yet.** Every command was checked against this repo's
scripts, TabbyAPI's source at `be74bf0` (its `main` on that day) and the model repos' own files. What has
actually been run is Behemoth at 4.25 bpw, by hand, on 2026-08-23.

[`runpod-exl3.md`](runpod-exl3.md) is still the procedure, and this file does not repeat it. Where a step
says *walkthrough §N*, do that section as written. Why these two models, and the other routes to them, are in
[`runpod-model-candidates.md`](runpod-model-candidates.md).

Everything runs from **Git Bash**, in the scripts directory:

```bash
cd "/c/GIT/sodi/formamorph/snowpanther's notes/pod-scripts"
```

---

## What changed in `pod-setup.sh` for these

Three optional settings, put in front of the command as environment variables. Leave them out and the
script does what it did on the verified 2026-08-23 run.

| Setting | What it does | Used by |
|---|---|---|
| `MAX_SEQ=65536` | context length and cache size, in tokens; a multiple of 256. Default 32768 | Artemis long context; Behemoth's fallback if it doesn't fit |
| `THINKING_BUDGET=400` | switches the model's thinking on for **every** request, capped at this many tokens | Artemis only, and only if you want thinking |
| `TABBY_REF=<full sha>` | installs TabbyAPI at that commit, not today's `main` | Behemoth, only if the current engine won't load it |

**Running the script a second time is how a setting changes.** It now stops the running server first, and
reuses the venv, the TabbyAPI checkout and the downloaded weights, so a re-run takes minutes, not a fresh
download. Nothing in this paragraph has been tried on a pod.

**Copying the script.** These edits sit on `description-consistency` and haven't been pushed. Walkthrough
§7 Method C (curl from GitHub) would fetch the *old* script until they are. Use **Method A**, and check the
md5 as §7 says.

---

## Recipe 1 — Artemis-31B-v1.2, 6.0 bpw, one GPU

**First ask whether you need a pod at all.** Featherless Premium serves this model unquantised at 32k for a
flat fee. A pod is for more context than that, for keeping play text off a third party's servers, or for
sampler control. See the candidates note §1–§2.

### The pod (walkthrough §5, with these values)

| Field | Value |
|---|---|
| GPU | **1 ×** A40, or any 48 GB card (L40S, RTX 6000 Ada, A6000) |
| Container disk | **60 GB** (26.7 GB of weights, plus the venv) |
| Expose TCP ports | **22** |
| Container start command | *(empty)* |
| Environment | `HF_HUB_ENABLE_HF_TRANSFER=1` (the repo isn't gated, so no `HF_TOKEN`) |

**One card means the peer-to-peer fault can't happen.** That fault is a broken copy *between* cards. The
script's check prints `SINGLE` and moves on. TabbyAPI logs `Disabling GPU split because one GPU is in use`
and ignores the `tensor_parallel` line in the config. That was read from its source; it hasn't been seen
on a pod yet.

### Steps

1. Walkthrough §6: set `RP_HOST` and `RP_ARGS`, then `./rp.sh 'nvidia-smi -L'`. Expect **one** line.
2. Walkthrough §7, Method A: copy `pod-setup.sh` over and compare the md5.
3. Skip the 1B rehearsal (§9). This model downloads in a couple of minutes, which makes it its own rehearsal.
4. Start it. No branch argument is needed: MikeRoz puts each bit-rate in its own repo.

   ```bash
   ./rp.sh 'bash /root/pod-setup.sh MikeRoz/Artemis-v1.2-6.00bpw-h8-exl3'
   ```

5. Wait for `READY`:

   ```bash
   ./rp.sh 'cat /workspace/pod-status'
   ./rp.sh 'tail -30 /workspace/pod-setup.log'
   ```

   The log should show `exllamav3 1.5.2` or newer. **The quant needs at least 1.5.1**, according to its card. TabbyAPI
   `main` pinned 1.5.2 on 2026-10-05, and that version has Gemma 4 support (`architecture/gemma4.py`).
6. Copy the API key from the end of that log. Walkthrough §12: open the tunnel in its own terminal.
7. Walkthrough §13, the preset:

   | Field | Value |
   |---|---|
   | Endpoint URL | `http://localhost:5000` |
   | API Token | the `api_key` from step 6 |
   | Model Name | `Artemis-v1.2-6.00bpw-h8-exl3` |
   | Context Window | `32768`, or whatever `MAX_SEQ` was |
   | Max Output Tokens | tick **Override endpoint limit**, **3072** |

   About 3,072 for Max Output: your Behemoth replies run about 8,000 characters, which is roughly 2,000
   tokens. 3,072 leaves room above that. Unlike KoboldCpp, TabbyAPI has no reply length of its own worth
   relying on. Formamorph sends this number with every request, and that's the limit that applies.
8. Walkthrough §14: the three `curl` checks, then one real turn.

### Thinking — off, unless the server turns it on

**Formamorph can't switch Artemis's thinking on through TabbyAPI**, whatever the app's reasoning setting
says. The reason is in the code on both sides:

- TabbyAPI isn't a dialect the app recognises, so the app sends its generic pair, `thinking_budget_tokens`
  and `reasoning_effort` (`src/lib/reasoningDialect.ts`, the `unknown` row).
- TabbyAPI accepts the budget only as `reasoning_budget_tokens`, `reasoning_budget`, `thinking_budget` or
  `thinking_token_budget`. **`thinking_budget_tokens` isn't on that list**, so the app's budget doesn't
  reach it.
- TabbyAPI passes `reasoning_effort` to the chat template, but the Gemma 4 template doesn't read that
  variable. It switches on `enable_thinking`, which defaults to off. When off, it writes an empty
  thought block, and the model answers straight away.

So by default Artemis runs with **thinking off**. The card says it works "thinking or non-thinking", so start
there.

**The risk with thinking off** is the one the 2026-09-17 stat probe measured on other Gemma 4 31B models. On
turns where nothing happens, the model sometimes explains itself in the answer instead of writing the
`Stat: N` lines, and the stat pass is silently skipped. **Watch the stats in the first session.**

**If they skip**, turn thinking on from the server. That probe found ~150 tokens of thinking removed the
problem, and 400 cost more time without helping further:

```bash
./rp.sh 'THINKING_BUDGET=150 bash /root/pod-setup.sh MikeRoz/Artemis-v1.2-6.00bpw-h8-exl3'
```

That applies to **every** request, narration included, so each reply starts with up to 150 tokens of
thinking first. TabbyAPI knows Gemma 4's thinking tags (`<|channel>thought` … `<channel|>`) and returns the
thinking separately from the reply, so it shouldn't appear in the story. If it does, that's a finding to
note here.

*A fix on the app's side, not done:* a TabbyAPI row in `reasoningDialect.ts` that sends `reasoning_budget_tokens`
and `enable_thinking` would let the app control this per prompt, as it already does for LM Studio.

### Long context

The reason to rent this over Featherless is often context beyond 32k. Gemma 4 31B supports up to 262k
natively.

```bash
./rp.sh 'MAX_SEQ=65536 bash /root/pod-setup.sh MikeRoz/Artemis-v1.2-6.00bpw-h8-exl3'
```

**Whether 64k fits on one 48 GB card depends on something unmeasured.** 50 of the model's 60 layers only
look back 1,024 tokens (sliding window), and only 10 see the whole context.
- If exllamav3 sizes the cache for that, 64k costs a few GB, and much more fits.
- If it allocates the full length for every layer, the cache is about **0.45 MB per token at Q8**. That's
  ~15 GB at 32k, which fits beside 26.7 GB of weights, and ~30 GB at 64k, which doesn't.

So try 65536. If the load fails on memory, drop back to 32768 or move to an 80 GB card. Write down which
happened.

---

## Recipe 2 — Behemoth-128B-v3, 5.0 bpw, two GPUs

**This model has only been run at 4.25 bpw.** That run is the baseline, so expect everything here to behave
like it, slightly heavier. Behemoth's own history is in [`behemoth-128b.md`](behemoth-128b.md).

### The pod

| Field | Value |
|---|---|
| GPU | **2 ×** A40 (two cards, not three — walkthrough §4) |
| Container disk | **120 GB** (80.6 GB of weights, plus the venv) |
| Expose TCP ports | **22** |
| Container start command | *(empty)* |
| Environment | `HF_HUB_ENABLE_HF_TRANSFER=1` |

**Alternative, untried: one 96 GB card** (RTX PRO 6000). 80.6 GB of weights plus a ~6 GB cache fits on
one card, which removes the peer-to-peer fault entirely. Same command, nothing else changes. Nobody has run
this install on a Blackwell card. An 80 GB H100 or A100 is **not** an option: the weights alone don't fit.

### Steps

1. Walkthrough §6: `./rp.sh 'nvidia-smi -L'`. Expect **two** lines.
2. Walkthrough §7, Method A: copy the script and check the md5.
3. Walkthrough §8–§9: the peer-to-peer check, and the 1B rehearsal if this is a new pod type. Expect
   `BROKEN`. Every two-A40 pod so far has been, and the script handles it.
4. Start it:

   ```bash
   ./rp.sh 'bash /root/pod-setup.sh MikeRoz/Behemoth-128B-v3-5.00bpw-h6-exl3'
   ```

5. Watch `pod-status` and the log as above. The download is ~81 GB, a few minutes with `hf_transfer`.
6. Key, tunnel, preset, checks (walkthrough §12–§14). Preset values:

   | Field | Value |
   |---|---|
   | Model Name | `Behemoth-128B-v3-5.00bpw-h6-exl3` |
   | Context Window | `32768` |
   | Max Output Tokens | override ticked, **3072** |

   Leave the app's reasoning off. The card says it was "tested without reasoning". The repo ships its own
   `chat_template.jinja`, which TabbyAPI uses as-is.

### If it doesn't load

**Out of memory.** By arithmetic it fits: about 41 GB of weights per card plus ~3 GB of cache, on 48 GB
cards. That's less headroom than 4.25 bpw had, and the figure is unmeasured. Halve the context first:

```bash
./rp.sh 'MAX_SEQ=16384 bash /root/pod-setup.sh MikeRoz/Behemoth-128B-v3-5.00bpw-h6-exl3'
```

**A load error about the quant format.** This quant was made with exllamav3 **1.4.2**. A fresh pod gets 1.5.2
or newer. Newer engines are expected to read older EXL3 files, but this pairing hasn't been tried. If the
error is about the format or the codebook, not about memory, go back to the TabbyAPI commit that ran
4.25 bpw, which installs 1.4.2:

```bash
./rp.sh 'TABBY_REF=e632af41eba68abeadc3437c62674360f2f8cbf1 bash /root/pod-setup.sh MikeRoz/Behemoth-128B-v3-5.00bpw-h6-exl3'
```

A re-run with a different `TABBY_REF` leaves the checkout there. A later run without it does **not** go
back to `main` by itself; delete `/root/tabbyAPI` for that.

### What to expect

- **Speed:** a little under the **12 tok/s** that 4.25 bpw gave on the same broken-p2p cards, because
  there are ~15% more weights to read per token. A pod whose peer-to-peer *passes* should do better.
  How much better is unknown (walkthrough §17).
- **Against the KoboldCpp Q6 run:** that is the comparison that matters now, since that run stopped
  refusing. EXL3 5.0 is about a quarter smaller than bartowski's Q6_K (80.6 against 107.8 GB), uses two
  cards instead of three, and quantises the cache cleanly. Nobody has measured whether it's also faster
  once the context fills. It's worth timing a turn at the start of a session and another late in one, on each.
- **Refusals:** the Q6 GGUF stopped refusing with the weights unchanged. Whether 5.0 bpw EXL3 behaves the
  same is exactly the open question in `behemoth-128b.md`, so note what happens.

---

## When done

Walkthrough §15: **stop the pod**. It bills per second whether it's working or not. The weights are on
container disk and go with it. That's deliberate: re-downloading takes minutes, while a standing volume
bills all month.

---

## Verification status

- **Read from source, 2026-10-05:** TabbyAPI `be74bf0`: the one-GPU split logic, the accepted
  reasoning-budget field names, `template_vars_default`, the Gemma 4 thinking tags, and exllamav3 1.5.2
  pinned in `pyproject.toml`. Formamorph's `reasoningDialect.ts` `unknown` row. Both models' `config.json`,
  both repos' file lists (each ships a `chat_template.jinja`), and the full SHA of `e632af4` from GitHub's API.
- **Checked locally:** `pod-setup.sh` passes `bash -n`, and its new settings refuse bad values (a
  `MAX_SEQ` that isn't a multiple of 256, a short `TABBY_REF`, a non-numeric `THINKING_BUDGET`) before
  anything starts.
- **Not run:** everything else. Both recipes, the script's new settings, the re-run path that stops the old
  server, and every memory figure except the 4.25 bpw one.
