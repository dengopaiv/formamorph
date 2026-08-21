# Recommended Models — August 2026

> **Scope:** the shortlist. *Which* model to point Formamorph at — per local VRAM tier (§1), per rented
> GPU (§2), per flat-rate host (§3), per cloud budget (§4) — and what to change in Settings once you have. The **why** — the
> selection axes, the gate-probe history, the per-model behavior findings — lives in [`model-research.md`](model-research.md), which stays the
> authoritative research log. This doc is downstream of it: refresh that one first, then re-rank here.

**Data pulled:** 2026-08-21 (HF API live; UGI leaderboard CSV; OpenRouter model/pricing API; RunPod pricing).
**Catalog compared against:** [`src/lib/localModels.ts`](../src/lib/localModels.ts) as shipped, screen scores
from [`testing/baseline/leaderboard.md`](../testing/baseline/leaderboard.md) (last screened 2026-07-18).

---

## Read the evidence column before you act

Everything below carries one of three evidence levels. They are not interchangeable.

| Level | Means | Trust it for |
|---|---|---|
| **SCREENED** | Been through `npm run screen` on the gate world, multi-seed | Shipping. It is a catalog-grade number. |
| **CANDIDATE** | Real provenance (trusted author, right base, right shape) but **never run against the gate** | Downloading and screening next. Not for the catalog. |
| **REPORTED** | Third-party leaderboard or model card only | Narrowing the candidate list. Nothing else. |

Nothing new since 2026-07-18 has been screened. Every recommendation marked CANDIDATE below is a
*download-and-screen* instruction, not a swap-it-in instruction. The house rule stands: a model enters
`localModels.ts` only after it clears the location-router gate.

---

## 1. Local models, by VRAM tier

Models the built-in engine downloads and runs on your own machine. Anything above 32 B is in §2 instead.

### ≤4 GB — still a hole, and the new small models don't fill it

| Model | Evidence | Verdict |
|---|---|---|
| Impish LLAMA 4B *(shipping pick)* | SCREENED C/31 | Weak (format 30%), barely cleared routing at 93%. Still the only member. |
| Qwen3.8-2B / 4B Distill (`empero-ai`, 2026-08-15) | REPORTED | New, but the whole small-Qwen line keeps failing this pipeline — Qwen3.5-2B abliterated was screened and REJECTED on routing (80%), Qwen3-4B RPG before it (60%). |
| LiquidAI LFM2.5-2.6B (2026-08-01) | REPORTED | Assistant/agent shaped, not creative. UGI writing for the LFM2.5 family sits ~34 at 1.2B. |

**Recommendation: do not backfill this tier from the August releases.** The tier-4 failure mode is
consistently *location routing*, and nothing in the new small-model wave is aimed at instruction-terse
classification plus prose. The open question from `model-research.md` — retire the tier or keep hunting — is
still open, and this refresh gives no reason to answer it differently.

### ≤8 GB — one clean challenger

| Model | Evidence | Repo / file | Q4_K_M |
|---|---|---|---|
| **Gemma-4 12B Uncensored (HauhauCS)** *(shipping pick)* | SCREENED **B/65** | `HauhauCS/Gemma4-12B-QAT-Uncensored-HauhauCS-Balanced` | 7.38 GB |
| ▶ **Gemma-4 12B StyleTune** (Gryphe) | CANDIDATE | `mradermacher/Gemma-4-12B-StyleTune-i1-GGUF` → `Gemma-4-12B-StyleTune.i1-Q4_K_M.gguf` | 7.95 GB |
| Sicarius `Sweet_Dreams_12B` / `Impish_Bloodmoon_12B` | CANDIDATE — see caveat | `SicariusSicariiStuff/…_GGUF` | ~7.5 GB |
| Ornith-1.5-9B | CANDIDATE — **reject on shape** | `ornith-ai/Ornith-1.5-9B-GGUF` | 5.63 GB |

**Screen Gemma-4 12B StyleTune next.** It is the tier-8 shaped sibling of `Gemma-4-26B-A4B-StyleTune-V2`,
which is the **#2 model on our whole board (B/69)** and one of only two models that ever showed real stat
restraint (11%). Same tuner, same recipe, same Gemma-4 family as the current tier winner — this is the single
highest-probability upgrade in the catalog. Apache-2.0, base `google/gemma-4-12B-it`. Fits 8.5 GB, though
tighter than the incumbent (7.95 vs 7.38 GB) — check it still loads with a working context on a real 8 GB card.

**The Sicarius 12Bs are the base's problem, not the tuner's.** `Sweet_Dreams_12B` (UGI Writing 34.25) and
`Impish_Bloodmoon_12B` (31.72, and the author's most-downloaded RP model) are the strongest of that line —
but every one of them is `Mistral-Nemo-Instruct-2407`, and **Nemo has never cleared B on our board**
(Rocinante-X 12B C/37, Silver-Siren B/53). Screen one only after StyleTune, and treat a C as the base
speaking rather than the tuning. Sicarius' real value to this project is at 4B — see the author notes in
[`model-research.md`](model-research.md).

**Ornith-1.5-9B is a trap.** It is the most-downloaded new small model on the Hub right now (115k in three
days) and it is *wrong for us*: a reasoning-first coding/agentic model — SWE-bench tuned, `reasoning_content`
blocks, "optimized toward developer tools rather than creative writing or roleplay" per its own card. Popular
≠ eligible. Skip.

### ≤16 GB — no successor; the incumbent holds

| Model | Evidence | Note |
|---|---|---|
| **Cydonia 24B v4.3** *(shipping pick)* | SCREENED **B/60** @ shipping Q4_K_M | Confirmed still TheDrummer's newest Cydonia — nothing after v4.3 (2025-11-08). |
| ▶ **Orion-26B-A4B** (BeaverAI, in flight) | CANDIDATE — **watch this one** | Q4_K_M 16.80 GB overflows the 16.5 GB ceiling; `Q3_K_M` 13.29 GB fits. `BeaverAI/Orion-26B-A4B-v1d-GGUF` (v1e landed 2026-08-21). |
| Rocinante-XL-16B v1 | CANDIDATE — low priority | `TheDrummer/Rocinante-XL-16B-v1-GGUF`, 9.75 GB. Mistral-Nemo base, which **has never cleared B** on our board (Rocinante-X 12B C/37, Silver-Siren B/53). |

**Nothing to change here yet — but Orion is coming.** The 24B RP scene did not move between February and
August 2026; TheDrummer's 2026 output went 31B (Artemis) and 128B (Behemoth), skipping the 24B slot
entirely. Cydonia v4.3 stays the ≤16 GB pick.

The live lead is **`Orion-26B-A4B`**, still in TheDrummer's testing org — `v1a` through `v1e`, the last
dated **2026-08-21**, i.e. today. Two reasons to care: it is a **26B-A4B MoE**, the exact shape as
`Gemma-4-26B-A4B-StyleTune-V2`, our **#2 board model (B/69)** and one of only two that ever showed real
stat restraint; and 4B active parameters means it generates at small-model speed across ~10 calls a turn.
Lettered BeaverAI builds are work-in-progress and change without notice — do not screen a letter and record
it as a score. Watch for the `TheDrummer/Orion-26B-A4B` release, then screen that. Note the standing caveat from the research doc: Cydonia is *hurt* by Memory Digests on long
sessions (silent by ~turn 42 vs perfect on bare history) — see §5.

### No Limit (≥20 GB) — the interesting tier, three real challengers

| Model | Evidence | Repo / file | Q4_K_M |
|---|---|---|---|
| **G4 MeroMero 31B** *(shipping pick)* | SCREENED **A/84** | `zerofata/G4-MeroMero-31B-gguf` | 18.69 GB |
| ▶ **G4 MeroMero v2 31B** | CANDIDATE — **screen first** | `zerofata/G4-MeroMero-v2-31B-GGUF` → `G4-MeroMero-v2-31B-Q4_K_M.gguf` | 18.69 GB |
| ▶ **Gemma-4 31B StyleTune** (Gryphe) | CANDIDATE — **best provenance on the page** | `mradermacher/Gemma-4-31B-StyleTune-i1-GGUF` → `…i1-Q4_K_M.gguf` | 19.48 GB |
| **Artemis 31B v1.1** (TheDrummer) | CANDIDATE | `TheDrummer/Artemis-31B-v1.1-GGUF` → `Artemis-31B-v1m-Q4_K_M.gguf` | 18.69 GB |
| **Qwen3.8-27B Dominatrix** (allura) | CANDIDATE — bleeding edge | `allura-quants/Qwen3.8-27B-Dominatrix-GGUF` → `allura-org_Qwen3.8-27B-Dominatrix_Q4_K_M.gguf` | 16.81 GB |
| Glistening-Gem 31B v2.0 | CANDIDATE — low priority | `zerofata/Glistening-Gem-31B-v2.0-gguf` | 18.69 GB |

**MeroMero v2 is the highest-value screen on this list.** Released 2026-07-31 (GGUF 08-03), it is a direct
successor to the model that tops our board and is the *only* model we have measured with real restraint (56%).
The card claims exactly the axis we score: "notably more diverse swipes", measurably reduced RP slop, with
IFEval/MMLU-Pro held flat — i.e. prose variety bought without losing the instruction-following that the
router, stats and choices passes depend on. Apache-2.0. Recommended samplers temp 0.8–1.0, minP 0.05.
**Screen it against v1 before swapping** — restraint was dense-31B-specific magic once before (the 26B-A4B
MoE sibling did *not* inherit it, B/60 vs A/84), so a v2 inheriting it is a hypothesis, not a given.

**Gemma-4-31B StyleTune has the best provenance of anything unscreened.** It sits at the intersection of
both models at the top of our board: the **same base** as `G4-MeroMero-31B` (A/84) — `google/gemma-4-31B-it`
— and the **same tuner** as `Gemma-4-26B-A4B-StyleTune-V2` (B/69, one of only two models that ever showed
real stat restraint). Released 2026-06-10, apache-2.0, and the community has voted: mradermacher's i1 quants
have 28k downloads. It is served on Featherless (§3), so it can be screened without downloading 19 GB.
Arguably this should be screened *before* MeroMero v2 — v2 is a hypothesis about restraint being inherited,
this is the same recipe from the other parent.

**Artemis 31B v1.1** is the same Gemma-4-31B base from a tuner already on our board, explicitly
creativity-over-alignment, and supports both Gemma thinking templates and custom `<think>`/`<thinking>` blocks
— which means it needs the reasoning handling verified (see §5) before it is judged. Worth a screen after
MeroMero v2.

**Qwen3.8-27B Dominatrix** is the one genuinely new *base*. Qwen3.8-27B landed 2026-08-14 (Apache-2.0, 262K
native context) and is the biggest release of the month by download volume; allura had an RP/creative-writing
finetune out three days later. Caveats, plainly: the card says "no beta read we die like llama 4", it is four
days old, and at 16.81 GB it overflows the ≤16 GB tier (16.5 GB ceiling) so it lands here rather than
competing with Cydonia. High upside — a modern long-context base is exactly what the fat injected prompt
wants — but this is the least-settled entry on the page.

---

## 2. Rented GPUs — everything above 32 B

> **Renting is for screening, not for playing.** It bills wall-clock, so a habit costs more than a
> curiosity. If the question is *what do I actually play on*, skip to **§3** — flat-rate hosting serves
> every model this doc recommends, for a fixed monthly bill and no GPU at all. Read this section for what
> the >32 B tier contains and what it would cost to try one.

A Quadro P2000 is a 4 GB card. Every tier above §1's first row is unreachable locally, so the >32 B models
below are only ever reached through a **rented pod exposing an OpenAI-compatible endpoint** — RunPod, Vast,
whatever. That makes them *endpoint-preset* models, not catalog models: none of them belong in
[`localModels.ts`](../src/lib/localModels.ts), which only ever describes what the built-in engine downloads
onto the machine Formamorph is running on.

### The rule that decides rent-vs-API

**A rented GPU bills wall-clock. An API bills tokens.** Formamorph is a reading-heavy app — you spend far
more time reading narration, weighing a choice and editing the world than the model spends generating. Every
one of those minutes is billed on a pod and free on an API.

That gives one clean rule:

> **Rent only for models that have no API.** Every frontier open-weight in §4 — DeepSeek V4, GLM-5.x, Kimi —
> is served by somebody for cents. Self-hosting a 671B to save money is arithmetic that never closes: 8×H100
> is ~$21/hr against ~$0.45 per 100 turns on V4 Flash. The models worth renting are the ones nobody hosts:
> the uncensored roleplay finetunes below.

### What the hardware costs

RunPod list, Community Cloud / Secure Cloud, pulled 2026-08-21. "Fits" budgets the GGUF file plus ~15% for
KV cache and overhead at Formamorph's default 10,750-token window.

| GPU | VRAM | $/hr (Comm / Secure) | Comfortably fits |
|---|---|---|---|
| RTX 4090 | 24 GB | $0.34 / $0.74 | ≤20 GB — 31B Q4, 35B-A3B IQ4_XS |
| RTX 5090 | 32 GB | $0.69 / $0.99 | ≤27 GB — 49B IQ4_XS |
| **A40** | 48 GB | **$0.35** / $0.44 | ≤42 GB — **70B Q4_K_M**, 49B Q5_K_M |
| L40S | 48 GB | $0.79 / $0.99 | same as A40, faster, ~2× the price |
| **2 × A40** | 96 GB | **$0.70** / $0.88 | ≤84 GB — **123B / 128B Q4_K_M** |
| A100 PCIe | 80 GB | $1.19 / $1.39 | ≤70 GB — 123B IQ4_XS, 106B-A12B Q4_K_M |
| H100 PCIe | 80 GB | $1.99 / $2.89 | same as A100, much faster |
| H200 | 141 GB | $3.59 / $4.59 | ≤123 GB — 123B Q6_K |

**The A40 is the value outlier.** 48 GB at $0.35/hr is cheaper per hour than a 24 GB 4090 and holds a 70B at
Q4_K_M. Two of them are cheaper than one A100 and carry 16 GB more. Unless you need the speed, the A40 is
the answer at both ends of this table.

Storage is billed separately and is easy to forget: network storage runs $0.07/GB/month, so parking a 73 GB
Behemoth quant costs ~$5/month standing whether you play or not — and a pod without it re-downloads tens of
GB on every cold start.

### What 100 turns actually costs

Wall-clock, so it depends entirely on how fast you play. Two paces, both estimates rather than measurements:

| GPU | $/hr | 100 turns @ ~40 turns/hr | 100 turns @ ~15 turns/hr |
|---|---|---|---|
| A40 | $0.35 | **~$0.88** | ~$2.33 |
| 2 × A40 | $0.70 | ~$1.75 | ~$4.67 |
| RTX 5090 | $0.69 | ~$1.73 | ~$4.60 |
| A100 80 GB | $1.19 | ~$2.98 | ~$7.93 |
| H200 | $3.59 | ~$8.98 | ~$23.93 |

Worth sitting with: **a 70B on an A40 at a brisk pace lands near $0.88 per 100 turns — cheaper than Kimi
K2.5 (~$2.60), with a W/10 of 8.5 against Kimi's 2.0.** Renting is not automatically the expensive option
here. It becomes the expensive option when you play slowly, and it stops being an option at all if you
forget to stop the pod.

### On a pod, GGUF is probably the wrong format

Worth saying before the size tables below, because they are all GGUF. GGUF is llama.cpp's format and it is
the right answer for the built-in engine — one file, CPU offload, no server to babysit. On a rented GPU
none of that applies: the weights fit in VRAM, and **vLLM with an FP8 or W4A16 quant serves the same model
several times faster**, which under wall-clock billing is money. It also handles ~10 concurrent calls per
turn properly, which is exactly Formamorph's request pattern with **Concurrent turn requests** on.

**`tacodevs` is the author to know here** — a quantizer rather than a finetuner, publishing precisely those
serving formats for models we already care about:

| Model | Formats | Why it matters |
|---|---|---|
| `Cydonia-24B-v4.3` | AWQ, FP8-Dynamic, W4A16-GPTQ | The vLLM build of our **screened B/60** ≤16 GB pick. Fits a 4090 at $0.34/hr. |
| `Behemoth-R1-123B-v2` | FP8-Dynamic, W4A16-GPTQ | 123B on a pod without quantizing it yourself — **but see the caveat** |
| `Behemoth-T1-123B`, `T1-v2`, `X-R1-123B` | FP8, GPTQ, LoRA | Same caveat |
| `Skyfall-31B-v4.2` | FP8-Dynamic | Solid mid-size (UGI Writing 39.99 / W-10 8.0 for v4) |

**The caveat, and it is a real one:** every 123B `tacodevs` covers is an `R1`/`T1` **reasoning** Behemoth,
and those score far worse at writing than the plain ones — `Behemoth-R1-123B-v2` is Writing **26.4** /
W-10 **2.8**, against Behemoth-X-v2's **50.27 / 8.2**. The format is right and the model is wrong. Nobody
has published an FP8 of Behemoth-X-123B-v2, so reaching the best 123B on vLLM means quantizing it yourself
or accepting llama.cpp and the GGUF sizes below.

### The models

Evidence is UGI unless marked otherwise. **None of these have been through `npm run screen`** — the same
CANDIDATE caveat as everywhere else in this doc, and it bites harder here because you are paying by the hour
to find out.

| Model | Params | UGI Writing | W/10 | Q4_K_M | Rent on |
|---|---|---|---|---|---|
| ▶ **Behemoth-X-123B-v2** (TheDrummer) | 123B dense | **50.27** | **8.2** | 73.22 GB | 2×A40 / A100 |
| **Anubis-70B-v1.1** (TheDrummer) | 70B dense | 46.26 | **8.5** | 42.52 GB | **A40** |
| GLM-4.5-Air `/nothink` (zai-org) | 106B-A12B | 47.0 | 7.0 | ~70 GB | A100 / 2×A40 |
| Behemoth-ReduX-123B-v1 | 123B dense | 48.76 | 6.8 | 73.22 GB | 2×A40 / A100 |
| Behemoth-X-123B-v2.1 | 123B dense | 45.81 | 8.2 | 73.22 GB | 2×A40 / A100 |
| ▶ **Behemoth-128B-v3** (2026-08-18) | 128B dense | *unrated* | *unrated* | 78.41 GB | 2×A40 |
| Anubis-70B-v1.2 | 70B dense | 45.47 | 6.0 | 42.52 GB | A40 |
| GLM-4.5-Air-Derestricted `/nothink` (ArliAI) | 106B-A12B | 43.70 | 7.8 | ~70 GB | A100 / 2×A40 |
| Valkyrie-49B-v2.1 (TheDrummer) | 49B dense | 40.43 | 6.0 | 30.22 GB | 5090 / A40 |
| Qwen3.6-35B-A3B-Anko (allura) | 35B-A3B | *unrated* | *unrated* | 21.39 GB | **4090** |
| Trinity-Large-Preview (arcee) | 398B-A13B | 40.72 | 5.5 | — | H200+ |

**Behemoth-X-123B-v2 is the ceiling, and it is a real one.** At Writing 50.27 it is the **highest-scoring
open-weight non-frontier model on the entire UGI board** — nothing else outside the DeepSeek/GLM/Kimi
frontier tier clears 50 — and it pairs that with W/10 8.2, which those frontier models emphatically do not
(V4 Pro 3.2, GLM-5.2 2.8, Kimi K2.5 2.0). It is the one model here that is plausibly better than
`G4 MeroMero 31B` at the thing MeroMero already scores A/84 for — with one behavior note below. Mistral-Large lineage, August 2025, so it
is mature rather than bleeding-edge: quants, templates and community settings are all settled.
`bartowski/TheDrummer_Behemoth-X-123B-v2-GGUF` → Q4_K_M 73.22 GB, IQ4_XS 65.43 GB, Q6_K 100.59 GB.

**Behemoth has no content floor** — probed directly, and the limit is set by the prompt rather than by the
model. Treat that as a steerability property rather than a feature: the narrator here chooses its own beats
through the director and character passes, so a model with no stopping condition lets a long session drift
somewhere nobody steered it. It does not disqualify anything, because at 123B it was never a catalog
candidate — but it does mean the W-10 8.2 in the table above should not be read as "better than 7.2." See
*Reading W/10 at the top of its range* in [`model-research.md`](model-research.md). Put the floor in the
prompt and the preset, where you can see it and edit it.

**Anubis-70B-v1.1 is the value pick, and note the version number.** It beats the *newer* v1.2 on all three
axes — Writing 46.26 vs 45.47, UGI 50.79 vs 43.21, W/10 8.5 vs 6.0. Newer is not better in this family, and
v1.1's W/10 of 8.5 is the highest on this table. `bartowski/TheDrummer_Anubis-70B-v1.1-GGUF` → Q4_K_M
42.52 GB, which fits a single A40 with ~5 GB left for context: fine at the default 10,750 window, tight
above it. Drop to `IQ4_XS` (37.90 GB) if you want to raise the context.

**Behemoth-128B-v3 is new and genuinely unproven.** Released 2026-08-18 on `Mistral-Medium-3.5-128B`,
apache-2.0, GGUFs at `bartowski/TheDrummer_Behemoth-128B-v3-GGUF`. The card is one line — *"Tested without
reasoning on Mistral v7 Tekken"* — which at least tells you the template and to leave reasoning off. Its
base scores Writing 45.47 / W/10 6.0 at `reasoning=none`, below Behemoth-X-v2's finetuned 50.27. **Screen it
against Behemoth-X-v2 before assuming the newer number wins** — the Anubis v1.1-vs-v1.2 result above is the
cautionary case.

**Skip the Iceblink finetunes; rent the base Air.** zerofata authors our A/84 board leader, so
`GLM-4.5-Iceblink-v3-106B-A12B` looked like the obvious MoE pick. The measurements say otherwise: base
`GLM-4.5-Air /nothink` scores Writing **47.0**, while Iceblink v2 `/nothink` scores **37.96** and v1 42.36 —
the finetune *lowers* writing against its own base. With thinking left on, Iceblink's W/10 collapses to
**1.5**. If you want the MoE — and there is a good reason to, since 12B active parameters generate several
times faster than a 123B dense model and you are paying by the hour — take base Air with `/nothink`, or
ArliAI's Derestricted build (43.70 / 7.8) if you want the refusals gone.

**Valkyrie-49B-v2.1 is the cheap dense option and confirms the reasoning finding.** Plain: 40.43 / 6.0. With
`<think>` prefill: **31.11 / 2.2**. Thinking makes it materially worse on both axes, which is §5's argument
arriving from an independent direction.

### Not worth renting

| Model | Why not |
|---|---|
| Vulpine-Seduction-70B, Feline-Clairvoyance-72B (Mawdistical), DarkDesires-LLaMa-70B (TareksLab) | Released 19–21 Aug 2026, unrated, unfamiliar authors, only third-party auto-quants. REPORTED only — revisit in a month. |
| `ArliAI/Qwen3.5-122B-RpRMax-v1` | No GGUF published by anyone. Not reachable without quantizing it yourself. |
| Trinity-Large-Preview 398B-A13B | Writing 40.72 for weights that need an H200 at $3.59/hr. The 70Bs beat it for a tenth of the money. |
| DeepSeek V4 / GLM-5.x / Kimi K2.5 weights | 4–8×H100, ~$11–21/hr. The API is cents. Never rent these. |
| `Llama-3.3-70B-Joyous` (allura) | Writing 38.09, W/10 2.5 — beaten by both Anubis 70Bs on the same base. |

### Two things to do on the pod, in this order

**Screen before you play.** The location router is the gate, and it is the exact failure already seen in
play. A 123B that misses the 90% routing threshold is a 123B you are paying $1.19/hr to watch fail. Point
the endpoint at the pod and run `npm run screen -- --model <label>` in the first fifteen minutes: at A100
rates that is roughly $0.30 of pod time to avoid a wasted session.

**Then split the endpoints.** This is the single biggest lever and it already shipped (2.10.0). A turn fires
~10 calls, and only *narration* needs the 123B — the router, stats, choices, clock and digests all want a
terse literal answer that a small fast model produces better and quicker. **Settings → Prompts →** *(prompt)*
**→ Options → Endpoint** pins each prompt to its own endpoint preset. Leave narration on the pod and send the
other nine to DeepSeek V4 Flash — or, if you would rather keep the whole turn off the cloud, to a second
small local model. `SicariusSicariiStuff/Assistant_Pepe_8B` is the interesting choice there: **W-10 8.8**,
assistant-shaped, and the nine passes it would serve want obedience rather than prose. That cuts the pod's wall-clock per turn substantially, which under
wall-clock billing *is* the cost saving — and it removes the reasoning-budget problem from the passes capped
at 8 and 12 tokens in the same move. Routing rides on the prompt preset, so duplicate a built-in first; the
shipped Default, Simple and XML presets are read-only.

---

## 3. Flat-rate hosting — the answer when you can't rent

**Read this before §2.** Renting is priced by the hour, which makes it fine for a one-off screen and bad for
playing regularly. There is a third option that neither §2 nor §4 covers: providers that host **the RP
finetunes themselves** — not frontier models — at a **flat monthly rate**, behind an OpenAI-compatible
endpoint. No GPU, no download, no hourly meter.

This is the one that fits actually playing.

### The two providers

| | Featherless *(Chat)* | ArliAI *(Core / Pro)* |
|---|---|---|
| Price | **$25/mo** | **$15** / $30 per mo |
| Tokens | Unlimited | Unlimited |
| Model ceiling | 70B–120B classes | 355B |
| Context | 32K | 32K / 128K–256K |
| Concurrency | **4 units** | **1** / 2 |
| Catalog | ~21,750 HF models | curated RP set |

Featherless is the one to look at first, because it already serves **every model this document
recommends** — checked against their live `/v1/models`:

| Model | Our standing | Featherless class | Concurrency cost |
|---|---|---|---|
| `zerofata/G4-MeroMero-31B` | **SCREENED A/84 — board leader** | gemma4-31b | 2 |
| `zerofata/G4-MeroMero-v2-31B` | screen-queue #1 | gemma4-31b | 2 |
| `Gryphe/Gemma-4-26B-A4B-StyleTune-V2` | **SCREENED B/69 — #2 on board** | gemma4-25b | 2 |
| `Gryphe/Gemma-4-31B-StyleTune` | **candidate — see below** | gemma4-31b | 2 |
| `TheDrummer/Cydonia-24B-v4.3` | SCREENED B/60 | mistral-24b | 2 |
| `TheDrummer/Artemis-31B-v1.1` | screen-queue #3 | gemma4-31b | 2 |
| `TheDrummer/Anubis-70B-v1.1` | §2 value pick, W-10 8.5 | llama31-70b | 4 |
| `SicariusSicariiStuff/Assistant_Pepe_70B` | W-10 **9.5** | llama31-70b | 4 |
| `SicariusSicariiStuff/Assistant_Pepe_8B` | W-10 8.8 | llama31-8b | **1** |
| `deepseek-ai/DeepSeek-V4-Flash` | §4 cloud pick | deepseek4-284b | 4 |

No Behemoth: the classes stop around 70B/120B, so 123B is genuinely out of reach here. Everything else is in.

### The split works, and it fits in one $25 plan

The concurrency budget is what decides this, and the arithmetic lands well:

> **`G4-MeroMero-31B` (2 units) + `Assistant_Pepe_8B` (1 unit) = 3 of 4 units.**

Board-leading prose on narration, a 9-out-of-10-willingness assistant on the structured passes, one
subscription, one flat bill, a spare unit. Pin it in **Settings → Prompts →** *(prompt)* **→ Options →
Endpoint**, exactly as §2 describes, with two Featherless presets instead of a pod and a cloud key.

The **70B version of the same idea does not fit**: `Anubis-70B-v1.1` and `Assistant_Pepe_70B` cost 4 units
each, so either one alone consumes the whole Chat plan. Run a 70B *or* the split, not both — or turn
**Concurrent turn requests** off and let the turn serialize.

### What it costs against the alternatives

Per-token rates are published too (the Developer plan), which makes the flat rate easy to judge. At the ~50K
in / ~1.5K out per turn this doc assumes:

| Route | Per 100 turns | Notes |
|---|---|---|
| DeepSeek V4 Flash (§4) | ~$0.45 | Cheapest credible option, full stop |
| `Cydonia-24B-v4.3` metered | ~$1.05 | |
| `G4-MeroMero-31B` metered | ~$3.04 | The A/84 model, per token |
| **Featherless Chat, flat** | **$25/mo whatever you play** | Breaks even against metered MeroMero at ~820 turns/mo |
| Rent 1×A40 (§2) | ~$0.88–$2.33 | Plus wall-clock risk and a ~$5/mo storage tail |

So: **play a lot and the flat rate wins; play a little and metered wins.** Neither requires a rig, and both
are cheaper and steadier than an hourly GPU.

### Two honest caveats

**The Chat plan's terms exclude benchmarking.** It is sold for "interactive, human-driven use" and
explicitly not for "reselling, app/API traffic, background automation, or benchmarking." Playing Formamorph
is squarely the intended use — a human driving a local app. **Running `npm run screen` against it is not**:
that is automated benchmarking by name. Screen on the metered Developer plan or on a rented pod, and keep
the Chat plan for playing.

**32K context.** Above Formamorph's 10,750 default, so nothing is lost today — but it caps how far the
context window can be raised later, and §5's warning about raising it across ~10 calls a turn applies here
in units of concurrency rather than dollars.

---

## 4. Cloud / API endpoints

Formamorph talks OpenAI-compatible chat completions, so anything with a `/v1` works via a custom text
endpoint preset. The shipped **Default** preset points at `https://api.lyonade.net/v1`.

### The economics matter more than usual here

A Formamorph turn is **one narration call plus up to ~10 small structured calls**, each carrying the fat
injected context (default context window 10,750 tokens). That multiplies token price by roughly an order of
magnitude versus a normal chat app — so a model's price per million is not a footnote, it is the deciding
axis for anything but a short session.

Estimates below assume **~50k input + ~1.5k output per turn** (10 calls near the default window, most well
under it). Order-of-magnitude only; prompt caching cuts input sharply on repeated context.

| Model | In / Out per M | ctx | UGI Writing | W/10 | ~100 turns | Verdict |
|---|---|---|---|---|---|---|
| **DeepSeek V4 Flash** | $0.083 / $0.165 | 1.3M | 54.6 (no-think) | **7.2** | **~$0.45** | ▶ **The pick.** Best willingness-per-dollar on the board by a wide margin. |
| GLM-4.7 Flash | $0.06 / $0.40 | 203K | — | — | ~$0.36 | Cheapest credible option; unmeasured on writing. |
| MiniMax M3 | $0.30 / $1.20 | 1M | — | — | ~$1.70 | Untested here; cheap, long context. |
| Kimi K2.5 | $0.45 / $2.25 | 262K | 61.5 (no-think) | **2.0** | ~$2.60 | Fine prose, **low willingness** — see below. |
| DeepSeek V4 Pro | $1.19 / $3.56 | 1M | **68.4** | 3.0 | ~$6.30 | Best prose measured anywhere. Pricey at 10 calls/turn. |
| GLM-5.2 | $0.97 / $3.04 | 1M | 67.0 | 2.8 | ~$5.30 | Prose rival to V4 Pro. (GLM-5.3 shipped 08-18, unmeasured.) |
| Kimi K3 | $3.00 / $15.00 | 1M | — | — | ~$172 | **~380× V4 Flash per turn.** Not viable for this call pattern. |

**Recommendation: DeepSeek V4 Flash, non-reasoning, as the default cloud endpoint.** It is the only model
that scores well on *both* our gating axes — willingness 7.2/10 (versus 2–3 for the Kimi and GLM flagships)
and writing 54.6, ahead of every local model we have ever screened — while costing less per turn than
anything except a flash-tier lightweight. The 1.3M context removes any banding pressure.

**If you want the best prose and the content is tame:** DeepSeek V4 Pro (writing 68.4, the highest measured
score in the CSV) or GLM-5.2 (67.0). Budget ~$5–6 per hundred turns and expect hedging at the edges.

### On Kimi specifically

Kimi K2.5 writes well (61.5 no-reasoning, above every local option) but sits at **W/10 = 2.0** — bottom decile
for willingness. K2.6 is no better (1.8–2.0). If a Kimi session feels like it is steering away from things,
that is the measured behavior, not a configuration problem. Moonshot's own line is documented as prone to
"unexpected refusals, overly cautious responses, or long reasoning loops" on creative work. It is a reasonable
choice for non-adult worlds; it is a poor default for this app's stated content range.

Also worth knowing, given the location-router question: **K2.5 is a reasoning model.** See §5 — the router
call is exactly where that hurts.

---

## 5. Settings that change per model class

Picking the model is half of it. These four toggles are model-dependent and currently ship one-size-fits-all.

**Reasoning models and the small structured passes.** The router, stats, choices and time passes want a
terse literal answer (`NONE`, a bare name, `name: +2`). A reasoning model spends its budget thinking first —
and `timePassed` is capped at **12 tokens**, `openingTime` at **8**. Turn thinking off for those. Settings →
System Prompts → *(prompt)* → Options carries the per-prompt reasoning control; the global `/no_think` soft
switch covers Qwen-style models wholesale. Keep reasoning **on** for director / character / storyboard, where
the research doc measures it as a genuine help, and **off** for narration, where it over-schematizes prose.

**Memory Digests are model-dependent — the one setting most worth changing by hand.** Measured, both
directions: the cloud/E4B tier *needs* condensation (bare history collapses its dialogue by ~turn 42), while
strong locals like Cydonia are *actively hurt* by it (perfect on bare history, silent by ~turn 42 with
digests on). Default is ON. On a Cydonia-class local model, try turning it OFF for long sessions.

**Concurrent turn requests.** Leave on for cloud and any serial-queueing endpoint. Turn off on a VRAM-tight
local engine, where ten concurrent calls will slow or OOM it.

**Context window.** Default 10,750 (local engine 8,192). Every model in §4 offers 200K–1.3M, so on cloud
there is real headroom to raise it — but that raises per-turn cost proportionally across ~10 calls. Raise it
deliberately, not reflexively.

---

## 6. Trending but wrong for us

Recorded so they stop getting re-proposed each time the Hub's trending page is checked.

| Model | Why it trends | Why not here |
|---|---|---|
| **Ornith-1.5** (9B / 35B-A3B / 397B) | Top of HF trending, 115k downloads in 3 days | Coding/agentic reasoning model, SWE-bench tuned. Wrong shape entirely. |
| **Qwen3.8-27B** base + heretic/abliterated variants | Biggest release of August 2026 | The *base* is a fine target — but take an RP finetune of it (Dominatrix), not the raw or crudely-abliterated builds. |
| **LiquidAI LFM2.5** family | Heavy promotion, tiny footprint | Assistant-shaped, sub-3B. Our sub-4B failures are already documented. |
| **Kimi K3** | Newest Moonshot flagship | ~$172 per 100 turns at our call pattern. Arithmetic, not opinion. |
| **DeepSeek V4 Pro / Qwen3.8-Max** | Frontier open weights | Fine on a hosted endpoint if you pay for it; never worth renting a pod for — see §2. |

---

## 7. Next actions

**The framing changed with §3.** Every model in the screen queue is served on Featherless, so screening no
longer means downloading 19 GB per candidate or renting a pod — it means pointing the harness at a hosted
endpoint. Do it on the **metered Developer plan**, not the Chat plan, whose terms exclude benchmarking.

Ordered by expected value:

1. **Screen `Gemma-4-31B-StyleTune`** — best provenance of anything unscreened: MeroMero's base, StyleTune's
   tuner, both parents already top-3 on our board. Hosted, so it is a config change away.
2. **Screen `G4-MeroMero-v2-31B` against v1** — `npm run screen -- --model meromero-v2-31b`, 3 seeds. The
   top-of-board's successor; if restraint carries over it is a straight catalog swap.
3. **Set up the split and play on it** — `G4-MeroMero-31B` (2 units) on narration, `Assistant_Pepe_8B`
   (1 unit) on the other nine passes, 3 of 4 units on one $25 Featherless plan. This is the configuration
   change with the largest effect on actual play, and it needs no screening to try.
4. **Screen `Gemma-4-12B-StyleTune`** — highest-probability ≤8 GB upgrade, and the only one of these that
   matters for the local 4 GB machine.
5. **Screen `Artemis-31B-v1.1`** — verify the thinking-template handling before judging the score.
6. **Re-pull UGI for the August models** — MeroMero v2, Artemis, Dominatrix, StyleTune-31B, Ornith and
   GLM-5.3 are all absent from the current CSV. The willingness numbers are worth having before screening.
7. **Consider `Qwen3.8-27B-Dominatrix`** once it has a few weeks of community signal.
8. **Leave tier-4 alone.** No viable backfill candidate exists in this wave.

Watch-list rather than screen-queue:

9. **`TheDrummer/Orion-26B-A4B`** — in testing at BeaverAI now (`v1e`, 2026-08-21). Same 26B-A4B MoE shape
   as our #2 board model. Screen the release, not the lettered builds.
10. **`Anubis-70B-v1.1` and `Assistant_Pepe_70B`** — both hosted, but 4 concurrency units each, so they need
    a bigger plan or a serialized turn. Worth one session to see whether a 70B changes anything.
11. **The 123B tier stays theoretical.** `Behemoth-X-123B-v2` (Writing 50.27 / W-10 8.2) is the best
    open-weight RP model measured anywhere, and nothing hosts it — it needs 2×A40 by the hour. Note that
    **DeepSeek V4 Flash beats it on Writing (54.58) at ~$0.45 per 100 turns**, so this is a curiosity to
    satisfy on a rented pod some weekend, not a gap in the setup.

When any of these is screened, update `leaderboard.md` and the catalog table in `model-research.md` first,
then re-rank this doc.

---

## Sources

- [Hugging Face Model API](https://huggingface.co/api/models) — release dates, all-time downloads, licenses,
  GGUF filenames and exact byte sizes (pulled live 2026-08-21).
- [UGI Leaderboard](https://huggingface.co/spaces/DontPlanToEnd/UGI-Leaderboard) — `ugi-leaderboard-data.csv`,
  1,295 models. Columns used: `Writing ✍️`, `W/10 👍`, `#P`, `Is Thinking Model`, `Release Date`.
- [OpenRouter models API](https://openrouter.ai/api/v1/models) — cloud pricing and context lengths.
- [RunPod pricing](https://www.runpod.io/pricing) — GPU $/hr (Community and Secure Cloud) and storage rates,
  pulled 2026-08-21.
- [Featherless](https://featherless.ai/) — plan tiers; live `GET https://api.featherless.ai/v1/models`
  (21,750 models) for `model_class`, `context_length`, `concurrency_cost` and per-token pricing.
- [ArliAI pricing](https://www.arliai.com/pricing) — flat-rate tiers, model ceilings, concurrency.
- Model cards: [G4-MeroMero-v2-31B](https://huggingface.co/zerofata/G4-MeroMero-v2-31B),
  [Artemis-31B-v1.1](https://huggingface.co/TheDrummer/Artemis-31B-v1.1),
  [Qwen3.8-27B-Dominatrix](https://huggingface.co/allura-org/Qwen3.8-27B-Dominatrix),
  [Ornith-1.5-9B](https://huggingface.co/ornith-ai/Ornith-1.5-9B),
  [Behemoth-128B-v3](https://huggingface.co/TheDrummer/Behemoth-128B-v3),
  [Behemoth-X-123B-v2](https://huggingface.co/TheDrummer/Behemoth-X-123B-v2),
  [Anubis-70B-v1.1](https://huggingface.co/TheDrummer/Anubis-70B-v1.1),
  [GLM-4.5-Iceblink-v3-106B-A12B](https://huggingface.co/zerofata/GLM-4.5-Iceblink-v3-106B-A12B).
- Author notes and the Sicarius-vs-leaderboard reconciliation: *Authors worth tracking* in
  [`model-research.md`](model-research.md).
- Internal: [`model-research.md`](model-research.md), [`leaderboard.md`](../testing/baseline/leaderboard.md),
  [`GATE-PROBE.md`](../testing/baseline/GATE-PROBE.md), [`src/lib/localModels.ts`](../src/lib/localModels.ts).
