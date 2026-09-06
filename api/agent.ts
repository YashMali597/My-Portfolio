// POST /api/agent — streams the LangGraph agent as Server-Sent Events.
//
// RUNTIME: Node, not Edge. This is forced, not a preference:
//   - @xenova/transformers runs onnxruntime, which needs Node APIs and WASM
//     filesystem access that the Edge runtime does not provide.
//   - lib/knowledge/loader.ts and search.ts read /knowledge and index.json
//     from disk via node:fs.
// The older /api/copilot.ts is Edge because it calls a hosted embedding API
// instead. Don't copy its `runtime: "edge"` here.
//
// Deployment note: the /knowledge markdown and lib/knowledge/index.json must
// be present in the serverless bundle — see includeFiles in vercel.json.
//
// Frame types emitted:
//   { type: "node",        name }             before each graph node runs
//   { type: "tool_result", tool, data }       when a tool resolves
//   { type: "clarify",     question }         graph interrupted, awaiting reply
//   { type: "notice",      text }              e.g. a fallback model answered
//   { type: "token",       text }             a piece of the final answer
//   { type: "error",       message }          recoverable problem
//   { type: "done",        sessionId }        stream finished

import type { IncomingMessage, ServerResponse } from "node:http";
import { HumanMessage, AIMessage, type BaseMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { streamAgent } from "../lib/agent/graph";
import { checkModelEnv } from "../lib/agent/config";
import { checkRateLimit, rateLimitMessage } from "../lib/agent/rateLimit";
import { sanitizeMessage, sanitizeSessionId, MAX_MESSAGE_LENGTH } from "../lib/agent/sanitize";

export const config = { runtime: "nodejs" };

interface AgentRequestBody {
  message?: string;
  sessionId?: string;
  /** Set when the client is answering a clarify interrupt. */
  resume?: boolean;
}

/** Node names surfaced to the client, in execution order. */
const PUBLIC_NODES = new Set([
  "classify",
  "retrieve",
  "clarify",
  "retrieveAfterClarify",
  "act",
  "generate",
]);

function sseFrame(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

async function readJsonBody(req: IncomingMessage): Promise<AgentRequestBody> {
  // Vercel usually pre-parses the body; fall back to reading the stream.
  const anyReq = req as IncomingMessage & { body?: unknown };
  if (anyReq.body && typeof anyReq.body === "object") {
    return anyReq.body as AgentRequestBody;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw) as AgentRequestBody;
  } catch {
    return {};
  }
}

export default async function handler(
  req: IncomingMessage & { method?: string },
  res: ServerResponse
) {
  if (req.method !== "POST") {
    res.writeHead(405, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed. Use POST." }));
    return;
  }

  const body = await readJsonBody(req);

  const clean = sanitizeMessage(body.message);
  const sessionId = sanitizeSessionId(body.sessionId);

  const reject = (status: number, error: string, extra: Record<string, unknown> = {}) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify({ error, ...extra }));
  };

  if (!clean.ok) {
    reject(400, clean.error ?? "Invalid message.");
    return;
  }
  if (!sessionId) {
    reject(
      400,
      "`sessionId` is required and must be 8-128 characters of A-Z, a-z, 0-9, _ or -."
    );
    return;
  }

  // Quota protection. The keys behind this endpoint are free tier; one visitor
  // holding down enter would otherwise exhaust the day for everyone.
  const clientIp =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    (req.socket?.remoteAddress ?? "unknown");

  const limit = checkRateLimit(sessionId, clientIp);
  if (!limit.allowed) {
    res.writeHead(429, {
      "content-type": "application/json",
      "retry-after": String(limit.retryAfter),
    });
    res.end(
      JSON.stringify({ error: rateLimitMessage(limit), retryAfter: limit.retryAfter })
    );
    return;
  }

  const env = checkModelEnv();
  if (!env.ok) {
    // Log the specifics for the operator; tell the visitor only that the
    // service is unavailable. Naming the missing variables in a public
    // response leaks how the server is configured.
    console.error(
      `[/api/agent] refusing requests: missing ${env.missing.join(" and ")}. See .env.example.`
    );
    reject(503, "The agent is not available right now. Please try again later.");
    return;
  }

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    // Proxies that buffer will otherwise defeat the whole point of streaming.
    "x-accel-buffering": "no",
  });

  const send = (payload: unknown) => {
    if (!res.writableEnded) res.write(sseFrame(payload));
  };

  try {
    const threadConfig = {
      configurable: { thread_id: sessionId },
      streamMode: ["updates", "messages"],
      // Cheap guard against a pathological loop burning the whole rate limit.
      recursionLimit: 25,
    };

    // A `resume: true` request is the reply to a clarify interrupt: feed it
    // back into the suspended run rather than starting a new turn.
    const input = body.resume
      ? new Command({ resume: clean.text })
      : { messages: [new HumanMessage(clean.text)] };

    // Tell the user their input was cut rather than silently answering a
    // truncated question.
    if (clean.truncated) {
      send({
        type: "notice",
        text: `Your message was truncated to ${MAX_MESSAGE_LENGTH} characters.`,
      });
    }

    let sawClarify = false;
    const seenToolResults = new Set<string>();

    for await (const [mode, payload] of await streamAgent(input, threadConfig)) {
      /* ------------------------------------------------ node + tool frames */
      if (mode === "updates") {
        const updates = payload as Record<string, any>;

        for (const [nodeName, nodeState] of Object.entries(updates)) {
          if (nodeName === "__interrupt__") {
            const interrupts = nodeState as { value?: unknown }[];
            const question = interrupts?.[0]?.value;
            if (typeof question === "string") {
              sawClarify = true;
              send({ type: "clarify", question });
            }
            continue;
          }

          if (PUBLIC_NODES.has(nodeName)) {
            send({ type: "node", name: nodeName });
          }

          // Routing degraded: say so rather than letting the answer look
          // authoritative when it was produced without intent classification.
          if (nodeState?.routerUnavailable) {
            send({
              type: "notice",
              text: "The routing model is rate limited — answering from a broader search of the knowledge base, which may be less precise.",
            });
          }

          // A fallback model answered because the primary was rate limited.
          // Surfaced, never masked — the fallback is a smaller model and its
          // answers may differ noticeably.
          const fallback = nodeState?.fallbackNotice;
          if (fallback?.model) {
            send({
              type: "notice",
              text: `Answered via fallback model (${fallback.model}) — the primary model is rate limited.`,
            });
          }

          // Surface tool output as it resolves, so the UI can render a card
          // for a project before the prose arrives.
          const results = nodeState?.toolResults as
            | { tool: string; data: unknown }[]
            | undefined;
          if (Array.isArray(results)) {
            for (const r of results) {
              const key = `${r.tool}:${JSON.stringify(r.data).slice(0, 200)}`;
              if (seenToolResults.has(key)) continue;
              seenToolResults.add(key);
              send({ type: "tool_result", tool: r.tool, data: r.data });
            }
          }
        }
        continue;
      }

      /* ----------------------------------------------------- token frames */
      if (mode === "messages") {
        const [chunk, meta] = payload as [BaseMessage, { langgraph_node?: string }];
        // Only the generate node's output is the answer. The act node's
        // tool-planning tokens and the router's JSON must never reach the user.
        if (meta?.langgraph_node !== "generate") continue;

        const content = (chunk as AIMessage)?.content;
        const text =
          typeof content === "string"
            ? content
            : Array.isArray(content)
              ? content
                  .map((c: any) => (typeof c === "string" ? c : (c?.text ?? "")))
                  .join("")
              : "";
        if (text) send({ type: "token", text });
      }
    }

    send({ type: "done", sessionId, clarifying: sawClarify });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);

    // Never forward a provider's raw payload. Groq's 429 body embeds the
    // organization id, and other providers include request ids and internal
    // URLs. Log the detail for the operator; send the visitor a sentence.
    console.error(`[/api/agent] turn failed: ${raw}`);

    const message = /429|rate.?limit|quota|resource.?exhausted/i.test(raw)
      ? "The agent has hit its usage limit for now. This site runs on free-tier model quotas — please try again shortly."
      : /503|high demand|unavailable/i.test(raw)
        ? "The model provider is temporarily unavailable. Please try again in a moment."
        : "Something went wrong while answering. Please try again.";

    send({ type: "error", message });
    send({ type: "done", sessionId });
  } finally {
    if (!res.writableEnded) res.end();
  }
}
