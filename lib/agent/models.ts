// Model layer for the portfolio agent.
//
// Both factories return LangChain `BaseChatModel` instances, so every consumer
// — including the LangGraph graph built in a later prompt — talks to the same
// `.invoke()` / `.stream()` / `.bindTools()` surface and never learns which
// provider is underneath. Swapping Groq for another provider should mean
// editing this file and nothing else.
//
// The split is deliberate:
//   router     -> Groq / Llama 8B   : cheap, fast, deterministic classification
//   generation -> Gemini Flash      : long context, tool use, final synthesis

import { ChatGroq } from "@langchain/groq";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import type { AIMessageChunk } from "@langchain/core/messages";
import { getGoogleApiKey, getGroqApiKey } from "./config";

/**
 * Small, fast model on Groq. Instant-tier latency is the whole reason this
 * model exists in the stack — routing runs on every turn, so it must not add
 * perceptible delay.
 *
 * NOTE: llama-3.1-8b-instant was retired and is no longer served on this
 * account. `GET https://api.groq.com/openai/v1/models` lists what is currently
 * available if this starts returning model_not_found.
 */
export const ROUTER_MODEL = "openai/gpt-oss-20b";

/**
 * Gemini Flash tier: large context window, tool calling, and a free tier
 * generous enough to develop against.
 *
 * NOTE: gemini-2.0-flash was retired — the API now returns 404 for it and
 * points at this model. Flash-tier model ids move; if generation starts 404ing,
 * the error message names the current replacement.
 */
export const GENERATION_MODEL = "openai/gpt-oss-120b";

/**
 * Default provider for generation.
 *
 * Groq, not Google — measured, not assumed:
 *
 *   Groq   gpt-oss-120b : 1,000 requests/day, 200,000 tokens/day
 *   Gemini gemini-3.6-flash :    20 requests/DAY (free tier)
 *
 * At ~3.2k tokens per turn that is ~60 answers/day on Groq versus ~10 on
 * Gemini. Groq also meters quota PER MODEL, so putting the router and the
 * generator on different Groq models gives each its own 200k bucket instead of
 * making them compete for one.
 */
export const GENERATION_PROVIDER_DEFAULT: "google" | "groq" = "groq";

/**
 * `reasoning_effort` is not portable across Groq models: the gpt-oss family
 * requires `low` | `medium` | `high` and rejects anything else, while other
 * families (qwen) require `none` | `default` and reject those. Sending the
 * wrong one is a hard 400, which took down every turn that fell through to a
 * non-gpt-oss fallback model.
 *
 * Only send it where it is known-valid; omit it elsewhere and take the
 * provider default.
 */
function reasoningEffortFor(model: string): "low" | undefined {
  return /gpt-oss/.test(model) ? "low" : undefined;
}

export interface ModelOverrides {
  /** Override the model id (e.g. to try a larger model or a different tier). */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Override which provider serves generation. See GENERATION_PROVIDER below. */
  provider?: "google" | "groq";
}

/**
 * Environment overrides.
 *
 * These exist because provider free tiers are the binding constraint, not the
 * architecture. Gemini's free tier caps `generateContent` at 20 requests PER
 * DAY, which one eval run exhausts many times over — so the eval harness needs
 * to be able to pin generation to a provider with headroom without editing
 * code or changing the deployed default.
 *
 * ADR-002's reasoning is unchanged: routing wants a fast small model,
 * generation wants context and tool calling. This only changes which vendor
 * supplies the second one for a given run.
 */
const ENV_ROUTER_MODEL = process.env.ROUTER_MODEL_ID?.trim();
const ENV_GENERATION_MODEL = process.env.GENERATION_MODEL_ID?.trim();
const ENV_GENERATION_PROVIDER = process.env.GENERATION_PROVIDER?.trim() as
  | "google"
  | "groq"
  | undefined;

/** Which models a given run actually used — recorded in eval results. */
export function activeModels() {
  return {
    router: ENV_ROUTER_MODEL ?? ROUTER_MODEL,
    routerProvider: "groq" as const,
    generation: ENV_GENERATION_MODEL ?? GENERATION_MODEL,
    generationProvider: ENV_GENERATION_PROVIDER ?? GENERATION_PROVIDER_DEFAULT,
  };
}

/**
 * Low-latency classification model.
 *
 * Temperature 0: routing decisions must be stable. The same question asked
 * twice should take the same branch, otherwise the graph's behavior is not
 * reproducible and failures become impossible to debug.
 *
 * Token cap is deliberately small — a router emits a label or a short JSON
 * object, never prose. Capping it is a cheap guard against a misbehaving
 * prompt burning the rate limit on a runaway generation.
 */
export function getRouterModel(overrides: ModelOverrides = {}): BaseChatModel {
  const routerModel = overrides.model ?? ENV_ROUTER_MODEL ?? ROUTER_MODEL;
  return new ChatGroq({
    apiKey: getGroqApiKey(),
    model: routerModel,
    temperature: overrides.temperature ?? 0,
    // 1536, not 512.
    //
    // gpt-oss is a REASONING model: its chain of thought is billed against the
    // same completion budget as its answer. At 512 the reasoning consumed the
    // entire allowance and the model returned an EMPTY content string — which
    // the graph read as a parse failure and fell back to `out_of_scope` with
    // confidence 0.3. Questions like "Why Direct Lake instead of import mode?"
    // were being silently dropped as out-of-scope, retrieving nothing.
    maxTokens: overrides.maxTokens ?? 1536,
    // Routing is a labelling task; deep deliberation buys nothing here and only
    // eats the budget and the latency this model was chosen for.
    reasoningEffort: reasoningEffortFor(routerModel),
    // One retry: routing is on the hot path, so fail fast rather than making
    // the user wait through a long backoff chain.
    maxRetries: 1,
  });
}

/**
 * Answer synthesis and tool-use reasoning.
 *
 * Temperature 0.3: high enough that answers read like prose rather than
 * template output, low enough that the model stays anchored to the retrieved
 * knowledge-base context instead of embroidering on it. Grounding matters more
 * than variety here — this model speaks for a real person's portfolio.
 */
export function getGenerationModel(overrides: ModelOverrides = {}): BaseChatModel {
  const provider = overrides.provider ?? ENV_GENERATION_PROVIDER ?? GENERATION_PROVIDER_DEFAULT;
  const model = overrides.model ?? ENV_GENERATION_MODEL ?? GENERATION_MODEL;
  const temperature = overrides.temperature ?? 0.3;

  if (provider === "groq") {
    return new ChatGroq({
      apiKey: getGroqApiKey(),
      model,
      temperature,
      // 4096, not 2048. Groq's gpt-oss models are REASONING models and bill
      // their chain of thought against the completion budget — the same trap
      // that made the router return empty strings. At 2048 the generation node
      // intermittently produced an empty answer with no error, which the eval
      // recorded as "answer empty or too short".
      maxTokens: overrides.maxTokens ?? 4096,
      reasoningEffort: reasoningEffortFor(model),
      maxRetries: 2,
    });
  }

  return new ChatGoogleGenerativeAI({
    apiKey: getGoogleApiKey(),
    model,
    temperature,
    maxOutputTokens: overrides.maxTokens ?? 2048,
    maxRetries: 2,
  });
}

/* -------------------------------------------------------------------------- */
/* Provider fallback                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Model used when the primary generation provider is rate limited.
 *
 * This is not hypothetical insurance. Gemini's free tier allows ~20
 * generateContent requests per DAY per model — a handful of real visitors
 * exhausts it, after which every answer would fail. Falling back to Groq keeps
 * the site answering.
 */
export const FALLBACK_GENERATION_MODEL = "gemini-3.6-flash";

/**
 * Ordered fallback chain, each entry on an INDEPENDENT quota bucket.
 *
 * Groq meters per model and Google per project, so a chain across different
 * models and providers survives far more traffic than retrying one model.
 * Ordered by capacity, then quality.
 */
const FALLBACK_CHAIN: { provider: "google" | "groq"; model: string }[] = [
  { provider: "groq", model: "openai/gpt-oss-120b" },
  { provider: "google", model: "gemini-3.6-flash" },
  { provider: "groq", model: "qwen/qwen3.6-27b" },
  { provider: "groq", model: "openai/gpt-oss-20b" },
];

/**
 * Ordered router chain, each on an independent quota bucket.
 *
 * The router had no fallback and became the single point of failure once
 * generation had one: when gpt-oss-20b hit its tokens-per-day cap, every turn
 * degraded to unclassified even though other models were free.
 */
const ROUTER_CHAIN: { provider: "google" | "groq"; model: string }[] = [
  { provider: "groq", model: "openai/gpt-oss-20b" },
  { provider: "groq", model: "qwen/qwen3.6-27b" },
  { provider: "groq", model: "openai/gpt-oss-120b" },
  { provider: "google", model: "gemini-3.6-flash" },
];

/**
 * Classify with fallback. Returns the raw content plus which model produced it.
 * Throws only when every bucket is exhausted — the graph then degrades to
 * unfiltered retrieval rather than claiming things are undocumented.
 */
export async function invokeRouterWithFallback(
  messages: BaseLanguageModelInput
): Promise<{ content: string; model: string; usedFallback: boolean }> {
  const primary = ENV_ROUTER_MODEL ?? ROUTER_MODEL;
  const chain = [
    { provider: "groq" as const, model: primary },
    ...ROUTER_CHAIN.filter((c) => c.model !== primary),
  ];

  let lastError: unknown;
  for (const [i, candidate] of chain.entries()) {
    try {
      const model =
        candidate.provider === "groq"
          ? new ChatGroq({
              apiKey: getGroqApiKey(),
              model: candidate.model,
              temperature: 0,
              maxTokens: 1536,
              reasoningEffort: reasoningEffortFor(candidate.model),
              maxRetries: 1,
            })
          : new ChatGoogleGenerativeAI({
              apiKey: getGoogleApiKey(),
              model: candidate.model,
              temperature: 0,
              maxOutputTokens: 1536,
              maxRetries: 1,
            });

      const res = await model.invoke(messages);
      return { content: String(res.content), model: candidate.model, usedFallback: i > 0 };
    } catch (err) {
      lastError = err;
      if (!isRateLimitError(err)) throw err;
    }
  }
  throw lastError;
}

/** Is this error a rate limit / quota exhaustion rather than a real fault? */
export function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b429\b|rate.?limit|quota|resource.?exhausted|too many requests|high demand|\b503\b/i.test(
    msg
  );
}

export interface FallbackNotice {
  /** Model that actually produced the answer. */
  model: string;
  provider: "google" | "groq";
  reason: string;
}

/**
 * Invoke the generation model, transparently falling back to the other
 * provider on a rate-limit error.
 *
 * Returns which model answered so the caller can tell the user. Silently
 * masking a fallback would be the wrong call on a site whose whole premise is
 * showing how the machine works — and it matters practically too, since the
 * fallback model is smaller and its answers may be noticeably different.
 */
export async function invokeGenerationWithFallback(
  messages: BaseLanguageModelInput,
  overrides: ModelOverrides = {}
): Promise<{ response: AIMessageChunk; notice: FallbackNotice | null }> {
  const primaryProvider = overrides.provider ?? ENV_GENERATION_PROVIDER ?? GENERATION_PROVIDER_DEFAULT;

  try {
    const response = (await getGenerationModel(overrides).invoke(
      messages
    )) as AIMessageChunk;
    return { response, notice: null };
  } catch (err) {
    if (!isRateLimitError(err)) throw err;

    // Walk the chain, skipping the bucket that just refused us. Each attempt
    // is a different model and/or provider, so a rate limit on one says
    // nothing about the next.
    const primaryModel = overrides.model ?? ENV_GENERATION_MODEL ?? GENERATION_MODEL;
    let lastError: unknown = err;

    for (const candidate of FALLBACK_CHAIN) {
      if (candidate.provider === primaryProvider && candidate.model === primaryModel) {
        continue; // the bucket that just failed
      }
      try {
        const response = (await getGenerationModel({
          ...overrides,
          provider: candidate.provider,
          model: candidate.model,
        }).invoke(messages)) as AIMessageChunk;

        return {
          response,
          notice: {
            model: candidate.model,
            provider: candidate.provider,
            reason: "primary model rate limited",
          },
        };
      } catch (fallbackErr) {
        lastError = fallbackErr;
        // Only keep walking on quota errors; a real fault should surface.
        if (!isRateLimitError(fallbackErr)) throw fallbackErr;
      }
    }

    throw lastError;
  }
}
