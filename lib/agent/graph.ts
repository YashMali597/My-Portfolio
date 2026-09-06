// LangGraph orchestration for the portfolio agent.
//
//   classify -> retrieve -> [clarify] -> act -> generate -> END
//
// Division of labour:
//   classify  Groq/Llama 8B  intent + entity, cheap and deterministic
//   retrieve  local MiniLM   semantic search, no LLM
//   clarify   no model       interrupt() and ask rather than guess
//   act       Gemini + tools decides which structured facts it needs
//   generate  Gemini         turns facts into grounded prose
//
// The generation model never states a fact from memory: `generate` sees only
// the retrieved chunks and the tool results, under the contract authored in
// /knowledge/profile.md.

import { StateGraph, START, END, MemorySaver, interrupt } from "@langchain/langgraph";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { AgentState, INTENTS, INTENT_SOURCE_TYPE, type Intent, type RetrievedChunk } from "./state";
import {
  getGenerationModel,
  invokeGenerationWithFallback,
  invokeRouterWithFallback,
  isRateLimitError,
} from "./models";
import { agentTools, agentToolsByName, listProjectSummaries, retrieveKnowledge } from "./tools";
import { buildGenerateSystemPrompt, loadAgentBehaviorPrompt } from "./prompt";
import { parseJsonLoose } from "./json";

/* -------------------------------------------------------------------------- */
/* Tuning                                                                     */
/* -------------------------------------------------------------------------- */

/** Below this router confidence, ask rather than guess. */
const CONFIDENCE_THRESHOLD = 0.6;

/** Chunks handed to the generation model. */
const TOP_K = 6;

/**
 * Retrieval below this cosine similarity is treated as "nothing relevant".
 *
 * Lowered from 0.25 after the eval showed it was silently starving real
 * questions. Measured on the current index:
 *
 *   "What did he do at Emerson?"      -> 0.239   (correct chunk)
 *   "Where did he go to school?"      -> 0.175   (correct chunk)
 *   "What are his salary expectations?" -> 0.209 (irrelevant chunk)
 *   "Write me a python script"        -> 0.190   (irrelevant chunk)
 *
 * The distributions OVERLAP: short, metadata-heavy entries in the collection
 * files score no higher than out-of-scope noise, so no absolute threshold
 * separates them. At 0.25 the graph returned ZERO context for questions about
 * his own job — the agent then said "that isn't documented", which is worse
 * than a weak match.
 *
 * Scope is therefore enforced where it actually can be: the classify node
 * returns no retrieval at all for `out_of_scope`, and the generate prompt
 * requires saying "not documented" when the context doesn't support an answer.
 * This floor is now only a guard against genuinely empty results.
 */
const RELEVANCE_FLOOR = 0.12;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function lastHumanMessage(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.getType() === "human") return String(m.content);
  }
  return "";
}

/**
 * Fuzzy-match free text against project slugs and titles.
 * Scored on token overlap — the router often returns a title, a partial name,
 * or a slug with the wrong separators, and all three should resolve.
 */
export function matchProjectSlug(
  text: string
): { slug: string; score: number }[] {
  const needle = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!needle) return [];
  const needleTokens = needle.split(" ").filter((t) => t.length > 2);

  return listProjectSummaries()
    .map((p) => {
      const haystack = `${p.slug} ${p.title} ${p.oneLiner}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ");
      const slugFlat = p.slug.replace(/-/g, " ");

      // Exact slug or full title match wins outright.
      if (needle === slugFlat || needle.includes(slugFlat)) {
        return { slug: p.slug, score: 1 };
      }
      const hit = needleTokens.filter((t) => haystack.includes(t)).length;
      const score = needleTokens.length ? hit / needleTokens.length : 0;
      return { slug: p.slug, score };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);
}

/* -------------------------------------------------------------------------- */
/* Node: classify                                                             */
/* -------------------------------------------------------------------------- */

const CLASSIFY_SYSTEM = `You classify questions for a portfolio agent representing Yash Mali.

Return ONLY a JSON object, no prose, no markdown fence:
{"intent": "<intent>", "entitySlug": "<slug or null>", "confidence": <0.0-1.0>}

Intents:
- project_deep_dive: about a specific project's details, how it worked, why a decision was made
- experience: jobs, employers, work history, education, degrees
- achievements: awards, recognition, publications, talks, certifications
- skills_query: what technologies/capabilities he has, whether he's used something
- architecture_meta: how something was DESIGNED — either this website's own agent
  architecture (its graph, models, retrieval, tools, ADRs) or a specific
  project's architecture. Leave entitySlug null when the question is about this
  site/agent itself rather than one of the projects below.
- general_greeting: greetings, "who are you", "what can you do"
- out_of_scope: anything not about Yash's portfolio (write code, general knowledge, personal questions)

entitySlug: if a specific project is named, its slug from this list, else null.
Available projects:
{{PROJECTS}}

confidence: how certain you are. Use <0.6 when the question is vague or could
match several projects (e.g. "tell me about the pipeline project" when two
projects involve pipelines).`;

async function classifyNode(state: typeof AgentState.State) {
  const question = lastHumanMessage(state.messages);
  const projects = listProjectSummaries();
  const projectList = projects
    .map((p) => `  ${p.slug} — ${p.title}`)
    .join("\n");

  let parsed: Record<string, unknown> | null = null;

  try {
    const res = await invokeRouterWithFallback([
      new SystemMessage(CLASSIFY_SYSTEM.replace("{{PROJECTS}}", projectList)),
      new HumanMessage(question),
    ]);
    parsed = parseJsonLoose(res.content, ["intent", "entitySlug", "confidence"]);
  } catch {
    parsed = null;
  }

  // A router failure must NOT fall through to `out_of_scope`.
  //
  // It used to, and the consequence was the worst possible one: out_of_scope
  // skips retrieval entirely, so the agent answered "that's not something I've
  // documented here" to questions whose answers ARE documented. Observed live
  // when Groq's daily token quota ran out — "What did he do at Emerson?" got a
  // flat denial.
  //
  // Instead, mark the router unavailable and let retrieval run UNFILTERED. The
  // turn loses intent-narrowed precision but still answers from the knowledge
  // base, which is a genuine degradation rather than a false negative.
  if (!parsed) {
    return {
      intent: undefined,
      confidence: 0.5,
      entitySlug: undefined,
      routerUnavailable: true,
    };
  }

  const rawIntent = String(parsed.intent ?? "").trim();
  const intent: Intent = (INTENTS as readonly string[]).includes(rawIntent)
    ? (rawIntent as Intent)
    : "out_of_scope";

  let confidence = Number(parsed.confidence);
  if (!Number.isFinite(confidence)) confidence = 0.5;
  confidence = Math.max(0, Math.min(1, confidence));

  // Resolve whatever the router returned against the real slug list — it
  // frequently emits a title or an invented slug.
  let entitySlug: string | undefined;
  const claimed = parsed.entitySlug;
  if (typeof claimed === "string" && claimed && claimed !== "null") {
    entitySlug = matchProjectSlug(claimed)[0]?.slug;
  }
  // Fall back to matching the question itself.
  if (!entitySlug) {
    const fromQuestion = matchProjectSlug(question);
    if (fromQuestion.length > 0 && fromQuestion[0].score >= 0.5) {
      entitySlug = fromQuestion[0].slug;
    }
  }

  return { intent, entitySlug, confidence };
}

/* -------------------------------------------------------------------------- */
/* Node: retrieve                                                             */
/* -------------------------------------------------------------------------- */

/** Map search results into the shape the graph carries. */
function toChunks(results: Awaited<ReturnType<typeof retrieveKnowledge>>): RetrievedChunk[] {
  return results.map((r) => ({
    id: r.chunk.id,
    text: r.chunk.text,
    heading: r.chunk.heading,
    documentTitle: r.chunk.documentTitle,
    sourceType: r.chunk.sourceType,
    sourceSlug: r.chunk.sourceSlug,
    sourceFile: r.chunk.sourceFile,
    score: Number(r.score.toFixed(4)),
  }));
}

async function retrieveNode(state: typeof AgentState.State) {
  const question = lastHumanMessage(state.messages);

  // Router down: search everything rather than assuming a scope we never
  // determined.
  if (state.routerUnavailable) {
    const results = await retrieveKnowledge(question, {
      topK: TOP_K,
      minScore: RELEVANCE_FLOOR,
    });
    return { retrievedChunks: toChunks(results) };
  }

  const intent = state.intent ?? "out_of_scope";

  // Don't retrieve for greetings/out-of-scope: there is nothing to ground and
  // weak matches would only tempt the model to answer from noise.
  if (intent === "out_of_scope") {
    return { retrievedChunks: [] as RetrievedChunk[] };
  }

  const sourceType = INTENT_SOURCE_TYPE[intent];

  let results = await retrieveKnowledge(question, {
    topK: TOP_K,
    sourceType,
    // When we know the project, restrict to it — this is the single biggest
    // precision win available, since project sections otherwise compete.
    sourceSlug: state.entitySlug,
    minScore: RELEVANCE_FLOOR,
  });

  // Supplement a thin filtered result with an unfiltered pass.
  //
  // Previously this only fired when the filtered search returned NOTHING, which
  // missed the more common failure: a plausible-but-narrow intent. "Has he
  // worked with SAP?" classifies as `experience` (reasonable — it asks about
  // work history), which restricts retrieval to experience.md and education.md
  // and therefore never sees the SAP BW *project* that actually answers it.
  //
  // Merging rather than replacing keeps the intent's precision advantage while
  // recovering the recall it costs.
  if (results.length < Math.ceil(TOP_K / 2) && (sourceType || state.entitySlug)) {
    const unfiltered = await retrieveKnowledge(question, {
      topK: TOP_K,
      minScore: RELEVANCE_FLOOR,
    });
    const seen = new Set(results.map((r) => r.chunk.id));
    for (const r of unfiltered) {
      if (!seen.has(r.chunk.id)) {
        results.push(r);
        seen.add(r.chunk.id);
      }
    }
    results.sort((a, b) => b.score - a.score);
    results = results.slice(0, TOP_K);
  }

  return { retrievedChunks: toChunks(results) };
}

/* -------------------------------------------------------------------------- */
/* Node: clarify                                                              */
/* -------------------------------------------------------------------------- */

/** Does this turn need a clarifying question before it can be answered? */
export function needsClarification(state: typeof AgentState.State): boolean {
  // Without classification there is no confidence signal to act on, and the
  // unfiltered retrieval above is the better recovery than asking.
  if (state.routerUnavailable) return false;

  const intent = state.intent;
  const confidence = state.confidence ?? 0;

  // A project deep-dive with no identified project cannot be answered — there
  // is no subject. This holds even at high confidence.
  if (intent === "project_deep_dive" && !state.entitySlug) return true;

  // architecture_meta deliberately does NOT require a slug: without one it is
  // a question about THIS system's architecture, which knowledge/system-
  // architecture.md answers. Forcing a clarify here would make "how does your
  // agent graph work?" ask which project the user meant.
  if (intent === "architecture_meta") return false;

  // Greetings and out-of-scope don't need a subject; asking would be absurd.
  if (intent === "general_greeting" || intent === "out_of_scope") return false;

  return confidence < CONFIDENCE_THRESHOLD;
}

function clarifyNode(state: typeof AgentState.State) {
  const question = lastHumanMessage(state.messages);

  // Offer the closest projects rather than the whole catalogue.
  const candidates = matchProjectSlug(question)
    .filter((m) => m.score > 0)
    .slice(0, 3);
  const projects = listProjectSummaries();
  const suggestions = (
    candidates.length > 0
      ? candidates.map((c) => projects.find((p) => p.slug === c.slug)!)
      : projects.slice(0, 3)
  ).filter(Boolean);

  const ask =
    suggestions.length > 0
      ? `Which would you like to hear about — ${suggestions
          .map((p) => p.title)
          .join(", ")}?`
      : "Could you tell me a bit more about what you'd like to know?";

  // interrupt() suspends the graph here. The API route surfaces the question,
  // and resuming with Command({ resume: "<reply>" }) returns that string as
  // this call's value on the replayed run.
  const reply = interrupt<string, string>(ask);

  // On resume, treat the reply as the disambiguating answer and re-resolve.
  const matched = matchProjectSlug(reply)[0];
  return {
    pendingClarification: undefined,
    entitySlug: matched?.slug ?? state.entitySlug,
    confidence: matched ? 0.9 : (state.confidence ?? 0.5),
    messages: [new HumanMessage(reply)],
  };
}

/* -------------------------------------------------------------------------- */
/* Node: act                                                                  */
/* -------------------------------------------------------------------------- */

const ACT_SYSTEM = `You gather facts for a portfolio agent. You do NOT write the
final answer — another step does that.

Call whichever tools you need to collect the structured facts required to
answer the user's question. Call several if the question spans topics. If the
retrieved excerpts below already contain everything needed, call no tools and
reply with the single word: NONE.

Never answer the question here. Only call tools.`;

/**
 * Which tool an intent needs, decided in code rather than by a model call.
 *
 * The `act` node used to be a full generation-model call whose only job was
 * picking a tool from five options — for intents that map 1:1 onto a tool
 * anyway. That doubled the model calls per turn (and therefore halved how many
 * questions the free tier can answer) to re-derive something the classifier
 * already told us.
 *
 * Returning a plan here skips that call entirely. The model is only consulted
 * when the mapping is genuinely ambiguous.
 */
function planTools(
  state: typeof AgentState.State
): { tool: string; args: Record<string, unknown> }[] | null {
  const intent = state.intent;

  switch (intent) {
    case "project_deep_dive":
    case "architecture_meta":
      // A named project resolves to exactly one lookup. Without a slug,
      // architecture_meta is about this system, which retrieval already covers.
      return state.entitySlug
        ? [{ tool: "getProject", args: { slug: state.entitySlug } }]
        : [];
    case "experience":
      return [{ tool: "getExperience", args: {} }];
    case "achievements":
      return [{ tool: "getAchievements", args: {} }];
    case "skills_query":
      return [{ tool: "getSkillsOverview", args: {} }];
    case "general_greeting":
      return [{ tool: "listProjects", args: {} }];
    case "out_of_scope":
      return [];
    default:
      // Unknown/degraded routing: let retrieval carry the turn.
      return null;
  }
}

async function actNode(state: typeof AgentState.State) {
  const question = lastHumanMessage(state.messages);
  const intent = state.intent ?? "out_of_scope";

  // Out of scope: nothing to gather. The generate node handles the redirect
  // using the rules from profile.md.
  //
  // Router unavailable: skip tool planning too. It is another model call on the
  // provider that just refused us, and generate can answer from the unfiltered
  // chunks alone.
  if (intent === "out_of_scope" || state.routerUnavailable) {
    return { toolResults: [] };
  }

  // Deterministic path: no model call at all.
  const plan = planTools(state);
  if (plan !== null) {
    const toolResults: { tool: string; data: unknown }[] = [];
    for (const step of plan) {
      const tool = agentToolsByName[step.tool] as
        | { invoke: (args: Record<string, unknown>) => Promise<unknown> }
        | undefined;
      if (!tool) continue;
      try {
        toolResults.push({ tool: step.tool, data: await tool.invoke(step.args) });
      } catch (err) {
        toolResults.push({
          tool: step.tool,
          data: { error: err instanceof Error ? err.message : String(err) },
        });
      }
    }
    return { toolResults };
  }

  // bindTools is optional on BaseChatModel; both concrete providers implement
  // it, so assert rather than guard at every call site.
  const base = getGenerationModel();
  const model = (base as unknown as {
    bindTools: (tools: typeof agentTools) => typeof base;
  }).bindTools(agentTools);

  const hint = state.entitySlug
    ? `\n\nThe user is asking about the project with slug "${state.entitySlug}".`
    : "";
  const context =
    state.retrievedChunks && state.retrievedChunks.length > 0
      ? `\n\nAlready-retrieved excerpts:\n${state.retrievedChunks
          .map((c) => `- ${c.documentTitle} > ${c.heading}`)
          .join("\n")}`
      : "";

  let response: AIMessage;
  try {
    response = (await model.invoke([
      new SystemMessage(ACT_SYSTEM + hint + context),
      new HumanMessage(question),
    ])) as AIMessage;
  } catch (err) {
    // Tool-planning failure is recoverable: generate can still answer from the
    // retrieved chunks alone. A rate limit here is expected on free tiers and
    // must not take the turn down.
    if (!isRateLimitError(err)) {
      // Non-quota failures are still worth not crashing over, but they are a
      // real signal, so record them for the generate node's context.
      return { toolResults: [{ tool: "act", data: { error: String(err) } }] };
    }
    return { toolResults: [] };
  }

  const calls = response.tool_calls ?? [];
  const toolResults: { tool: string; data: unknown }[] = [];
  const messages: BaseMessage[] = [];

  if (calls.length > 0) {
    messages.push(response);
    for (const call of calls) {
      // agentToolsByName is a Record built from a heterogeneous tool array, so
      // TS widens the value to a union whose .invoke overloads don't unify.
      // The runtime contract is simple — every entry is a LangChain tool — so
      // narrow it to that one call signature.
      const tool = agentToolsByName[call.name] as
        | { invoke: (args: Record<string, unknown>) => Promise<unknown> }
        | undefined;
      if (!tool) continue;
      try {
        const data = await tool.invoke(call.args ?? {});
        toolResults.push({ tool: call.name, data });
        messages.push(
          new ToolMessage({
            tool_call_id: call.id ?? call.name,
            name: call.name,
            content: JSON.stringify(data),
          })
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toolResults.push({ tool: call.name, data: { error: message } });
        messages.push(
          new ToolMessage({
            tool_call_id: call.id ?? call.name,
            name: call.name,
            content: JSON.stringify({ error: message }),
          })
        );
      }
    }
  }

  return { toolResults, messages };
}

/* -------------------------------------------------------------------------- */
/* Node: generate                                                             */
/* -------------------------------------------------------------------------- */

async function generateNode(state: typeof AgentState.State) {
  const question = lastHumanMessage(state.messages);
  const system = buildGenerateSystemPrompt(state.retrievedChunks, state.toolResults);

  // Prior turns give the model conversational continuity, but the grounding
  // block above is what it may draw facts from. Tool-call plumbing from `act`
  // is dropped — it is bookkeeping, not conversation.
  const history = state.messages
    .filter((m) => m.getType() === "human" || m.getType() === "ai")
    .filter((m) => !(m as AIMessage).tool_calls?.length)
    .slice(-8);

  // Falls back to the other provider on a rate limit rather than failing the
  // turn. The notice travels in state so the UI can say a fallback answered.
  const { response, notice } = await invokeGenerationWithFallback([
    new SystemMessage(system),
    ...history,
  ]);

  return { messages: [response], fallbackNotice: notice ?? undefined };
}

/* -------------------------------------------------------------------------- */
/* Graph                                                                      */
/* -------------------------------------------------------------------------- */

function routeAfterRetrieve(state: typeof AgentState.State): "clarify" | "act" {
  return needsClarification(state) ? "clarify" : "act";
}

const checkpointer = new MemorySaver();

export function buildAgentGraph() {
  const workflow = new StateGraph(AgentState)
    .addNode("classify", classifyNode)
    .addNode("retrieve", retrieveNode)
    .addNode("clarify", clarifyNode)
    // A second retrieve pass after clarification, rather than an edge back to
    // "retrieve". A cycle would re-enter routeAfterRetrieve, and a clarifying
    // reply that still matches no project would loop forever. A distinct node
    // makes termination structural instead of dependent on the reply.
    .addNode("retrieveAfterClarify", retrieveNode)
    .addNode("act", actNode)
    .addNode("generate", generateNode)
    .addEdge(START, "classify")
    .addEdge("classify", "retrieve")
    .addConditionalEdges("retrieve", routeAfterRetrieve, {
      clarify: "clarify",
      act: "act",
    })
    // Re-retrieve after clarify: the user's reply changed the subject, so the
    // first pass used the wrong project filter (or none).
    .addEdge("clarify", "retrieveAfterClarify")
    .addEdge("retrieveAfterClarify", "act")
    .addEdge("act", "generate")
    .addEdge("generate", END);

  return workflow.compile({ checkpointer });
}

let cachedGraph: ReturnType<typeof buildAgentGraph> | null = null;

/** Compiled graph, shared across requests. The MemorySaver inside it is what
 *  makes multi-turn conversations work, so it must not be rebuilt per call. */
export function getAgentGraph() {
  if (!cachedGraph) cachedGraph = buildAgentGraph();
  return cachedGraph;
}

/**
 * Stream a turn through the graph.
 *
 * LangGraph's `.stream()` overloads are keyed on a literal `streamMode`, and
 * with a multi-mode tuple TypeScript resolves to an overload it does not
 * consider iterable — even though the runtime yields `[mode, payload]` pairs
 * exactly as documented. Rather than repeat that cast at every call site
 * (route, eval harness, tests), it is made once here, where the reason can be
 * written down.
 */
export type AgentStreamEvent = [string, unknown];

export function streamAgent(
  input: unknown,
  config: {
    configurable: { thread_id: string };
    streamMode: readonly string[];
    recursionLimit?: number;
  }
): Promise<AsyncIterable<AgentStreamEvent>> {
  const graph = getAgentGraph() as unknown as {
    stream: (i: unknown, c: unknown) => Promise<AsyncIterable<AgentStreamEvent>>;
  };
  return graph.stream(input, config);
}

/** Warm the pieces that lazy-load, so the first real request isn't slow.
 *  Also fails fast if profile.md lost its behavior section. */
export function assertAgentReady(): void {
  loadAgentBehaviorPrompt();
  listProjectSummaries();
}
