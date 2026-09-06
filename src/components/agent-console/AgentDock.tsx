// Persistent floating agent, for pages where the console isn't the centerpiece.
//
// Renders the same AgentConsole in its compact variant. Note this mounts a
// separate useAgentStream instance from the homepage console, so the two hold
// separate in-memory threads — they do share the session cookie, so the
// server-side checkpointer continues the same conversation across both.

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageSquare, X } from "lucide-react";
import AgentConsole from "./AgentConsole";
import useFocusTrap from "../../hooks/useFocusTrap";
import usePrefersReducedMotion from "../../hooks/usePrefersReducedMotion";

export interface AgentDockProps {
  /** Pre-filled message, e.g. from an "Explore with Agent" project button. */
  initialMessage?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function AgentDock({
  initialMessage,
  open: controlledOpen,
  onOpenChange,
}: AgentDockProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  // useFocusTrap already owns Escape handling and focus restoration — passing
  // the close callback avoids a second competing keydown listener.
  useFocusTrap(panelRef, open, () => setOpen(false), toggleRef);

  return (
    <div className="agent-dock">
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            className="agent-dock-panel"
            role="dialog"
            aria-label="Portfolio agent"
            aria-modal="false"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <AgentConsole variant="compact" initialMessage={initialMessage} />
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        ref={toggleRef}
        className="agent-dock-toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={open ? "Close the agent" : "Ask the agent"}
      >
        {open ? <X size={16} aria-hidden="true" /> : <MessageSquare size={16} aria-hidden="true" />}
        {open ? "Close" : "Ask the agent"}
      </button>
    </div>
  );
}
