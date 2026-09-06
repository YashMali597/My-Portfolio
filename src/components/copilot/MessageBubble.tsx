import { motion } from "framer-motion";
import { fadeInUp } from "../../lib/motion";
import { renderRichText } from "../../lib/richText";
import type { ChatRole } from "./useCopilotChat";

interface MessageBubbleProps {
  role: ChatRole;
  content: string;
  isStreaming?: boolean;
  onRetry?: () => void;
  retryDisabled?: boolean;
}

export default function MessageBubble({
  role,
  content,
  isStreaming,
  onRetry,
  retryDisabled,
}: MessageBubbleProps) {
  return (
    <motion.div
      layout
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      className={`copilot-message copilot-message--${role}`}
    >
      <div className={`copilot-bubble copilot-bubble--${role}`}>
        {renderRichText(content)}
        {isStreaming && (
          <span className="copilot-cursor" aria-hidden="true">
            ▌
          </span>
        )}
        {onRetry && (
          <button
            type="button"
            className="copilot-retry-btn"
            onClick={onRetry}
            disabled={retryDisabled}
          >
            Retry
          </button>
        )}
      </div>
    </motion.div>
  );
}
