// Client-side hook driving the agent console.
//
// CLIENT-ONLY. Everything else in lib/agent/ is server code that imports
// node:fs — this file must never import from graph.ts, tools.ts, or loader.ts,
// or Vite will try to bundle the filesystem into the browser. It talks to the
// agent solely over /api/agent.

import { useCallback, useRef, useState, useEffect } from "react";

export type NodeName =
  | "classify"
  | "retrieve"
  | "clarify"
  | "retrieveAfterClarify"
  | "act"
  | "generate";

/** A rendered block inside an agent message: prose or a tool-driven component. */
export type UiBlock =
  | { kind: "text"; text: string }
  | { kind: "tool"; tool: string; data: unknown; id: string };

export interface AgentMessage {
  id: string;
  role: "user" | "agent";
  blocks: UiBlock[];
  /** Honest status notes, e.g. "answered via fallback model". Never masked. */
  notices?: string[];
  /** Present when this message is a clarifying question from the graph. */
  clarify?: { question: string; options: string[] };
  /** Still receiving tokens. */
  streaming?: boolean;
  error?: string;
}

export interface UseAgentStreamResult {
  messages: AgentMessage[];
  activeNodes: NodeName[];
  /** Nodes that have finished this turn — lets the trace panel show progress. */
  completedNodes: NodeName[];
  isStreaming: boolean;
  pendingClarification: string | null;
  sendMessage: (text: string) => Promise<void>;
  stop: () => void;
  reset: () => void;
  /** Re-send the last user message. Null when there is nothing to retry. */
  retry: (() => void) | null;
  error: string | null;
}

/**
 * Hard ceiling on a single turn. The graph can legitimately take ~30s when the
 * provider is slow, but without a bound a stalled connection leaves a spinner
 * running forever, which is the worst possible failure mode.
 */
const REQUEST_TIMEOUT_MS = 90_000;

const SESSION_COOKIE = "agent_session_id";

/** Stable per-visitor session id, so the graph's checkpointer can resume a
 *  paused run and keep multi-turn context across page navigations. */
function getSessionId(): string {
  if (typeof document === "undefined") return "ssr";

  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`)
  );
  if (match) return decodeURIComponent(match[1]);

  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // Session-scoped rather than permanent: the server's MemorySaver is in-process
  // and does not survive a cold start, so a long-lived cookie would point at a
  // thread the server has already forgotten.
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=86400; samesite=lax`;
  return id;
}

let uid = 0;
const nextId = () => `m${++uid}-${Date.now().toString(36)}`;

/**
 * Pull the offered choices out of a clarifying question so they can be
 * rendered as chips. The clarify node phrases them as
 * "Which ... — A, B, C?" — parse that, and fall back to no chips (the user
 * can always type a reply) rather than showing something malformed.
 */
function parseClarifyOptions(question: string): string[] {
  const dash = question.lastIndexOf("—");
  if (dash === -1) return [];
  const tail = question.slice(dash + 1).replace(/\?\s*$/, "").trim();
  if (!tail) return [];
  return tail
    .split(/,\s*(?:or\s+)?|\s+or\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 80);
}

export function useAgentStream(): UseAgentStreamResult {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [activeNodes, setActiveNodes] = useState<NodeName[]>([]);
  const [completedNodes, setCompletedNodes] = useState<NodeName[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingClarification, setPendingClarification] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const lastMessageRef = useRef<string | null>(null);
  const lastWasResumeRef = useRef(false);
  const sessionRef = useRef<string>("");
  // Whether the next send is answering an interrupt. A ref, not state: the
  // value is read inside the async send and must not be a render-stale copy.
  const awaitingResumeRef = useRef(false);

  useEffect(() => {
    sessionRef.current = getSessionId();
    return () => abortRef.current?.abort();
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setActiveNodes([]);
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m))
    );
  }, []);

  const reset = useCallback(() => {
    stop();
    setMessages([]);
    setCompletedNodes([]);
    setPendingClarification(null);
    setError(null);
    awaitingResumeRef.current = false;
    // New thread id, so the server starts a fresh conversation.
    document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
    sessionRef.current = getSessionId();
  }, [stop]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || abortRef.current) return;

    const resume = awaitingResumeRef.current;
    awaitingResumeRef.current = false;
    lastMessageRef.current = trimmed;
    lastWasResumeRef.current = resume;

    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort("timeout"), REQUEST_TIMEOUT_MS);

    setError(null);
    setPendingClarification(null);
    setActiveNodes([]);
    setCompletedNodes([]);
    setIsStreaming(true);

    const agentId = nextId();
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: "user", blocks: [{ kind: "text", text: trimmed }] },
      { id: agentId, role: "agent", blocks: [], streaming: true },
    ]);

    /** Append text to the agent message, coalescing into the trailing text
     *  block so tokens don't each become a separate node. */
    const appendToken = (token: string) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== agentId) return m;
          const blocks = [...m.blocks];
          const last = blocks[blocks.length - 1];
          if (last?.kind === "text") {
            blocks[blocks.length - 1] = { kind: "text", text: last.text + token };
          } else {
            blocks.push({ kind: "text", text: token });
          }
          return { ...m, blocks };
        })
      );
    };

    const appendToolBlock = (tool: string, data: unknown) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === agentId
            ? { ...m, blocks: [...m.blocks, { kind: "tool", tool, data, id: nextId() }] }
            : m
        )
      );
    };

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          sessionId: sessionRef.current,
          resume,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        let detail = `Request failed (${res.status})`;
        try {
          const j = await res.json();
          if (j?.error) detail = j.error;
        } catch {
          /* non-JSON error body */
        }
        throw new Error(detail);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // SSE frames are delimited by a blank line. A chunk can split one mid-way,
      // so hold the remainder in `buffer` until the delimiter actually arrives.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;

          let evt: any;
          try {
            evt = JSON.parse(line.slice(6));
          } catch {
            continue;
          }

          switch (evt.type) {
            case "node": {
              const name = evt.name as NodeName;
              setActiveNodes([name]);
              setCompletedNodes((prev) =>
                prev.includes(name) ? prev : [...prev, name]
              );
              break;
            }
            case "tool_result":
              appendToolBlock(evt.tool, evt.data);
              break;
            case "token":
              appendToken(evt.text);
              break;
            case "notice":
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === agentId
                    ? { ...m, notices: [...(m.notices ?? []), String(evt.text)] }
                    : m
                )
              );
              break;
            case "clarify": {
              const question = String(evt.question ?? "");
              setPendingClarification(question);
              awaitingResumeRef.current = true;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === agentId
                    ? {
                        ...m,
                        clarify: { question, options: parseClarifyOptions(question) },
                        streaming: false,
                      }
                    : m
                )
              );
              break;
            }
            case "error":
              setError(String(evt.message ?? "Something went wrong."));
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === agentId ? { ...m, error: String(evt.message) } : m
                )
              );
              break;
            case "done":
              break;
          }
        }
      }
    } catch (err) {
      const aborted = (err as Error)?.name === "AbortError";
      const timedOut = aborted && controller.signal.reason === "timeout";

      if (!aborted || timedOut) {
        const raw = err instanceof Error ? err.message : String(err);
        // Never surface a raw stack trace or a provider's internal JSON.
        const message = timedOut
          ? "That took too long and timed out. The model provider may be slow or rate limited."
          : /failed to fetch|networkerror|load failed/i.test(raw)
            ? "Couldn't reach the agent. Check your connection and try again."
            : raw.length > 200 || /\{|at \w+\s*\(/.test(raw)
              ? "Something went wrong reaching the agent. Try again in a moment."
              : raw;
        setError(message);
        setMessages((prev) =>
          prev.map((m) => (m.id === agentId ? { ...m, error: message, streaming: false } : m))
        );
      }
    } finally {
      clearTimeout(timeoutId);
      abortRef.current = null;
      setIsStreaming(false);
      setActiveNodes([]);
      setMessages((prev) =>
        prev.map((m) => (m.id === agentId ? { ...m, streaming: false } : m))
      );
    }
  }, []);

  const retry = useCallback(() => {
    const last = lastMessageRef.current;
    if (!last || abortRef.current) return;
    // Drop the failed exchange so the retry doesn't stack duplicates.
    setMessages((prev) => {
      const idx = prev.map((m) => m.role).lastIndexOf("user");
      return idx === -1 ? prev : prev.slice(0, idx);
    });
    awaitingResumeRef.current = lastWasResumeRef.current;
    void sendMessage(last);
  }, [sendMessage]);

  return {
    messages,
    activeNodes,
    completedNodes,
    isStreaming,
    pendingClarification,
    sendMessage,
    stop,
    reset,
    retry: error && lastMessageRef.current && !isStreaming ? retry : null,
    error,
  };
}
