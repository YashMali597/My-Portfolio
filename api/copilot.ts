// Vercel Edge Function: POST /api/copilot
// Retrieves the most relevant chunks of real portfolio content for a query,
// then asks Claude to answer grounded in that context, streaming the answer
// back to the client as newline-delimited JSON events:
//   {"type":"phase","phase":"retrieving"}   - embedding + similarity search in flight
//   {"type":"phase","phase":"thinking"}     - waiting on Claude's first token
//   {"type":"token","text":"..."}           - a chunk of the answer
//   {"type":"error","message":"..."}        - a recoverable problem, answer continues
//   {"type":"done"}                          - stream finished
import Anthropic from "@anthropic-ai/sdk";
import { corpus } from "../src/lib/rag/corpus";
import embeddings from "../src/lib/rag/embeddings.json";
import { embedText } from "../src/lib/rag/embed";
import { cosineSimilarity } from "../src/lib/rag/search";
import { checkRateLimit } from "../src/lib/rag/rateLimit";
import { profile } from "../src/data/site-content";

export const config = { runtime: "edge" };

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "[api/copilot] ANTHROPIC_API_KEY is not set — every request to /api/copilot will fail until it's configured (e.g. in .env.local for local dev, or the project's environment variables in Vercel)."
  );
}

const MODEL = "claude-opus-5";
const MAX_TOKENS = 600;
const TOP_K = 8;
const MAX_QUERY_LENGTH = 1000;
const MAX_HISTORY_TURNS = 6;

const SYSTEM_PROMPT = `You are a guide embedded in ${profile.name}'s portfolio website. You help visitors — mostly recruiters and engineers — understand ${profile.name}'s projects, work experience, education, skills, and achievements.

Rules:
- Answer using ONLY the retrieved context below, plus general technical knowledge needed to explain concepts (e.g. what a medallion architecture is, what RAG means). Never invent specific facts, numbers, dates, employers, achievements, or claims about ${profile.name}'s work that aren't in the context.
- If the retrieved context doesn't cover what's being asked, say so honestly rather than guessing — e.g. "That's not something covered in this portfolio, but I can tell you about..." This applies to achievements too: if asked about an achievement, award, or recognition that isn't in the retrieved context, say plainly that it isn't something you have on record — never invent one.
- When you state a fact from the context, mention which project, role, or achievement it came from (e.g. "At Emerson, ..." or "In the Commodity Intelligence Platform, ..."). A project's pipeline stages may appear in context as their own entries (e.g. "Commodity Intelligence Platform — Silver — Cleansed") — use them to go into real depth on a specific stage when asked, not just the project's one-line summary.
- When an achievement is relevant, mention it and link to the original LinkedIn post using the exact URL given in that chunk's context (shown as "LinkedIn: <url>") — format it as a normal markdown link, e.g. [View on LinkedIn](https://...). Only ever use a URL that appears verbatim in the retrieved context; never invent, guess, or reconstruct one.
- Politely decline requests unrelated to this portfolio (writing unrelated code, general chit-chat, unrelated advice) and redirect back to what you can help with: this portfolio's projects, experience, skills, and achievements.
- Keep answers concise — a few sentences, not an essay.`;

function encodeLine(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(obj)}\n`);
}

interface RequestBody {
  query?: string;
  history?: Array<{ role: string; content: string }>;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (!checkRateLimit(ip).allowed) {
    return new Response(
      JSON.stringify({ error: "Too many requests — try again in a moment." }),
      { status: 429, headers: { "content-type": "application/json" } }
    );
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const query = body.query?.trim();
  if (!query) {
    return new Response(JSON.stringify({ error: "Missing query" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return new Response(JSON.stringify({ error: "Query is too long" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const history = Array.isArray(body.history)
    ? body.history
        .filter(
          (turn) =>
            turn &&
            (turn.role === "user" || turn.role === "assistant") &&
            typeof turn.content === "string" &&
            turn.content.trim()
        )
        .slice(-MAX_HISTORY_TURNS)
    : [];

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encodeLine({ type: "phase", phase: "retrieving" }));

      let contextBlock = "";
      try {
        const queryVector = await embedText(query);
        const vectors = embeddings as { id: string; vector: number[] }[];
        const scored = vectors.map((e) => ({
          id: e.id,
          score: cosineSimilarity(queryVector, e.vector),
        }));
        scored.sort((a, b) => b.score - a.score);
        const topIds = new Set(scored.slice(0, TOP_K).map((s) => s.id));
        const topChunks = corpus.filter((c) => topIds.has(c.id));
        contextBlock = topChunks
          .map((c) => {
            const linkSuffix = c.linkedinUrl ? ` (LinkedIn: ${c.linkedinUrl})` : "";
            return `[${c.source}] ${c.text}${linkSuffix}`;
          })
          .join("\n\n");
      } catch (err) {
        console.error("[api/copilot] retrieval failed:", err);
        controller.enqueue(
          encodeLine({
            type: "error",
            message: "Retrieval is temporarily unavailable — answering from general knowledge only.",
          })
        );
      }

      controller.enqueue(encodeLine({ type: "phase", phase: "thinking" }));

      try {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        const claudeStream = anthropic.messages.stream({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: `${SYSTEM_PROMPT}\n\nRetrieved portfolio context:\n${contextBlock || "(no matching context found for this query)"}`,
          messages: [
            ...history.map((turn) => ({
              role: turn.role as "user" | "assistant",
              content: turn.content,
            })),
            { role: "user" as const, content: query },
          ],
        });

        for await (const event of claudeStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encodeLine({ type: "token", text: event.delta.text }));
          }
        }

        const finalMessage = await claudeStream.finalMessage();
        if (finalMessage.stop_reason === "refusal") {
          controller.enqueue(
            encodeLine({
              type: "token",
              text: "I can't help with that one, but I'm happy to talk through the projects, experience, or skills on this portfolio.",
            })
          );
        }
      } catch (err) {
        console.error("[api/copilot] Claude request failed:", err);
        controller.enqueue(
          encodeLine({
            type: "error",
            message: "The assistant is temporarily unavailable. Please try again shortly.",
          })
        );
      }

      controller.enqueue(encodeLine({ type: "done" }));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8" },
  });
}
