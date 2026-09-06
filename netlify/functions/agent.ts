// Netlify Function: POST /api/agent
//
// The Vite site calls /api/agent, but Netlify does not deploy top-level
// Vercel-style api/*.ts files. This fetch-handler wrapper mirrors api/agent.ts
// using Netlify's native Request -> Response function shape.

import { HumanMessage, AIMessage, type BaseMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { streamAgent } from "../../lib/agent/graph";
import { checkModelEnv } from "../../lib/agent/config";
import { checkRateLimit, rateLimitMessage } from "../../lib/agent/rateLimit";
import { sanitizeMessage, sanitizeSessionId, MAX_MESSAGE_LENGTH } from "../../lib/agent/sanitize";

interface AgentRequestBody {
  message?: string;
  sessionId?: string;
  resume?: boolean;
}

const PUBLIC_NODES = new Set([
  "classify",
  "retrieve",
  "clarify",
  "retrieveAfterClarify",
  "act",
  "generate",
]);

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status });
}

function sseFrame(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

async function readJsonBody(req: Request): Promise<AgentRequestBody> {
  try {
    return (await req.json()) as AgentRequestBody;
  } catch {
    return {};
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed. Use POST." });
  }

  const body = await readJsonBody(req);
  const clean = sanitizeMessage(body.message);
  const sessionId = sanitizeSessionId(body.sessionId);

  if (!clean.ok) {
    return jsonResponse(400, { error: clean.error ?? "Invalid message." });
  }
  if (!sessionId) {
    return jsonResponse(400, {
      error: "`sessionId` is required and must be 8-128 characters of A-Z, a-z, 0-9, _ or -.",
    });
  }

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = checkRateLimit(sessionId, clientIp);
  if (!limit.allowed) {
    return Response.json(
      { error: rateLimitMessage(limit), retryAfter: limit.retryAfter },
      {
        status: 429,
        headers: { "retry-after": String(limit.retryAfter) },
      }
    );
  }

  const env = checkModelEnv();
  if (!env.ok) {
    console.error(
      `[/api/agent] refusing requests: missing ${env.missing.join(" and ")}. See .env.example.`
    );
    return jsonResponse(503, {
      error: "The agent is not available right now. Please try again later.",
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(sseFrame(payload));
      };

      try {
        const threadConfig = {
          configurable: { thread_id: sessionId },
          streamMode: ["updates", "messages"],
          recursionLimit: 25,
        };

        const input = body.resume
          ? new Command({ resume: clean.text })
          : { messages: [new HumanMessage(clean.text)] };

        if (clean.truncated) {
          send({
            type: "notice",
            text: `Your message was truncated to ${MAX_MESSAGE_LENGTH} characters.`,
          });
        }

        let sawClarify = false;
        const seenToolResults = new Set<string>();

        for await (const [mode, payload] of await streamAgent(input, threadConfig)) {
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

              if (nodeState?.routerUnavailable) {
                send({
                  type: "notice",
                  text: "The routing model is rate limited - answering from a broader search of the knowledge base, which may be less precise.",
                });
              }

              const fallback = nodeState?.fallbackNotice;
              if (fallback?.model) {
                send({
                  type: "notice",
                  text: `Answered via fallback model (${fallback.model}) - the primary model is rate limited.`,
                });
              }

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

          if (mode === "messages") {
            const [chunk, meta] = payload as [BaseMessage, { langgraph_node?: string }];
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
        console.error(`[/api/agent] turn failed: ${raw}`);

        const message = /429|rate.?limit|quota|resource.?exhausted/i.test(raw)
          ? "The agent has hit its usage limit for now. This site runs on free-tier model quotas - please try again shortly."
          : /\b503\b|high demand|unavailable/i.test(raw)
            ? "The model provider is temporarily unavailable. Please try again in a moment."
            : "Something went wrong while answering. Please try again.";

        send({ type: "error", message });
        send({ type: "done", sessionId });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
