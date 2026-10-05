# Behemoth 128B — personal-rig notes (NOT a catalog model)

> **Why this doc exists:** Behemoth is a different kind of thing from everything in
> [`model-research`](../docs-internal/notes/model-research/notes.md). That doc is the **public track** — models that ship in
> [`src/lib/localModels.ts`](../src/lib/localModels.ts), screened on the bench, tiered by the VRAM a *user*
> is assumed to have. Behemoth is none of that: it is the maintainer's own ceiling/reference model, run on
> hosted or rented hardware. It is kept here so it can never drift into a tier table, a screen run, or a
> shipped recommendation.

**Last updated:** 2026-09-16 — Route B rewritten against [`runpod-exl3.md`](runpod-exl3.md), which replaced
the pod setup this file used to describe. Everything below the model table that says *measured* comes from
the 2026-08-23 pods.

---

## The separation rule

| | Catalog models (`model-research`) | Behemoth (this doc) |
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

**It refuses, which no earlier Behemoth has done here.** One subjective session on 2026-08-22 found the
writing and instruction-following good, and also found refusals. The *no content floor* result belongs to
Behemoth-X-123B-v2 on `Mistral-Large`; v3's newer, more aligned base does not inherit it. For a narrator a
refusal mid-session stops the story rather than weakening it. Details in
[`model-recommendations.md`](model-recommendations.md).

---

## Route A — Featherless (flat rate) — closed

**Featherless serves no Behemoth at all**: not v3, and none of the 123B `Mistral-Large` ones. Checked
2026-09-16 against the live `GET https://api.featherless.ai/v1/models` (21,946 models).

**It is not a size limit, and it is not the architecture.** Featherless serves models far bigger than 128B:
GLM-5 at 754B, Kimi-K3 at 2.78T, and DeepSeek V3.1 and V4. It also serves **`mistralai/Mistral-Medium-3.5-128B`
itself**, which is Behemoth v3's base, and `Mistral-Large-Instruct-2411`, the older Behemoths' base. So
their stack runs both architectures.

**The pattern is: no community finetunes above the ~70B class.** Every model it serves above 100B, 42 of
them, is the vendor's own release. Finetunes stop at the Llama 70B and Qwen 72B classes, which is why
Sicarius's 70B models and TheDrummer's Anubis 70B are there. TheDrummer's catalog shows the same cut-off:
44 of his models are served, the largest being 70B.

| TheDrummer model | Size | On Featherless |
|---|---|---|
| Precog-24B-v1 | 24B | yes |
| Anubis-70B-v1 / v1.1 / v1.2 | 70B | yes |
| Agatha-111B-v1 / v1.1 | 111B (Command-A) | no, and no Command-A class exists at all |
| Precog-123B-v1 | 123B | no |
| Behemoth, every version | 123B / 128B | no |

So the 100-download onboarding threshold was never the thing to wait for. Nothing in the catalog shows a
big finetune getting past this, whatever its download count.

*(Earlier versions of this file said the $25 tier had no size cap, and that onboarding and architecture
support were the open questions. The first part is true; the rest was the wrong question.)*

**Consequence:** Route B is the only way to run Behemoth. One lever is left and it is a long shot: asking in
their Discord `#model-suggestions`. Nothing among the 42 big models suggests they take requests at that size.

**A side benefit:** since the base is served, `Mistral-Medium-3.5-128B` can be screened on Featherless
without renting anything. That would settle how much of v3's refusing comes from the base.

---

## Route B — rented pod + EXL3 (this has been run)

**The procedure is [`runpod-exl3.md`](runpod-exl3.md).** Do not follow a pod setup from anywhere else,
including earlier versions of this file. What follows is only what is specific to Behemoth.

EXL is **only** viable here. It is VRAM-only with no CPU offload, so it is useless on the local Quadro P2000
(4GB) at any bpw. On a full-GPU rental it is the right choice: real tensor parallelism, better quality per
bit, and a Q8 cache that halves KV memory.

### The quants

```
MikeRoz/Behemoth-128B-v3-2.25bpw-h6-exl3
MikeRoz/Behemoth-128B-v3-4.25bpw-h6-exl3   ◀ the one that was run
MikeRoz/Behemoth-128B-v3-5.00bpw-h6-exl3   75.06 GiB of weights (measured)
```

MikeRoz puts **each bit-rate in its own repo**, so no `--revision` is needed — unlike ArtusDev's
branch-per-bitrate repos, which is the trap in `runpod-exl3.md` §3. 2.25 bpw is below the ~3.0 line where a
smaller model at a higher bit-rate reads better; leave it alone.

### What was measured, 2026-08-23

2× A40, TabbyAPI `e632af4`, exllamav3 1.4.2, torch 2.9.0+cu128 — full detail in `runpod-exl3.md` §17.

| | 4.25 bpw h6 |
|---|---|
| Weights | **68.6 GB**, tensor-parallel split 35.3 / 34.7 GB |
| Context | 32k, `cache_mode: Q8`, fits inside 90 GB with headroom |
| Load | ~14 s from container disk |
| Throughput | 8.1 tok/s at 50 tokens, **12.0 tok/s at 200** |
| Cost | ~$0.80/hr for the pair, on-demand |

**12 tok/s is a floor.** That pod's peer-to-peer copies returned zeros, so it ran `nccl` with
`NCCL_P2P_DISABLE=1` and every collective went through host RAM. A healthy pod should beat it — by how much
is **P3** in `TODO.md`.

**The p2p trap was found on Behemoth.** All nine shards checksummed clean against Hugging Face's LFS hashes
while the output was garbage. If Behemoth produces `<unk>` walls, run the §8 copy test before re-downloading
anything.

**Pick: 4.25 bpw on 2× A40.** 5.00 bpw is ~75 GiB and should also fit two A40s with a Q8 cache, but it has
not been loaded. *(This replaces the earlier pick of 2× A6000, which was arithmetic from `bpw × 125B / 8`
before anything was measured.)*

### Behemoth-specific notes on the procedure

1. **Two cards, not three**, and not one 80 GB card — that leaves no usable context (§4).
2. **Container disk ≥ 100 GB, weights on it.** Not a network volume: the ~14 s load is from local NVMe, and a
   restart re-downloads the 68 GB in two or three minutes with `HF_HUB_ENABLE_HF_TRANSFER=1`, which is
   cheaper than a standing volume (§5, §15).
3. **Rehearse on the 1B model first** (§9). `pod-setup.sh` has never itself been run at Behemoth size — the
   measurements above were done by hand. That is **P1** in `TODO.md`. Then:

   ```bash
   ./rp.sh 'bash /root/pod-setup.sh MikeRoz/Behemoth-128B-v3-4.25bpw-h6-exl3'
   ```

   If it sits at `RUNNING` well past twenty minutes, read `/workspace/pod-setup.log`; the ten-minute
   health-check window is one of the untested parts at this size.
4. **Formamorph wiring goes through the SSH tunnel**, never the RunPod HTTP proxy (§12, §13). Endpoint URL
   `http://localhost:5000`, the TabbyAPI `api_key` (not the admin key), and **Override endpoint limit**
   ticked. The proxy buffers streaming into one lump and sends play text in the clear. Because the URL is
   always `localhost`, the preset no longer goes stale when the pod id changes — only the tunnel command's
   IP and port do.
5. **Only one model is loaded on the pod.** Use per-prompt endpoint routing to point only **narration** at
   Behemoth and leave the structured calls on the hosted endpoint.

---

## Open questions

- **How often does it refuse in play?** One session found refusals; nobody has counted them.
- **What does a pod with working peer-to-peer give?** 12 tok/s is the broken-p2p floor.
- **Does `pod-setup.sh` bring it up unattended?** Only done by hand so far.
- **Is it actually better for narration than the No-Limit catalog pick (G4 MeroMero 31B, A/84)?** Untested,
  and deliberately *not* testable on the public bench. If judged, judge it here and say on what hardware.
