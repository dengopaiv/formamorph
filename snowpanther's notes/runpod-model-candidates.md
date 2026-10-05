# Behemoth 5.0 bpw and the Artemis-31B-v1.2 quants — which can reach Formamorph, and how

**Written 2026-10-05**, from the Hugging Face API, the model cards, the live Featherless catalogue
(`GET https://api.featherless.ai/v1/models`, 22,130 models) and TabbyAPI's current `pyproject.toml`.
**Nothing here has been run on a pod or played.** Where a claim rests on arithmetic rather than a
measurement, it says so.

The procedure for actually standing a pod up is [`runpod-exl3.md`](runpod-exl3.md); this file only says
which model goes into it. Behemoth's own history (refusals, the Featherless dead end, the 2026-08-23
measurements) is [`behemoth-128b.md`](behemoth-128b.md).

---

## The short answer

| Model | Best route | Cost shape | Verdict |
|---|---|---|---|
| **Artemis-31B-v1.2** (any quant) | **Featherless, the original BF16 model** | $25/mo flat | **Use this.** It is in the catalogue, unquantised, no pod needed. |
| Artemis-31B-v1.2 EXL3 6.00 bpw | RunPod, **one** A40 / L40S | per hour | Only for what Featherless can't give: >32k context, full sampler control, or no third party holding the text. |
| Behemoth-128B-v3 EXL3 5.00 bpw | RunPod, 2× A40 or 1× 96 GB card | per hour | Fits on paper, unmeasured. A small step up from the 4.25 bpw that has actually run. |
| Everything else in the Artemis list | — | — | Wrong hardware (MLX, OpenVINO, NVFP4) or no better than the EXL3 above. Table in §3. |

**Featherless cannot serve Behemoth** (no community finetune above ~70B, see `behemoth-128b.md` Route A),
and **no quant of anything is ever a Featherless route**: Featherless serves its own copies of full models
by repo id. A quant repo is only something you download onto your own pod.

---

## 1. Artemis-31B-v1.2 — Featherless first

| Field | Value |
|---|---|
| Repo | [`TheDrummer/Artemis-31B-v1.2`](https://huggingface.co/TheDrummer/Artemis-31B-v1.2) |
| Base | `google/gemma-4-31B-it` — dense, 31.3B params, `Gemma4ForConditionalGeneration` (has a vision tower) |
| BF16 size | 62.5 GB |
| Published | 2026-09-25 |
| Author | TheDrummer — a trusted author here |
| Card guidance | "Gemma 4 31B template, thinking or non-thinking." "Sampler wrangling may be required (or be conservative)." |

**On Featherless: yes.** `TheDrummer/Artemis-31B-v1.2`, model class `gemma4-31b`, context **32,768**.
v1 and v1.1 are there too, and so is `sophosympatheia/Mero-Artemis-31B-v0.3.1`, a merge with the MeroMero
lineage this project has already screened. 31B is above the $10 Basic tier's 15B cap, so this needs
**Premium ($25)**.

That makes Artemis the first model in this file that is **playable for a flat fee**, which the budget note
in `model-recommendations.md` says is the only way regular play is affordable. It is also unquantised
there, so it is the best-quality copy of the model on offer anywhere in this file.

Wiring it into Formamorph is the ordinary OpenAI-compatible preset: base URL `https://api.featherless.ai/v1`,
the Featherless key, model `TheDrummer/Artemis-31B-v1.2`. It is HTTPS end to end, so the
encrypted-transport rule is met without a tunnel.

### The Gemma 4 reasoning catch — read before playing

Artemis is a Gemma 4 reasoning model, and the 2026-09-17 stat-pass probe
(`docs-internal/notes/model-research/notes.md`, *Stat-pass reasoning probe*) found that **Gemma 4 31B
models spill their reasoning into the stat-update answer on idle turns** when the app runs the stat pass
with reasoning off. The cap cuts the reply off before any `Stat: N` line, and the player sees a stat pass
silently skipped. A ~150-token thinking budget fixed it on the built-in engine.

That was measured on MeroMero, not Artemis, and on the built-in engine and LM Studio, not Featherless.
**Unknown:** whether Featherless honours the app's reasoning fields for Gemma 4 at all. If it ignores them,
Artemis may think at length on every call (slow, and liable to run into `max_tokens`), or never think
(spill risk on idle turns). The first session on it should watch the stat passes specifically.

---

## 2. Artemis on RunPod — when it is worth renting

Renting a pod for a model Featherless already serves only makes sense for one of these:

- **More than 32k context.** Featherless caps the class at 32,768. Gemma 4 31B goes further natively, and
  the card reports one clean 100k handoff.
- **No third party holding play text.** Featherless is HTTPS, so the transport is fine, but the text
  lands on their servers. Their logging policy has not been checked for this note. A pod down an SSH
  tunnel has nobody else in the path.
- **Sampler control** beyond what Featherless exposes, given the card's "sampler wrangling" warning.

### Which quant

All three EXL3 quants are MikeRoz's, one bit-rate per repo (no `--revision` needed — the friendly layout,
same as his Behemoth repos):

| Repo | Weights | Fits | Comment |
|---|---|---|---|
| `MikeRoz/Artemis-v1.2-6.00bpw-h8-exl3` | 26.7 GB | 1× A40 / L40S (48 GB) | **The pick.** Near-lossless at 31B, and 48 GB leaves ~20 GB for cache. |
| `MikeRoz/Artemis-v1.2-4.00bpw-h6-exl3` | 19.0 GB | 1× 24 GB card, tightly; 1× 48 GB easily | Only if renting a 24 GB card; cache room at 32k unmeasured. |
| `MikeRoz/Artemis-v1.2-2.25bpw-h6-exl3` | 12.6 GB | anything | Below the ~3.0 bpw line `runpod-exl3.md` §3 draws. Skip it. |

**One card means no peer-to-peer problem.** The broken peer DMA that hit three pods out of three
(`runpod-exl3.md` §8) only exists between two cards. A single-GPU pod side-steps the whole thing, and
`pod-setup.sh`'s check already prints `SINGLE` and carries on.

**Engine version: fine with the current scripts.** The card says the quant needs **exllamav3 ≥ 1.5.1**.
`pod-setup.sh` clones TabbyAPI `main` unpinned, and TabbyAPI `main` currently pins **exllamav3 1.5.2**,
which carries `architecture/gemma4.py`. Note this is newer than the 1.4.2 that `runpod-exl3.md` §17
measured, so that whole verified install path is now on a different engine version.

**Script caveat, unverified.** `pod-setup.sh` writes `tensor_parallel: true` unconditionally. On a
single card that is either a no-op or a load error; nobody has tried it. If TabbyAPI refuses to load,
set it to `false` in `/root/tabbyAPI/config.yml` and restart. The `max_seq_len: 32768` it writes is also
the thing to raise if long context is the reason for renting.

Usage, once that holds: `bash pod-setup.sh MikeRoz/Artemis-v1.2-6.00bpw-h8-exl3`, then the tunnel and
preset from `runpod-exl3.md` §12–§13 unchanged.

---

## 3. The rest of the Artemis quant list

The Hugging Face listing has 18 quants. Besides the three EXL3 repos:

| Repo(s) | Format | Runs on | Verdict |
|---|---|---|---|
| `bartowski/…-GGUF`, `mradermacher/…-GGUF` and `…-i1-GGUF`, `Abiray/…-GGUF` | GGUF | llama.cpp / koboldcpp, any GPU, CPU offload | **The fallback.** Q4_K_M ≈ 18.7–19.5 GB. Right for a single 24 GB card or for koboldcpp; on a rented 48 GB card EXL3 6.0 is the better use of it. bartowski is the one the card links. |
| `FaustianDeal/…-BF16-embd-GGUF` | GGUF, BF16 embeddings | same | A slightly larger variant of the above; no reason to prefer it here. |
| `DeusImperator/…-GGUF-long-ctx` | GGUF Q5_K_M, 24.2 GB | same | Name implies a long-context tweak; card **not read**. Only interesting for the >32k reason. |
| `FaustianDeal/…-NVFP4`, `dgibbons/…-NVFP4A16` | NVFP4 (compressed-tensors) | vLLM, built for **Blackwell** | Skip — wrong generation for A40s, and vLLM isn't what our scripts set up. |
| `FaustianDeal/…-NVFP4-GGUF` | NVFP4 inside GGUF | exotic | Skip. |
| `ReadyArt/…_W8A16_PTQ` | 8-bit weights (compressed-tensors) | vLLM | 36.5 GB; works on an A40 via vLLM, but gives nothing EXL3 6.0 doesn't. |
| `ailexleon/…-mlx-4/6/8Bit`, `jancirnodziewiaty/…-oQ4e-mtp` | MLX | Apple silicon only | Not usable. |
| `Wondernutts/…-int4-ov` | OpenVINO int4 | Intel hardware | Not usable. |

**None of them run on the local Quadro P2000 (4 GB).** The smallest file in the list is mradermacher's
IQ1_S at 7.2 GB.

Several GGUF repos also ship an `mmproj` file (the vision projector). Formamorph sends text, so it is not
needed.

---

## 4. Behemoth-128B-v3 at 5.00 bpw

| Field | Value |
|---|---|
| Repo | [`MikeRoz/Behemoth-128B-v3-5.00bpw-h6-exl3`](https://huggingface.co/MikeRoz/Behemoth-128B-v3-5.00bpw-h6-exl3) |
| Weights | **80.6 GB** (75.08 GiB) |
| Quantised with | exllamav3 1.4.2 (`quantization_config.version`) |
| Architecture | `MistralForCausalLM`, 88 layers, 8 KV heads × 128 |
| Card | "Tested without reasoning on Mistral v7 Tekken." Nothing else. |

**Featherless: no**, as for every Behemoth. This is RunPod only.

### Does it fit — arithmetic, not a measurement

The 4.25 bpw run on 2× A40 split **70.0 GB** across the cards (35.3 / 34.7) with 32k context and a Q8
cache, measured. 5.00 bpw adds about 12 GB of weights. The cache is roughly 0.18 MB per token at Q8
(88 layers × 8 heads × 128 × 2), so ~6 GB at 32k.

- **2× A40 (96 GB):** ~40 GB of weights per card plus ~3 GB of cache each, on 48 GB cards. **Should fit at
  32k**, with less headroom than 4.25 had. If it doesn't load, drop `max_seq_len` / `cache_size` to 16384
  before giving up. Still two cards, so still the peer-to-peer workaround (`runpod-exl3.md` §8), still
  ~12 tok/s rather than the 15–20 a healthy pair would give.
- **One 96 GB card (e.g. RTX PRO 6000):** 80.6 + ~6 GB fits on one card, which **removes the
  peer-to-peer problem entirely**. Whether RunPod has one free and at what rate wasn't checked. Also untried:
  a Blackwell card on this install path.
- **1× H100 / A100 80 GB:** does **not** fit; the weights alone are larger than the card.

**Engine:** the quant was made with 1.4.2, the version that ran 4.25 on 2026-08-23. A fresh pod now pulls
1.5.2 via TabbyAPI `main`. Newer exllamav3 is expected to load older EXL3 files, but that pairing is
**untested**. If it fails, check out TabbyAPI `e632af4` (the commit §17 measured) before suspecting
the download.

### Is the step up worth it

Probably not by itself. At ~125B, 4.25 → 5.0 bpw is a small change in quality for ~15% more weights. 5.0 is
worth running if 4.25 sessions felt slightly lossy *and* a 96 GB single card is available, so it costs
nothing in stability.

The refusals, which this note first named as the real problem, are no longer seen: a **Q6_K GGUF on 3× A40
under KoboldCpp** stopped refusing (2026-10-05, weights unchanged; see `behemoth-128b.md`). That run is
also the comparison any EXL3 session now has to beat. It slows down late in long sessions, around 90k of
~148k as KoboldCpp shows it. At 5.0 bpw on two cards, EXL3 would be about a fifth smaller than Q6_K, use one
card fewer, and quantise the cache cleanly. Nobody has measured whether it is faster at that length.

---

## 5. Which to try first

1. **Artemis-31B-v1.2 on Featherless Premium.** No pod, flat rate, full precision, a trusted author, and
   the card's reception is strong. Watch the stat passes for the Gemma 4 spill (§1).
2. If it plays well but 32k context or the third-party question bites: **Artemis 6.00 bpw EXL3 on one
   A40**, through the existing scripts — one card, so no peer-to-peer gamble.
3. **Behemoth 5.00 bpw** only as a deliberate ceiling session, ideally on a single 96 GB card.

---

## Verification status

- **Checked live, 2026-10-05:** Featherless listing (Artemis v1.2, v1.1, v1 present; class `gemma4-31b`;
  context 32,768; no Behemoth), every quant repo's file sizes via the Hugging Face tree API, the three model
  cards, TabbyAPI `main` pinning exllamav3 1.5.2, and exllamav3 shipping `gemma4.py`.
- **Arithmetic only:** every "fits" claim above except the 4.25 bpw Behemoth numbers, which were measured.
- **Not checked:** Featherless's logging policy and whether it honours reasoning controls for Gemma 4;
  RunPod's current GPU stock and prices; `pod-setup.sh` on a single GPU; exllamav3 1.5.x loading a 1.4.2
  quant; any of these models actually played in Formamorph.
