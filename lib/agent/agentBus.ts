// Tiny pub/sub so anything on the page can hand a question to the console.
//
// "Explore with Agent →" lives on a project card that may be several sections
// below (or on a different route from) the console. Threading a callback down
// through every intermediate component would couple the whole page tree to the
// agent; a one-event bus keeps that coupling to two files.
//
// CLIENT-ONLY, like useAgentStream — no server imports.

export type AskListener = (message: string) => void;

const listeners = new Set<AskListener>();

/** Ask the mounted console a question. Returns false if nothing is listening. */
export function askAgent(message: string): boolean {
  const text = message.trim();
  if (!text || listeners.size === 0) return false;
  for (const listener of listeners) listener(text);
  return true;
}

export function subscribeToAsk(listener: AskListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether a console is currently mounted and able to receive questions. */
export function hasAgentListener(): boolean {
  return listeners.size > 0;
}

/** Scroll the primary console into view, if it is on this page. */
export function scrollToAgent(): void {
  const el = document.getElementById("agent");
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}
