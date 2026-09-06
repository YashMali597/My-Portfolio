// Evaluation harness for the portfolio agent.
//
//   npm run eval              # full dataset
//   npm run eval -- --only commodity-01,system-02
//   npm run eval -- --limit 5
//
// Calls the compiled graph directly (not the HTTP route) so the measurement is
// of the agent, not of the transport. Writes eval/results.json, which
// `npm run knowledge:build` folds into the /system page.
//
// Requires GOOGLE_API_KEY and GROQ_API_KEY — this makes real model calls,
// including a separate judge call per item.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/* ------------------------------------------------------------------ env */
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

function loadEnvFile(): void {
  let raw: string;
  try {
    raw = readFileSync(join(ROOT, ".env"), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(k in process.env) && v) process.env[k] = v;
  }
}
loadEnvFile();

const { HumanMessage, SystemMessage } = await import("@langchain/core/messages");
const { streamAgent } = await import("../lib/agent/graph");
const { getGenerationModel, activeModels } = await import("../lib/agent/models");
const { checkModelEnv } = await import("../lib/agent/config");
const { parseJsonLoose } = await import("../lib/agent/json");

/* ------------------------------------------------------- rate limiting */

// Free tiers here are token-per-minute capped (Groq: 8k TPM; Gemini: 20
// requests/DAY). A naive loop trips 429 on nearly every item, so the harness
// paces itself and honours the server's own Retry-After hint rather than
// guessing a backoff.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Pull "try again in 13.365s" out of a provider 429 message. */
function retryAfterMs(message: string): number | null {
  const m = /try again in ([\d.]+)s/i.exec(message) ?? /retry in ([\d.]+)s/i.exec(message);
  if (m) return Math.ceil(parseFloat(m[1]) * 1000) + 1500;
  return /429|rate.?limit|quota/i.test(message) ? 30_000 : null;
}

async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 8): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const wait = retryAfterMs(msg);
      if (wait === null) throw err;
      process.stdout.write(` [429 ${label}, waiting ${Math.round(wait / 1000)}s]`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

/* --------------------------------------------------------------- types */

type Mode = "answer" | "not_documented" | "clarify" | "decline";

interface EvalItem {
  id: string;
  question: string;
  mode: Mode;
  expectedSource: string | null;
  expectedSection?: string;
  expectedGist: string;
}

interface TurnCapture {
  answer: string;
  clarifyQuestion?: string;
  intent?: string;
  entitySlug?: string;
  confidence?: number;
  chunks: { sourceFile: string; heading: string; text: string; score: number }[];
  tools: string[];
  toolResults: { tool: string; data: unknown }[];
  latencyMs: number;
  usage: { input: number; output: number };
  error?: string;
}

interface ItemResult extends TurnCapture {
  id: string;
  question: string;
  mode: Mode;
  expectedSource: string | null;
  expectedSection?: string;
  retrievalHit: boolean | null;
  sectionHit: boolean | null;
  behaviourPass: boolean | null;
  behaviourNote: string;
  grounded: boolean | null;
  judgeVerdict: string;
  judgeReason: string;
}

/* ----------------------------------------------------------- run a turn */

async function runTurn(item: EvalItem): Promise<TurnCapture> {
  const cfg = {
    configurable: { thread_id: `eval-${item.id}-${Date.now()}` },
    streamMode: ["updates"],
    recursionLimit: 25,
  };

  const cap: TurnCapture = {
    answer: "",
    chunks: [],
    tools: [],
    toolResults: [],
    latencyMs: 0,
    usage: { input: 0, output: 0 },
  };

  const started = performance.now();
  try {
    await withRetry("graph", async () => {
    for await (const [, payload] of await streamAgent(
      { messages: [new HumanMessage(item.question)] },
      cfg
    )) {
      const updates = payload as Record<string, any>;
      for (const [node, state] of Object.entries(updates)) {
        if (node === "__interrupt__") {
          const q = (state as { value?: unknown }[])?.[0]?.value;
          if (typeof q === "string") cap.clarifyQuestion = q;
          continue;
        }
        if (state?.intent) cap.intent = state.intent;
        if (state?.entitySlug) cap.entitySlug = state.entitySlug;
        if (typeof state?.confidence === "number") cap.confidence = state.confidence;
        if (Array.isArray(state?.retrievedChunks)) {
          cap.chunks = state.retrievedChunks.map((c: any) => ({
            sourceFile: c.sourceFile,
            heading: c.heading,
            text: c.text,
            score: c.score,
          }));
        }
        if (Array.isArray(state?.toolResults)) {
          cap.tools.push(...state.toolResults.map((t: any) => t.tool));
          cap.toolResults.push(...state.toolResults);
        }
        if (Array.isArray(state?.messages)) {
          for (const m of state.messages) {
            if (m?.getType?.() === "ai" && !m.tool_calls?.length) {
              const c = m.content;
              if (typeof c === "string" && c.trim()) cap.answer = c;
            }
            // Token usage, when the provider reports it.
            const u = m?.usage_metadata;
            if (u) {
              cap.usage.input += u.input_tokens ?? 0;
              cap.usage.output += u.output_tokens ?? 0;
            }
          }
        }
      }
    }
    });
  } catch (err) {
    cap.error = err instanceof Error ? err.message : String(err);
  }
  cap.latencyMs = Math.round(performance.now() - started);
  return cap;
}

/* ------------------------------------------------------------- LLM judge */

// Deliberately strict and literal. A lenient judge is worse than no judge: it
// produces a confident 100% that hides exactly the failures this is meant to
// catch. The judge is told to fail on ANY unsupported claim, and that
// plausibility and correctness are not the question — only support by context.
const JUDGE_SYSTEM = `You are a strict grounding judge. You are NOT evaluating whether the answer is
helpful, well written, or factually true in the real world. You are evaluating
ONE thing: is every factual claim in the ANSWER directly supported by the
CONTEXT provided?

The CONTEXT has two parts: RETRIEVED CHUNKS and TOOL RESULTS. Both are equally
valid support. A claim backed by tool output is supported even if no chunk
mentions it.

Rules:
- A claim is supported only if the CONTEXT states it or entails it directly.
- If the answer contains ANY specific fact (a number, a date, a name, a
  technology, an outcome, a link) that does not appear in the CONTEXT, the
  verdict is NO. Do not be generous.
- Plausible-sounding elaboration that is not in the CONTEXT is NOT supported.
- The context describes Yash's own portfolio. Attributing documented work to
  Yash ("Yash built X") is SUPPORTED when the context describes X — do not
  fail an answer merely because the context does not repeat his name.
- Saying something is undocumented, unknown, or not available IS ALWAYS
  SUPPORTED. It needs no context. An empty context makes such a statement MORE
  correct, never less. Never fail an answer for admitting a gap.
- Declining an out-of-scope request is ALWAYS SUPPORTED, including when the
  decline mentions Yash's contact email or names topics it could discuss
  instead — those come from the agent's standing instructions, not the context.
- Generic conversational framing ("Sure", "Here's what I found") is ignored.
- If CONTEXT is empty and the answer asserts a POSITIVE factual claim about
  Yash, the verdict is NO.

Respond with ONLY a JSON object:
{"verdict": "YES" | "NO", "reason": "<one sentence, name the unsupported claim if NO>"}`;

async function judge(
  answer: string,
  chunks: TurnCapture["chunks"],
  toolResults: TurnCapture["toolResults"]
): Promise<{ verdict: string; reason: string; grounded: boolean | null }> {
  if (!answer.trim()) {
    return { verdict: "SKIP", reason: "no answer produced", grounded: null };
  }

  const context =
    chunks.length === 0
      ? "(no context was retrieved)"
      : chunks
          .map((c, i) => `[${i + 1}] ${c.sourceFile} > ${c.heading}\n${c.text}`)
          .join("\n\n---\n\n");

  // Temperature 0: the judge must be reproducible run to run.
  //
  // JUDGE_MODEL_ID lets the judge run on a DIFFERENT model from the one under
  // test. That is good practice anyway (a model grading its own output is a
  // weak check) and it also puts the judge on a separate token-per-minute
  // bucket, which is what makes the eval finish on a free tier.
  // 1500, not 400. Same lesson the router taught: reasoning models bill their
  // chain of thought against the completion budget, so a tight cap yields an
  // empty response and a PARSE_ERROR rather than a verdict.
  const model = getGenerationModel({
    temperature: 0,
    maxTokens: 1500,
    model: process.env.JUDGE_MODEL_ID?.trim() || undefined,
  });

  try {
    const res = await withRetry("judge", () =>
      model.invoke([
        new SystemMessage(JUDGE_SYSTEM),
        new HumanMessage(`CONTEXT:\n${context}\n\n---\n\nANSWER:\n${answer}`),
      ])
    );
    const raw = String(res.content);
    const parsed = parseJsonLoose(raw, ["verdict"]);
    if (!parsed) {
      return { verdict: "PARSE_ERROR", reason: raw.slice(0, 160), grounded: null };
    }
    const verdict = String(parsed.verdict ?? "").toUpperCase();
    return {
      verdict,
      reason: String(parsed.reason ?? ""),
      grounded: verdict === "YES" ? true : verdict === "NO" ? false : null,
    };
  } catch (err) {
    return {
      verdict: "ERROR",
      reason: err instanceof Error ? err.message.split("\n")[0] : String(err),
      grounded: null,
    };
  }
}

/* --------------------------------------------------------- behaviour check */

const DECLINE_PATTERNS =
  /\b(not something|don'?t have|do not have|isn'?t documented|is not documented|not documented|can'?t help with that|outside|out of scope|rather than|instead|reach out|contact)\b/i;
const CODE_PATTERNS = /```|\bimport requests\b|\bdef \w+\(|\bBeautifulSoup\b/;

/** Did the agent do the RIGHT KIND of thing for this item's mode? */
function checkBehaviour(
  item: EvalItem,
  cap: TurnCapture
): { pass: boolean | null; note: string } {
  // An item whose graph run died (rate limit, provider outage) tells us nothing
  // about the agent's behaviour. Scoring it as a failure would blame the agent
  // for the free tier. Excluded from the rate and reported separately.
  if (cap.error) return { pass: null, note: `run error: ${cap.error.slice(0, 80)}` };

  switch (item.mode) {
    case "clarify":
      return cap.clarifyQuestion
        ? { pass: true, note: "interrupted and asked" }
        : { pass: false, note: "answered instead of asking" };

    case "decline": {
      if (cap.clarifyQuestion) return { pass: false, note: "asked for clarification instead of declining" };
      if (CODE_PATTERNS.test(cap.answer)) return { pass: false, note: "produced code" };
      return DECLINE_PATTERNS.test(cap.answer)
        ? { pass: true, note: "declined and redirected" }
        : { pass: false, note: "did not visibly decline" };
    }

    case "not_documented":
      return DECLINE_PATTERNS.test(cap.answer)
        ? { pass: true, note: "acknowledged the gap" }
        : { pass: false, note: "did not say the fact is undocumented" };

    case "answer":
      if (cap.clarifyQuestion) return { pass: false, note: "asked instead of answering" };
      return cap.answer.trim().length > 40
        ? { pass: true, note: "answered" }
        : { pass: false, note: "answer empty or too short" };
  }
}

/* -------------------------------------------------------------- pricing */

// Rough public per-1M-token pricing, used only for an order-of-magnitude
// estimate. Both providers have free tiers that likely make actual spend zero.
const PRICE_PER_MTOK = { input: 0.1, output: 0.4 };

function estimateCost(inTok: number, outTok: number): number {
  return (inTok / 1e6) * PRICE_PER_MTOK.input + (outTok / 1e6) * PRICE_PER_MTOK.output;
}

/* ------------------------------------------------------------------ main */

async function main() {
  const args = process.argv.slice(2);
  const only = args.includes("--only")
    ? new Set(args[args.indexOf("--only") + 1].split(",").map((s) => s.trim()))
    : null;
  const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;
  // Seconds to wait between items, to stay under tokens-per-minute caps.
  const delayMs =
    (args.includes("--delay") ? Number(args[args.indexOf("--delay") + 1]) : 40) * 1000;
  // 40s default is not arbitrary: Groq's free tier is 8,000 tokens/minute and
  // one item costs ~3.5k tokens across the act, generate and judge calls, so
  // roughly 1.5 items/minute is the ceiling. Going faster just buys 429s.

  const env = checkModelEnv();
  if (!env.ok) {
    console.error(
      `\n  Cannot run the eval: missing ${env.missing.join(" and ")}.\n` +
        `  This harness makes real model calls (one graph run + one judge call per item).\n` +
        `  Set them in .env — see .env.example.\n`
    );
    process.exit(1);
  }

  const dataset = JSON.parse(readFileSync(join(ROOT, "eval", "dataset.json"), "utf8"));
  let items: EvalItem[] = dataset.items;
  if (only) items = items.filter((i) => only.has(i.id));
  items = items.slice(0, limit);

  console.log(`\nRunning eval on ${items.length} item(s)\n`);

  const results: ItemResult[] = [];

  for (const [i, item] of items.entries()) {
    if (i > 0 && delayMs > 0) await sleep(delayMs);
    process.stdout.write(`  [${i + 1}/${items.length}] ${item.id.padEnd(16)} `);

    const cap = await runTurn(item);

    // Retrieval: did the expected document appear among the retrieved chunks?
    const sources = new Set(cap.chunks.map((c) => c.sourceFile));
    const retrievalHit = item.expectedSource ? sources.has(item.expectedSource) : null;
    const sectionHit =
      item.expectedSource && item.expectedSection
        ? cap.chunks.some(
            (c) =>
              c.sourceFile === item.expectedSource &&
              c.heading.toLowerCase().startsWith(item.expectedSection!.toLowerCase())
          )
        : null;

    const behaviour = checkBehaviour(item, cap);

    // A clarify item never produces an answer, so there is nothing to judge.
    const j =
      item.mode === "clarify"
        ? { verdict: "N/A", reason: "clarify item — no answer to judge", grounded: null }
        : await judge(cap.answer, cap.chunks, cap.toolResults);

    results.push({
      ...cap,
      id: item.id,
      question: item.question,
      mode: item.mode,
      expectedSource: item.expectedSource,
      expectedSection: item.expectedSection,
      retrievalHit,
      sectionHit,
      behaviourPass: behaviour.pass,
      behaviourNote: behaviour.note,
      grounded: j.grounded,
      judgeVerdict: j.verdict,
      judgeReason: j.reason,
    });

    const flags = [
      retrievalHit === null ? "ret:-" : retrievalHit ? "ret:hit" : "ret:MISS",
      behaviour.pass === null ? "beh:err" : behaviour.pass ? "beh:ok" : "beh:FAIL",
      j.grounded === null ? "gnd:-" : j.grounded ? "gnd:ok" : "gnd:FAIL",
    ].join(" ");
    console.log(`${String(cap.latencyMs).padStart(6)}ms  ${flags}${cap.error ? `  ERROR: ${cap.error}` : ""}`);
  }

  /* ---------------------------------------------------------- aggregate */

  const scored = (f: (r: ItemResult) => boolean | null) => {
    const applicable = results.filter((r) => f(r) !== null);
    const passed = applicable.filter((r) => f(r) === true).length;
    return {
      passed,
      total: applicable.length,
      rate: applicable.length ? passed / applicable.length : null,
    };
  };

  const retrieval = scored((r) => r.retrievalHit);
  const section = scored((r) => r.sectionHit);
  const grounded = scored((r) => r.grounded);
  const behaviour = scored((r) => r.behaviourPass);

  const byMode = (mode: Mode) => {
    const subset = results.filter((r) => r.mode === mode && r.behaviourPass !== null);
    const passed = subset.filter((r) => r.behaviourPass === true).length;
    return { passed, total: subset.length, rate: subset.length ? passed / subset.length : null };
  };

  // Errored runs are mostly 429 backoff sleeps — including them would report
  // the rate limit, not the agent.
  const latencies = results
    .filter((r) => !r.error)
    .map((r) => r.latencyMs)
    .sort((a, b) => a - b);
  const p = (q: number) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * q))] ?? 0;

  const totalIn = results.reduce((s, r) => s + r.usage.input, 0);
  const totalOut = results.reduce((s, r) => s + r.usage.output, 0);

  const summary = {
    generatedAt: new Date().toISOString(),
    // Recorded so the published numbers can never be misattributed to models
    // other than the ones that actually produced them.
    models: { ...activeModels(), judge: process.env.JUDGE_MODEL_ID?.trim() || activeModels().generation },
    datasetVersion: dataset.version,
    itemCount: results.length,
    retrieval,
    sectionPrecision: section,
    groundedness: grounded,
    behaviour,
    byMode: {
      answer: byMode("answer"),
      not_documented: byMode("not_documented"),
      clarify: byMode("clarify"),
      decline: byMode("decline"),
    },
    latencyMs: {
      mean: Math.round(latencies.reduce((s, v) => s + v, 0) / (latencies.length || 1)),
      p50: p(0.5),
      p95: p(0.95),
      max: latencies[latencies.length - 1] ?? 0,
    },
    tokens: {
      input: totalIn,
      output: totalOut,
      // Zero means the provider did not report usage, not that nothing was used.
      reported: totalIn + totalOut > 0,
    },
    estimatedCostUsd: Number(estimateCost(totalIn, totalOut).toFixed(4)),
    errors: results.filter((r) => r.error).length,
  };

  mkdirSync(join(ROOT, "eval"), { recursive: true });
  writeFileSync(
    join(ROOT, "eval", "results.json"),
    JSON.stringify({ summary, results }, null, 2),
    "utf8"
  );

  const pct = (r: { rate: number | null; passed: number; total: number }) =>
    r.rate === null ? "n/a" : `${(r.rate * 100).toFixed(1)}% (${r.passed}/${r.total})`;

  console.log("\n  ── Aggregate ──────────────────────────────");
  console.log(`  Retrieval hit rate    ${pct(retrieval)}`);
  console.log(`  Section precision     ${pct(section)}`);
  console.log(`  Groundedness          ${pct(grounded)}`);
  console.log(`  Correct behaviour     ${pct(behaviour)}`);
  console.log(`    answer              ${pct(summary.byMode.answer)}`);
  console.log(`    not_documented      ${pct(summary.byMode.not_documented)}`);
  console.log(`    clarify             ${pct(summary.byMode.clarify)}`);
  console.log(`    decline             ${pct(summary.byMode.decline)}`);
  console.log(`  Latency  mean ${summary.latencyMs.mean}ms  p50 ${summary.latencyMs.p50}ms  p95 ${summary.latencyMs.p95}ms`);
  console.log(
    `  Tokens   ${summary.tokens.reported ? `${totalIn} in / ${totalOut} out  ~$${summary.estimatedCostUsd}` : "not reported by provider"}`
  );
  if (summary.errors) console.log(`  Errors   ${summary.errors}`);

  /* ------------------------------------------------- plausibility warning */
  const perfect =
    retrieval.rate === 1 && grounded.rate === 1 && behaviour.rate === 1 && results.length > 5;
  if (perfect) {
    console.log(
      "\n  ⚠  Everything passed. Before believing it, check that the judge is\n" +
        "     actually rejecting things (run a deliberately ungrounded answer\n" +
        "     through it) and that the dataset contains genuinely hard items."
    );
  }

  const failures = results.filter(
    (r) => r.behaviourPass === false || r.grounded === false || r.retrievalHit === false
  );
  if (failures.length) {
    console.log("\n  ── Failures ───────────────────────────────");
    for (const f of failures) {
      console.log(`  ${f.id}`);
      if (f.retrievalHit === false) console.log(`     retrieval missed ${f.expectedSource}`);
      if (!f.behaviourPass) console.log(`     behaviour: ${f.behaviourNote}`);
      if (f.grounded === false) console.log(`     judge: ${f.judgeReason}`);
    }
  }

  console.log(`\n  Wrote eval/results.json\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
