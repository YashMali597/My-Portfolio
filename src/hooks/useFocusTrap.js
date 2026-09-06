import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])';

export default function useFocusTrap(containerRef, isActive, onEscape, restoreFocusRef) {
  const previouslyFocused = useRef(null);

  useEffect(() => {
    if (!isActive) return undefined;

    previouslyFocused.current = document.activeElement;
    const restoreTarget = restoreFocusRef?.current ?? previouslyFocused.current;

    const container = containerRef.current;
    const focusFirst = () => {
      const focusable = container?.querySelectorAll(FOCUSABLE_SELECTOR);
      focusable?.[0]?.focus();
    };
    focusFirst();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onEscape?.();
        return;
      }
      if (event.key !== "Tab" || !container) return;

      const focusable = Array.from(
        container.querySelectorAll(FOCUSABLE_SELECTOR)
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (restoreTarget instanceof HTMLElement) {
        restoreTarget.focus();
      }
    };
  }, [isActive, containerRef, onEscape, restoreFocusRef]);
}
