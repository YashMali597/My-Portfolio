import { motion, useReducedMotion } from "framer-motion";
import { glowPulse } from "../../lib/motion";

const STATUS_CLASS = {
  active: "status-dot--active",
  idle: "status-dot--idle",
  warning: "status-dot--warning",
};

export default function StatusDot({ status = "active", className = "" }) {
  const statusClass = STATUS_CLASS[status] ?? STATUS_CLASS.active;
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.span
      className={`status-dot ${statusClass} ${className}`.trim()}
      variants={prefersReducedMotion ? undefined : glowPulse}
      initial="initial"
      animate="animate"
    />
  );
}
