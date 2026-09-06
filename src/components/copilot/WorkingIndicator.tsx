import { motion } from "framer-motion";

interface WorkingIndicatorProps {
  phase: "retrieving" | "thinking";
}

const LABELS: Record<WorkingIndicatorProps["phase"], string> = {
  retrieving: "retrieving context…",
  thinking: "thinking…",
};

export default function WorkingIndicator({ phase }: WorkingIndicatorProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className={`copilot-working copilot-working--${phase}`}
    >
      <span className="copilot-working-icon" aria-hidden="true">
        {phase === "retrieving" ? "🔍" : "🧠"}
      </span>
      <span className="copilot-working-label">{LABELS[phase]}</span>

      {phase === "retrieving" ? (
        <span className="copilot-scan-bar" aria-hidden="true">
          <span className="copilot-scan-bar__sweep" />
        </span>
      ) : (
        <span className="copilot-dots" aria-hidden="true">
          {[0, 0.2, 0.4].map((delay) => (
            <motion.span
              key={delay}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity, delay }}
            />
          ))}
        </span>
      )}
    </motion.div>
  );
}
