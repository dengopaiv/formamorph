// Brief-check probe — reads an author's brief against the AI-facing description the narrator is actually
// handed, which §12 of `snowpanther's notes/description-consistency-design.md` argues is the pair the 🔍
// check should have been reading all along.
//
// Why this is a second probe and not a flag on `desccheck-probe.mjs`: that probe measures the *shipped*
// prompt, compiled in memory with drift guards, and its message is labelled "Player-Facing Description" /
// "AI-Facing Description" because that is what the app sends. Nothing is shipped for this pair. Bolting a
// mode onto it would make the shipped measurement conditional on a flag, which is how a baseline quietly
// stops meaning what its table says. The two share what should be shared — `parseFindings` comes from the
// shipped module here too, so what this scores is what the dialog would show — and nothing else.
//
// The arms, and the last one is the reason the probe exists:
//
//   clean          the note accounts for the whole brief. Want NONE. Same arm as everywhere else, and the
//                  same blocker: a model with nothing to report invents something to be useful.
//   contradiction  one brief line changed so the note states the opposite. Want a finding naming it.
//   omission       one line added to the brief that the note never accounts for. Want it named.
//   laundered      the brief unchanged, the note replaced with the same subject's player-facing blurb
//                  written out as a note — every visible fact kept, every secret gone.
//
// `laundered` is the case the shipped check **cannot** reach. Player-facing against note, the two texts are
// the same text: identical prose never disagrees, so no prompt rewrite gets there, which is exactly the
// 1-in-96 measured across four wordings in §11. It is also, per the author, the commonest way a world is
// filled in — write the blurb, paste it into the AI field, stop. Against the brief it should be the easiest
// finding on the board, because three authored facts are simply missing. That is the hypothesis; this probe
// is here to find out, not to confirm it.
//
// Scored on secrets named rather than on a single regex: a run that names one of the three missing secrets
// is a hit, and the recall across all three is printed beside it, because "found something" and "found the
// world" are different results and the second is what an author needs.
//
// Usage:  node briefcheck-probe.mjs [--endpoint URL] [--model a,b] [--runs 6] [--only chapel]
//                                   [--class laundered] [--seed 7] [--token TOK] [--reasoning none|off]
//                                   [--prompt file.txt] [--dump out.jsonl] [--rescore in.jsonl]
//
//   --prompt takes a plain text file holding one template, `<SUBJECT>` and all. Nothing is shipped for this
//   pair yet, so there is no module to A/B against and no drift guard to keep — the wording under test is
//   either the default below or the file, and the dump records which.

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
const runs = Number(argVal("--runs", "6"));
const only = argVal("--only");
const onlyClass = argVal("--class");
const baseSeed = Number(argVal("--seed", "7"));
const token = argVal("--token", process.env.PROBE_TOKEN || "");
const reasoning = argVal("--reasoning", "none");
const promptPath = argVal("--prompt");
const dumpPath = argVal("--dump");
const rescorePath = argVal("--rescore");
const dump = [];

// The parser is the shipped one, so a lenient parse that turns prose into a finding is measured here the way
// the author would meet it. `descriptionCheck.ts` imports a sibling a data: URL cannot resolve, so the
// sibling is compiled first and the specifier rewritten — same trick as `desccheck-probe.mjs`.
const compile = async (f) => (await transform(await readFile(f, "utf8"), { loader: "ts", format: "esm" })).code;
const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const bridgeUrl = dataUrl(await compile(path.join(REPO_ROOT, "src/lib/bridgeDescription.ts")));
const checkSource = await readFile(path.join(REPO_ROOT, "src/lib/descriptionCheck.ts"), "utf8");
const checkCode = (await transform(checkSource, { loader: "ts", format: "esm" })).code
  .replace(/(["'])\.\/bridgeDescription\1/g, JSON.stringify(bridgeUrl));
const { parseFindings, composeCheckPrompt, DEFAULT_CHECK_MAX_TOKENS } = await import(dataUrl(checkCode));

const TEMPERATURE = 0.2;
const temp = checkSource.match(/CHECK_TEMPERATURE\s*=\s*([\d.]+)/);
if (!temp || Number(temp[1]) !== TEMPERATURE) {
  throw new Error(`CHECK_TEMPERATURE drifted (${temp?.[1]}) — update briefcheck-probe.mjs`);
}
const SAID_NONE = /^none[.!]?$/i;

/**
 * The wording under test. Not shipped anywhere — §12 is an open question, and putting a default in the app
 * before it is measured is how the last four prompt rewrites happened.
 *
 * It differs from the shipped check in the one way that matters: this comparison is **one-directional**. The
 * brief is authored truth and the note must account for all of it; the note holding more is the drafting
 * prompt working, not a finding. That asymmetry is stated rather than implied, because §11 measured what
 * happens when a model has to infer which side is allowed to hold more — it narrates the difference as a
 * finding and the parser keeps the sentence.
 *
 * SECRET: lines are named explicitly. Both texts are private, so a secret belongs in both, and a check that
 * did not say so would flag every secret the note correctly holds.
 */
const DEFAULT_BRIEF_CHECK_PROMPT =
  "You are the game's continuity editor for <SUBJECT>.\n\n"
  + "The author's brief is the authored truth. Every line of it is a fact, including any line beginning "
  + "SECRET: — those are private, and the AI-facing description is private too, so it must hold them as "
  + "well.\n\n"
  + "The AI-facing description is the reference the narrator reads. It must account for every fact in the "
  + "brief. It may hold further detail besides, and that is never a finding.\n\n"
  + "Report only real failures:\n"
  + "- A fact the brief states that the AI-facing description contradicts.\n"
  + "- A fact the brief states that the AI-facing description never accounts for. Name that fact.\n\n"
  + "Write one finding per line. Do not rewrite either text, do not suggest wording, and do not remark on "
  + "style. If the AI-facing description accounts for the whole brief, reply with the single word NONE.";

const template = promptPath ? await readFile(promptPath, "utf8") : DEFAULT_BRIEF_CHECK_PROMPT;

/** Both texts under headings, labelled with the field names the author sees in the editor. */
const buildBriefMessage = (brief, note) =>
  `Author's Brief:\n${brief.trim()}\n\nAI-Facing Description:\n${note.trim()}`;

// The cast is `bridge-probe.mjs`'s, verbatim: same four subjects, same briefs, same notes. The laundered
// notes are `desccheck-probe.mjs`'s roundtrip fixtures, also verbatim. Copied rather than imported because
// both of those files are scripts that run on import — and copied text drifts, so every string is checked
// against its source below before a single model is called.
const CASES = [
  {
    name: "harbormaster",
    kind: "character",
    brief:
      "- runs the harbor office at the river mouth\n"
      + "- gray-bearded, heavy through the shoulders\n"
      + "- pronounced limp, winch accident on the dock years ago\n"
      + "- same tarred oilskin coat in every weather\n"
      + "- never without his tally ledger\n"
      + "- curt with strangers, slow to warm\n"
      + "- SECRET: takes bribes from the night barges to keep their cargo out of the ledger\n"
      + "- SECRET: his younger brother drowned at this landing; he has never forgiven himself\n"
      + "- SECRET: means to sell the office and flee downriver before the ice closes",
    note:
      "Ordec runs the harbor office at the river mouth. Gray-bearded, heavy through the shoulders, and he walks "
      + "with a pronounced limp from a winch accident on the dock years ago. He wears the same tarred oilskin coat "
      + "in every weather and is never without the tally ledger he keeps every barge's cargo in. He is curt with "
      + "strangers and slow to warm. Privately, he takes bribes from the night barges to leave their cargo out of "
      + "that ledger. His younger brother drowned at this same landing and he has never forgiven himself for it. "
      + "He intends to sell the office and flee downriver before the winter ice closes the channel.",
    laundered:
      "Ordec is the harbormaster at the river mouth. He is a gray-bearded man, heavy through the shoulders, who "
      + "limps between the barges in a tarred oilskin coat with his tally ledger under one arm. He is curt with "
      + "strangers and has little patience for anyone who is not there on business.",
    contradiction: {
      from: "- pronounced limp, winch accident on the dock years ago",
      to: "- quick and brisk on his feet, never injured, covers the quay at a stride",
      want: /\b(limp\w*|brisk\w*|quick\w*|stride\w*|walk\w*|gait|lame|leg|winch|accident|injur\w*|mobil\w*|mov\w*)\b/i,
    },
    omission: {
      add: "- a one-eyed dog always at his heel",
      want: /\b(dog|hound|animal|creature|pet|companion|one-?eyed)\b/i,
    },
    secrets: [
      { id: "bribes", re: /\b(brib\w*|night barge\w*|off the ledger|out of (?:that |the )?ledger|unrecorded|kickback)/i },
      { id: "brother", re: /\b(brother|drown\w*|forgiv\w*)/i },
      { id: "flight", re: /\b(sell\w* (?:the )?office|flee\w*|fle(?:e|d)|downriver|before the ice|leav\w* (?:before|the harbor))/i },
    ],
  },
  {
    name: "healer",
    kind: "character",
    brief:
      "- small, spare woman\n"
      + "- fingers permanently stained brown from the herbs\n"
      + "- speaks slowly, long gaps between sentences\n"
      + "- walled bitterroot garden behind her cottage\n"
      + "- endless patience with frightened children\n"
      + "- SECRET: poisoned the old magistrate two winters ago and watched him die\n"
      + "- SECRET: never learned to read; hides it by having others read aloud\n"
      + "- SECRET: dying of the same wasting sickness she treats",
    note:
      "Mother Ain is a small, spare woman whose fingers are permanently stained brown from the herbs she works. "
      + "She speaks slowly, leaving long gaps between sentences, and keeps a walled garden of bitterroot behind her "
      + "cottage. She has endless patience with frightened children. What nobody in the village knows: she poisoned "
      + "the old magistrate two winters ago and watched him die. She has never learned to read, and hides it by "
      + "having others read aloud to her. She is herself dying of the same wasting sickness she treats in others.",
    laundered:
      "Mother Ain is the village healer. She is a small, spare woman with herb-stained fingers who speaks slowly, "
      + "leaving long gaps between her sentences, and keeps a bitterroot garden behind her cottage. She has endless "
      + "patience with frightened children and they are not afraid of her.",
    contradiction: {
      from: "- speaks slowly, long gaps between sentences",
      to: "- talks fast and chatters, never leaves a pause",
      want: /\b(slow\w*|quick\w*|chatter\w*|talk\w*|speak\w*|speech|spoken|pace|pause\w*|gap\w*|fast|unhurried|deliberate|measured|manner)\b/i,
    },
    omission: {
      add: "- carries a brass ear-trumpet, hard of hearing",
      want: /\b(ear-?trumpet|trumpet|brass|deaf\w*|hear\w*|hard of hearing)\b/i,
    },
    secrets: [
      { id: "poisoning", re: /\b(poison\w*|magistrate|murder\w*|kill\w*|watched him die)/i },
      { id: "illiterate", re: /\b(read\w*|illiterat\w*|literac\w*|letters)/i },
      { id: "dying", re: /\b(dying|dies|wasting|sickness|illness|ill\b|disease|her own death|terminal)/i },
    ],
  },
  {
    name: "chapel",
    kind: "location",
    brief:
      "- stone chapel, half-sunk in the marsh a mile east of the village\n"
      + "- walls tilting where the ground gave way\n"
      + "- standing water to the knee inside, never drains\n"
      + "- cold air, smells of silt\n"
      + "- herons nest in the exposed roof beams, scatter when anyone enters\n"
      + "- SECRET: sealed crypt below holding the village's plague dead\n"
      + "- SECRET: the bronze bell was stolen and sold downriver a generation ago\n"
      + "- SECRET: smugglers use the nave to meet after dark",
    note:
      "The drowned chapel stands half-sunk in the marsh a mile east of the village, its stone walls tilting where "
      + "the ground gave way. Inside, standing water reaches the knee and never drains; the air is cold and smells "
      + "of silt. Herons nest in the exposed roof beams and scatter noisily when anyone enters. Below the flooded "
      + "floor is a sealed crypt holding the village's plague dead, which is why the ground was abandoned. The "
      + "bronze bell was stolen and sold downriver a generation ago. Smugglers now use the nave to meet after dark.",
    laundered:
      "The drowned chapel is a stone building half-sunk in the marsh a mile east of the village, its walls tilting "
      + "where the ground gave way. Standing water reaches the knee inside and the air is cold and smells of silt. "
      + "Herons nest in the exposed roof beams and scatter when anyone comes in.",
    contradiction: {
      from: "- standing water to the knee inside, never drains",
      to: "- dry underfoot inside, the floor has never flooded",
      want: /\b(water|flood\w*|dry|wet|damp|knee|drain\w*|underfoot|wade|wading|submerg\w*|floor)\b/i,
    },
    omission: {
      add: "- a line of planks laid end to end crosses the nave to walk on",
      want: /\b(plank\w*|board\w*|walkway|footbridge|bridge|cross\w*|laid)\b/i,
    },
    secrets: [
      { id: "crypt", re: /\b(crypt|plague|dead|buri\w*|tomb|ossuar\w*|abandon\w*)/i },
      { id: "bell", re: /\b(bell|bronze|stolen|sold)/i },
      { id: "smugglers", re: /\b(smuggl\w*|after dark|meet\w* in the nave)/i },
    ],
  },
  {
    name: "nightmarket",
    kind: "location",
    brief:
      "- six lantern-strung alleys behind the customs house\n"
      + "- runs dusk until first gray light, then the stalls fold away\n"
      + "- loud, packed shoulder to shoulder\n"
      + "- dried fish, hammered copperware, cheap sweet wine\n"
      + "- the whole quarter smells of frying oil\n"
      + "- SECRET: the guard captain takes a cut from every stallholder\n"
      + "- SECRET: a slaver keeps a covered cage behind the furthest stall\n"
      + "- SECRET: the quarter burns next spring",
    note:
      "The night market fills six lantern-strung alleys behind the customs house and runs from dusk until the first "
      + "gray light, when the stalls fold away entirely. It is loud and packed shoulder to shoulder. The stalls sell "
      + "dried fish, hammered copperware and cheap sweet wine, and the whole quarter smells of frying oil. The guard "
      + "captain takes a cut from every stallholder to let the market stand at all. Behind the furthest stall a "
      + "slaver keeps a covered cage, which the crowd is careful not to look at. The whole quarter burns next spring.",
    laundered:
      "The night market fills six lantern-strung alleys behind the customs house and runs from dusk until the first "
      + "gray light. It is loud and packed shoulder to shoulder. The stalls sell dried fish, hammered copperware and "
      + "cheap sweet wine, and the whole quarter smells of frying oil.",
    contradiction: {
      from: "- runs dusk until first gray light, then the stalls fold away",
      to: "- runs from first light until noon, then the stalls fold away",
      want: /\b(dusk|night\w*|dark|dawn|noon|morning|first light|hour\w*|time|open\w*|clos\w*|when|run\w*)\b/i,
    },
    omission: {
      add: "- a stone fountain where all six alleys meet",
      want: /\b(fountain|basin|well|spring|waterworks)\b/i,
    },
    secrets: [
      { id: "captain", re: /\b(guard captain|captain|takes a cut|cut from|brib\w*|protection)/i },
      { id: "slaver", re: /\b(slav\w*|cage|covered)/i },
      { id: "fire", re: /\b(burn\w*|fire|next spring)/i },
    ],
  },
];

// Copied text drifts. Every brief and note here is checked against the file it was copied from before any
// model is called, so a fixture edited in one probe and not the other fails loudly instead of producing a
// table that cannot be read beside the others.
const bridgeSource = await readFile(path.join(HARNESS_DIR, "bridge-probe.mjs"), "utf8");
const desccheckSource = await readFile(path.join(HARNESS_DIR, "desccheck-probe.mjs"), "utf8");
const flat = (s) => s.replace(/\s+/g, " ").trim();
const sourceHas = (src, text) => flat(src.replace(/"\s*\n\s*\+\s*"/g, "").replace(/\\n/g, " ")).includes(flat(text));
for (const c of CASES) {
  if (!sourceHas(bridgeSource, c.brief)) throw new Error(`${c.name}: brief drifted from bridge-probe.mjs`);
  if (!sourceHas(bridgeSource, c.note)) throw new Error(`${c.name}: note drifted from bridge-probe.mjs`);
  if (!sourceHas(desccheckSource, c.laundered)) throw new Error(`${c.name}: laundered note drifted from desccheck-probe.mjs`);
  if (!c.brief.includes(c.contradiction.from)) throw new Error(`${c.name}: contradiction line not in brief`);
}

const CLASSES = ["clean", "contradiction", "omission", "laundered"];
const ARMS = [];
for (const c of CASES) {
  if (only && !c.name.includes(only)) continue;
  const base = { case: c.name, kind: c.kind, secrets: c.secrets };
  ARMS.push({ ...base, cls: "clean", brief: c.brief, note: c.note, want: null });
  ARMS.push({
    ...base, cls: "contradiction", note: c.note, want: c.contradiction.want,
    brief: c.brief.replace(c.contradiction.from, c.contradiction.to),
  });
  ARMS.push({
    ...base, cls: "omission", note: c.note, want: c.omission.want,
    brief: `${c.brief}\n${c.omission.add}`,
  });
  // No `want` regex: the laundered arm is scored on the secrets it names, in scoreRow.
  ARMS.push({ ...base, cls: "laundered", brief: c.brief, note: c.laundered, want: null });
}
const arms = ARMS.filter((a) => (onlyClass ? a.cls === onlyClass : true));
const activeClasses = CLASSES.filter((k) => arms.some((a) => a.cls === k));

// Same violations `desccheck-probe.mjs` counts, and for the same reasons: a preamble and a rewrite are the
// prompt being disobeyed, while agreement wording is the parser being fooled, which is a different bug.
const PREAMBLE = /^\s*(here (is|are)|here'?s|sure[,!.]|certainly|okay[,!.]|below (is|are)|i(?:'ve| have) (found|reviewed|compared)|after (reviewing|comparing)|upon review)/i;
const REWRITE = /^\s*(?:\*\*)?(?:revis\w*|rewritten|rewrite|corrected|proposed|updated|suggested)\s*(?:version|text|description|wording)?\s*(?:\*\*)?\s*:/im;
const AGREEMENT = /\b(?:agree\w*|consistent|match(?:es)?|align\w*|accounted for|accounts for)\b|\bno (?:disagreement|contradiction|conflict|discrepanc\w*|issue|inconsistenc\w*|omission)|\b(?:does |do |is |are )?not (?:a )?(?:contradict\w*|disagree\w*|conflict\w*|discrepanc\w*|inconsistent|missing)|nothing to (?:report|flag)|none (?:found|identified)|no findings|just more detail/i;
const words = (s) => (s.trim().match(/\S+/g) || []).length;

const norm = (s) => s.replace(/\s+/g, " ").toLowerCase().trim();

// **A finding that is a contiguous run of its own input is a paste, whatever it contains.** That is the whole
// rule, and it is stronger than what this probe started with in two ways it needed.
//
// The 60-character containment rule inherited from `desccheck-probe.mjs` was written for prose descriptions,
// and a brief is written in short bullets: *"talks fast and chatters, never leaves a pause"* is 46 characters,
// so it slid under the threshold and scored as a comparison. It was not one. On the first sweep cydonia-24b
// scored 14 of 24 on the contradiction arm and **every non-NONE answer it gave on that arm was the changed
// brief line handed straight back** — so the threshold came off.
//
// The first correction then tried to spare a genuine finding that quotes the brief, by requiring the absence
// of comparison words. That was worse than useless: the words live in the source text too, so *"- never
// injured"* was read as a comparison because the pasted bullet contains "never". Six pastes survived on that
// alone. The guard is gone, because a real finding names both sides and therefore adds words *outside* any
// run it quotes — which makes it not a substring. The test is exact and needs no vocabulary.
function isEcho(finding, arm) {
  const f = norm(finding).replace(/^[^:]{0,40}:\s*/, "");
  const hay = norm(arm.brief) + " || " + norm(arm.note);
  if (f.length >= 15 && hay.includes(f)) return true;
  if (f.length < 60) return false;
  for (let i = 0; i + 60 <= f.length; i += 10) if (hay.includes(f.slice(i, i + 60))) return true;
  return false;
}

async function call(model, sys, user, seed) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const body = {
    model,
    messages: [{ role: "system", content: sys }, { role: "user", content: user }],
    temperature: TEMPERATURE, max_tokens: DEFAULT_CHECK_MAX_TOKENS, seed, stream: false,
  };
  if (reasoning !== "off") body.reasoning_effort = reasoning;
  let res;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
    if (res.status !== 429 || attempt >= 4) break;
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
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
  byClass: Object.fromEntries(CLASSES.map((k) => [k, {
    runs: 0, hits: 0, findSum: 0, agreeWorded: 0, saidNone: 0, echoed: 0, echoOnly: 0,
    secretsFound: 0, secretsTotal: 0,
  }])),
});

// Shared by the live sweep and --rescore so the two cannot diverge — the same reason `desccheck-probe.mjs`
// has one, and it earned that structure by needing a metric corrected against completions already paid for.
function scoreRow(T, arm, out, label) {
  const C = T.byClass[arm.cls];

  // Empty with the budget spent: `checkDescriptions` reads that as agreement, so it must not be able to
  // score as one. Voided before the class denominator moves.
  if (out.finish === "length" && !out.raw) {
    T.truncated++;
    T.emptyTrunc++;
    console.log(`  ${label} VOID · empty after truncation (${out.tokens ?? "?"} tok)`
      + " — the app would read this as agreement");
    return { hit: null, findings: [], named: [] };
  }
  C.runs++;

  const findings = parseFindings(out.raw);
  C.findSum += findings.length;

  // The laundered arm asks a different question than the planted ones: not "was the plant named" but "how
  // much of the authored world came back". A run that names one of three missing secrets is a hit; the
  // recall across all three is what says whether an author could trust the report.
  // Only a finding that is not a paste can score. A model handing the changed brief line back has compared
  // nothing, and counting that as a detection is how a degenerate arm reads as a working one. `echoOnly`
  // keeps the runs that would have scored under the looser rule, so the correction stays legible instead of
  // being a silently different number.
  const real = findings.filter((f) => !isEcho(f, arm));
  let named = [];
  let hit;
  if (arm.cls === "laundered") {
    named = arm.secrets.filter((s) => real.some((f) => s.re.test(f))).map((s) => s.id);
    C.secretsFound += named.length;
    C.secretsTotal += arm.secrets.length;
    hit = named.length > 0;
    if (!hit && arm.secrets.some((s) => findings.some((f) => s.re.test(f)))) C.echoOnly++;
  } else if (arm.want) {
    hit = real.some((f) => arm.want.test(f));
    if (!hit && findings.some((f) => arm.want.test(f))) C.echoOnly++;
  } else {
    hit = findings.length === 0;
  }
  if (hit) C.hits++;

  const flags = [];
  if (SAID_NONE.test(out.raw)) C.saidNone++;
  if (PREAMBLE.test(out.raw)) { T.preamble++; flags.push("preamble"); }
  if (REWRITE.test(out.raw)) { T.rewrote++; flags.push("REWRITE"); }
  if (findings.length === 1 && words(findings[0]) > 60) { T.blob++; flags.push("blob"); }
  if (out.finish === "length") { T.truncated++; flags.push("truncated"); }
  if (out.tokens != null) { T.tokSum += out.tokens; T.tokRuns++; T.tokMax = Math.max(T.tokMax, out.tokens); }
  if (findings.some((f) => AGREEMENT.test(f))) { C.agreeWorded++; flags.push("agreement-worded"); }
  if (findings.some((f) => isEcho(f, arm))) { C.echoed++; flags.push("ECHO"); }
  if (arm.cls === "laundered") flags.push(`secrets ${named.length}/${arm.secrets.length}${named.length ? " (" + named.join(",") + ")" : ""}`);

  const tok = out.tokens != null ? ` · ${out.tokens} tok` : "";
  console.log(`  ${label} ${findings.length} finding(s) · ${hit ? "HIT" : "miss"}${tok}`
    + `${flags.length ? " · " + flags.join(" · ") : ""}`);
  for (const f of findings) console.log(`      • ${f.replace(/\s+/g, " ").slice(0, 200)}`);
  // A broad alternation can match by accident, so show the text behind every hit — the rates mean nothing
  // until a few of these have been read by eye.
  if (arm.want) {
    for (const f of findings.filter((x) => arm.want.test(x))) {
      const flat2 = f.replace(/\s+/g, " ");
      const m = flat2.match(arm.want);
      const at = Math.max(0, m.index - 40);
      console.log(`      ↳ matched: …${flat2.slice(at, m.index + m[0].length + 40)}…`);
    }
  }
  return { hit, findings, named };
}

const totals = {};

if (rescorePath) {
  const rows = (await readFile(rescorePath, "utf8")).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const byArm = new Map(ARMS.map((a) => [`${a.case}/${a.cls}`, a]));
  console.log(`Re-scoring ${rows.length} stored completion(s) from ${rescorePath} — no model is called.`);
  console.log(`temp ${TEMPERATURE} · cap ${DEFAULT_CHECK_MAX_TOKENS} · fixtures and metrics as they stand now\n`);
  let last = "";
  for (const row of rows) {
    if (only && !row.case.includes(only)) continue;
    if (onlyClass && row.cls !== onlyClass) continue;
    const arm = byArm.get(`${row.case}/${row.cls}`);
    if (!arm) continue;
    const T = totals[row.model] ??= blank();
    const head = `${row.model} · ${row.case} · ${row.cls}`;
    if (head !== last) { console.log(`\n######## ${head}`); last = head; }
    T.runs++;
    scoreRow(T, arm, { raw: row.raw ?? "", finish: row.finish, tokens: row.tokens }, `#${row.run}`);
  }
} else {
  console.log(`Brief-check probe · ${endpoint} · ${models.length} model(s) · ${arms.length} arm(s) · `
    + `${runs} run(s)/arm · temp ${TEMPERATURE} · cap ${DEFAULT_CHECK_MAX_TOKENS} · reasoning ${reasoning}`);
  console.log(`prompt: ${promptPath ?? "built-in default (nothing is shipped for this pair)"}`);
  console.log("clean: want NONE · contradiction/omission: want the planted finding · laundered: want the "
    + "missing secrets named\n");

  for (const model of models) {
    const T = totals[model] = blank();
    console.log(`\n${"=".repeat(96)}\n== ${model}`);
    await call(model, composeCheckPrompt(template, "character"), "warm up", baseSeed).catch(() => {});

    for (const arm of arms) {
      const sys = composeCheckPrompt(template, arm.kind);
      const user = buildBriefMessage(arm.brief, arm.note);
      console.log(`\n######## ${arm.case} · ${arm.cls} (${arm.kind})`);
      for (let r = 0; r < runs; r++) {
        let out, err = null;
        try { out = await call(model, sys, user, baseSeed + r); } catch (e) { err = String(e.message || e); }
        T.runs++;
        if (err) { T.errors++; console.log(`  #${r + 1} ERROR: ${err}`); continue; }
        const { hit, findings, named } = scoreRow(T, arm, out, `#${r + 1}`);
        dump.push({
          model, case: arm.case, cls: arm.cls, kind: arm.kind, run: r + 1, seed: baseSeed + r,
          prompt: promptPath ?? "default", findings, hit, named,
          finish: out.finish, tokens: out.tokens, raw: out.raw,
        });
      }
    }
  }
}

const modelList = Object.keys(totals);
const pct = (n, d) => `${(100 * n / (d || 1)).toFixed(0)}%`;
console.log(`\n${"=".repeat(96)}`);
for (const model of modelList) {
  const T = totals[model];
  console.log(`\n${model} · ${T.runs} runs (${T.errors} err)`);
  for (const k of activeClasses) {
    const C = T.byClass[k];
    const avg = (C.findSum / (C.runs || 1)).toFixed(1);
    if (k === "clean") {
      const fp = C.runs - C.hits;
      console.log(`  ${"clean".padEnd(15)}false positives ${fp}/${C.runs} (${pct(fp, C.runs)}) · `
        + `agreement-worded ${C.agreeWorded} · echoed ${C.echoed} · said NONE ${C.saidNone}/${C.runs} · ${avg} findings avg`);
    } else if (k === "laundered") {
      console.log(`  ${"laundered".padEnd(15)}named a missing secret ${C.hits}/${C.runs} (${pct(C.hits, C.runs)}) · `
        + `secret recall ${C.secretsFound}/${C.secretsTotal} (${pct(C.secretsFound, C.secretsTotal)}) · `
        + `${avg} findings avg · echoed ${C.echoed}${C.echoOnly ? ` · ${C.echoOnly} echo-only` : ""}`);
    } else {
      console.log(`  ${k.padEnd(15)}found ${C.hits}/${C.runs} (${pct(C.hits, C.runs)}) · ${avg} findings avg · `
        + `echoed ${C.echoed}${C.echoOnly ? ` · ${C.echoOnly} echo-only, a paste that matched the want` : ""}`);
    }
  }
  console.log(`  ${"format".padEnd(15)}rewrites ${T.rewrote} · preamble ${T.preamble} · single-blob ${T.blob}`);
  const avgTok = T.tokRuns ? (T.tokSum / T.tokRuns).toFixed(0) : "—";
  console.log(`  ${"budget".padEnd(15)}${avgTok} tok avg, ${T.tokMax} max of ${DEFAULT_CHECK_MAX_TOKENS} · `
    + `truncated ${T.truncated}${T.emptyTrunc ? ` (${T.emptyTrunc} voided empty)` : ""}`);
}

if (modelList.length > 1) {
  console.log(`\n${"=".repeat(96)}\nArms, same fixtures and seeds:\n`);
  console.log(`${"model".padEnd(38)}${"clean".padStart(7)}${"contrad".padStart(9)}${"omissio".padStart(9)}`
    + `${"launder".padStart(9)}${"secrets".padStart(9)}`);
  for (const model of modelList) {
    const T = totals[model];
    const c = (k) => pct(T.byClass[k].hits, T.byClass[k].runs).padStart(k === "clean" ? 7 : 9);
    const sec = pct(T.byClass.laundered.secretsFound, T.byClass.laundered.secretsTotal).padStart(9);
    console.log(model.padEnd(38) + c("clean") + c("contradiction") + c("omission") + c("laundered") + sec);
  }
  console.log("\n(clean = share of runs that correctly reported nothing; the rest = share that found the plant)");
}

if (dumpPath && dump.length) {
  await writeFile(dumpPath, dump.map((d) => JSON.stringify(d)).join("\n") + "\n");
  console.log(`\nFull outputs -> ${dumpPath} (${dump.length} rows) — re-score without re-running.`);
}
