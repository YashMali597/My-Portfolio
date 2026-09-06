import type { Variants } from "framer-motion";

// Shared Framer Motion variants for the command-center design system.
// Import these instead of redefining transitions inline per component.

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" },
  },
};

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.1,
    },
  },
};

/**
 * Slow opacity pulse for "live" status indicators. Animates opacity only
 * (GPU-composited) — the glow itself is a static CSS box-shadow on
 * `.status-dot` so a page with many concurrent StatusDots isn't repainting
 * a box-shadow every frame on each one.
 */
export const glowPulse: Variants = {
  initial: {
    opacity: 0.6,
  },
  animate: {
    opacity: [0.6, 1, 0.6],
    transition: {
      duration: 2.4,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};

/** Shared timing constants for typewriter-style text effects. */
export const typewriterTiming = {
  typeSpeed: 40,
  deleteSpeed: 30,
  delaySpeed: 2000,
};
