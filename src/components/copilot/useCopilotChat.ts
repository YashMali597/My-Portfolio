import { useCallback, useEffect, useRef, useState } from "react";
import { streamRagResponse } from "../../lib/copilot/ragClient";
import { getAgentResponse as getMockAgentResponse } from "../../lib/copilot/mock";

export type ChatRole = "user" | "agent" | "notice";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  isStreaming?: boolean;
  // Only set on "notice" messages that failed to reach the live backend —
  // lets the UI offer a "Retry" button that resends this exact query.
  retryQuery?: string;
}

export type AgentPhase = "idle" | "retrieving" | "thinking" | "streaming";

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `msg-${idCounter}`;
}

const MOCK_WORD_INTERVAL = 45;

export default function useCopilotChat(introMessage: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: nextId(), role: "agent", content: introMessage },
  ]);
  const [phase, setPhase] = useState<AgentPhase>("idle");
  const messagesRef = useRef<ChatMessage[]>(messages);
  const mockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isBusy = phase !== "idle";

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(
    () => () => {
      if (mockTimeoutRef.current) clearTimeout(mockTimeoutRef.current);
    },
    []
  );

  const sendMessage = useCallback(
    async (rawQuery: string) => {
      const query = rawQuery.trim();
      if (!query || isBusy) return;

      const history = messagesRef.current
        .filter((m) => m.content)
        .map((m) => ({
          role: (m.role === "agent" ? "assistant" : "user") as "user" | "assistant",
          content: m.content,
        }));

      setMessages((prev) => [...prev, { id: nextId(), role: "user", content: query }]);
      setPhase("retrieving");

      const agentMessageId = nextId();
      let agentMessageStarted = false;
      const ensureAgentMessage = () => {
        if (agentMessageStarted) return;
        agentMessageStarted = true;
        setMessages((prev) => [
          ...prev,
          { id: agentMessageId, role: "agent", content: "", isStreaming: true },
        ]);
      };

      let receivedAny = false;
      const appendToken = (token: string) => {
        receivedAny = true;
        ensureAgentMessage();
        setPhase("streaming");
        setMessages((prev) =>
          prev.map((m) => (m.id === agentMessageId ? { ...m, content: m.content + token } : m))
        );
      };

      try {
        await streamRagResponse(query, history, {
          onPhase: (nextPhase) => setPhase(nextPhase),
          onToken: appendToken,
          onError: (message) => appendToken(message),
        });
        if (!receivedAny) {
          // Stream completed with no tokens and no error event — treat as a
          // failure rather than silently leaving an empty bubble on screen.
          throw new Error("Empty response from Copilot API");
        }
      } catch {
        // Live backend unreachable (not deployed yet, network error, rate
        // limited, etc). Surface that plainly with a retry option, then
        // still answer from the canned mock responder so the widget stays
        // useful — but never silently pretend the mock answer is live.
        setMessages((prev) => {
          const withoutEmptyPlaceholder = prev.filter((m) => m.id !== agentMessageId || m.content);
          return [
            ...withoutEmptyPlaceholder,
            {
              id: nextId(),
              role: "notice",
              content: "Couldn't reach the live assistant right now — showing an offline demo answer instead.",
              retryQuery: query,
            },
          ];
        });

        const mockMessageId = nextId();
        const answer = await getMockAgentResponse(query);
        const words = answer.split(" ");
        setMessages((prev) => [
          ...prev,
          { id: mockMessageId, role: "agent", content: "", isStreaming: true },
        ]);
        setPhase("streaming");
        await new Promise<void>((resolve) => {
          let index = 0;
          const revealNext = () => {
            index += 1;
            const partial = words.slice(0, index).join(" ");
            setMessages((prev) =>
              prev.map((m) => (m.id === mockMessageId ? { ...m, content: partial } : m))
            );
            if (index < words.length) {
              mockTimeoutRef.current = setTimeout(revealNext, MOCK_WORD_INTERVAL);
            } else {
              resolve();
            }
          };
          revealNext();
        });
        setMessages((prev) =>
          prev.map((m) => (m.id === mockMessageId ? { ...m, isStreaming: false } : m))
        );
        setPhase("idle");
        return;
      }

      ensureAgentMessage();
      setMessages((prev) =>
        prev.map((m) => (m.id === agentMessageId ? { ...m, isStreaming: false } : m))
      );
      setPhase("idle");
    },
    [isBusy]
  );

  return { messages, phase, isBusy, sendMessage };
}
