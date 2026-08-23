# Formamorph — connecting a custom text endpoint

Notes from reading this install's `app/resources/app.asar` (unpacked and read; nothing in the game
folder was modified). Written 2026-08-10.

> **Update 2026-08-19 — the app self-updated again.** `app/resources/app.asar` is now dated Aug 16,
> 108 MB, and its `package.json` reads **2.12.2** (§1 below describes the 81 MB / 2.11.1 build).
> Everything in §2–§8 was re-checked against 2.12.2 and still holds; the minified symbols moved, so
> when grepping the renderer read **`nI`** for `nE` (§3) and **`D2e`** for `ype` (probe URL builder).
> §11 (RunPod and other online providers) was written against 2.12.2 and quotes it directly.

---

## 0. TL;DR

1. **This install self-updated.** Folder says 2.5.0; the app inside is **2.11.1**. Endpoint settings
   were rebuilt in between — that's why it doesn't look like it used to.
2. **Endpoint config is now preset-based**, and the two built-in presets are read-only. To use your
   own server you must click **Preset → "Add New Preset…"** first. Nothing else unlocks the fields.
3. **"Text generation not initialized" is koboldcpp talking, not Formamorph.** It means koboldcpp has
   no text model loaded. Setting OpenRouter inside KoboldAI Lite does *not* make koboldcpp serve
   OpenRouter — see §4.
4. **For OpenRouter, cut koboldcpp out entirely** and point Formamorph straight at
   `https://openrouter.ai/api/v1`. The desktop app has a CORS shim, so this just works. See §6.
5. **Empty narration with no error message?** Set **Paragraph Limit → Auto**. On Single, the app
   appends `stop:["\n"]`, which a reasoning model trips instantly — HTTP 200, zero text, no warning.
   Reproduced and measured in §7.
6. **RunPod, Together, DeepInfra, any OpenAI-compatible host — all work.** The only thing that varies
   is the URL: a base ending in `/v1` is auto-completed, anything longer is used verbatim, so
   RunPod **Serverless** needs `…/openai/v1/chat/completions` typed in full. See §11.
7. **Slow turns are usually not a config bug.** Two GPUs give koboldcpp capacity, not speed (layer
   split runs them sequentially), and Formamorph fires a **separate request per prompt kind** —
   narration and choices alone are two full calls. See §14.
8. **Don't use the RunPod HTTP proxy for a streaming endpoint** — it buffers SSE, so narration lands
   in one dump. But **don't use a bare TCP port either**: that sends every scene and your API key
   across the internet in cleartext. **Tunnel it over SSH** and point the preset at `localhost` —
   encrypted, still streams, and the URL stops changing on redeploy. §15.3a. §15 is the full
   multi-GPU RunPod quickstart, and §15.0 picks the engine for you.
9. **Don't rent three GPUs for a tensor-parallel engine.** vLLM requires both head counts to divide
   by the TP size, and GQA models have 8 KV heads — so **TP 3 refuses to start**. Rent 2 or 4, and
   drop a quant instead. §15.1.

---

## 1. What this folder is

An Electron app.

| Path | What it is |
|---|---|
| `Formamorph.exe` (root, Jul 18) | launcher stub |
| `app/resources/app.asar` (Aug 10, 81 MB) | the actual app — **v2.11.1** per its `package.json` |
| `app/resources/app.asar.unpacked/node_modules/node-llama-cpp` | bundled local inference engine (CUDA + Vulkan binaries) |
| `models/` | where downloaded GGUFs land |
| `userdata/` | Chromium profile; **all settings live in `userdata/Local Storage/leveldb`** |
| `userdata/updates/` | electron-updater staging — evidence of the in-place update |
| `runpod-endpoint-preset.json` (root) | preset schema + mock RunPod URLs — template, not loadable by the app (§13) |
| `load-preset.js` (root) | DevTools console loader that writes the preset key (§13) |

The version drift is the whole reason things moved: you are running 2.11.1 UI inside a folder
named 2.5.0.

### Bundled local engine

`app.asar → electron/llmEngine.cjs` loads a GGUF via node-llama-cpp **in the Electron main process**
and serves a minimal OpenAI-compatible server on `http://localhost:8977/v1`. The renderer then talks
to it exactly like any third-party endpoint. It implements only two routes:

- `GET  */models` — matches *any* path ending in `/models`, so both OpenAI and LM Studio probes hit it
- `POST */chat/completions` — SSE streaming supported

---

## 2. What changed since 2.5.0

**Before:** one set of fields (`FORMAMORPH_endpointUrl`, `_apiToken`, `_modelName`) plus a
`FORMAMORPH_useCustomEndpoint` boolean.

**Now:** *endpoint presets*, in **Settings → AI Endpoints → Text**. Two presets ship built-in and
their fields render `readOnly` (greyed, 60% opacity):

| Preset | URL | Model | Editable? |
|---|---|---|---|
| **Built-In Engine** (desktop only) | `http://localhost:8977/v1/chat/completions` | the loaded GGUF | no |
| **Default** | `https://api.lyonade.net/v1` (community server) | `default` | no |

### The migration that ate your old endpoint

There's a one-shot migration (minified as `Qje()`, guarded by localStorage key
`FORMAMORPH_engineIsPresetMigrated`). On desktop it:

1. reads `FORMAMORPH_textEndpointPresets` (absent on first run after the update → empty),
2. sees the stored `activeId` isn't a real preset,
3. **force-writes `activeId = "builtin-engine"`**, and
4. **deletes `FORMAMORPH_useCustomEndpoint`**.

It runs *before* the legacy-settings reader (`zje()`), so the old single-endpoint values never make
it into a preset. This install's leveldb confirms it: `engineIsPresetMigrated` is set, and the stale
`FORMAMORPH_endpointUrl` still reads `http://localhost:8977/v1/chat/completions`.

Net effect: after the update, desktop users land on the Built-In Engine with a read-only form and no
obvious way to type a URL.

### How to actually get an editable endpoint

**Settings → AI Endpoints → Text tab → "Preset" dropdown (top of the pane) → "Add New Preset…"**,
give it a name, save. *Now* Endpoint URL / API Token / Model Name / Context Window / Max Output
Tokens are editable.

> **Gotcha — a new preset is a *clone*, not a blank.** It copies the values of whatever preset was
> active when you created it (`l6e(store, id, name, L$(store))`). Add a preset while "Koboldcpp" is
> selected and your shiny new "openrouter" preset silently starts life pointing at
> `http://localhost:5001/v1`. **Always re-check the Endpoint URL right after naming a preset** — this
> is the single easiest way to end up debugging the wrong server.

### Also new: per-prompt endpoint routing

**Settings → Prompts** — each prompt type (narration, choices, stat updates, summary, diary,
director, storyboard…) has its own **Endpoint** dropdown, defaulting to "Use Active Endpoint". You
can route narration to a big remote model and the cheap background calls to a local one.

---

## 3. URL normalization (you don't need to type the full path)

`nE()` rewrites what you type:

| You type | Requests go to |
|---|---|
| `http://localhost:5001` | `http://localhost:5001/v1/chat/completions` |
| `http://localhost:5001/v1` | `http://localhost:5001/v1/chat/completions` |
| anything with a longer path | left **exactly** as typed |

The UI shows "Requests go to …" under the field when it rewrites. If your path isn't empty and isn't
`/v1`, it is used verbatim — so a typo'd path is passed straight through.

---

## 4. Why "Text generation not initialized" — the OpenRouter-through-koboldcpp problem

**That string comes from koboldcpp**, not Formamorph. koboldcpp returns it (503) when its text
backend has no model loaded. Its web UI and API don't function until a model is fully loaded.

The trap is this: **KoboldAI Lite's OpenRouter support is a browser-side feature of the Lite UI, not
a server-side proxy.** Lite is bundled with koboldcpp and can be launched with no model at all
(that's an intended mode) specifically so it can talk to *external* services — AI Horde, OpenAI,
OpenRouter, etc. When you do that, the OpenRouter key lives in your browser and Lite calls
OpenRouter **directly**. koboldcpp's own `/v1/chat/completions` is left with no model behind it.

So:

```
What you have:     Formamorph ──> kcpp :5001 /v1/chat/completions ──> (nothing loaded) ──> 503
What Lite does:    your browser ─────────────────────────────────────> openrouter.ai
```

koboldcpp has **no documented way to expose an external API through its own endpoints.** Pointing
any third-party client at kcpp gets you kcpp's local model or nothing.

### Three ways out

| Option | Do this |
|---|---|
| **Use OpenRouter (recommended)** | Skip koboldcpp. Point Formamorph at `https://openrouter.ai/api/v1` — §6. |
| **Use koboldcpp** | Load a GGUF in koboldcpp so its API actually serves something — §5. |
| **Genuinely need a local proxy** | Use a real proxy (LiteLLM proxy, `llama-swap`, nginx). koboldcpp is not one. |

---

## 5. Preset settings — koboldcpp with a local GGUF

| Field | Value |
|---|---|
| Endpoint URL | `http://localhost:5001` |
| API Token | *(blank)* — the app always sends `Authorization: Bearer <token>`; kcpp ignores an empty one |
| Model Name | anything; kcpp doesn't route on it |
| Context Window | **type it manually** — see below |
| Max Output Tokens | your call (default 1024) |

- **CORS: nothing to configure.** `electron/main.cjs` installs an `onHeadersReceived` shim
  (`corsShim.cjs`) that rewrites CORS headers on every external http(s) response and forces
  preflights to `204`. The in-app "Trouble connecting?" dialog still tells you to enable CORS — that
  text is for the *browser* build of Formamorph, not this one.
- **The green "Reachable" dot will light up.** The probe tries LM Studio's `/api/v0/models` first
  (404 on kcpp, then cached as dead for the session) and falls back to `GET /v1/models`, which kcpp
  answers. It does not verify the model name on that path.
- **"Detect" (context window) will not work.** It scrapes `context_length` / `max_context_length` /
  `max_model_len` / `context_window` / `loaded_context_length` out of the `/v1/models` payload;
  koboldcpp's model list carries none of them. Type your `--contextsize` value in by hand.

---

## 6. Preset settings — OpenRouter direct

| Field | Value |
|---|---|
| Endpoint URL | `https://openrouter.ai/api/v1` |
| API Token | your OpenRouter key (`sk-or-v1-…`) |
| Model Name | the **exact** slug, e.g. `moonshotai/kimi-k2.5` — how to find one: §8 |
| Context Window | press **Detect** (works here), or type it |
| Max Output Tokens | your call |

- **Detect works** — OpenRouter's `/api/v1/models` includes `context_length`.
- **Caveat:** Detect looks for the entry whose `id` equals your Model Name; if there's no exact
  match it silently falls back to the *first* entry in the list that has a context field. With
  OpenRouter's several-hundred-model list that's an arbitrary number. Get the slug exactly right.
- The reachability probe resolves to `https://openrouter.ai/api/v1/models` and returns green.

---

## 7. Behaviors worth knowing before you debug something that isn't broken

**Top-p / top-k / min-p are never sent to a custom endpoint.** In the request builder those three are
gated behind the `localEngine` flag — only the Built-In Engine gets them. A custom preset receives:

```
model, messages, max_tokens, stream:true, temperature,
repetition_penalty + repeat_penalty, [stop], [reasoning fields]
```

Set top-p/top-k/min-p on the server side instead. (This is consistent with where the sliders live in
the UI — inside the Built-In Engine's own Advanced panel, next to GPU Layers.)

**First contact fires ~7 throwaway probe requests.** To learn which `reasoning_effort` values your
server accepts, it POSTs `{messages:[{role:"user",content:"."}], max_tokens:1, reasoning_effort:X}`
once per level (`none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`), treating 200 as
supported and 400 as not. Servers that ignore unknown fields (koboldcpp, most local servers) answer
200 to all seven, so the app concludes everything is supported and will send `reasoning_effort` —
which those servers then ignore. Harmless; on OpenRouter it costs seven near-zero requests.

**404s are cached for the session.** Any probe URL that 404s is added to a set and never retried
until you restart the app.

**Streaming.** Always `stream: true`, SSE parsed for `delta.content` plus `delta.reasoning` /
`delta.reasoning_content`. Only `delta.content` becomes narration — anything in the reasoning fields
feeds the collapsible "Thinking…" note and nothing else.

### The empty-narration trap (reproduced against OpenRouter + Kimi K2.5)

Set **Paragraph Limit = Single** and the narration request gains `stop: ["\n"]`:

```js
...Qt === "narration" && oe === "single" && pe !== "inline" && { stop: ["\n"] }
//   request kind        paragraphLimit      thinkingMode
```

Against a **reasoning model** that is fatal. The model spends its first tokens in the `reasoning`
channel, then opens `content` with a newline — which trips the stop sequence instantly. Measured,
same key/model/params, only the stop differing:

| Request | HTTP | finish_reason | content | reasoning |
|---|---|---|---|---|
| baseline | 200 | stop | 1969 chars | 0 |
| **+ `stop:["\n"]`** | **200** | **stop** | **0 chars** | **162** |
| + `reasoning_effort:"none"` | 200 | stop | 2901 chars | 0 |
| + `reasoning_effort:"high"` | 200 | stop | 1982 chars | 1247 |
| + `repetition_penalty` & `repeat_penalty` | 200 | stop | 1758 chars | 1089 |

A perfectly successful HTTP 200 with zero renderable text — **no error toast, no clue in the UI.**
Whether it bites is luck of the draw: OpenRouter routes to different providers per request and only
some of them emit reasoning for a given model, so this presents as "empty *sometimes*".

- **Fix:** Settings → Generation → **Paragraph Limit → Auto** (or None).
- Setting **Thinking Mode → Inline** also suppresses the stop (`pe !== "inline"` guard), but Auto is
  the cleaner fix.
- Unrelated but useful, from the same table: `reasoning_effort: "none"` genuinely stops Kimi from
  thinking and returns *more* prose. Formamorph sends it whenever Thinking Mode is anything other
  than **Native** — so turning Formamorph's own thinking on is how you turn the *model's* thinking
  off. (Only if the probe in §7 recorded `none` as supported.)

Also note `repeat_penalty` — a llama.cpp-ism the app sends alongside the OpenAI-standard
`repetition_penalty` — is harmless on OpenRouter; unknown fields are ignored, not rejected.

**Status dot meanings:** green *Reachable* · amber *Reachable, but no "<model>"* (LM Studio path
only, non-blocking) · red *Didn't answer* · grey *Not checked*.

---

## 8. Picking an OpenRouter model

The Model Name field for text endpoints is a **plain text input** — there's no model browser. (Only
the ComfyUI / InvokeAI *image* providers get server-populated dropdowns.) So the slug has to be typed
correctly by hand.

### Finding a slug

1. Browse <https://openrouter.ai/models> and open a model — **the URL path after the domain *is* the
   slug**: `openrouter.ai/moonshotai/kimi-k2.5` → `moonshotai/kimi-k2.5`.
2. Author pages list a vendor's whole range: <https://openrouter.ai/moonshotai>.
3. Machine-readable: `GET https://openrouter.ai/api/v1/models`, read `.data[].id`. This is the
   **same** endpoint Formamorph's **Detect** button reads — if a slug is in there, it will resolve.

### Kimi slugs (verified 2026-08-10, price per 1M in / out)

| Model | Slug | Context | Price |
|---|---|---|---|
| Kimi K3 | `moonshotai/kimi-k3` | 1.05M | $2.80 / $14 |
| Kimi K2.7 Code | `moonshotai/kimi-k2.7-code` | 262K | $0.68 / $3.40 |
| Kimi K2.6 | `moonshotai/kimi-k2.6` | 262K | $0.58 / $2.44 |
| **Kimi K2.5** | **`moonshotai/kimi-k2.5`** | **262K** | **$0.375 / $2.025** |
| Kimi K2 Thinking | `moonshotai/kimi-k2-thinking` | 262K | $0.60 / $2.50 |
| Kimi K2 0905 | `moonshotai/kimi-k2-0905` | 262K | $0.60 / $2.50 |
| Kimi K2 0711 | `moonshotai/kimi-k2` | 131K | $0.57 / $2.30 |

So for K2.5 the Model Name field gets exactly:

```
moonshotai/kimi-k2.5
```

A date-pinned variant `moonshotai/kimi-k2.5-0127` also exists if you want to freeze the version.
Paid-only — there's no `:free` Kimi K2.5, so the account needs credits.

### Routing suffixes

`model` is the only routing lever Formamorph sends, so suffixes are how you steer provider choice.
Append to any slug:

| Suffix | Effect |
|---|---|
| `:free` | free-tier hosting where offered; rate-limited, availability varies |
| `:nitro` | sort providers by throughput — fastest |
| `:floor` | cheapest provider |
| `:exacto` | providers with stronger tool-calling quality signals |
| `:online` | adds web search to any model |
| `:batch` | cheaper but async — **don't**, Formamorph streams |

e.g. `moonshotai/kimi-k2.5:nitro`.

### Gotchas specific to this app

- **A typo'd slug isn't caught at save time.** The reachability dot only checks that the server
  answers `/v1/models`; it never validates your model name on the OpenAI path. You'll find out at
  generation time, as the generic *"Couldn't reach your AI server"* toast.
- **Check what Detect fills in.** It matches `id === <your Model Name>` exactly, and on no match
  silently falls back to the first entry in the list that has a context field — an arbitrary number
  out of OpenRouter's several hundred models. For K2.5 you want to see **262144**.
- **Don't just paste 262144 into Context Window.** That value decides how much history gets packed
  into *every* prompt, and you pay for it each turn. Start somewhere in the 32K–65K range and raise
  it only if summarization is dropping things you care about.
- **Raise Max Output Tokens** from the 1024 default — narration turns want the headroom.
- Expect the seven `reasoning_effort` probe requests (§7) the first time the preset is used.

---

## 9. Map for future digging

Unpack with any asar tool (header is `4 / headerSize / payloadSize / jsonLen`, JSON at offset 16,
data at `8 + headerSize` aligned to 4).

| Where | What |
|---|---|
| `electron/main.cjs` | window setup, IPC, `onHeadersReceived` CORS wiring |
| `electron/corsShim.cjs` | the header transform (widens, never narrows; forces 204 on OPTIONS) |
| `electron/llmEngine.cjs` | bundled node-llama-cpp server on :8977, parallel-sequence pool |
| `electron/modelScan.cjs`, `modelDownload.cjs`, `modelMove.cjs` | model library management |
| `dist/assets/index-*.js` | the whole renderer (minified, ~5.5 MB) |

Useful symbols in the renderer bundle: `nE` (URL normalize) · `ype` (probe URL builder) · `XU` /
`Mwt` (reachability) · `j$` / `O$` (context detect) · `X$` (reasoning-effort probe) · `Mje`
(endpoint resolution, sets `localEngine`) · `Qje` (the forced migration) · `zje` (legacy import) ·
`hpe` / `QS` (built-in preset values).

Settings key: `FORMAMORPH_textEndpointPresets` in `userdata/Local Storage/leveldb`.

---

## 10. Where the presets physically live

This is a **portable** build: `portableProfile.cjs` sees `FORMAMORPH_ROOT` (set by the Windows Go
launcher) and puts the whole Chromium profile in `<root>/userdata`, beside the app rather than in
`%APPDATA%`. `%APPDATA%\formamorph` exists but is empty — don't go looking there.

- **File:** `userdata\Local Storage\leveldb\` — the `.log` is the write-ahead log (newest writes),
  the `.ldb` files are compacted older state.
- **Key:** `FORMAMORPH_textEndpointPresets`, value is JSON:
  `{"activeId": "<uuid>", "presets": [{"id","name","values":{endpoint, apiToken, model, contextWindowOverride, maxTokens}}]}`
- Built-in presets are **not** stored here — they only exist in code (`hpe` / `QS`); the file holds
  your own presets plus which id is active. An `activeId` of `builtin-engine` or `default` with an
  empty `presets` array is the normal post-migration state.

Two consequences worth knowing:

- **API tokens are stored in plaintext.** Anyone with the folder has your keys. Don't share or back
  up `userdata` casually.
- **The write-ahead log keeps superseded values.** Every intermediate edit — including keys you've
  since replaced — stays readable in the `.log` until compaction. Rotating a leaked key at the
  provider is the only real fix; editing the field isn't.

Handy for debugging: grepping that `.log` for `{"activeId"` replays your entire edit history in
order, which is the fastest way to see what a preset *used* to point at.

---

## 11. RunPod and other online endpoints

Nothing in §2–§8 is OpenRouter-specific. A custom preset is just "POST OpenAI-shaped JSON at this
URL with this bearer token", so any OpenAI-compatible host works: RunPod, Together, DeepInfra,
Fireworks, Groq, Featherless, a LiteLLM proxy in front of anything else. The CORS shim (§5) means
there is nothing to configure server-side.

The **one rule** that decides whether a given provider is a two-second setup or a silent failure is
the URL normalizer in §3. Restating it in the form that matters here:

> `nI()` appends `/v1/chat/completions` **only** when the path you typed is empty or exactly `/v1`.
> Every other path is passed through **verbatim**.

Providers whose base URL ends in `/v1` (OpenRouter, Together, DeepInfra, Groq…) therefore need no
thought. Providers with a longer path — RunPod Serverless being the common one — need the full path
typed out through `/chat/completions`, or requests go to a route that does not exist.

### 11a. RunPod Pod (vLLM / Ollama / TGI behind the HTTP proxy)

The easy shape. RunPod exposes any HTTP port on a pod as `https://<pod-id>-<port>.proxy.runpod.net`.

| Field | Value |
|---|---|
| Endpoint URL | `https://<pod-id>-8000.proxy.runpod.net` |
| API Token | whatever your server wants (vLLM `--api-key`); blank if it wants nothing |
| Model Name | the served model id |
| Context Window | **Detect** works if the server's `/v1/models` carries a context field — vLLM's does (`max_model_len`) |
| Max Output Tokens | your call |

Path is empty, so it normalizes to `…/v1/chat/completions` and behaves exactly like the koboldcpp
case in §5. Two requirements on the RunPod side:

- Start vLLM with **`--host 0.0.0.0`**. The 127.0.0.1 default is unreachable from the proxy, and the
  symptom in Formamorph is an indistinguishable red *Didn't answer* dot.
- Add the port (8000 for vLLM) to the pod's exposed **HTTP** ports, not TCP.

### 11b. RunPod Serverless (worker-vllm) — type the whole path

| Field | Value |
|---|---|
| Endpoint URL | `https://api.runpod.ai/v2/<ENDPOINT_ID>/openai/v1/chat/completions` |
| API Token | your **RunPod** API key (`rpa_…`) — not an OpenAI key |
| Model Name | the HF repo id you deployed (e.g. `mistralai/Mistral-7B-Instruct-v0.2`), or your `OPENAI_SERVED_MODEL_NAME_OVERRIDE` value |
| Context Window | **Detect** works — see the probe note below |
| Max Output Tokens | raise it from 1024 |

The `/chat/completions` suffix is **not optional**. `/v2/<id>/openai/v1` is neither empty nor `/v1`,
so it is used verbatim:

```js
const $ne="/chat/completions";
function nI(t){ …
  const r=n.pathname.replace(/\/+$/,"");
  if(r==="")n.pathname=`/v1${$ne}`;
  else if(r==="/v1")n.pathname=`/v1${$ne}`;
  else return e;                 // ← RunPod Serverless lands here
  return n.toString()}
```

**The status dot tells you which mistake you made.** The probe builder (`D2e`, was `ype`) derives the
models URL two different ways:

```js
openai: t.includes("/chat/completions")
  ? t.slice(0,t.indexOf("/chat/completions"))+"/models"   // strip and re-suffix
  : `${e.origin}/v1/models`                               // origin only — path discarded
```

- With the full path → probes `https://api.runpod.ai/v2/<id>/openai/v1/models` → **green, and Detect
  fills in the real context length.**
- Without it → probes `https://api.runpod.ai/v1/models` → **red *Didn't answer*.**

So a red dot on a key you know is good means you left the suffix off. (The LM Studio probe
`https://api.runpod.ai/api/v0/models` 404s first either way and is cached dead for the session —
that one is expected and harmless.)

**Cold starts.** There is no `AbortSignal.timeout` anywhere in the renderer's request path, so a cold
worker makes the first turn slow rather than throwing. But remember §7: first contact fires **seven**
`reasoning_effort` probe requests, and on Serverless each of those is a real job — it will wake the
worker and it will bill. Consider setting an active worker to 1 while you're configuring, or just
expect the first preset use to be expensive in wall-clock time.

### 11c. Images can go online too

Not covered anywhere above: the image side has its own provider enum, separate from the text preset
system — `a1111 | comfyui | invokeai | openai`, where `openai` is labelled in-app as **"Set up
OpenAI-compatible (cloud)"**. Defaults are all local:

```js
{a1111:"http://127.0.0.1:7860", comfyui:"http://127.0.0.1:8188",
 invokeai:"http://127.0.0.1:9090", openai:""}
```

A RunPod pod running ComfyUI, A1111/Forge or InvokeAI slots straight in via the same
`https://<pod-id>-<port>.proxy.runpod.net` URL — pick the matching provider rather than `openai`, and
unlike text you get server-populated model dropdowns (`lQe` for ComfyUI, the InvokeAI equivalent
beside it). The in-app ComfyUI setup dialog still tells you to add `--enable-cors-header`; as with
§5 that advice is for the browser build, the desktop shim already handles it.

### 11d. Checklist for any new online provider

1. Does the base URL end in `/v1` or a bare host? → paste it as-is. Otherwise → append
   `/chat/completions` yourself.
2. Remember a new preset is a **clone** (§2) — re-read the Endpoint URL after naming it.
3. Green dot only proves `…/models` answered. It never validates your Model Name (§8).
4. Press **Detect**, then *look at the number*. On no exact id match it silently takes the first
   model in the list that has a context field.
5. Expect the seven probe requests. On per-request-billed or cold-start providers, that is not free.
6. If narration comes back empty with no error: Paragraph Limit → **Auto** (§7).
7. Is the URL `https://`, loopback, or a LAN/Tailscale address? If it is plain `http://` out to the
   internet, everything you play crosses it readable — tunnel it instead (§15.3a). The field says so.

### 11e. Picking a RunPod template

§11a/§11b tell you how to *wire up* a RunPod endpoint. This section is the decision that comes
first: **which template, and does it match the model files you actually have?** Getting this wrong
is the difference between a two-minute deploy and an afternoon of fighting a serving engine.

#### The decision in one table

| What you have | How you play | Template | Formamorph endpoint |
|---|---|---|---|
| **GGUF quants** (`*.gguf`, what's in `models/`) | either | **Pod → KoboldCpp** ← *this install* | `https://<pod-id>-5001.proxy.runpod.net` |
| GGUF, want a llama.cpp-native server | either | Pod → llama.cpp / Ollama | `https://<pod-id>-<port>.proxy.runpod.net` |
| safetensors / AWQ / GPTQ repo | long sessions | Pod → vLLM | `https://<pod-id>-8000.proxy.runpod.net` |
| safetensors / AWQ / GPTQ repo | scattered single turns | Serverless → vLLM worker | `https://api.runpod.ai/v2/<ID>/openai/v1/chat/completions` |

The branch that matters is the **first column, not the second**. Format decides the engine; usage
pattern only decides pod-vs-serverless within an engine.

#### Why not just use the vLLM template for everything

Because vLLM is a safetensors-first engine and this install's models are GGUF. vLLM's GGUF support
has been moved **out of tree** into a separate `vllm-gguf-plugin`, and upstream still describes it as
highly experimental, under-optimized, and potentially incompatible with other features. It exists
mainly for CPU-offload cases. Pointing the RunPod Serverless vLLM worker at a `.gguf` is swimming
upstream for no benefit.

If you *want* vLLM's throughput, the correct move is not to convert your quant — it is to deploy the
finetune's **original safetensors repo**, or an **AWQ/GPTQ** quant of it, and accept that it is a
different artifact from the Q6_K you tested locally. AWQ is the usual pick for GPU serving; it hits
vLLM's Marlin kernels and generally beats GPTQ by 5–15% throughput.

#### The recommended setup: Pod → KoboldCpp

RunPod ships an official KoboldCpp template, and it is the path of least resistance here for a
specific reason: **it is the same server §5 already documents**, just reachable over the internet.
Everything you learned debugging kcpp locally transfers unchanged.

**On the RunPod side**

| Setting | Value |
|---|---|
| Template | official **KoboldCpp** |
| `KCPP_MODEL` | the **direct download URL** of the GGUF on Hugging Face — comma-delimited if the quant ships as multiple parts |
| Exposed port | **5001**, as **HTTP** (not TCP) |
| `KCPP_ARGS` | your `--contextsize`, `--flashattention`, GPU-layer flags, and **`--password`** (below) |

Startup is fast for what it is — the template is available in about two minutes in most regions,
most of which is pulling the GGUF from HF into the pod.

**Never upload the GGUF from home.** `KCPP_MODEL` makes the *pod* fetch from Hugging Face over a
datacentre link. Pushing 27 GB up a domestic connection instead can take longer than the session you
wanted it for. If you plan to redeploy repeatedly, put the model on a RunPod **network volume** once
and mount it, so subsequent pods skip the download entirely.

**On the Formamorph side** — a new preset (§2), then:

| Field | Value |
|---|---|
| Endpoint URL | `https://<pod-id>-5001.proxy.runpod.net` — path empty, so `nI()` completes it to `/v1/chat/completions` (§3) |
| API Token | your kcpp `--password` value |
| Model Name | anything — kcpp doesn't route on it |
| Context Window | **type it by hand to match `--contextsize`** |
| Max Output Tokens | raise from 1024 |

> **Detect will not work here, and that is expected.** Per §5, the context probe scrapes
> `context_length` / `max_context_length` / `max_model_len` / `context_window` /
> `loaded_context_length` out of `/v1/models`, and koboldcpp's model list carries none of them. The
> green *Reachable* dot will still light up — kcpp answers `GET /v1/models` fine. Green dot plus a
> dead Detect button is the correct signature for this setup, not a symptom.

#### Lock the pod down before you leave it running

**RunPod's HTTP proxy URLs are public and unauthenticated by default.** The hostname is derived from
the pod id; anyone who has it can spend your GPU time and read whatever you're generating. This is
not a theoretical concern for a URL that ends up pasted into config files and chat logs.

koboldcpp's **`--password`** is the fix, and it lines up neatly with this app: Formamorph *always*
sends `Authorization: Bearer <token>` (§5), so the password goes straight in the API Token field and
authenticated requests just work.

Verify it rather than assuming — one curl from your machine before you trust it:

```bash
# should be rejected
curl -s -o /dev/null -w '%{http_code}\n' https://POD-5001.proxy.runpod.net/v1/models
# should be 200
curl -s -o /dev/null -w '%{http_code}\n' -H 'Authorization: Bearer PASSWORD' \
     https://POD-5001.proxy.runpod.net/v1/models
```

If the first one returns 200, the password isn't being enforced — fix that before generating
anything you'd mind a stranger reading.

#### GPU sizing for this install's models

Weights are only part of it; the KV cache grows with context and with how many parallel sequences
the server keeps. Rule of thumb: leave **8–10 GB of headroom** over the file size at the context
sizes Formamorph packs (§8 — don't set Context Window to the model's maximum just because you can).

| Model in `models/` | File size | Sensible GPU |
|---|---|---|
| `Persona_Maker_12B.i1-Q6_K.gguf` | 10.1 GB | 24 GB (RTX 4090 / A5000) — comfortable |
| `Rocinante-XL-16B-v1a-Q6_K.gguf` | 13.2 GB | 24 GB — fine |
| `Assistant_Pepe_32B.i1-Q6_K.gguf` | ~27 GB when complete | **48 GB** (A6000 / L40S) |

*(As of 2026-08-19 the 32B is still mid-download — an 18 GB `.part` beside a 0-byte target. Point
`KCPP_MODEL` at the Hugging Face URL rather than waiting for the local copy; the pod will fetch it
faster than you will.)*

#### Billing shape — the part that actually decides pod vs serverless

- A **Pod bills wall-clock**, including every minute you spend *reading* narration. In a text
  adventure that is most of the session. Predictable and cheap per hour, wasteful if you idle.
- **Serverless bills GPU-seconds**, so reading time is free — but scale-to-zero means an idle gap
  can cold-start the worker mid-story, and §11b's seven `reasoning_effort` probes are seven real
  billed jobs on first contact.

For sit-down-and-play sessions, the pod wins on simplicity and on never stalling mid-scene.
**Stop the pod when you finish.** A forgotten idling pod is the single most expensive mistake
available here, and nothing in Formamorph will remind you.

#### Teardown / next-session checklist

1. Stop (or terminate) the pod. Check the RunPod console, not your memory.
2. The pod id changes on redeploy → **the proxy hostname changes** → update the preset's Endpoint
   URL. A stale hostname presents as a red *Didn't answer* dot.
3. Keep a network volume if you'll redeploy the same model; otherwise you re-download every time.
4. The kcpp password is stored in `userdata` **in plaintext** (§10). Treat it like any other key.

---

## 12. Choosing a provider — the whole landscape

§11 covers RunPod specifically. This section is the wider question: **given that you want to run
your own models, who can actually do that, and what does each one cost you in flexibility?**

### 12.0. The axis that matters

Price is not the interesting variable — see §12.4, the numbers are closer than they look. The
variable that decides everything is **how much control you keep over which weights run and how they
are sampled.** Providers fall into three tiers:

| Tier | You control | You give up |
|---|---|---|
| **1. Your weights, rented GPU** | the exact `.gguf`, the exact quant, sampler flags, context size, no content policy | you run the server; you pay for idle time |
| **2. Any HF repo, their infra** | *which finetune* — from ~45k models | the quant (they serve their own), sampler config, context ceiling |
| **3. Curated catalogue** | nothing about the model | everything except prompt and temperature |

Formamorph makes tier 1 more attractive than it looks, for a reason buried in §7: **top-p / top-k /
min-p are never sent to a custom endpoint.** They are gated behind the `localEngine` flag, so a
remote preset receives only `temperature`, `max_tokens`, the two repetition-penalty fields and
`stop`. On tier 1 that's fine — you set them server-side with kcpp flags. On tiers 2 and 3 there is
**no way to set them at all**, from either end. If your RP finetunes want a particular min-p, tier 1
is the only place you can give it to them.

### 12.1. The comparison table

"§3?" = does the URL normalizer complete it for you, or must you type the full path (§3, §11b)?

| Provider | Tier | What you can run | Endpoint URL | §3? | Detect | Billing |
|---|---|---|---|---|---|---|
| **RunPod Pod + KoboldCpp** | 1 | **your exact GGUF file** | `https://<pod-id>-5001.proxy.runpod.net` | auto ✅ | ❌ type it (§5) | ~$0.49–0.53/hr for 48 GB |
| RunPod Pod + vLLM | 1 | safetensors / AWQ / GPTQ | `https://<pod-id>-8000.proxy.runpod.net` | auto ✅ | ✅ `max_model_len` | same |
| RunPod Serverless | 1 | safetensors / AWQ / GPTQ | `https://api.runpod.ai/v2/<ID>/openai/v1/chat/completions` | **full path** ⚠️ | ✅ | GPU-seconds |
| Vast.ai | 1 | your exact GGUF file | whatever host:port the instance exposes | usually auto ✅ | depends on engine | undercuts RunPod ⚠️*unverified* |
| **Featherless** | 2 | ~45k HF repos incl. RP finetunes | `https://api.featherless.ai/v1` | auto ✅ | ⚠️ untested; expect 32768 | **$25/mo** Chat, unlimited tokens |
| ArliAI | 2 | RP-focused catalogue | `https://api.arliai.com/v1` | auto ✅ | ⚠️ untested | flat monthly |
| OpenRouter | 3 | several hundred hosted models | `https://openrouter.ai/api/v1` | auto ✅ | ✅ (§6) | per token |
| NanoGPT | 3 | ~200 models, list price, no markup | `https://nano-gpt.com/api/v1` | auto ✅ | ⚠️ `/models` undocumented | per prompt |
| Google Gemini | 3 | Gemini only | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` | **full path** ⚠️ | ⚠️ likely ❌ | per token, cheap tiers |
| Built-In Engine | 1 | your GGUF, your GPU | — (read-only preset, §2) | — | — | free |
| "Default" preset | 3 | community server | `https://api.lyonade.net/v1` | — | — | free |

Every one of these gets `Authorization: Bearer <token>` whether or not it wants it (§5), and every
one is exempt from CORS worries thanks to the desktop shim.

### 12.2. Tier 1 — you supply the weights

**RunPod Pod + KoboldCpp** is the recommended shape and has its own section: **§11e**. Short version:
`KCPP_MODEL` takes an HF download URL, port 5001 exposed as HTTP, `--password` in `KCPP_ARGS`, and
Formamorph's Detect button correctly does nothing.

**Vast.ai** is the same idea on a marketplace model — you rent from individual hosts rather than a
uniform fleet, which is how it undercuts RunPod. Trade-offs: variable host quality and disk speed,
fewer prebuilt templates, and you're more likely to be wiring up a container yourself. Worth pricing
if the pod route wins for you and you're comfortable with more setup. *(Pricing unverified as of
2026-08-19 — check before switching.)*

**Don't forget the Built-In Engine.** It's tier 1, it's free, and it already has your GGUFs. The
whole reason to rent a GPU is the 32B that your card can't hold — the 12B and the 16B may well be
fine locally, in which case rent only for the big one.

### 12.3. Tier 2 — any HF repo, someone else's infra

This is the tier that didn't exist a couple of years ago and is the reason the "own models vs. API"
choice is no longer binary. **Featherless** hosts ~45,000 open models — the largest LLM inference
provider on Hugging Face — and that includes the RP finetune ecosystem your `models/` folder is
drawn from (TheDrummer's Rocinante and Cydonia lines are on it).

| | |
|---|---|
| Chat plan | **$25/mo**, unlimited tokens, **32K context**, 4 concurrent units |
| Cheaper tier | flat plans from $10/mo |
| Endpoint URL | `https://api.featherless.ai/v1` — ends in `/v1`, so §3 completes it |
| Model Name | the HF repo id, e.g. `TheDrummer/Rocinante-12B-v1.1` |

The Chat plan is explicitly scoped to "interactive, human-driven use" and forbids API/automation
traffic, reselling, and benchmarking. A person playing Formamorph is exactly the intended case —
but note that Formamorph's background prompts (summary, diary, director) are still *your* session,
not automation, while pointing a bot at it would not be.

**What you give up:** they serve the **original fp16 repo, not your `i1-Q6_K`**. Same finetune,
measurably different outputs from what you've tuned against locally. Plus the 32K ceiling and no
sampler control (§12.0).

**ArliAI** is the same flat-rate concept with a narrower, RP-first catalogue. Useful as a second
lookup when Featherless doesn't list something.

**Check the catalogue before subscribing.** Your three files look like `mradermacher`-style
quants; what matters is whether the *source repo* is listed. `Rocinante-XL-16B-v1a`,
`Persona_Maker_12B` and `Assistant_Pepe_32B` each need looking up by hand.

### 12.4. Tier 3 — curated catalogues

These can't run your models and shouldn't be evaluated as if they could. They earn their place as
**second endpoints**, not replacements — see §12.5.

- **OpenRouter** — the most models, per-token, routing suffixes for provider steering. Fully
  documented in §6 and §8.
- **NanoGPT** — ~200 models, OpenAI-compatible, billed per prompt at provider list price with no
  percentage markup. Structurally an OpenRouter alternative; the same "is my slug exactly right"
  discipline from §8 applies. *(Name is ambiguous — this is `nano-gpt.com`, not OpenAI's
  `gpt-5-nano`, which is just a small model you'd reach through any aggregator.)*
- **Google Gemini** — cheap and huge-context, but two catches. Its OpenAI compatibility layer lives
  at `https://generativelanguage.googleapis.com/v1beta/openai/`, which is neither empty nor `/v1`,
  so per §3 you must type `…/v1beta/openai/chat/completions` in full or nothing will work. And its
  safety filtering makes it unreliable for the content RP finetunes exist to produce. Fine for
  structural prompts, unsuitable as your narrator.

### 12.5. The hybrid — this is the actual answer

You do not have to pick one. **Settings → Prompts** gives every prompt type its own Endpoint
dropdown (§2), so the sane configuration is tiered by what each call is worth:

| Prompt type | Send it to | Why |
|---|---|---|
| **narration** | tier 1 — your model, your quant, your samplers | it's the whole product |
| choices | tier 1 or 2 | voice consistency matters |
| summary, diary, stat updates, director, storyboard | tier 3 — cheap and fast | structural work; nobody reads it for prose |

That combination gets you the flexibility you want where it counts and stops you paying 48 GB rates
to compress a scene summary. It also softens the pod's weakness: the background calls keep working
while the pod is stopped.

### 12.6. The cost crossover

At **~$0.53/hr** for a 48 GB card against Featherless's **$25/mo**:

```
$25 / $0.53 per hr  ≈  47 hours of pod time per month  ≈  11 hours per week
```

- Play **more** than ~11 hrs/week → the flat-rate plan is cheaper *and* has no forgotten-pod risk.
- Play **less** → the pod is cheaper, and it's the only option that runs your actual file.
- Remember the pod bills **reading time**. In a text adventure that is most of the clock, which is
  why the crossover lands so much lower than raw generation time would suggest.

### 12.7. Decision flow

1. **Does the Built-In Engine already handle this model on your GPU?** → use it. Free, tier 1.
2. **Do you need your exact quant, custom samplers, or >32K context?** → **RunPod pod + KoboldCpp**
   (§11e). This is the flexible answer and the one that matches "I like my own models".
3. **Is the source repo on Featherless, and do you play more than ~11 hrs/week?** → $25/mo Chat plan
   is less hassle and probably cheaper.
4. **Either way, route the background prompts to tier 3** (§12.5). It's free money.
5. Only reach for tier 3 as your *narrator* if you've decided a frontier model beats your finetune
   for this story — a real choice, just a different one.

### 12.8. Verification status

Verified against live sources on 2026-08-19: all base URLs in §12.1, Featherless plan terms and
catalogue coverage, RunPod 48 GB rates, the Gemini compatibility path, vLLM's GGUF status.
**Unverified:** Vast.ai pricing, and the Detect behaviour of Featherless / ArliAI / NanoGPT /
Gemini — those `/models` payloads haven't been inspected for the context fields §5 lists, so treat
the Detect column as a prediction and check the number it fills in (§11d).

---

## 13. Loading a preset from a file

### 13.0. There is no endpoint-preset import — verified

Worth stating plainly, because the UI implies otherwise. Formamorph **does** have preset
import/export, and the Preset dropdown **does** offer "Import Preset…" next to "Add New Preset…" —
but that is the *prompt* preset dropdown, not the endpoint one. In 2.12.2:

- Prompt presets export as `<name>.preset.json` or as a `FMPRESET1:`-prefixed share code, and are
  validated against `kind === "formamorph-prompt-preset"`. Reject message: *"This file is not a
  Formamorph prompt preset."*
- There is also a whole-app backup format (*"This file is not a Formamorph backup."*). Importing one
  would carry endpoint presets along with **everything else**, which is not what you want for this.
- The text-endpoint preset API is exactly `selectTextEndpointPreset` / `add` / `rename` / `delete` /
  `reset`. **No import. No export.** Endpoint presets exist only as a localStorage key.

So "drop a file in the folder" is not achievable. Writing the key directly is.

### 13.1. The storage schema (2.12.2)

Key `FORMAMORPH_textEndpointPresets`, value is a JSON **string**:

```json
{
  "activeId": "runpod-pod-kcpp",
  "presets": [
    { "id": "runpod-pod-kcpp",
      "name": "RunPod - KoboldCpp",
      "values": {
        "endpoint": "https://<pod-id>-5001.proxy.runpod.net",
        "apiToken": "<kcpp --password>",
        "model": "gguf",
        "contextWindowOverride": 32768,
        "maxTokens": 2048
      } }
  ]
}
```

Things the parser (`cU.parse`) actually enforces — it is far more permissive than it looks:

- **Only two checks.** `activeId` must be a string and `presets` must be an array. Fail either and
  the whole store silently resets to `{activeId:"default", presets:[]}`. The contents of each preset
  are **not validated at all**.
- **`id` is any unique string** — a UUID is what the UI generates, but nothing requires one. Reserved:
  `default` and `builtin-engine` are the two read-only built-ins (§2); reusing those ids will shadow
  nothing and confuse you.
- **`values` is merged over defaults** as `{...tT, ...preset.values}`, where
  `tT = {endpoint, apiToken:"", model:"default", contextWindowOverride:null, maxTokens:1024}`.
  So **partial `values` objects are fine** — omit any field you don't care about.
- **Unknown keys are preserved but ignored**, which is why `runpod-endpoint-preset.json` can carry
  `_note` / `_urlFormat` documentation fields inline.
- `contextWindowOverride` is a number or `null`. `maxTokens` is a number.

### 13.2. The two files in this folder

| File | What it is |
|---|---|
| `runpod-endpoint-preset.json` | the schema above, filled in with **mock RunPod URLs** for all three shapes (Pod+kcpp, Pod+vLLM, Serverless) plus an inline field reference. Reading material and a template — not something the app loads. |
| `load-preset.js` | the loader you actually paste. Presets are inlined at the top; edit and paste the whole file. |

### 13.3. Procedure

1. Edit the `PRESETS` array at the top of `load-preset.js`. Replace every `REPLACEME` — the script
   refuses to write if any survive.
2. Launch Formamorph, open DevTools (**Ctrl+Shift+I**, or F12). *`main.cjs` sets
   `contextIsolation:true, nodeIntegration:false` but never passes `devTools:false`, so DevTools
   should open — unverified on this install.*
3. Paste the whole file into the **Console** tab, Enter.
4. It reloads the app itself. Check **Settings → AI Endpoints → Text**.

The script **merges**: existing presets are kept, a matching `id` is overwritten, new ids are
appended. It prints before/after, saves a rollback copy to
`FORMAMORPH_textEndpointPresets_backup`, and echoes the one-liner to restore it.

It also sets `FORMAMORPH_engineIsPresetMigrated = "1"`. That matters: if that guard is ever absent,
the one-shot migration (§2) runs on next boot and **force-writes `activeId = "builtin-engine"`**,
which would look exactly like your new preset failing to save.

### 13.4. Alternatives, and why not

- **Typing it into the UI** is five fields and needs no DevTools. For a single preset this is
  genuinely faster than editing a script; the file is worth it for repeatable setups or for a pod
  whose id changes every redeploy (§11e).
- **Editing `userdata/Local Storage/leveldb` directly** — don't. It needs the app closed, a real
  LevelDB library to write safely, and a corrupt write costs you every setting in the profile, not
  just presets.
- Remember the token lands in that leveldb **in plaintext**, and the write-ahead log keeps superseded
  values until compaction (§10). A pod password pasted through this script is recoverable from
  `userdata` afterwards.

## 14. Why it's slow — throughput on a rented GPU

§11 and §12 answer *where* to run the model. This section answers the question that comes after the
first session: **it connected fine, so why is each turn taking so long?**

The short version: **fitting and running fast are different problems**, and Formamorph makes several
requests per turn rather than one. Neither fact is visible from the UI.

### 14.0. Capacity is not speed

The instinct when sizing a pod is "will the weights fit". That question is easy and usually yes.
Example that prompted this section — a 70B at Q6_K on **2× A40 (48 GB each, 96 GB total)**:

| | |
|---|---|
| Weights, 70B Q6_K (~6.6 bpw) | ~57 GB |
| KV cache at 32K, GQA 8 kv-heads × 128 dim × 80 layers, fp16 | ~10 GB |
| **Total** | **~67 GB of 96 GB** — comfortable |

So it fits with room to spare, and it will still feel slow. Capacity was never the constraint.

### 14.1. Token generation is bandwidth-bound

Generating one token requires reading **every weight** from VRAM. So the ceiling is arithmetic, not
tuning:

```
tokens/sec  ≈  memory bandwidth  ÷  weight bytes
```

The A40 is GDDR6 at **~696 GB/s**. For the example above:

| Quant | Weights | Theoretical ceiling | Realistic |
|---|---|---|---|
| Q6_K | 57 GB | 696 / 57 ≈ **12 tok/s** | 7–9 tok/s |
| Q5_K_M | ~48 GB | ≈ 14 tok/s | 9–11 tok/s |
| **Q4_K_M** | ~40 GB | ≈ 17 tok/s | **11–13 tok/s** |

At 8 tok/s a 400-token narration takes **50 seconds** before prefill is counted. That is not a
misconfiguration — it is what the hardware allows. Recognising this early saves an afternoon of
tuning flags that cannot move the number.

**This is why quantization is the biggest single lever.** Q6→Q4_K_M is ~1.4× faster for a quality
loss that, at 70B, is much smaller than the loss from dropping to a 32B. If a run feels sluggish, go
down a quant before going down a parameter count.

### 14.2. Two GPUs give you room, not speed — unless the engine does tensor parallelism

This is the part that surprises people, and it is engine-dependent:

| Engine | Split | Effect |
|---|---|---|
| **koboldcpp / llama.cpp** | **layer split** — GPU0 runs layers 0–40, then GPU1 runs 41–80 | cards work **sequentially**. You get one card's bandwidth. Two GPUs = capacity only. |
| **vLLM** `--tensor-parallel-size 2` | **tensor parallel** — every layer is sharded across both | cards work **simultaneously**. Roughly 2× the bandwidth. |

So on 2× A40 with koboldcpp, the second card buys you the ability to *hold* a 70B and nothing more.
The table in §14.1 already reflects that — it uses one card's 696 GB/s, not 1392.

If two-GPU speed is the goal, that is the one strong argument for vLLM (§11e / §12.2) — and it costs
you your GGUF, since you must deploy the safetensors or an AWQ/GPTQ quant instead. That is a real
trade, not a free upgrade: different artifact, different outputs from what you tuned against.
NVLink does not change the picture for llama.cpp; the layer-boundary transfers are tiny either way.

One assumption sits under this whole table: that the two cards can actually copy to each other
*correctly*. On a rented pod that is not a given, and when it fails nothing errors — you get fluent
gibberish rather than a crash. **§15.9** is the two-minute check; run it before trusting any
two-card setup, whichever engine you land on.

### 14.3. A turn is not one request — verified in 2.12.2

The renderer issues **separate HTTP requests per prompt kind**, sequentially. There are nine kinds:
`narration`, `choices`, `summary`, `stats`, `tags`, `diary`, `director`, `storyboard`, `title`.

| Kind | Streaming | Notes |
|---|---|---|
| `narration` | `stream:!0` | the main call — `max_tokens` from the preset |
| `choices` | `stream:!0` | **a second full call**, same streaming handler, `kind === "choices"` |
| `stats`, `summary`, `diary`, `director`, `storyboard` | — | structural passes |
| `tags` (scene image) | `stream:!1` | `max_tokens: 200` |
| `title` | `stream:!1` | `max_tokens: 80` |

Two consequences that dominate perceived latency:

1. **Each call carries its own system prompt.** Different system prompt = a different prefix from
   token zero = koboldcpp's prompt cache **cannot reuse anything** between them. You pay full prefill
   three or four times per turn, not once.
2. **They are serialized.** Nothing overlaps. A "slow turn" is the sum of several complete
   prefill+generate cycles on a 70B.

This is exactly what §12.5 (hybrid routing) exists to fix, and the performance argument for it is
stronger than the cost argument: **Settings → Prompts** gives every kind its own Endpoint dropdown.
Move `summary` / `stats` / `tags` / `diary` / `title` off the pod and they stop queueing behind your
narration. Nobody reads a scene summary for its prose.

**There is no client-side request timeout** on generation — no `AbortSignal.timeout` anywhere in the
generation path. A slow endpoint will crawl indefinitely rather than erroring, so "hung" and "slow"
look identical from inside the app. Distinguish them at the server (§14.5).

### 14.4. What you get if you paste the URL and change nothing

Both defaults are conservative, which usefully **rules out over-packing** as a cause of slowness:

| Field | Left blank → | Constant |
|---|---|---|
| Context Window | **10,750 tokens** | `ZO = parseInt(void 0)\|\|10750` |
| Max Output Tokens | **1,024 tokens** | `T2 = parseInt(void 0)\|\|1024` |

Resolution order for context is `localEngine ? engineValue : contextWindowOverride ?? detected ?? ZO`
— so with koboldcpp (where Detect returns nothing, §5) a blank field means **10,750**, regardless of
what `--contextsize` the server was started with. Raising the field raises prefill cost on every one
of the calls in §14.3, so treat it as a performance dial, not just a capacity one.

### 14.5. The one measurement worth taking

Don't guess from inside the app — koboldcpp prints the answer on the pod console for every request:

```
Process:12.34s (100.0T/s), Generate:20.00s (20.0T/s), Total:32.34s
```

That single line separates every cause:

| What you see | Diagnosis |
|---|---|
| `Generate` ≈ the §14.1 realistic figure | **Nothing is wrong.** You are at the hardware ceiling — quantize down (§14.6). |
| `Generate` far below it (e.g. 2–3 T/s on a 70B) | **Layers are on CPU.** Check the startup line `offloaded N/81 layers to GPU`; auto-detection under-guesses across two GPUs. Force `--gpulayers 999`. |
| `Process` large and repeated several times per turn | the §14.3 multi-call pattern. Route background prompts elsewhere. |
| Server `Total` is fine but the app feels far slower | network path — see §14.7 — or you are watching several §14.3 calls in sequence. |

### 14.6. Levers, in order of payoff

1. **Drop a quant** — Q6_K → Q4_K_M, ~1.4×, small quality cost at 70B. Biggest single win.
2. **Route background prompts to a cheap endpoint** (§12.5). Removes whole prefill+generate cycles
   from the critical path rather than making them faster.
3. **Confirm full offload** — `--gpulayers 999`, verify against the startup log. Partial offload is
   catastrophic, not gradual.
4. **`--flashattention`** — cuts KV memory and speeds long-context prefill.
5. **Lower the Context Window field** (§14.4) if it was raised. Prefill scales with it, several times
   per turn.
6. **Switch to a tensor-parallel engine** — vLLM or exllamav3/TabbyAPI — if multi-GPU speed matters
   more than running your exact GGUF (§14.2). Step-by-step in **§15**; §15.0 picks which.
7. **Get off the HTTP proxy** (§14.7) — doesn't raise tokens/sec, but stops streaming feeling dead.

Note what is *not* on this list: sampler tuning, `--threads`, and anything in the Formamorph UI other
than context and routing. Per §7/§12.0, top-p/top-k/min-p aren't even sent to a custom endpoint.

### 14.7. The RunPod proxy is on the path — and it buffers

Everything above measures the *server*. The `*.proxy.runpod.net` hostname (§11a) is a reverse proxy
in front of the pod, and it is not transparent:

- **It buffers SSE. Confirmed** — reproduced by running koboldcpp natively and comparing against the
  same server through the proxy. Formamorph streams narration (§14.3), so through the proxy you wait
  out the whole generation seeing nothing, then get the paragraph in one dump. **Same tokens/sec,
  much worse experience** — and it makes a healthy endpoint feel broken.
- The path is `User → Cloudflare → Runpod Load Balancer → Pod`, inheriting **Cloudflare's ~100 s
  connection limit (524)**. A stream that has already started is safe; one that hasn't emitted a
  first byte within 100 s is killed. Long prefill on a big model can reach that.

**Fix: expose the port as TCP instead** and connect to the pod's public IP and mapped external port.
Full procedure, including what that costs you in TLS, is in **§15.3**.

### 14.8. Verification status

**Verified by reading the 2.12.2 renderer:** the nine prompt kinds and their separate requests;
`narration`/`choices` both streaming via the same handler; `tags` and `title` non-streaming at
`max_tokens` 200 and 80; absence of any generation-path request timeout; `ZO = 10750` and
`T2 = 1024` and the context resolution order in §14.4.

**Arithmetic, not measurement:** every tokens/sec figure in §14.1. They are bandwidth ceilings
derived from the A40's ~696 GB/s spec and the weight sizes — real throughput lands below them and
varies with context length, batch and quant type. Use them to set expectations and to recognise
"this is normal", not as targets.

**Confirmed on this setup:** the proxy buffers SSE (§14.7) — reproduced against koboldcpp running
natively. The ~100 s Cloudflare limit is from RunPod's own proxy documentation.

**Unverified:** koboldcpp's prompt-cache behaviour across differing system prompts is inferred from
how prefix caching works generally, not observed on this install.

## 15. Quickstart — Formamorph on RunPod with two GPUs (vLLM or TabbyAPI)

§11e sets up **koboldcpp**, which is the right default. This section is the other path, and it exists
for exactly one reason: **koboldcpp cannot use two GPUs at once** (§14.2) — vLLM and exllamav3 can.
If you are renting a **single** GPU, stop here and use §11e; neither engine buys you anything and
both cost you your GGUF.

Start at **§15.0**, which routes you to one of two engines depending on what quant of your finetune
exists. §15.2–§15.7 cover vLLM; **§15.8** covers TabbyAPI/EXL3.

### 15.0. The decision gate: which quant of your finetune exists?

Check this **before** renting anything, because it picks the engine for you.

Three engines matter, and the split is not vLLM-vs-koboldcpp — it's **which ones do tensor
parallelism** (§14.2), because that is the only thing that makes a second GPU raise tokens/sec:

| Engine | Format | Tensor parallel | Server |
|---|---|---|---|
| koboldcpp / llama.cpp | **GGUF** | ❌ layer split only | built in (§11e) |
| **vLLM** | AWQ / GPTQ / safetensors | ✅ | built in (§15.2) |
| **exllamav3** | **EXL3** (also EXL2 via v2) | ✅ | **TabbyAPI** (§15.8) |

So the gate is: what has somebody actually quantized your finetune into?

| What exists for your model | Route |
|---|---|
| An **AWQ** quant | ✅ **vLLM** — §15.2 on. Marlin kernels, works on Ampere. Best-supported path. |
| A **GPTQ** quant | ✅ vLLM, typically 5–15% behind AWQ. |
| An **EXL3** (or EXL2) quant | ✅ **TabbyAPI** — §15.8. Same tensor-parallel win, no AWQ required. |
| Only **fp16 safetensors** | ⚠️ a 70B in fp16 is ~140 GB — **does not fit** 2× A40. Either `--quantization bitsandbytes` for on-the-fly 4-bit (works, gives up much of the speed you came for), or quantize it yourself — see below. |
| Only **GGUF** | → koboldcpp (§11e), **or** make your own quant. Don't conclude "GGUF only" until you've checked EXL3 as well. |

**The RP finetune ecosystem is GGUF-first, and that is the real friction here.** TheDrummer,
Sicarius and the rest get quantized quickly and thoroughly, but overwhelmingly into GGUF, because
that is what the audience runs. AWQ and GPTQ exist mainly for people serving on datacenter GPUs,
which is a much smaller crowd with different taste in models.

**Check EXL3 before you give up, though.** It is easy to conclude the format died — the visible part
of it did, since ooba stopped being the default way people touched it. The engine did not: exllamav3
is active, TabbyAPI is its server, and it does tensor parallelism. Quant coverage for RP finetunes is
thinner than GGUF and lags release day, but it is far from empty. Search both `-AWQ` and `-EXL3`
before routing yourself to koboldcpp by default.

**The escape hatch: quantize it yourself.** If nothing usable exists, rent a card for an hour, run a
calibration pass, push the result to a private HF repo, and every future session has an artifact.
For a 70B that is a couple of dollars, once, and it permanently unblocks this path for any finetune
you like. **Use `llm-compressor`** — the vLLM project's tool, built on AutoAWQ's work with the
original maintainer's involvement. **AutoAWQ itself was archived in May 2025 and is unmaintained**;
guides still pointing at it are stale.

Whichever route you take, note the artifact is genuinely different from what you tested locally. A
4-bit AWQ or a 5 bpw EXL3 is not your `i1-Q6_K` — same finetune, different outputs.

#### Worked examples — checked on Hugging Face, 2026-08-20

**Assistant_Pepe_70B** (Sicarius, Llama-3.1-70B finetune) — *the gate resolves to vLLM.*

| Repo | Format | Size | On 2× A40 |
|---|---|---|---|
| `SicariusSicariiStuff/Assistant_Pepe_70B_GPTQ_AR_4-bit-128` | GPTQ 4-bit | **39.8 GB** | ✅ **vLLM, TP 2** |
| `SicariusSicariiStuff/Assistant_Pepe_70B_FP8` | FP8 | 72.7 GB | ❌ **Ampere has no FP8** |
| `SicariusSicariiStuff/Assistant_Pepe_70B` | fp16 | 141.1 GB | ❌ exceeds 96 GB |
| `mradermacher/Assistant_Pepe_70B-i1-GGUF` | GGUF imatrix, 24 quants | IQ1_S 15.3 → Q6_K 57.9 GB | ✅ koboldcpp, no TP |
| `bartowski/...`, `mradermacher/...-GGUF`, `..._70B_GGUF` | GGUF static | — | ✅ koboldcpp, no TP |

No AWQ, and **no EXL3/EXL2 for the 70B** (EXL3 exists only for the 8B). The GPTQ's
`quantization_config` is the good case: `bits 4, group_size 128, desc_act false, sym true`, made with
auto-round 0.12.0. **`desc_act: false` + `sym: true` is what `gptq_marlin` wants** — fast kernel, no
fallback. `num_attention_heads: 64`, `num_key_value_heads: 8` → TP 2 and 4 both legal.

*(The HF page showing "11B params" is an artifact of counting packed int4 tensors, not a different
model.)*

**Behemoth 123B** (TheDrummer, Mistral-Large-2 finetune) — *the gate resolves to TabbyAPI.*

`num_attention_heads: 96`, `num_key_value_heads: 8`, 88 layers, 128K positions.

| Source | Format | Sizes |
|---|---|---|
| `TheDrummer/Behemoth-*-GGUF` + mradermacher/bartowski | GGUF | i1-Q6_K ≈ 101 GB |
| **`ArtusDev/TheDrummer_Behemoth-{ReduX-v1,ReduX-v1.1,X-v2,X-v2.1,R1-v2}-EXL3`** | **EXL3** | branches **2.5 / 3.0 / 3.5 / 4.0 / 4.25 / 5.0 / 6.0 / 8.0 bpw** |
| `tacodevs/Behemoth-{R1-123B-v2-W4A16,T1-123B,T1-v2-123B}-GPTQ` | GPTQ 4-bit | — |
| `cgg507/Behemoth-R1-123B-v2-awq` | AWQ | — |
| `MikeRoz`, `BigHuggyD`, `BaronRabban` | EXL2 (v1-era only) | 2.0–8.0 bpw |

Measured EXL3 sizes for `Behemoth-ReduX-123B-v1.1`:

| Branch | Weights | Fits 2× A40 (96 GB)? | Fits 3× A40 (144 GB)? |
|---|---|---|---|
| `4.0bpw_H6` | 62.1 GB | ✅ ~34 GB for KV | ✅ |
| **`5.0bpw_H6`** | **77.3 GB** | ✅ ~19 GB for KV — see below | ✅ |
| `6.0bpw_H6` | 92.5 GB | ❌ no room for KV | ✅ |
| `8.0bpw_H8` | 123.1 GB | ❌ | ✅ ~21 GB for KV |

**The 5.0bpw line is the interesting one.** Behemoth's KV cache is
`88 layers × 8 kv-heads × 128 dim × 2 × 2 bytes ≈ 0.34 MB/token` → **~11 GB at 32K**, which fits the
~19 GB left over on two cards, with room to spare. `cache_mode: Q8` roughly halves that if you want
64K. So an EXL3 5.0bpw plausibly runs Behemoth on **two** A40s instead of three — a third off the
bill — while also being tensor-parallel, which the GGUF never was. Worth an hour of pod time to test
against your usual i1-Q6_K before believing it.

**Confirmed for Behemoth-128B-v3, 2026-08-22.** `MikeRoz/Behemoth-128B-v3-5.00bpw-h6-exl3` exists and
its weights measure **75.06 GiB** — under the ReduX 5.0bpw figure above, and under the 78.41 GB Q4_K_M
GGUF of the same model, at higher precision. The prediction in this section holds for v3, but note the
KV arithmetic above was computed for the **123B** on `Mistral-Large`; v3 is 128B on `Mistral-Medium-3.5`
and its layer and kv-head counts have not been re-derived, so treat the ~19 GB headroom as indicative
until it is. Separately: v3 refuses where earlier Behemoths did not — see `model-recommendations.md`.

**Note what these two examples prove between them.** Sicarius ships GPTQ and FP8 himself; ArtusDev
covers TheDrummer's current Behemoth releases in EXL3 at eight bit-rates. The "RP finetunes are GGUF
only" impression is what the front page looks like, not what the ecosystem holds — **but it is
per-model, and the answer differs between two models by the same kind of author.** Always check both
`-GPTQ`/`-AWQ` and `-EXL3` for the specific repo before routing yourself to koboldcpp.

### 15.1. Sizing — and why the *number* of cards is a hard constraint

Ampere (A40 = sm_86) runs AWQ, GPTQ and the Marlin kernels, but **not FP8** — that needs Ada or
Hopper. So on A40s, FP8 repos are decoration no matter how appealing the file size looks.

#### Pick the GPU count before you pick the model — TP divides, and 3 usually doesn't

**This is a rental decision, not a debugging detail, which is why it's here and not in §15.7.**
vLLM shards tensor-parallel across GPUs by splitting attention heads, and it enforces that **both
`num_attention_heads` and `num_key_value_heads` are divisible by the TP size.** It refuses to start
otherwise:

> `ValueError: Total number of attention heads (N) must be divisible by tensor parallel size (M).`

Modern GQA models almost all have **8 KV heads**. Eight is divisible by 1, 2, 4 and 8 — **not by 3.**

| Cards | TP size | GQA-8 model (Llama 70B, Mistral Large / Behemoth) |
|---|---|---|
| 2 | 2 | ✅ |
| **3** | **3** | ❌ **fails to start** — 8 % 3 ≠ 0 |
| 4 | 4 | ✅ |

So **three cards is the one count that doesn't work** with vLLM for essentially every model you'd
want to run. If you habitually rent three because that's what a 123B at Q6 needs in GGUF, note that
the habit does not transfer: on vLLM you want **2 or 4**, and the way to use three cards is a smaller
quant on two of them (see the Behemoth EXL3 numbers in §15.0), not TP 3.

Fallbacks if you really have three: `--pipeline-parallel-size 3` runs but is a pipeline, not a
bandwidth win — much the same as koboldcpp's layer split (§14.2), so it buys capacity, not speed.

One further quantized-model rule: the layer output size must divide by **(quantization block size ×
TP size)**. With `group_size: 128` and TP 2 or 4 this is satisfied by every mainstream architecture,
but it's the second thing to suspect if a GPTQ/AWQ model refuses a TP size that the head counts say
should be legal.

*Whether exllamav3/TabbyAPI (§15.8) enforces the same rule is **unverified** — its splitting is
independent of vLLM's. If it does tolerate 3 GPUs it would change the arithmetic above considerably,
and that is worth ten minutes on a pod to find out.*

#### Memory budget

Weights are the easy part; KV grows with context and is what actually decides whether a config fits:

```
KV bytes/token  =  layers × kv_heads × head_dim × 2 (K and V) × 2 (fp16)
```

| Model | KV per token | at 32K |
|---|---|---|
| Llama-3.1 70B (80 × 8 × 128) | 0.33 MB | ~10 GB |
| Behemoth 123B (88 × 8 × 128) | 0.34 MB | ~11 GB |

Leave that much clear above the weights, plus a couple of GB of overhead. `cache_mode: Q8` in
TabbyAPI, or KV-cache quantization in vLLM, roughly halves it when you want long context on a card
that won't quite stretch.

### 15.2. Deploy the pod

1. **Pod → vLLM template** (or the `vllm/vllm-openai:latest` image directly). Set **GPU count = 2**.
2. **Expose the port as TCP, not HTTP.** This is the important one — see §15.3.
3. Set `MAX_MODEL_LEN` in the environment if the template offers it, or pass `--max-model-len` in the
   arguments.
4. **Run the §15.9 peer-to-peer check before you download anything large.** Two GPUs that can't copy
   to each other correctly produce fluent nonsense from either engine, with no error anywhere.

Launch arguments:

```
--model <hf-repo-id-of-the-awq-quant>
--host 0.0.0.0
--tensor-parallel-size 2
--max-model-len 32768
--api-key <a-long-random-string>
--enable-prefix-caching
```

Defaults worth knowing, so you only override what matters:

| Flag | Default | Comment |
|---|---|---|
| `--port` | **8000** | |
| `--host` | loopback | **must** be `0.0.0.0` or nothing outside the container can reach it |
| `--tensor-parallel-size` | **1** | the whole reason you're here — set it to 2 |
| `--gpu-memory-utilization` | **0.92** | leave it alone unless you hit OOM |
| `--max-model-len` | derived from the model config | set it — model maxima are often far larger than you want to pay for |
| `--served-model-name` | same as `--model` | whatever this resolves to is what goes in Formamorph's Model Name field |
| `--api-key` | unset | **set it** — see §15.4 |
| `--enable-prefix-caching` | see note | V1 enables it, but the CLI reference still lists the flag's default as off. Pass it explicitly rather than relying on the engine version. |

Prefix caching matters more here than usual: per §14.3 Formamorph re-sends a large, mostly-unchanged
history several times per turn, and prefix caching is what stops each of those being a full prefill.

### 15.3. The HTTP proxy buffers SSE — confirmed

**The RunPod HTTP proxy buffers SSE.** Confirmed on this setup by running koboldcpp natively and
comparing: the same server streams smoothly on a direct connection and arrives as a single delayed
dump through `*.proxy.runpod.net`. Formamorph streams narration token-by-token (`stream:!0`, §14.3),
so buffering destroys the entire point of streaming — you wait the full generation time staring at
nothing, then the paragraph appears at once. Identical tokens/sec, far worse experience.

The proxy also routes `User → Cloudflare → Runpod Load Balancer → Pod` and inherits **Cloudflare's
~100-second connection limit (524)**. Streaming that has already started is fine; a request that
hasn't emitted its first byte within 100 s is killed outright. On a big model with a long prefill,
that is a reachable threshold.

So: **Expose TCP Ports → 8000**, then **Connect → Direct TCP Ports** for the real address, shown like
`213.173.109.39:13007 -> :8000`. Two consequences:

- **The external port is randomly assigned and changes on redeploy** — along with the IP. Your preset
  URL is stale every single time you redeploy. (§11e says the same about pod ids; here it's both.)
- **TCP direct is plain HTTP — there is no TLS.** Your `--api-key` crosses the open internet in
  cleartext, as does everything you generate. RunPod's own docs put this on you. Treat that key as
  disposable and rotate it; don't reuse a password from anywhere else. **This is the wrong trade for
  this app** — §15.3a has the arrangement that keeps the streaming *and* the encryption.

### 15.3a. Keeping it encrypted — tunnel, don't proxy

§15.3 buys smooth streaming by giving up TLS, and that bullet undersells what is being given up.

What crosses the wire here is not telemetry. It is the world, the characters, the scene as it stands,
and the model's reply — the whole of it, as readable UTF-8, on every hop between this machine and the
pod. Datacentre transit, the café access point, the ISP, whoever runs the middle. There is nothing to
decrypt because nothing was encrypted. The `--api-key` rides along in the same clear, so anyone who
reads one request can also generate on the rented GPUs until the pod comes down.

For this app specifically that is a bad trade at any speed, and the speed being defended is small:
encrypting a few kilobytes of text per turn is invisible next to a generation that takes seconds.
**Some latency is acceptable here. Cleartext is not.**

#### The four transports, honestly

| Transport | Encrypted | Streams token-by-token | Cost |
|---|---|---|---|
| **Direct TCP** (§15.3) | ❌ nothing | ✅ | none — this is the tempting one |
| **RunPod HTTPS proxy** | ✅ TLS to Cloudflare | ❌ buffers SSE (§14.7) | narration lands in one dump; 100 s cap |
| **SSH tunnel** ← *use this* | ✅ end to end | ✅ SSH forwards bytes as they arrive | one terminal left open |
| **Tailscale on the pod** | ✅ WireGuard | ✅ | install step on each new pod |

The proxy and the direct port are a forced choice between the two properties. A tunnel refuses the
choice: the transport is encrypted by SSH and the bytes are still forwarded unbuffered, so streaming
behaves exactly as it does on the direct port.

#### The tunnel

Expose **TCP port 22** on the pod and use **Connect → SSH over exposed TCP** — the address of the
form `root@<ip> -p <port>`, not the `ssh.runpod.io` one. Then, in a terminal you leave running:

```bash
ssh -N -L 8000:localhost:8000 root@<POD-IP> -p <POD-SSH-PORT> -i ~/.ssh/id_ed25519
```

`-N` means "forward only, no shell". `localhost:8000` is resolved **on the pod**, so this works even
with the inference server bound to loopback — which is the real prize: `--host 127.0.0.1` instead of
`0.0.0.0` closes the §15.4 `/invocations` hole outright, because there is no longer a public port to
find. The endpoint URL then becomes:

| Field | Value |
|---|---|
| Endpoint URL | `http://localhost:8000` — completed to `/v1/chat/completions` by §3 |

Two consequences worth expecting. The tunnel dies with the terminal, so a dropped connection reads
in-app as a red *Didn't answer* dot; `-o ServerAliveInterval=30` makes it fail faster and more
honestly than it otherwise would. And the preset URL now **stops changing on redeploy** — it is
`localhost` forever, and only the ssh command carries the new IP and port. That is a real second win
over §15.3, where every redeploy meant editing the preset.

**Use `ssh.runpod.io` only if the exposed-TCP option is not available.** That proxy host is not a
plain sshd — it refuses exec'd commands and demands a PTY (§15.9's helper script exists because of
it), and whether it forwards ports at all is untested here.

#### What the app does about it now

The Endpoint URL fields — text and image both — flag a plain-`http://` address that points out to the
internet, in the row's own helper line, and the warning is wired to the input with `aria-describedby`
so focusing the field reads it out. Loopback, LAN ranges, `.local` names and Tailscale's `100.64/10`
are all silent: an `http://` inside a tunnel or a WireGuard mesh is already encrypted underneath, and
warning about those would only teach you to ignore the warning that matters.

#### What the tunnel does and doesn't cover on a rented pod

On a pod the tunnel is close to a complete answer, and it is worth being clear why. The thing at the far
end is **your own vLLM or TabbyAPI process**, not a vendor's inference service — nobody is reading the
prompt in order to answer it. So unlike a hosted provider, where the plaintext at the destination is
unavoidable by design, here the network really is the whole of the exposure, and encrypting it really
does close the problem.

What is left over is the *host*, not the path, and no endpoint setting reaches it:

1. **The pod is RunPod's machine.** Weights, KV cache and every prompt in flight sit in that host's RAM
   while the pod is up, and the container filesystem is their disk. Anyone with hypervisor or datacentre
   access is inside the boundary no matter what the transport looks like. The only levers are how long
   the pod stays up and what you leave on its disk — which is another reason to stop it between sessions
   (§11e).
2. **Don't turn on prompt logging.** Both servers can log prompts and generations, and a pod's container
   log is shown in RunPod's own web console — which is a plaintext copy of the session sitting in a web
   UI, reached by a login rather than by a tunnel. Leave the logging keys off. *(That the option exists in
   both servers and that RunPod surfaces container logs in its UI is the point; the exact `config.yml` key
   names are unchecked here — read them before you flip anything.)*
3. **The API token is stored on your disk in plaintext** regardless (§10, §13.1).

For completeness, the case this section is *not* about: on a hosted catalogue (§12 tier 2 and 3 —
OpenRouter, Featherless and the rest) the provider necessarily sees every prompt in the clear at their
end, whatever the retention policy says, and TLS does nothing about that. That is a reason to choose the
pod, not a reason to skip the tunnel on it.

### 15.4. Lock it down — the `--api-key` gap

`--api-key` (or the `VLLM_API_KEY` env var) **only authenticates paths under `/v1`, `/v2` and
`/inference`.** The `/invocations` endpoint is **not covered and exposes the same inference
capability.** So a key alone does not make an internet-reachable vLLM private — anyone who finds the
host:port can generate on your GPUs through `/invocations`.

Mitigations, in order of preference: **bind the server to `127.0.0.1` and reach it through the §15.3a
tunnel**, which removes the public port instead of guarding it; failing that, keep the pod's TCP port
unadvertised and short-lived; put a reverse proxy in front that rejects everything except `/v1/*`; or
stop the pod when you're not playing (which you want to do anyway, §11e).

### 15.5. Formamorph preset

Add a new preset (§2 — the built-ins are read-only), then:

| Field | Value |
|---|---|
| Endpoint URL | Tunnelled (§15.3a, preferred): `http://localhost:8000`. Direct: `http://<PUBLIC-IP>:<EXTERNAL-PORT>` — bare host either way, so `nI()` completes it to `/v1/chat/completions` (§3). Note **`http`**, not `https`; the direct form is the one the field now warns about, and it is right to. |
| API Token | your `--api-key` string |
| Model Name | must match `--served-model-name` (or the repo id) **exactly** — vLLM routes on it and a typo only surfaces at generation time (§8) |
| Context Window | click **Detect** — it works here |
| Max Output Tokens | raise from the 1024 default (§14.4) |

**Detect works with vLLM and doesn't with koboldcpp.** Per §5 the probe scrapes `max_model_len` out
of `/v1/models`, which vLLM includes and kcpp doesn't. If Detect fills in your `--max-model-len`,
that's end-to-end proof the URL, key and model name are all correct.

### 15.6. Verify before you trust it

```bash
# 1. should be rejected without a key
curl -s -o /dev/null -w '%{http_code}\n' http://IP:PORT/v1/models
# 2. should be 200, and should show max_model_len
curl -s -H 'Authorization: Bearer KEY' http://IP:PORT/v1/models
# 3. streaming — tokens should arrive progressively, not all at once
curl -N -H 'Authorization: Bearer KEY' -H 'Content-Type: application/json' \
  -d '{"model":"MODEL","messages":[{"role":"user","content":"count to 20"}],"stream":true}' \
  http://IP:PORT/v1/chat/completions
```

Test 3 is the one that matters and the one people skip. `-N` disables curl's own buffering; if the
chunks still arrive in a single burst, something on the path is buffering and you have not actually
escaped §15.3.

### 15.7. Gotchas

| Symptom | Cause |
|---|---|
| Server never starts, `ValueError: Total number of attention heads … must be divisible by tensor parallel size` | **Both head counts must divide by TP size** — and GQA models have 8 KV heads, so **TP 3 always fails**. Full rule and the rental consequence in **§15.1**. |
| Connection refused from outside | `--host` left at loopback. Must be `0.0.0.0`. |
| Red *Didn't answer* dot after a redeploy | new IP **and** new random external port (§15.3). |
| HTTP 404 at generation time, green dot | Model Name doesn't match `--served-model-name`. The probe hits `/v1/models` and succeeds; only generation routes on the name. |
| OOM at startup | lower `--max-model-len` first, then `--gpu-memory-utilization`. Context is usually the culprit, not weights. |
| Text appears all at once | proxy buffering — you're still on the HTTP proxy (§15.3). |

### 15.8. The third path — EXL3 on TabbyAPI

Everything from §15.2 to §15.7 assumes vLLM. **TabbyAPI is the alternative when an EXL3 quant exists
and an AWQ one doesn't** — which, for RP finetunes, is a realistic split (§15.0). It gets you the
same thing you came here for: **tensor parallelism across both A40s.**

**Why it looks dead and isn't.** ExLlama's visibility collapsed when text-generation-webui stopped
being the default way people ran it. The engine kept going — **exllamav3** with the **EXL3** format,
served by **TabbyAPI** (0.0.29 as of April 2026, with reasoning and tool-calling support added that
month). It's a headless server rather than a webui, so it generates far fewer screenshots per user.
Absence of chatter is not absence of maintenance.

Concrete evidence rather than assertion: **ArtusDev publishes EXL3 quants of TheDrummer's current
Behemoth releases** — ReduX v1/v1.1, X v2/v2.1, R1 v2 — each at eight bit-rates from 2.5 to 8.0 bpw,
on branches. Sizes are in §15.0. That is active coverage of exactly the RP finetune line you'd
otherwise assume is GGUF-only.

EXL3 is trellis-encoded (QTIP-derived) and its quality-per-bit advantage over GGUF K-quants is real,
but **concentrated at low bpw**. At the 5–6 bpw you can afford on 96 GB the gap narrows considerably,
so pick this path for the tensor parallelism and the quant availability, not for an expected quality
jump.

#### Deploy

Same pod shape as §15.2 — 2 GPUs, **TCP port exposed, not HTTP** (§15.3 applies identically; the
proxy buffers SSE regardless of which engine is behind it).

TabbyAPI is configured by `config.yml` rather than CLI flags. The keys that matter, with their real
defaults:

```yaml
network:
  host: 127.0.0.1        # MUST become 0.0.0.0
  port: 5000             # note: 5000, not vLLM's 8000
  disable_auth: false    # leave false

model:
  model_dir: models
  model_name:                        # the EXL3 folder under model_dir
                                     # ArtusDev repos put each bpw on its own BRANCH —
                                     # clone with --revision 5.0bpw_H6, not main
  max_seq_len:                       # set it; otherwise the model's own maximum
  tensor_parallel: false             # MUST become true — the whole point
  tensor_parallel_backend: native    # docs: native for PCIe, nccl for NVLink —
                                     # but see §15.9: on a pod with broken peer-to-peer,
                                     # nccl + NCCL_P2P_DISABLE=1 was the only thing that worked
  gpu_split_auto: true
  cache_mode: FP16                   # Q8/Q6/Q4 trade cache quality for context
```

Three of those are the entire setup: **`host: 0.0.0.0`**, **`tensor_parallel: true`**, and
`max_seq_len`. On the documentation's advice `tensor_parallel_backend: native` is the pick for
unbridged A40s — **native for PCIe, NCCL for NVLink** — and getting it backwards is described as a
silent performance loss rather than an error.

**Measured 2026-08-23, and it complicates that advice.** On a 2× A40 pod whose peer-to-peer
transfers were silently broken (§15.9), `nccl` launched with `NCCL_P2P_DISABLE=1` was the only
configuration that produced correct output at all. `native` was not tested on that pod — but it is
the backend that would drive the broken path directly, so where the §15.9 check fails, read the
PCIe/native recommendation as inverted: **NCCL is the fallback that still works**, at the cost of
routing collectives through host RAM. On a pod that passes the check, the original advice stands.

API keys go in `api_keys.yml` (copy `api_keys_sample.yml`). It distinguishes an **`api_key`** from an
**`admin_key`** — the admin key can load and unload models over HTTP. On a pod reachable from the
open internet that is a bigger deal than it sounds; treat the admin key as the sensitive one and
don't paste it into Formamorph. The read/generate `api_key` is what belongs in the preset.

#### Formamorph preset

| Field | Value |
|---|---|
| Endpoint URL | `http://<PUBLIC-IP>:<EXTERNAL-PORT>` — bare host, `nI()` completes it (§3). **`http`**, not `https` (§15.3). |
| API Token | the **`api_key`** from `api_keys.yml` — not the admin key |
| Model Name | the loaded model's name |
| Context Window | try **Detect**; if it comes back empty, type your `max_seq_len` by hand |
| Max Output Tokens | raise from the 1024 default (§14.4) |

TabbyAPI exposes the OpenAI v1 schema — `/v1/chat/completions`, `/v1/completions`, `/v1/models` — so
everything in §3 and §5 applies unchanged. It also has its own `/v1/model/load` route, which is what
the admin key guards.

#### Measured on Ampere, 2026-08-23

This section used to say *benchmark it on Ampere specifically — this is the one claim I'd least want
you to take on trust*. It has now been measured, on 2× A40 (sm_86), TabbyAPI `e632af4` with
exllamav3 1.4.2, torch 2.9.0+cu128, driver 570.195.03:

| Model | Quant | Cache | Context | Request | Rate |
|---|---|---|---|---|---|
| Behemoth-128B-v3 | EXL3 4.25 bpw, h6 | Q8 | 32768 | 50 tokens | 8.1 tok/s |
| Behemoth-128B-v3 | EXL3 4.25 bpw, h6 | Q8 | 32768 | 200 tokens | **12.0 tok/s** |

Weights landed at 35.3 GB + 34.7 GB across the two cards — an even tensor-parallel split, 68.6 GB of
weights plus a 32k Q8 cache inside 90 GB of VRAM, with headroom. Load time was ~14 s with the file
still in page cache. Prose quality was intact; the trellis-decode-is-slow-on-Ampere worry did not
turn up anything disqualifying.

**Read that as a floor, not a clean number.** That pod's peer-to-peer transfers were broken (§15.9),
so every collective was detouring through host RAM. A pod that passes the §15.9 check should beat
it; by how much is still unmeasured.

### 15.9. The peer-to-peer trap — check this before you trust two cards

**The failure.** A two-GPU pod can advertise working peer-to-peer transfers and not have them. On
RunPod pod `zzbockeqp0d3by` (2× A40, 2026-08-23) a direct `cuda:0 → cuda:1` tensor copy returned
**all zeros**, while `torch.cuda.can_device_access_peer()` reported `True` in both directions.

Nothing errors. The model loads, VRAM fills plausibly, the server starts, and every token is
garbage — a wall of `<unk>` at greedy temperature, multilingual token salad at normal ones. At the
API it is indistinguishable from a corrupted download.

**The check.** Two minutes, once torch is installed, before downloading anything large:

```bash
python - <<'PY'
import torch
a = torch.arange(1000000, dtype=torch.float32, device="cuda:0")
torch.cuda.synchronize(0); torch.cuda.synchronize(1)

b = a.to("cuda:1")                      # direct — uses peer DMA
torch.cuda.synchronize(0); torch.cuda.synchronize(1)
print("DIRECT  :", (a.cpu() - b.cpu()).abs().max().item(), b[:6].tolist())

c = a.cpu().to("cuda:1")                # staged through host RAM
torch.cuda.synchronize(1)
print("VIA HOST:", (a.cpu() - c.cpu()).abs().max().item(), c[:6].tolist())
PY
```

Both lines must print `0.0` and `[0.0, 1.0, 2.0, 3.0, 4.0, 5.0]`. The broken pod printed:

```
DIRECT  : 999999.0 [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
VIA HOST: 0.0      [0.0, 1.0, 2.0, 3.0, 4.0, 5.0]
```

**The workaround.** `tensor_parallel: true` with `tensor_parallel_backend: nccl` (§15.8), launched
with `NCCL_P2P_DISABLE=1` so collectives route through host memory:

```bash
#!/bin/bash
cd /root/tabbyAPI
source venv/bin/activate
export NCCL_P2P_DISABLE=1
exec python main.py "$@"
```

`NCCL_P2P_DISABLE=1` on its own does **not** fix it. It redirects NCCL only — not the raw torch copy
path that exl3's default layer split (`gpu_split_auto` with `tensor_parallel: false`) uses. That is
precisely why TP works on a broken pod and plain autosplit does not, and it is worth knowing which
knob is doing the work rather than pasting both and hoping.

**Telling this apart from a bad download.** Three checks, cheapest first:

1. **Greedy decode.** `temperature: 0, top_k: 1` on `"The capital city of France is"`. Sampling
   problems vanish under greedy; numerical ones don't.
2. **A 1B control.** `turboderp/Llama-3.2-1B-Instruct-exl3 --revision 4.0bpw` is ~1 GB. If it works
   on a single card and breaks when forced across both with `gpu_split: [0.5, 4]`, the model is
   innocent and the pod is not.
3. **Checksums.** HF publishes the sha256 of every LFS file, so *is my download intact* has an
   actual answer rather than a shrug:

```bash
curl -s "https://huggingface.co/api/models/<repo>/tree/main?recursive=1" \
  | python3 -c 'import json,sys
for e in json.load(sys.stdin):
    if e.get("lfs"): print(e["lfs"]["oid"] + "  " + e["path"])' > expected.txt
sha256sum -c expected.txt
```

On the broken pod all nine Behemoth shards plus `tokenizer.json` returned `OK` while the output was
still nonsense. Re-downloading 68 GB would have proved nothing.

**Why it happens.** ACS and IOMMU force PCIe peer transactions through the root complex for security
checks, and virtualized or containerized hosts frequently break P2P this way. The documented
*benign* outcome is that the driver reports no P2P support and the runtime migrates allocations to
system memory — slower, but correct. This pod showed the malignant variant: capability advertised,
transfers accepted, data silently dropped. So treat "no P2P support" in a log as informational, and
"P2P available" as unproven until the copy test agrees with it.

**At rental time.** The user reports that RunPod surfaces a warning about this class of limitation
when you pick a multi-GPU configuration — *unverified; the exact wording and where it appears are
unrecorded, and nothing in RunPod's published docs was found stating it.* If the warning is there it
deserves reading rather than clicking past, but it does not replace the check: what happened here
was silent corruption, not an absent capability, and a listing claiming P2P works is exactly the
case this section exists for. A failed check is also grounds to redeploy — a new pod is a new
physical host, and the test costs seconds.

### 15.10. Verification status

**Verified against vLLM and RunPod docs on 2026-08-20:** the flag defaults in §15.2 (`--port` 8000,
`--tensor-parallel-size` 1, `--gpu-memory-utilization` 0.92, `--max-model-len` derived,
`--served-model-name` mirroring `--model`); the `--api-key` path-prefix limitation and the
unprotected `/invocations` endpoint; the single-node TP guidance; the proxy hop chain, the ~100 s
Cloudflare limit, and the TCP-mapping format.

**Verified by the user, on their own hardware:** RunPod's HTTP proxy buffers SSE (§15.3), reproduced
by comparing against koboldcpp running natively.

**Verified on a rented pod, 2026-08-23** (2× A40, TabbyAPI `e632af4`, exllamav3 1.4.2+cu128.torch2.9.0,
torch 2.9.0+cu128, Python 3.11.10, driver 570.195.03, Ubuntu 22.04.5): the whole §15.8 install path end
to end — `pip install -e ".[cu12]"` resolving torch and the matching exl3 wheel by Python version and
platform; current TabbyAPI being **exl3-only**, with the backend auto-detected from the model's
`quantization_config` so `backend:` can be left blank; `cache_mode` accepting `FP16`/`Q8`/`Q6`/`Q4` or an
explicit `"k,v"` bit pair. **EXL3 throughput on Ampere (§15.8) — previously flagged here as the weakest
claim in the section — is now measured**, though on a pod with broken peer-to-peer, so it stands as a
floor rather than a clean figure. The §15.9 peer-to-peer corruption was reproduced directly, including
on a 1B control model split across both cards, and the `nccl` + `NCCL_P2P_DISABLE=1` workaround was
confirmed to restore correct output; the Behemoth shards checksummed clean against HF's LFS hashes
while that output was still garbage.

**Verified on Hugging Face, 2026-08-20 (§15.0 worked examples):** every repo id, file size and
branch list quoted there — the Assistant_Pepe_70B GPTQ `quantization_config` (bits 4, group_size 128,
desc_act false, sym true, auto-round 0.12.0) and its 39.8 GB total; Behemoth's `num_attention_heads`
96 / `num_key_value_heads` 8 / 88 layers; ArtusDev's EXL3 branch sizes (62.1 / 77.3 / 92.5 / 123.1 GB).
The vLLM head-divisibility rule in §15.1 is from vLLM's own error path and issue tracker.

**Also verified on 2026-08-20:** AutoAWQ was archived in May 2025 and `llm-compressor` is the
maintained AWQ path (§15.0); exllamav3 supports tensor parallelism and TabbyAPI is its OpenAI-compatible
server; the `config.yml` keys and defaults quoted in §15.8 (`port: 5000`, `host: 127.0.0.1`,
`tensor_parallel: false`, `tensor_parallel_backend: native`, `cache_mode: FP16`), including that
native is recommended for PCIe and NCCL for NVLink.

**Unverified:** whether exllamav3/TabbyAPI enforces vLLM's head-divisibility rule (§15.1) — this
decides whether three cards are usable at all and is worth testing directly. The throughput estimate
in §15.1 — tensor parallelism doubling bandwidth is
arithmetic (§14.1), not a measurement on this model. The head-count divisibility rule in §15.7 is a
known vLLM startup constraint, not something the parallelism doc states. Whether an AWQ or EXL3 quant
of your particular finetune exists is the thing to check first (§15.0) and nothing here can answer it.

**Reasoned, not measured — §15.3a, added 2026-08-23:** that an SSH tunnel forwards SSE unbuffered and
so keeps token-by-token streaming. This follows from SSH being a byte-stream forwarder with no notion of
HTTP framing — unlike the Cloudflare hop in §14.7, which buffers because it *does* parse the response —
but it was not run against a live pod. Likewise the claim that the encryption overhead is negligible:
that is arithmetic on a few kilobytes per turn against a multi-second generation, not a timing.

**Verified in this session, 2026-08-23:** that `ssh.runpod.io` is not a plain sshd — it requires a PTY
and silently ignores exec'd commands (this is why §15.9's helper pipes commands into an interactive
shell). **Unverified:** whether it forwards ports at all, which is exactly why §15.3a routes you to
**SSH over exposed TCP** instead. Also unverified: the `config.yml` key names for prompt logging in
either server (§15.3a) — that the option exists in both and that RunPod shows container logs in its web
console is the claim being made, not any particular key. Also unverified: that binding the inference server to `127.0.0.1`
behind that tunnel closes the §15.4 `/invocations` hole — it follows from there being no public
listener, but it was not tested by scanning the pod from outside.

**Unverified, added 2026-08-23:** whether `tensor_parallel_backend: native` also fails on a pod with
broken peer-to-peer (§15.8, §15.9) — only `nccl` was tested there, and `native` is assumed to drive the
broken path but was never run. What EXL3 throughput looks like on a *healthy* two-card pod, and
therefore what the §15.9 workaround actually costs. Whether RunPod warns about P2P limitations at
rental time and in what words (§15.9) — user-reported, and not found in RunPod's published docs.

---

## Sources

- [NVIDIA AI Enterprise — Peer-to-Peer (P2P) CUDA transfers (not supported under vGPU)](https://docs.nvidia.com/ai-enterprise/release-8/latest/infra-software/vgpu/features/p2p.html)
- [Multi-GPU NVIDIA P2P capabilities and debugging tips — ACS/IOMMU forcing transfers through the root complex](https://morgangiraud.medium.com/multi-gpu-nvidia-p2p-capabilities-and-debugging-tips-fb7597b4e2b5)
- [kata-containers #12289 — "PCI peer-to-peer transactions on BARs are not supported" in containerized GPU setups](https://github.com/kata-containers/kata-containers/issues/12289)
- [vLLM forums — what "there is no P2P support" means in practice](https://discuss.vllm.ai/t/what-means-there-is-no-p2p-support/1928)
- [Runpod — vLLM OpenAI compatibility (Serverless base URL, model name, /models, streaming)](https://docs.runpod.io/serverless/vllm/openai-compatibility)
- [Runpod — deploy vLLM on Serverless](https://docs.runpod.io/serverless/vllm/get-started)
- [vLLM docs — RunPod deployment](https://docs.vllm.ai/en/latest/deployment/frameworks/runpod/)
- [Runpod — connecting Cursor to LLM pods (`<pod-id>-<port>.proxy.runpod.net`, `--host 0.0.0.0`)](https://www.runpod.io/blog/connect-cursor-to-llm-pods-runpod)
- [Featherless — serverless hosting, plans and catalogue](https://featherless.ai/)
- [Featherless — API examples (`https://api.featherless.ai/v1`)](https://featherless.ai/docs/api-examples-and-snippets)
- [Featherless — TheDrummer/Rocinante-12B-v1.1](https://featherless.ai/models/TheDrummer/Rocinante-12B-v1.1)
- [Featherless — largest LLM inference provider on Hugging Face](https://featherless.ai/blog/featherless-becomes-hugging-faces-largest-llm-inference-provider-with-6-700-models)
- [Arli AI — unrestricted inference, flat-rate plans](https://www.arliai.com/quick-start)
- [NanoGPT API introduction (`https://nano-gpt.com/api/v1`)](https://docs.nano-gpt.com/introduction)
- [NanoGPT pricing — list price, no markup](https://nano-gpt.com/pricing)
- [Gemini API — OpenAI compatibility layer](https://ai.google.dev/gemini-api/docs/openai)
- [RunPod GPU pricing (48 GB class rates)](https://gpuperhour.com/providers/runpod)
- [KoboldCpp on Runpod — official template, `KCPP_MODEL`](https://koboldai.com/Guides/KoboldCpp_runpod/)
- [Runpod — run GGUF quantized models with KoboldCpp](https://www.runpod.io/blog/gguf-quantized-models-koboldcpp-runpod)
- [vLLM — GGUF quantization (out-of-tree plugin, experimental)](https://docs.vllm.ai/en/stable/features/quantization/gguf/)
- [vLLM — distributed serving / `--tensor-parallel-size`](https://docs.vllm.ai/en/latest/serving/distributed_serving.html)
- [NVIDIA A40 — product page (48 GB GDDR6, memory bandwidth spec)](https://www.nvidia.com/en-us/data-center/a40/)
- [vLLM — parallelism and scaling (`--tensor-parallel-size` on one node)](https://docs.vllm.ai/en/latest/serving/parallelism_scaling/)
- [vLLM — OpenAI-compatible server (`--api-key` covers only /v1, /v2, /inference; /invocations is not protected)](https://docs.vllm.ai/en/latest/serving/online_serving/openai_compatible_server/)
- [vLLM — `vllm serve` CLI reference (flag defaults)](https://docs.vllm.ai/en/latest/cli/serve/)
- [vLLM — automatic prefix caching](https://docs.vllm.ai/en/latest/features/automatic_prefix_caching/)
- [vLLM — RunPod deployment](https://docs.vllm.ai/en/latest/deployment/frameworks/runpod/)
- [Runpod — expose ports (HTTP proxy format, TCP mapping, 100 s Cloudflare limit)](https://docs.runpod.io/pods/configuration/expose-ports)
- [Runpod — when to use (or not use) the proxy](https://www.runpod.io/blog/runpod-proxy-guide)
- [Runpod — deploy vLLM with Docker (`vllm/vllm-openai`, `--host 0.0.0.0`)](https://www.runpod.io/articles/guides/deploy-vllm-runpod-docker)
- [turboderp-org/exllamav3 — EXL3, tensor-parallel inference](https://github.com/turboderp-org/exllamav3)
- [TabbyAPI — `config_sample.yml` (verbatim keys and defaults)](https://github.com/theroyallab/tabbyAPI/blob/main/config_sample.yml)
- [TabbyAPI wiki — server options](https://github.com/theroyallab/tabbyAPI/wiki/02.-Server-options)
- [Serving ExLlamaV3 with TabbyAPI — accuracy notes](https://kaitchup.substack.com/p/serving-exllamav3-with-tabbyapi-accuracy)
- [AutoAWQ — archived May 2025, unmaintained](https://github.com/casper-hansen/AutoAWQ)
- [llm-compressor — AWQ quantization (the maintained path)](https://docs.vllm.ai/projects/llm-compressor/en/latest/examples/awq/)
- [vLLM — attention heads must divide by TP size (issue #2652)](https://github.com/vllm-project/vllm/issues/2652)
- [vLLM — tensor parallelism with non-divisible head counts (issue #5003)](https://github.com/vllm-project/vllm/issues/5003)
- [SicariusSicariiStuff/Assistant_Pepe_70B](https://huggingface.co/SicariusSicariiStuff/Assistant_Pepe_70B)
- [SicariusSicariiStuff/Assistant_Pepe_70B_GPTQ_AR_4-bit-128](https://huggingface.co/SicariusSicariiStuff/Assistant_Pepe_70B_GPTQ_AR_4-bit-128)
- [mradermacher/Assistant_Pepe_70B-i1-GGUF](https://huggingface.co/mradermacher/Assistant_Pepe_70B-i1-GGUF)
- [ArtusDev/TheDrummer_Behemoth-ReduX-123B-v1.1-EXL3 (bpw on branches)](https://huggingface.co/ArtusDev/TheDrummer_Behemoth-ReduX-123B-v1.1-EXL3)
- [TheDrummer/Behemoth-ReduX-123B-v1.1](https://huggingface.co/TheDrummer/Behemoth-ReduX-123B-v1.1)
- [LostRuins/koboldcpp — flags incl. `--password`](https://github.com/LostRuins/koboldcpp)
- [KoboldCpp wiki (launching without a model; Lite connecting to external services)](https://github.com/LostRuins/koboldcpp/wiki)
- [Common KoboldCpp errors — API unavailable until a model is loaded](https://koboldcpp.com/common-koboldcpp-errors-and-how-to-fix-them/)
- [KoboldAI Lite (browser-side OpenRouter support)](https://lite.koboldai.net/)
- [KoboldCpp API documentation](https://lite.koboldai.net/koboldcpp_api)
- [LostRuins/koboldcpp — disabling/proxying routes discussion](https://github.com/LostRuins/koboldcpp/discussions/1966)
- [OpenRouter — Kimi K2.5 model page](https://openrouter.ai/moonshotai/kimi-k2.5)
- [OpenRouter — moonshotai author page (all Kimi slugs)](https://openrouter.ai/moonshotai)
- [OpenRouter — Nitro and Floor price shortcuts](https://openrouter.ai/blog/announcements/introducing-nitro-and-floor-price-shortcuts/)
- [OpenRouter — Exacto variant](https://openrouter.ai/docs/guides/routing/model-variants/exacto)
