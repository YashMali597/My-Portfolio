import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { glowPulse } from "../../lib/motion";
import usePrefersReducedMotion from "../../hooks/usePrefersReducedMotion";

const INVITE_TEXT = "Ask about my Azure AI Search work →";
const INVITE_DELAY = 4000;
const INVITE_AUTOHIDE = 8000;
const SESSION_KEY = "copilot-invite-shown";

interface CopilotButtonProps {
  onOpen: () => void;
}

export default function CopilotButton({ onOpen }: CopilotButtonProps) {
  const [showInvite, setShowInvite] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return undefined;
    const showTimer = setTimeout(() => {
      setShowInvite(true);
      sessionStorage.setItem(SESSION_KEY, "1");
    }, INVITE_DELAY);
    return () => clearTimeout(showTimer);
  }, []);

  useEffect(() => {
    if (!showInvite) return undefined;
    const hideTimer = setTimeout(() => setShowInvite(false), INVITE_AUTOHIDE);
    return () => clearTimeout(hideTimer);
  }, [showInvite]);

  const handleOpen = () => {
    setShowInvite(false);
    onOpen();
  };

  return (
    <div className="copilot-button-wrapper">
      {showInvite && (
        <motion.div
          className="copilot-tooltip copilot-tooltip--invite glass-panel"
          initial={{ opacity: 0, y: 8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.95 }}
          role="status"
        >
          {INVITE_TEXT}
        </motion.div>
      )}
      {!showInvite && isHovered && (
        <div className="copilot-tooltip copilot-tooltip--status" role="tooltip">
          STATUS: ONLINE
        </div>
      )}

      <motion.div
        animate={
          showInvite && !prefersReducedMotion ? { y: [0, -10, 0, -6, 0] } : { y: 0 }
        }
        transition={{ duration: 1.1, ease: "easeInOut" }}
      >
        <motion.button
          type="button"
          className="copilot-button glow-cyan"
          onClick={handleOpen}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onFocus={() => setIsHovered(true)}
          onBlur={() => setIsHovered(false)}
          aria-label="Open Recruiter Copilot chat"
          variants={prefersReducedMotion ? undefined : glowPulse}
          initial="initial"
          animate="animate"
        >
          <MessageCircle size={24} />
        </motion.button>
      </motion.div>
    </div>
  );
}
