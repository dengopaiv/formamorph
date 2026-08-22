# snowpanther's notes

Personal working notes for this fork — research logs, design memos, manual test scripts. Kept out of
`docs-internal/`, which is upstream's own directory: a note filed in there shows up in the diff of every
pull request made from this fork, and drifts against upstream on every rebase.

Nothing here is upstream's, and nothing here ships. Anything meant for upstream belongs in `docs/`
(user-facing) or `docs-internal/` (the maintainer's), and should be written there deliberately.

| | |
|---|---|
| `description-consistency-design.md` | The ✨ drafting buttons: the round-trip that launders authored facts out of a description, and checking a draft against the world's names, lore and locations. Version zero built; the probe results are in §11. |
| `FORMAMORPH-ENDPOINT-NOTES.md` | Pointing the app at a text endpoint, from reading the packaged build: URL normalization, preset fields, where presets live on disk, koboldcpp and OpenRouter setup, RunPod, throughput math, and a two-GPU quickstart for vLLM and TabbyAPI/EXL3. Predates the code work. |
| `keyboard-nesting-test-script.md` | Manual pass for the `keyboard-tree-nesting` branch, with NVDA — setup, ordered cases, and which claims only ears can settle. |
| `model-recommendations.md` | The shortlist: which model to point Formamorph at, per VRAM tier / rented GPU / flat-rate host / cloud budget. Downstream of `docs-internal/model-research.md`, which stays the research log. |
