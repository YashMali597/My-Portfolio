import { useCallback, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import CopilotButton from "./CopilotButton";
import CopilotPanel from "./CopilotPanel";

export default function CopilotWidget() {
  const [isOpen, setIsOpen] = useState(false);
  // Stable, always-mounted focus target: the button and panel swap in/out,
  // so restoring focus to "whatever had it before" races the unmount order.
  // Focusing this persistent wrapper instead is race-free.
  const rootRef = useRef<HTMLDivElement>(null);

  const handleOpen = useCallback(() => setIsOpen(true), []);
  const handleClose = useCallback(() => setIsOpen(false), []);

  return (
    <div className="copilot-root" ref={rootRef} tabIndex={-1}>
      <AnimatePresence mode="wait" initial={false}>
        {isOpen ? (
          <CopilotPanel key="panel" onClose={handleClose} restoreFocusRef={rootRef} />
        ) : (
          <CopilotButton key="button" onOpen={handleOpen} />
        )}
      </AnimatePresence>
    </div>
  );
}
