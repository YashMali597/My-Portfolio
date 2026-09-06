// The agent console — the centerpiece of the homepage, and (in compact
// variant) the persistent floating widget on other pages. Both share
// useAgentStream, so a conversation continues across the two.

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Square, RotateCcw, Sparkles, Info, RefreshCw, AlertCircle } from "lucide-react";
import { useAgentStream, type AgentMessage } from "../../../lib/agent/useAgentStream";
import usePrefersReducedMotion from "../../hooks/usePrefersReducedMotion";
import { subscribeToAsk } from "../../../lib/agent/agentBus";
import TracePanel from "./TracePanel";
import ToolBlock from "./generative-ui/blocks";

import { projects } from "../../data/site-content";

/**
 * Suggested questions, built from real project titles in /knowledge so a chip
 * can never reference a project that no longer exists. The two pipeline
 * projects lead because their Architecture sections are the best-documented
 * content in the knowledge base.
 */
const SUGGESTIONS: string[] = (() => {
  const withDiagram = projects.filter((p) => p.pipelineStages);
  const rest = projects.filter((p) => !p.pipelineStages);
  const featured = [...withDiagram, ...rest].slice(0, 2);
  return [
    ...featured.map((p) => `Walk me through the ${p.title} architecture`),
    "What did he do at Emerson?",
    "What projects has he built?",
  ];
})();

export interface AgentConsoleProps {
  /** "full" for the homepage centerpiece, "compact" for the floating widget. */
  variant?: "full" | "compact";
  /** Message to send automatically on mount (used by "Explore with Agent"). */
  initialMessage?: string;
  className?: string;
}

/* -------------------------------------------------------------------------- */
/* Streaming text                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Streamed prose with a blinking cursor while tokens are still arriving.
 * Renders paragraphs on blank lines and bolds `**...**`, which is as much
 * markdown as the generation model reliably produces — a full markdown parser
 * would be more machinery than the output justifies.
 */
function StreamedText({ text, streaming }: { text: string; streaming: boolean }) {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());

  return (
    <div className="agent-text">
      {paragraphs.map((para, i) => {
        const isLast = i === paragraphs.length - 1;
        const parts = para.split(/(\*\*[^*]+\*\*)/g);
        return (
          <p key={i} className="agent-paragraph">
            {parts.map((part, j) =>
              part.startsWith("**") && part.endsWith("**") ? (
                <strong key={j}>{part.slice(2, -2)}</strong>
              ) : (
                <span key={j}>{part}</span>
              )
            )}
            {streaming && isLast && <span className="agent-cursor" aria-hidden="true" />}
          </p>
        );
      })}
      {streaming && paragraphs.length === 0 && (
        <p className="agent-paragraph">
          <span className="agent-cursor" aria-hidden="true" />
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Message                                                                    */
/* -------------------------------------------------------------------------- */

function MessageView({
  message,
  onAsk,
  onRetry,
  reducedMotion,
}: {
  message: AgentMessage;
  onAsk: (text: string) => void;
  onRetry: (() => void) | null;
  reducedMotion: boolean;
}) {
  const isUser = message.role === "user";

  return (
    <motion.div
      className={`agent-message agent-message--${message.role}`}
      initial={reducedMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      {!isUser && <span className="agent-message-badge">agent</span>}

      <div className="agent-message-body">
        {message.blocks.map((block, i) =>
          block.kind === "text" ? (
            <StreamedText
              key={i}
              text={block.text}
              streaming={!!message.streaming && i === message.blocks.length - 1}
            />
          ) : (
            <ToolBlock
              key={block.id}
              tool={block.tool}
              data={block.data}
              onAsk={onAsk}
              reducedMotion={reducedMotion}
            />
          )
        )}

        {/* An interrupt from the clarify node: the graph is paused server-side
            until the next send resumes it. */}
        {message.clarify && (
          <div className="agent-clarify">
            <p className="agent-clarify-question">{message.clarify.question}</p>
            {message.clarify.options.length > 0 && (
              <div className="agent-clarify-options" role="group" aria-label="Suggested answers">
                {message.clarify.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className="agent-clarify-chip"
                    onClick={() => onAsk(opt)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Honest status notes — a fallback model answered, input was
            truncated. Shown, never masked. */}
        {message.notices?.map((note, i) => (
          <p key={i} className="agent-notice">
            <Info size={13} aria-hidden="true" />
            <span>{note}</span>
          </p>
        ))}

        {/* Never a raw stack trace, never a silent hang — a plain sentence and
            a way to try again. */}
        {message.error && (
          <div className="agent-error" role="alert">
            <p className="agent-error__text">
              <AlertCircle size={14} aria-hidden="true" />
              <span>{message.error}</span>
            </p>
            {onRetry && (
              <button type="button" className="agent-error__retry" onClick={onRetry}>
                <RefreshCw size={13} aria-hidden="true" /> Try again
              </button>
            )}
          </div>
        )}

        {/* An agent turn that produced nothing but a still-open stream. */}
        {!isUser &&
          message.blocks.length === 0 &&
          !message.clarify &&
          !message.error &&
          message.streaming && (
            <p className="agent-paragraph agent-thinking">
              <span className="agent-cursor" aria-hidden="true" />
            </p>
          )}
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* Console                                                                    */
/* -------------------------------------------------------------------------- */

export default function AgentConsole({
  variant = "full",
  initialMessage,
  className = "",
}: AgentConsoleProps) {
  const {
    messages,
    activeNodes,
    completedNodes,
    isStreaming,
    pendingClarification,
    sendMessage,
    stop,
    reset,
    retry,
    error,
  } = useAgentStream();

  const [input, setInput] = useState("");
  const prefersReducedMotion = usePrefersReducedMotion();
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sentInitial = useRef(false);
  const isStreamingRef = useRef(false);
  isStreamingRef.current = isStreaming;

  // Questions pushed from elsewhere on the page ("Explore with Agent" on a
  // project card). Only the full variant subscribes, so a card click drives
  // the main console rather than the floating dock when both are mounted.
  useEffect(() => {
    if (variant !== "full") return undefined;
    return subscribeToAsk((text) => {
      if (!isStreamingRef.current) void sendMessage(text);
    });
  }, [variant, sendMessage]);

  // Fire the pre-filled message from an "Explore with Agent" button once.
  useEffect(() => {
    if (initialMessage && !sentInitial.current) {
      sentInitial.current = true;
      void sendMessage(initialMessage);
    }
  }, [initialMessage, sendMessage]);

  // Follow the stream, but only when the user is already near the bottom —
  // yanking the viewport while they're reading earlier output is hostile.
  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance < 160) {
      el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion ? "auto" : "smooth" });
    }
  }, [messages, prefersReducedMotion]);

  const submit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;
      setInput("");
      void sendMessage(trimmed);
      inputRef.current?.focus();
    },
    [isStreaming, sendMessage]
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter breaks the line.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  };

  const isEmpty = messages.length === 0;
  const compact = variant === "compact";

  return (
    <section
      className={`agent-console agent-console--${variant} ${className}`.trim()}
      aria-label="Ask the portfolio agent"
    >
      {/* A long transcript otherwise traps keyboard users between the thread
          and the composer. */}
      {!compact && (
        <a href="#agent-composer-input" className="agent-skip-link">
          Skip to the message box
        </a>
      )}

      {!compact && (
        <header className="agent-console-head">
          <div>
            <h2 className="agent-console-title">
              <Sparkles size={18} aria-hidden="true" /> Ask the agent
            </h2>
            <p className="agent-console-sub">
              Grounded in a markdown knowledge base — it cites what it reads, and
              says so when something isn&apos;t documented.
            </p>
          </div>
          {messages.length > 0 && (
            <button type="button" className="agent-reset" onClick={reset} title="New conversation">
              <RotateCcw size={14} aria-hidden="true" /> Reset
            </button>
          )}
        </header>
      )}

      <TracePanel
        activeNodes={activeNodes}
        completedNodes={completedNodes}
        isStreaming={isStreaming}
        compact={compact}
      />

      <div
        className="agent-thread"
        ref={threadRef}
        role="log"
        aria-label="Conversation with the portfolio agent"
        aria-live="polite"
        aria-atomic="false"
        aria-busy={isStreaming}
        tabIndex={0}
      >
        {isEmpty ? (
          <div className="agent-empty">
            <p className="agent-empty-title">What would you like to know?</p>
            <div className="agent-suggestions" role="group" aria-label="Suggested questions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="agent-suggestion"
                  onClick={() => submit(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <MessageView
                key={m.id}
                message={m}
                onAsk={submit}
                onRetry={m.error ? retry : null}
                reducedMotion={prefersReducedMotion}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      <p className="visually-hidden" role="status" aria-live="polite">
        {isStreaming ? "The agent is answering." : ""}
      </p>

      <form
        className="agent-composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <textarea
          ref={inputRef}
          id="agent-composer-input"
          className="agent-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={compact ? 1 : 2}
          placeholder={
            pendingClarification
              ? "Answer above, or type your own…"
              : "Ask about a project, a role, or a decision…"
          }
          aria-label="Message the agent"
          disabled={isStreaming}
        />
        {isStreaming ? (
          <button
            type="button"
            className="agent-send agent-send--stop"
            onClick={stop}
            aria-label="Stop generating"
          >
            <Square size={14} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            className="agent-send"
            disabled={!input.trim()}
            aria-label="Send message"
          >
            <ArrowUp size={16} aria-hidden="true" />
          </button>
        )}
      </form>

      {/* The inline per-message error carries the retry affordance; this
          console-level line only fires for errors with no message to attach
          to (e.g. a refusal before the turn started). */}
      {error && messages.length === 0 && (
        <p className="agent-console-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
