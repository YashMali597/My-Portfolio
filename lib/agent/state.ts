// Graph state for the portfolio agent.
//
// `messages` uses LangGraph's built-in reducer so each node can return only
// the messages it added rather than the whole history. Every other field is
// last-write-wins, which is what we want — each turn re-classifies and
// re-retrieves rather than accumulating stale intent from earlier turns.

import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";
import type { SourceType } from "../knowledge/loader";

export const INTENTS = [
  "project_deep_dive",
  "experience",
  "achievements",
  "skills_query",
  "architecture_meta",
  "general_greeting",
  "out_of_scope",
] as const;

export type Intent = (typeof INTENTS)[number];

/** A retrieved chunk as it travels through the graph (no embedding vector). */
export interface RetrievedChunk {
  id: string;
  text: string;
  heading: string;
  documentTitle: string;
  sourceType: SourceType;
  sourceSlug: string;
  sourceFile: string;
  score: number;
}

export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),

  /** Set by the classify node. */
  intent: Annotation<Intent | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),

  /** Project slug, when the question is about one specific project. */
  entitySlug: Annotation<string | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),

  /** Router confidence in [0, 1]. Drives the clarify branch. */
  confidence: Annotation<number | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),

  /** Top chunks from the retrieve node. */
  retrievedChunks: Annotation<RetrievedChunk[] | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),

  /** The question the clarify node asked, if the graph interrupted. */
  pendingClarification: Annotation<string | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),

  /** True when the router was unavailable (rate limited / errored) and the
   *  turn is running without intent classification. */
  routerUnavailable: Annotation<boolean | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),

  /** Set when a fallback model answered because the primary was rate limited.
   *  Surfaced to the user rather than masked. */
  fallbackNotice: Annotation<{ model: string; provider: string; reason: string } | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),

  /** Structured tool output from the act node, passed to generate. */
  toolResults: Annotation<{ tool: string; data: unknown }[] | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),
});

export type AgentStateType = typeof AgentState.State;

/**
 * Which slice of the knowledge base each intent should retrieve from.
 * `undefined` means search everything.
 *
 * Note `skills_query` searches projects rather than skills.md: skills are
 * evidenced by the projects that used them, so the useful chunks are the
 * project narratives, not the skill list itself.
 */
export const INTENT_SOURCE_TYPE: Record<Intent, SourceType | SourceType[] | undefined> = {
  project_deep_dive: "project",
  experience: ["experience", "education"],
  achievements: "achievement",
  skills_query: ["project", "skills"],
  // Covers BOTH "how does your agent work" (the system doc) and "how was
  // project X built" (the project's Architecture section). Which one it means
  // is decided by whether classify resolved an entitySlug.
  architecture_meta: ["system", "project"],
  // "profile" only, NOT "system". A greeting like "what can you do?" should
  // introduce Yash's work, not volunteer this site's own internals — the
  // /system page is deliberately unpublished. Architecture is still fully
  // answerable, but only when someone asks for it directly, which routes to
  // architecture_meta above.
  general_greeting: "profile",
  out_of_scope: undefined,
};
