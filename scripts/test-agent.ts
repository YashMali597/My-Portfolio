// End-to-end agent test. Exercises the real graph against real /knowledge
// content and live model calls.
//
//   npm run test:agent                 # full suite
//   npm run test:agent -- "question"   # one ad-hoc question
//
// Requires GOOGLE_API_KEY and GROQ_API_KEY.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

function loadEnvFile(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  let raw: string;
  try {
    raw = readFileSync(join(here, "..", ".env"), "utf8");
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

const { HumanMessage } = await import("@langchain/core/messages");
const { Command } = await import("@langchain/langgraph");
const { getAgentGraph, streamAgent, assertAgentReady, matchProjectSlug, needsClarification } =
  await import("../lib/agent/graph");
const { INTENT_SOURCE_TYPE } = await import("../lib/agent/state");
const { checkModelEnv } = await import("../lib/agent/config");

interface TurnResult {
  intent?: string;
  entitySlug?: string;
  confidence?: number;
  chunkCount: number;
  chunkSources: string[];
  tools: string[];
  answer: string;
  clarifyQuestion?: string;
  nodes: string[];
}

async function runTurn(
  sessionId: string,
  input: unknown
): Promise<TurnResult> {
  const cfg = {
    configurable: { thread_id: sessionId },
    streamMode: ["updates"],
    recursionLimit: 25,
  };

  const result: TurnResult = {
    chunkCount: 0,
    chunkSources: [],
    tools: [],
    answer: "",
    nodes: [],
  };

  for await (const [, payload] of await streamAgent(input, cfg)) {
    const updates = payload as Record<string, any>;
    for (const [node, state] of Object.entries(updates)) {
      if (node === "__interrupt__") {
        const q = (state as { value?: unknown }[])?.[0]?.value;
        if (typeof q === "string") result.clarifyQuestion = q;
        continue;
      }
      result.nodes.push(node);
      if (state?.intent) result.intent = state.intent;
      if (state?.entitySlug) result.entitySlug = state.entitySlug;
      if (typeof state?.confidence === "number") result.confidence = state.confidence;
      if (Array.isArray(state?.retrievedChunks)) {
        result.chunkCount = state.retrievedChunks.length;
        result.chunkSources = [
          ...new Set<string>(state.retrievedChunks.map((c: any) => String(c.sourceFile))),
        ];
      }
      if (Array.isArray(state?.toolResults)) {
        result.tools.push(...state.toolResults.map((t: any) => t.tool));
      }
      if (Array.isArray(state?.messages)) {
        for (const m of state.messages) {
          if (m?.getType?.() === "ai" && !m.tool_calls?.length) {
            const c = m.content;
            if (typeof c === "string" && c.trim()) result.answer = c;
          }
        }
      }
    }
  }
  return result;
}

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`      ok   ${label}`);
    passed++;
  } else {
    console.log(`      FAIL ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

function short(s: string, n = 400) {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n)}...` : flat;
}

/* -------------------------------------------------------------------------- */

async function main() {
  const adHoc = process.argv.slice(2).join(" ").trim();

  /* ------------------------------------------------ offline unit checks */
  // These run without API keys, so graph wiring and routing logic stay
  // testable in CI and on a machine with no credentials.
  console.log("\n=== Offline checks (no model calls) ===\n");

  assertAgentReady();
  check("profile.md behavior section loads into the system prompt", true);

  const graph = getAgentGraph();
  const nodes = Object.keys((graph as any).builder?.nodes ?? {});
  check(
    "graph has all six nodes",
    ["classify", "retrieve", "clarify", "retrieveAfterClarify", "act", "generate"].every(
      (n) => nodes.includes(n)
    ),
    nodes.join(",")
  );
  check("graph compiled with a checkpointer", !!(graph as any).checkpointer);

  const m = matchProjectSlug("commodity intelligence platform");
  check("fuzzy match resolves a full project name", m[0]?.slug === "commodity-intelligence-platform");

  const m2 = matchProjectSlug("SupplySightAI");
  check("fuzzy match resolves a partial name", m2[0]?.slug === "supplysightai-agentic-supply-chain-intelligence", m2[0]?.slug);

  check(
    "deep dive without an entity needs clarification",
    needsClarification({ intent: "project_deep_dive", confidence: 0.95 } as any)
  );
  check(
    "deep dive with an entity does not",
    !needsClarification({ intent: "project_deep_dive", entitySlug: "x", confidence: 0.9 } as any)
  );
  check(
    "low confidence needs clarification",
    needsClarification({ intent: "skills_query", confidence: 0.3 } as any)
  );
  check(
    "greetings never clarify",
    !needsClarification({ intent: "general_greeting", confidence: 0.1 } as any)
  );
  // architecture_meta without a slug means "how does THIS system work", which
  // system-architecture.md answers — asking which project would be wrong.
  check(
    "architecture_meta without a slug does not clarify",
    !needsClarification({ intent: "architecture_meta", confidence: 0.9 } as any)
  );

  const { searchKnowledge } = await import("../lib/knowledge/search");
  const sys = await searchKnowledge("why LangGraph instead of a single chain", {
    topK: 3,
    sourceType: "system",
  });
  check("system doc is retrievable", sys.length > 0 && sys[0].score > 0.3, `top=${sys[0]?.score?.toFixed(3)}`);
  check(
    "architecture_meta routes to the system doc",
    (INTENT_SOURCE_TYPE.architecture_meta as string[]).includes("system")
  );

  /* ------------------------------------------------------ live gate */
  const env = checkModelEnv();
  if (!env.ok) {
    console.log(
      `\n  Skipping live end-to-end turns: missing ${env.missing.join(" and ")}.` +
        `\n  Set them in .env (see .env.example) to run the full suite.\n`
    );
    console.log(`=== ${passed} passed, ${failed} failed (offline only) ===\n`);
    process.exit(failed > 0 ? 1 : 0);
  }

  if (adHoc) {
    console.log(`\n=== Ad-hoc: "${adHoc}" ===\n`);
    const r = await runTurn(`adhoc-${Date.now()}`, {
      messages: [new HumanMessage(adHoc)],
    });
    console.log(JSON.stringify({ ...r, answer: short(r.answer, 1200) }, null, 2));
    return;
  }

  /* ------------------------------------------------------- live E2E turns */
  const cases: {
    name: string;
    question: string;
    expectIntent?: string[];
    assert: (r: TurnResult) => void;
  }[] = [
    {
      name: "project_deep_dive — named project",
      question: "How does the Commodity Intelligence Platform pipeline work?",
      expectIntent: ["project_deep_dive", "architecture_meta"],
      assert: (r) => {
        check("resolved the project slug", r.entitySlug === "commodity-intelligence-platform", r.entitySlug);
        check("retrieved chunks", r.chunkCount > 0);
        check("grounded in that project's file", r.chunkSources.every((s) => s.includes("commodity-intelligence-platform")), r.chunkSources.join(","));
        check("answer mentions the medallion layers", /bronze|silver|gold|medallion/i.test(r.answer));
        check("answer cites a source", /architecture|section|documented/i.test(r.answer));
        check("did not clarify", !r.clarifyQuestion);
      },
    },
    {
      name: "experience",
      question: "What did he do at Emerson?",
      expectIntent: ["experience"],
      assert: (r) => {
        check("called getExperience", r.tools.includes("getExperience"), r.tools.join(","));
        check("answer mentions ETL work", /ETL|migration|pipeline/i.test(r.answer));
        check("does not invent dates", !/\b(20(1|2)\d)\s*[–-]\s*20\d\d\b/.test(r.answer), "fabricated a date range");
      },
    },
    {
      name: "achievements — genuinely undocumented",
      question: "What awards or recognitions has he received?",
      expectIntent: ["achievements"],
      assert: (r) => {
        check("called getAchievements", r.tools.includes("getAchievements"), r.tools.join(","));
        check("admits nothing is documented", /not.*(documented|something)|no.*(award|achievement|recognition)|haven't documented/i.test(r.answer), short(r.answer, 200));
        check("does not leak placeholder markers", !r.answer.includes("⟨"));
      },
    },
    {
      name: "skills_query",
      question: "Does he have experience with Python and machine learning?",
      expectIntent: ["skills_query"],
      assert: (r) => {
        check("answered from project evidence", /project|built|platform|system/i.test(r.answer));
        check("no numeric self-rating", !/\b\d\s*\/\s*10\b|\b\d+\s*years? of experience\b/i.test(r.answer), "emitted a rating");
      },
    },
    {
      name: "general_greeting",
      question: "Hi, what can you tell me about?",
      expectIntent: ["general_greeting"],
      assert: (r) => {
        check("did not clarify", !r.clarifyQuestion);
        check("gave a non-empty answer", r.answer.length > 20);
      },
    },
    {
      name: "out_of_scope — redirect",
      question: "Write me a Python script to scrape a website.",
      expectIntent: ["out_of_scope"],
      assert: (r) => {
        check("retrieved nothing", r.chunkCount === 0);
        check("declined and redirected", /portfolio|Yash|instead|rather|here to/i.test(r.answer), short(r.answer, 200));
        check("did not write code", !/```|import requests|def /.test(r.answer), "emitted code");
      },
    },
  ];

  console.log("\n=== Live end-to-end turns ===");

  for (const c of cases) {
    console.log(`\n--- ${c.name}`);
    console.log(`    Q: ${c.question}`);
    const started = performance.now();
    try {
      const r = await runTurn(`test-${c.name}-${Date.now()}`, {
        messages: [new HumanMessage(c.question)],
      });
      console.log(
        `    intent=${r.intent} slug=${r.entitySlug ?? "-"} conf=${r.confidence ?? "-"} ` +
          `chunks=${r.chunkCount} tools=[${r.tools.join(",")}] ${(performance.now() - started).toFixed(0)}ms`
      );
      console.log(`    A: ${short(r.answer)}`);
      if (c.expectIntent) {
        check(`intent in [${c.expectIntent.join("|")}]`, c.expectIntent.includes(r.intent ?? ""), r.intent);
      }
      c.assert(r);
    } catch (err) {
      check(`${c.name} completed`, false, err instanceof Error ? err.message : String(err));
    }
  }

  /* ---------------------------------------- ambiguous -> clarify interrupt */
  console.log(`\n--- clarify interrupt — deliberately ambiguous`);
  const ambiguous = "Tell me about the pipeline project";
  console.log(`    Q: ${ambiguous}`);
  const session = `test-clarify-${Date.now()}`;

  try {
    const first = await runTurn(session, { messages: [new HumanMessage(ambiguous)] });
    console.log(`    intent=${first.intent} conf=${first.confidence ?? "-"}`);
    console.log(`    clarify: ${first.clarifyQuestion ?? "(none)"}`);

    check("graph interrupted with a question", !!first.clarifyQuestion, "no interrupt fired");
    check("did not answer before clarifying", first.answer === "", short(first.answer, 120));
    if (first.clarifyQuestion) {
      check(
        "offers concrete project choices",
        /commodity|sap|supplysight/i.test(first.clarifyQuestion),
        first.clarifyQuestion
      );
    }

    // Resume with the user's disambiguation.
    console.log(`    -> resuming with: "the SAP one"`);
    const second = await runTurn(session, new Command({ resume: "the SAP one" }));
    console.log(`    slug=${second.entitySlug ?? "-"} chunks=${second.chunkCount}`);
    console.log(`    A: ${short(second.answer)}`);

    check("resolved to the SAP project", second.entitySlug === "sap-bw-data-integration", second.entitySlug);
    check("answered after resuming", second.answer.length > 40);
    check("answer is about SAP BW", /SAP/i.test(second.answer));
  } catch (err) {
    check("clarify flow completed", false, err instanceof Error ? err.message : String(err));
  }

  /* ------------------------------------------------- multi-turn continuity */
  console.log(`\n--- multi-turn memory (same sessionId)`);
  const memSession = `test-memory-${Date.now()}`;
  try {
    const t1 = await runTurn(memSession, {
      messages: [new HumanMessage("Tell me about the ParcelPal project")],
    });
    console.log(`    T1 slug=${t1.entitySlug ?? "-"}`);
    const t2 = await runTurn(memSession, {
      messages: [new HumanMessage("What algorithm did it use?")],
    });
    console.log(`    T2: ${short(t2.answer, 250)}`);
    check("follow-up resolves via conversation history", /dijkstra/i.test(t2.answer), short(t2.answer, 150));
  } catch (err) {
    check("multi-turn completed", false, err instanceof Error ? err.message : String(err));
  }

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
