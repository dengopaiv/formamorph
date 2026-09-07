# snowpanther's notes

Personal working notes for this fork — research logs, design memos, manual test scripts. Kept out of
`docs-internal/`, which is upstream's own directory: a note filed in there shows up in the diff of every
pull request made from this fork, and drifts against upstream on every rebase.

Nothing here is upstream's, and nothing here ships. Anything meant for upstream belongs in `docs/`
(user-facing) or `docs-internal/` (the maintainer's), and should be written there deliberately.

| | |
|---|---|
| `TODO.md` | The working file: what is in flight, what state each thing is in, and the channel for saying so between sessions. Write in its Inbox; lines starting `@me` are yours and are never edited. Start here after a gap. |
| `runpod-exl3.md` | From an empty RunPod account to a working Formamorph preset, running an EXL3 quant on two rented GPUs under TabbyAPI or text-generation-webui. Step by step, in order, from Windows. §1 is the whole procedure on one screen; §7 is how the scripts actually get onto the pod, which is the part with no shortcut. The procedure; `FORMAMORPH-ENDPOINT-NOTES.md` is the argument behind it. |
| `description-consistency-design.md` | The ✨ drafting buttons: the round-trip that launders authored facts out of a description, and checking a draft against the world's names, lore and locations. Version zero built; the probe results are in §11. |
| `FORMAMORPH-ENDPOINT-NOTES.md` | Pointing the app at a text endpoint, from reading the packaged build: URL normalization, preset fields, where presets live on disk, koboldcpp and OpenRouter setup, RunPod, throughput math, and a two-GPU quickstart for vLLM and TabbyAPI/EXL3. Predates the code work. |
| `pod-scripts/` | Three scripts for driving a rented RunPod pod without sitting in an interactive SSH session — `rp.sh` runs one command and returns clean text (the proxy host silently ignores exec'd commands), `pod-setup.sh` brings TabbyAPI up unattended and writes a readable log instead of progress bars, `textgen-setup.sh` does the same for text-generation-webui and is the unverified one. |
| `keyboard-nesting-test-script.md` | Manual pass for the `keyboard-tree-nesting` branch, with NVDA — setup, ordered cases, and which claims only ears can settle. |
| `model-recommendations.md` | The shortlist: which model to point Formamorph at, per VRAM tier / rented GPU / flat-rate host / cloud budget. Downstream of `docs-internal/model-research.md`, which stays the research log. |
