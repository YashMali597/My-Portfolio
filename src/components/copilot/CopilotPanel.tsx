import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Minus } from "lucide-react";
import { StatusDot } from "../ui";
import MessageBubble from "./MessageBubble";
import WorkingIndicator from "./WorkingIndicator";
import useCopilotChat from "./useCopilotChat";
import { suggestedQuestions } from "../../lib/copilot/mock";
import useFocusTrap from "../../hooks/useFocusTrap";

const INTRO_MESSAGE =
  "I'm an AI guide to this portfolio — ask me about specific projects, architectures, or how a piece of this system was built.";

interface CopilotPanelProps {
  onClose: () => void;
  restoreFocusRef?: RefObject<HTMLElement | null>;
}

export default function CopilotPanel({ onClose, restoreFocusRef }: CopilotPanelProps) {
  const { messages, phase, isBusy, sendMessage } = useCopilotChat(INTRO_MESSAGE);
  const [draft, setDraft] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useFocusTrap(panelRef, true, onClose, restoreFocusRef);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, phase]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim() || isBusy) return;
    sendMessage(draft);
    setDraft("");
  };

  const handleChipClick = (question: string) => {
    if (isBusy) return;
    sendMessage(question);
  };

  const showChips = messages.length <= 1 && !isBusy;

  return (
    <motion.div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Recruiter Copilot chat"
      className="copilot-panel glass-panel"
      initial={{ opacity: 0, scale: 0.92, y: 24 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 24 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <div className="copilot-header">
        <div className="copilot-header-title">
          <StatusDot status="active" />
          <span>RECRUITER COPILOT</span>
        </div>
        <button
          type="button"
          className="copilot-icon-btn"
          onClick={onClose}
          aria-label="Minimize Recruiter Copilot"
        >
          <Minus size={16} />
        </button>
      </div>

      <div className="copilot-messages">
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            role={m.role}
            content={m.content}
            isStreaming={m.isStreaming}
            onRetry={m.retryQuery ? () => sendMessage(m.retryQuery!) : undefined}
            retryDisabled={isBusy}
          />
        ))}

        <AnimatePresence>
          {(phase === "retrieving" || phase === "thinking") && (
            <WorkingIndicator key={phase} phase={phase} />
          )}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      {showChips && (
        <div className="copilot-chips">
          {suggestedQuestions.map((q) => (
            <button
              key={q}
              type="button"
              className="copilot-chip"
              onClick={() => handleChipClick(q)}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <form className="copilot-input-bar" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about a project, stack, or architecture…"
          disabled={isBusy}
          aria-label="Message Recruiter Copilot"
        />
        <button
          type="submit"
          className="copilot-send-btn"
          disabled={isBusy || !draft.trim()}
          aria-label="Send message"
        >
          <Send size={16} />
        </button>
      </form>
    </motion.div>
  );
}
