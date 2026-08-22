// Description-check probe — feeds the shipped continuity-editor prompt (src/lib/descriptionCheck.ts,
// compiled in-memory so the probe always tests the shipped text) pairs of descriptions whose disagreement is
// known in advance, and scores what comes back through the shipped parser rather than a copy of it. What the
// probe reports is therefore what the dialog would have shown an author.
//
// The check writes nothing, so the failure modes are not "did it damage the text". They are:
//
//   detection — four classes, one per bullet of the prompt plus the null case:
//     clean          the two agree. Want NONE. Every finding here is a false positive, and this is the arm
//                    that matters most: a model asked to find disagreements will invent one to be useful,
//                    and an author shown three imaginary problems stops opening the dialog at all.
//     contradiction  one fact stated on both sides, differently. Want a finding naming it.
//     omission       the player-facing text asserts something the note never accounts for.
//     roundtrip      the note has been overwritten from the blurb and holds nothing private any more. This
//                    is the finding the whole feature exists for — the one an author cannot get by
//                    re-reading either text — so it is scored on its own rather than folded into the rest.
//
//   format — `parseFindings` is lenient by design, which hides the difference between "NONE" and "The two
//     descriptions are consistent." The second is a bogus finding sitting in the dialog under a heading that
//     says something is wrong, and it is a *parser* problem, not a model one, so agreement-worded false
//     positives are counted separately from invented disagreements. Rewrites are counted too: the prompt
//     forbids them, and a rewrite is the silent-overwrite failure this pass exists to avoid.
//
//   budget — completion tokens against DEFAULT_CHECK_MAX_TOKENS. A reasoning model on a 300-token cap can
//     spend the entire budget thinking and return an empty string, which `checkDescriptions` reads as
//     agreement; that signature is detected and named rather than scored as a clean pass.
//
// Usage:  node desccheck-probe.mjs [--endpoint URL] [--model a,b] [--runs 8] [--only chapel]
//                                  [--class clean] [--seed 7] [--token TOK] [--reasoning none|off|low]
//                                  [--promptfile A.ts] [--dump out.jsonl]
//
//   OpenRouter:  --endpoint https://openrouter.ai/api/v1/chat/completions --token "$OPENROUTER_KEY"
//                --model deepseek/deepseek-chat,mistralai/mistral-nemo
//
//   Several --model values run as arms over the same fixtures and print one comparison table, which is the
//   point of the probe: a frontier arm says whether the prompt is *right*, and only a small-model arm says
//   whether it *survives* the model this app is usually pointed at. A frontier pass alone proves nothing
//   about the 12B, because the format contract is the part a large model satisfies without trying.
//
//   --reasoning off omits the field entirely, for providers that reject it.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";

const HARNESS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HARNESS_DIR, "../../..");
const args = process.argv.slice(2);
const argVal = (f, d = null) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const endpoint = argVal("--endpoint", "https://api.lyonade.net/v1/chat/completions");
const models = argVal("--model", "default").split(",").map((m) => m.trim()).filter(Boolean);
const runs = Number(argVal("--runs", "8"));
const only = argVal("--only");
const onlyClass = argVal("--class");
const baseSeed = Number(argVal("--seed", "7"));
const token = argVal("--token", process.env.PROBE_TOKEN || "");
const reasoning = argVal("--reasoning", "none");
const dumpPath = argVal("--dump");
const dump = [];

// The prompt, the message shape and the parser all come from the shipped module, so an edit to
// descriptionCheck.ts is picked up with no probe change and the score is of the real thing.
// descriptionCheck.ts imports from bridgeDescription, which a data: URL cannot resolve on its own — the
// sibling is compiled first and the specifier rewritten to point at it. That also lets --promptfile live
// anywhere (`git show HEAD:src/lib/descriptionCheck.ts > /tmp/A.ts`) so a prompt edit can be A/B'd against
// the current metric instead of against stale numbers.
const promptFile = argVal("--promptfile", path.join(REPO_ROOT, "src/lib/descriptionCheck.ts"));
const compile = async (f) => (await transform(await readFile(f, "utf8"), { loader: "ts", format: "esm" })).code;
const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const bridgeUrl = dataUrl(await compile(path.join(REPO_ROOT, "src/lib/bridgeDescription.ts")));
const tsSource = await readFile(promptFile, "utf8");
const checkCode = (await transform(tsSource, { loader: "ts", format: "esm" })).code
  .replace(/(["'])\.\/bridgeDescription\1/g, JSON.stringify(bridgeUrl));
const {
  DEFAULT_DESC_CHECK_PROMPT, DEFAULT_CHECK_MAX_TOKENS, composeCheckPrompt, buildCheckMessage, parseFindings,
} = await import(dataUrl(checkCode));

// Mirrors what the module keeps private. A drift in either would silently change what is being measured:
// the temperature is the sampler the app actually uses, and SAID_NONE is how the probe tells a clean "NONE"
// apart from prose that happens to parse to nothing.
const TEMPERATURE = 0.2;
const temp = tsSource.match(/CHECK_TEMPERATURE\s*=\s*([\d.]+)/);
if (!temp || Number(temp[1]) !== TEMPERATURE) {
  throw new Error(`CHECK_TEMPERATURE drifted (${temp?.[1]}) — update desccheck-probe.mjs`);
}
if (!/NONE_ANSWER\s*=\s*\/\^none\[\.!\]\?\$\/i/.test(tsSource)) {
  throw new Error("NONE_ANSWER drifted — update SAID_NONE in desccheck-probe.mjs");
}
const SAID_NONE = /^none[.!]?$/i;

// The roundtrip finding, in the ways a model phrases it: the note adds nothing, or holds nothing private.
// Broad on purpose — the class is scored on whether the *theme* was reached, and every matched finding is
// printed with its evidence below, so a suspicious rate can be read rather than trusted.
const ROUNDTRIP_WANT =
  /\b(no|not|noth\w*|little|fails?|lacks?|lacking|absent|missing|omits?|without)\b[\s\S]{0,70}\b(more|beyond|extra|additional|further|private|secret|hidden|unseen|motive|interior|depth|deeper|new)\b|\b(same|identical|mirror\w*|echo\w*|duplicat\w*|paraphras\w*|restat\w*|repeats?|adds? nothing|no new|near-?identical|little more than)\b/i;

// The cast is the bridge probe's, deliberately: the same four subjects run through both probes, so a result
// here can be read next to how the drafting prompts behaved on the same text. `player` and `ai` are the
// bridge probe's `blurb` and `aiNote` unchanged, and they are genuinely consistent — every fact the blurb
// asserts is in the note, and the note holds secrets besides. That is what makes them usable as the clean
// arm; the other three arms are one edit away from them each.
const CASES = [
  {
    name: "harbormaster",
    kind: "character",
    player:
      "The harbormaster is a gray-bearded man in a tarred oilskin coat who limps between the barges, tally "
      + "ledger always under one arm, and has no patience for strangers.",
    ai:
      "Ordec runs the harbor office at the river mouth. Gray-bearded, heavy through the shoulders, and he walks "
      + "with a pronounced limp from a winch accident on the dock years ago. He wears the same tarred oilskin coat "
      + "in every weather and is never without the tally ledger he keeps every barge's cargo in. He is curt with "
      + "strangers and slow to warm. Privately, he takes bribes from the night barges to leave their cargo out of "
      + "that ledger. His younger brother drowned at this same landing and he has never forgiven himself for it. "
      + "He intends to sell the office and flee downriver before the winter ice closes the channel.",
    contradiction: {
      player:
        "The harbormaster is a gray-bearded man in a tarred oilskin coat who strides briskly between the barges, "
        + "tally ledger always under one arm, and has no patience for strangers.",
      want: /\b(limp\w*|stride\w*|brisk\w*|quick\w*|walk\w*|gait|lame|leg|winch|accident|injur\w*|mobil\w*|mov\w*)\b/i,
    },
    omission: {
      player:
        "The harbormaster is a gray-bearded man in a tarred oilskin coat who limps between the barges with a "
        + "one-eyed dog at his heel, tally ledger always under one arm, and has no patience for strangers.",
      want: /\b(dog|hound|animal|creature|pet|companion|one-?eyed)\b/i,
    },
    // Laundered: every visible fact kept, every private one gone. This is what the note looks like after a
    // player-facing draft has been generated back over it.
    roundtrip:
      "Ordec is the harbormaster at the river mouth. He is a gray-bearded man, heavy through the shoulders, who "
      + "limps between the barges in a tarred oilskin coat with his tally ledger under one arm. He is curt with "
      + "strangers and has little patience for anyone who is not there on business.",
  },
  {
    name: "healer",
    kind: "character",
    player:
      "A small, slow-spoken woman with herb-stained fingers who tends a bitterroot garden behind her cottage "
      + "and has endless patience with frightened children.",
    ai:
      "Mother Ain is a small, spare woman whose fingers are permanently stained brown from the herbs she works. "
      + "She speaks slowly, leaving long gaps between sentences, and keeps a walled garden of bitterroot behind her "
      + "cottage. She has endless patience with frightened children. What nobody in the village knows: she poisoned "
      + "the old magistrate two winters ago and watched him die. She has never learned to read, and hides it by "
      + "having others read aloud to her. She is herself dying of the same wasting sickness she treats in others.",
    contradiction: {
      player:
        "A small, quick, chattering woman with herb-stained fingers who talks over anyone who pauses, tends a "
        + "bitterroot garden behind her cottage and has endless patience with frightened children.",
      want: /\b(slow\w*|quick\w*|chatter\w*|talk\w*|speak\w*|speech|spoken|pace|pause\w*|gap\w*|unhurried|deliberate|measured|manner)\b/i,
    },
    omission: {
      player:
        "A small, slow-spoken woman with herb-stained fingers who cups a brass ear-trumpet when she is spoken "
        + "to, tends a bitterroot garden behind her cottage and has endless patience with frightened children.",
      want: /\b(ear-?trumpet|trumpet|brass|deaf\w*|hear\w*|hard of hearing)\b/i,
    },
    roundtrip:
      "Mother Ain is the village healer. She is a small, spare woman with herb-stained fingers who speaks slowly, "
      + "leaving long gaps between her sentences, and keeps a bitterroot garden behind her cottage. She has endless "
      + "patience with frightened children and they are not afraid of her.",
  },
  {
    name: "chapel",
    kind: "location",
    player:
      "A stone chapel half-sunk in the marsh east of the village, cold inside and flooded to the knee, where "
      + "herons nest in the open roof beams.",
    ai:
      "The drowned chapel stands half-sunk in the marsh a mile east of the village, its stone walls tilting where "
      + "the ground gave way. Inside, standing water reaches the knee and never drains; the air is cold and smells "
      + "of silt. Herons nest in the exposed roof beams and scatter noisily when anyone enters. Below the flooded "
      + "floor is a sealed crypt holding the village's plague dead, which is why the ground was abandoned. The "
      + "bronze bell was stolen and sold downriver a generation ago. Smugglers now use the nave to meet after dark.",
    contradiction: {
      player:
        "A stone chapel half-sunk in the marsh east of the village, cold inside but dry underfoot, where herons "
        + "nest in the open roof beams.",
      want: /\b(water|flood\w*|dry|wet|damp|knee|drain\w*|underfoot|wade|wading|submerg\w*|floor)\b/i,
    },
    omission: {
      player:
        "A stone chapel half-sunk in the marsh east of the village, cold inside and flooded to the knee, where "
        + "herons nest in the open roof beams and a line of planks laid end to end crosses the nave to walk on.",
      want: /\b(plank\w*|board\w*|walkway|footbridge|bridge|cross\w*|laid)\b/i,
    },
    roundtrip:
      "The drowned chapel is a stone building half-sunk in the marsh a mile east of the village, its walls tilting "
      + "where the ground gave way. Standing water reaches the knee inside and the air is cold and smells of silt. "
      + "Herons nest in the exposed roof beams and scatter when anyone comes in.",
  },
  {
    name: "nightmarket",
    kind: "location",
    player:
      "Six lantern-strung alleys behind the customs house, packed shoulder to shoulder from dusk to first light, "
      + "selling dried fish and hammered copperware under a haze of frying oil.",
    ai:
      "The night market fills six lantern-strung alleys behind the customs house and runs from dusk until the first "
      + "gray light, when the stalls fold away entirely. It is loud and packed shoulder to shoulder. The stalls sell "
      + "dried fish, hammered copperware and cheap sweet wine, and the whole quarter smells of frying oil. The guard "
      + "captain takes a cut from every stallholder to let the market stand at all. Behind the furthest stall a "
      + "slaver keeps a covered cage, which the crowd is careful not to look at. The whole quarter burns next spring.",
    contradiction: {
      player:
        "Six lantern-strung alleys behind the customs house, packed shoulder to shoulder from first light until "
        + "noon, selling dried fish and hammered copperware under a haze of frying oil.",
      want: /\b(dusk|night\w*|dark|dawn|noon|morning|first light|hour\w*|time|open\w*|clos\w*|when|run\w*)\b/i,
    },
    omission: {
      player:
        "Six lantern-strung alleys behind the customs house with a stone fountain where all six meet, packed "
        + "shoulder to shoulder from dusk to first light, selling dried fish and hammered copperware under a haze "
        + "of frying oil.",
      want: /\b(fountain|basin|well|spring|waterworks)\b/i,
    },
    roundtrip:
      "The night market fills six lantern-strung alleys behind the customs house and runs from dusk until the first "
      + "gray light. It is loud and packed shoulder to shoulder. The stalls sell dried fish, hammered copperware and "
      + "cheap sweet wine, and the whole quarter smells of frying oil.",
  },
];

const CLASSES = ["clean", "contradiction", "omission", "roundtrip"];
const ARMS = [];
for (const c of CASES) {
  if (only && !c.name.includes(only)) continue;
  const base = { case: c.name, kind: c.kind };
  ARMS.push({ ...base, cls: "clean", player: c.player, ai: c.ai, want: null });
  ARMS.push({ ...base, cls: "contradiction", player: c.contradiction.player, ai: c.ai, want: c.contradiction.want });
  ARMS.push({ ...base, cls: "omission", player: c.omission.player, ai: c.ai, want: c.omission.want });
  ARMS.push({ ...base, cls: "roundtrip", player: c.player, ai: c.roundtrip, want: ROUNDTRIP_WANT });
}
const arms = ARMS.filter((a) => !onlyClass || a.cls === onlyClass);
const activeClasses = CLASSES.filter((k) => arms.some((a) => a.cls === k));

// Format violations. A preamble and a rewrite are both the prompt being disobeyed; the agreement wording is
// the parser being fooled, which is a different bug with a different fix, so it is kept apart.
const PREAMBLE = /^\s*(here (is|are)|here'?s|sure[,!.]|certainly|okay[,!.]|below (is|are)|i(?:'ve| have) (found|reviewed|compared)|after (reviewing|comparing)|upon review)/i;
const REWRITE = /^\s*(?:\*\*)?(?:revis\w*|rewritten|rewrite|corrected|proposed|updated|suggested)\s*(?:version|text|description|wording)?\s*(?:\*\*)?\s*:/im;
const AGREEMENT = /\b(agree\w*|consistent|no (?:disagreement|contradiction|discrepanc\w*|conflict|issue|inconsistenc\w*)\w*|nothing to (?:report|flag)|none (?:found|identified)|no findings|align\w*)\b/i;
const words = (s) => (s.trim().match(/\S+/g) || []).length;

async function call(model, sys, user, seed) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const body = {
    model,
    messages: [{ role: "system", content: sys }, { role: "user", content: user }],
    temperature: TEMPERATURE, max_tokens: DEFAULT_CHECK_MAX_TOKENS, seed, stream: false,
  };
  if (reasoning !== "off") body.reasoning_effort = reasoning;
  const res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const j = await res.json();
  return {
    raw: (j.choices?.[0]?.message?.content ?? "").trim(),
    finish: j.choices?.[0]?.finish_reason ?? "",
    tokens: j.usage?.completion_tokens ?? null,
  };
}

const blank = () => ({
  runs: 0, errors: 0, preamble: 0, rewrote: 0, blob: 0, truncated: 0, emptyTrunc: 0,
  tokSum: 0, tokMax: 0, tokRuns: 0,
  byClass: Object.fromEntries(CLASSES.map((k) => [k, { runs: 0, hits: 0, findSum: 0, agreeWorded: 0, saidNone: 0 }])),
});

console.log(`Description-check probe · ${endpoint} · ${models.length} model(s) · ${arms.length} arm(s) · `
  + `${runs} run(s)/arm · temp ${TEMPERATURE} · cap ${DEFAULT_CHECK_MAX_TOKENS} · reasoning ${reasoning}`);
console.log(`clean: want NONE (findings are false positives) · the other three: want the planted finding\n`);

const totals = {};
for (const model of models) {
  const T = totals[model] = blank();
  console.log(`\n${"=".repeat(96)}\n== ${model}`);
  await call(model, composeCheckPrompt(DEFAULT_DESC_CHECK_PROMPT, "character"), "warm up", baseSeed).catch(() => {});

  for (const arm of arms) {
    const sys = composeCheckPrompt(DEFAULT_DESC_CHECK_PROMPT, arm.kind);
    const user = buildCheckMessage(arm.player, arm.ai);
    console.log(`\n######## ${arm.case} · ${arm.cls} (${arm.kind})`);
    for (let r = 0; r < runs; r++) {
      let out, err = null;
      try { out = await call(model, sys, user, baseSeed + r); } catch (e) { err = String(e.message || e); }
      T.runs++;
      const C = T.byClass[arm.cls];
      if (err) { T.errors++; console.log(`  #${r + 1} ERROR: ${err}`); continue; }

      // Nothing came back and the budget is gone: the model reasoned through the entire cap. `checkDescriptions`
      // would read that empty completion as agreement, so the run is voided rather than scored — a null result
      // must not be able to pass as a clean one, which is the single class where saying nothing is correct.
      if (out.finish === "length" && !out.raw) {
        T.truncated++;
        T.emptyTrunc++;
        console.log(`  #${r + 1} VOID · empty after truncation (${out.tokens ?? "?"} tok)`
          + " — the app would read this as agreement");
        dump.push({ model, case: arm.case, cls: arm.cls, kind: arm.kind, run: r + 1, seed: baseSeed + r,
          findings: [], hit: null, finish: out.finish, tokens: out.tokens, raw: "" });
        continue;
      }
      C.runs++;

      const findings = parseFindings(out.raw);
      C.findSum += findings.length;
      // A clean pair is a hit only when nothing was reported; the planted classes need a finding that names
      // the plant, so a model that reports two unrelated things does not score.
      const hit = arm.want ? findings.some((f) => arm.want.test(f)) : findings.length === 0;
      if (hit) C.hits++;

      const flags = [];
      if (SAID_NONE.test(out.raw)) C.saidNone++;
      if (PREAMBLE.test(out.raw)) { T.preamble++; flags.push("preamble"); }
      if (REWRITE.test(out.raw)) { T.rewrote++; flags.push("REWRITE"); }
      if (findings.length === 1 && words(findings[0]) > 60) { T.blob++; flags.push("blob"); }
      if (out.finish === "length") { T.truncated++; flags.push("truncated"); }
      if (out.tokens != null) { T.tokSum += out.tokens; T.tokRuns++; T.tokMax = Math.max(T.tokMax, out.tokens); }
      const agreeWorded = findings.filter((f) => AGREEMENT.test(f));
      if (arm.cls === "clean" && agreeWorded.length) { C.agreeWorded++; flags.push("agreement-worded"); }

      const tok = out.tokens != null ? ` · ${out.tokens} tok` : "";
      console.log(`  #${r + 1} ${findings.length} finding(s) · ${hit ? "HIT" : "miss"}${tok}`
        + `${flags.length ? " · " + flags.join(",") : ""}`);
      for (const f of findings) console.log(`      • ${f.replace(/\s+/g, " ").slice(0, 200)}`);
      // A regex hit can be an artifact of a broad alternation, so show what matched — the rates are only
      // trustworthy once a few of these have been read.
      if (arm.want) {
        for (const f of findings.filter((x) => arm.want.test(x))) {
          const flat = f.replace(/\s+/g, " ");
          const m = flat.match(arm.want);
          const at = Math.max(0, m.index - 40);
          console.log(`      ↳ matched: …${flat.slice(at, m.index + m[0].length + 40)}…`);
        }
      }
      dump.push({
        model, case: arm.case, cls: arm.cls, kind: arm.kind, run: r + 1, seed: baseSeed + r,
        findings, hit, finish: out.finish, tokens: out.tokens, raw: out.raw,
      });
    }
  }
}

const pct = (n, d) => `${(100 * n / (d || 1)).toFixed(0)}%`;
console.log(`\n${"=".repeat(96)}`);
for (const model of models) {
  const T = totals[model];
  const clean = T.byClass.clean;
  console.log(`\n${model} · ${T.runs} runs (${T.errors} err)`);
  for (const k of activeClasses) {
    const C = T.byClass[k];
    const avg = (C.findSum / (C.runs || 1)).toFixed(1);
    if (k === "clean") {
      const fp = C.runs - C.hits;
      console.log(`  ${"clean".padEnd(15)}false positives ${fp}/${C.runs} (${pct(fp, C.runs)})`
        + ` · agreement-worded ${C.agreeWorded} · said NONE ${C.saidNone}/${C.runs} · ${avg} findings avg`);
    } else {
      console.log(`  ${k.padEnd(15)}found ${C.hits}/${C.runs} (${pct(C.hits, C.runs)}) · ${avg} findings avg`);
    }
  }
  const tokAvg = T.tokRuns ? (T.tokSum / T.tokRuns).toFixed(0) : "n/a";
  console.log(`  ${"format".padEnd(15)}rewrites ${T.rewrote} · preamble ${T.preamble} · single-blob ${T.blob}`);
  console.log(`  ${"budget".padEnd(15)}${tokAvg} tok avg, ${T.tokMax || "?"} max of ${DEFAULT_CHECK_MAX_TOKENS}`
    + ` · truncated ${T.truncated}${T.emptyTrunc ? ` · ${T.emptyTrunc} VOIDED, empty after truncation` : ""}`);
  if (T.emptyTrunc) {
    console.log("  note           voided runs returned nothing with the budget spent — raise the cap or drop"
      + " --reasoning; the app reads an empty completion as agreement, so these would have passed silently.");
  }
  if (clean.agreeWorded) {
    console.log("  note           agreement-worded false positives are a parser gap, not a model failure:"
      + " the model said the two agree in prose and parseFindings kept the sentence.");
  }
}

if (models.length > 1) {
  console.log(`\n${"=".repeat(96)}\nArms, same fixtures and seeds:\n`);
  const head = ["model".padEnd(34), ...activeClasses.map((k) => k.slice(0, 7).padStart(8)), "rewrite".padStart(8), "trunc".padStart(6)];
  console.log(head.join(" "));
  for (const model of models) {
    const T = totals[model];
    const cells = activeClasses.map((k) => {
      const C = T.byClass[k];
      // The clean column is the one to read upside down: it is the share of runs that stayed silent.
      return pct(C.hits, C.runs).padStart(8);
    });
    console.log([model.slice(0, 34).padEnd(34), ...cells, String(T.rewrote).padStart(8), String(T.truncated).padStart(6)].join(" "));
  }
  console.log("\n(clean = share of runs that correctly reported nothing; the rest = share that found the plant)");
}

if (dumpPath) {
  await writeFile(dumpPath, dump.map((d) => JSON.stringify(d)).join("\n") + "\n");
  console.log(`\nFull outputs -> ${dumpPath} (${dump.length} rows) — re-score without re-running.`);
}
