# Behemoth 128B — personal-rig notes (NOT a catalog model)

> **Why this doc exists:** Behemoth is a different kind of thing from everything in
> [`model-research.md`](model-research.md). That doc is the **public track** — models that ship in
> [`src/lib/localModels.ts`](../src/lib/localModels.ts), screened on the bench, tiered by the VRAM a *user*
> is assumed to have. Behemoth is none of that: it is the maintainer's own ceiling/reference model, run on
> hosted or rented hardware. It is kept here so it can never drift into a tier table, a screen run, or a
> shipped recommendation.

**Last updated:** 2026-08-22

---

## The separation rule

| | Catalog models (`model-research.md`) | Behemoth (this doc) |
|---|---|---|
| Audience | every Formamorph user | maintainer only |
| Constraint | must fit a stated VRAM tier | no tier — hosted or rented |
| Evidence | bench Obj score, 3 seeds, hardened turns | impressions; not comparably scored |
| Ships in `localModels.ts` | yes | **never** |
| Appears in tier tables | yes | **never** |

**Do not** screen Behemoth for an Obj score and file it next to the catalog rows. Even as a "reference
tier" entry it would mislead — the reference tiers in that doc are all things a user could plausibly run,
and this is not. If it ever needs a number, record it *here* and say what hardware produced it.

> ⚠️ **Assumption flagged:** this rationale is reconstructed from the 2026-08-22 session, not from the
> earlier chat where the split was actually decided. If the real reason was different, correct this section
> — everything below it is factual and unaffected.

---

## What the model is

| Field | Value |
|---|---|
| Repo | [`TheDrummer/Behemoth-128B-v3`](https://huggingface.co/TheDrummer/Behemoth-128B-v3) |
| Params | ~125B (repo is named 128B) |
| Base | `mistralai/Mistral-Medium-3.5-128B` — a **new base**, not the Mistral Large 2 the 123B Behemoths used |
| License | Apache 2.0 |
| Weights | BF16 safetensors, chat template included |
| Author | TheDrummer — already a trusted finetune author for this project |
| Status | model card WIP; ~74 downloads/month; **not** on HF Inference Providers (as of 2026-08-22) |

Only card note: *"Tested without reasoning on Mistral v7 Tekken."* Treat as thinking-OFF, consistent with
the project's standing preference for narration.

---

## Route A — Featherless (flat rate)

**The $25 Premium tier has no model-size cap.** Only Basic ($10) is capped, at 15B. Premium is "any model
size" and they already host Mistral-family models up to 141B. *(This corrects an earlier assumption that
128B would be over the $25 tier — it is not.)*

So size is not the blocker. Two things are:

1. **Onboarding threshold.** Featherless auto-onboards any public HF model with **100+ downloads**. This one
   was at ~74 on 2026-08-22 — just under. Below the line you request it by email or in their Discord
   `#model-suggestions`. It will likely cross on its own.
2. **Architecture support — the real unknown.** Mistral-Medium-3.5 is a new base. Featherless states support
   for the Llama / Mistral / Qwen / DeepSeek families without naming this one. Unverified.

**Next action:** ask in `#model-suggestions` whether `TheDrummer/Behemoth-128B-v3` is onboardable. That one
answer settles Route A.

---

## Route B — rented pod + EXL3

EXL is **only** viable here. It is VRAM-only with no CPU offload, so it is useless on the local Quadro P2000
(4GB) at any bpw. On a full-GPU rental it is the right choice: fastest single-user inference when nothing is
offloaded.

The available quants are **EXL3, not EXL2** — which matters, because EXL3 holds quality far better at low
bpw, making the cheap end genuinely usable.

```
MikeRoz/Behemoth-128B-v3-2.25bpw-h6-exl3
MikeRoz/Behemoth-128B-v3-4.25bpw-h6-exl3
MikeRoz/Behemoth-128B-v3-5.00bpw-h6-exl3
```

MikeRoz is a long-standing quantizer for this line (also did the Behemoth-R1-123B EXL2s).

### Sizing → pod

Weights only. **These are computed as `bpw × 125B / 8`, not read off the repos — verify before booking.**

| Quant | Weights | Smallest sane pod | Context headroom |
|---|---|---|---|
| 2.25bpw | ~35 GB | 2× RTX 4090 (48 GB) | tight, ~10 GB |
| 4.25bpw | ~66 GB | 1× A100/H100 80 GB | ~12 GB, needs Q4 cache |
| **4.25bpw** | **~66 GB** | **2× A6000 (96 GB)** ◀ pick | **~28 GB — roomy** |
| 5.00bpw | ~78 GB | 2× A6000 (96 GB) | ~16 GB |

**Pick: 4.25bpw on 2× A6000.** Best $/GB on RunPod, real context headroom without hard cache-quantizing,
and 4.25 EXL3 is close enough to lossless for prose. Ballpark ~$1.00–1.60/hr for the pair — **pricing moves
and this figure is unverified as of 2026-08-22; check live.**

---

## Practical setup (Route B)

1. **Network volume, always.** Re-downloading 66 GB per session is 20–40 min of *paid pod time* every time.
   A ~100 GB volume costs a few dollars a month and makes restarts near-instant. Initial pull:
   `HF_HUB_ENABLE_HF_TRANSFER=1 hf download …`.
2. **Serve with TabbyAPI** — the standard OpenAI-compatible server for EXL3; RunPod has templates. Set an API
   key in its config rather than leaving the port open.
3. **Formamorph wiring:** add a custom endpoint preset pointing at
   `https://{podid}-5000.proxy.runpod.net/v1`. The pod id **changes on every new pod**, and presets live in
   localStorage with no export (see the `endpoint-presets-not-portable` note) — so this is a field you
   re-paste each session. Known friction, not a bug to chase.
4. **Only one model is loaded on the pod.** If the narration/structured endpoint split is in use, point only
   **narration** at Behemoth and leave the structured calls on the hosted endpoint.

---

## Open questions

- **Featherless: does the Mistral-Medium-3.5 arch serve?** Blocks Route A entirely. Unverified.
- **Has it crossed 100 downloads / been auto-onboarded?** Re-check; was ~74 on 2026-08-22.
- **Real file sizes for the three EXL3 repos** — the table above is arithmetic, not measured.
- **Live RunPod A6000 pricing** — quoted range is approximate and predates 2026-08-22.
- **Is it actually better for narration than the No-Limit catalog pick (G4 MeroMero 31B, A/84)?** Untested,
  and deliberately *not* testable on the public bench. If judged, judge it here and say on what hardware.
