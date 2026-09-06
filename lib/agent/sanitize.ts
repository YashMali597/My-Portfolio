// Input handling for user messages reaching the agent.
//
// Two jobs, both narrow:
//   1. Bound the input so a huge paste can't blow the context window or the
//      token quota.
//   2. Strip characters that corrupt the prompt or the SSE transport.
//
// This is deliberately NOT an attempt to filter prompt injection by pattern
// matching. That approach fails — an attacker rephrases and gets through, while
// legitimate questions get blocked. Injection resistance belongs in the system
// prompt (see knowledge/profile.md) and in the architecture: the generation
// model only ever sees retrieved chunks and tool output, and the tools only
// read /knowledge. There is no capability here to hijack.

export const MAX_MESSAGE_LENGTH = 2000;

/**
 * C0/C1 control characters, excluding tab (\t), newline (\n) and carriage
 * return (\r). These corrupt SSE framing, which is newline-delimited, and have
 * no place in a typed question.
 */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/**
 * Zero-width and bidirectional-override characters. Invisible in the UI but
 * fully present in the prompt — a way to hide text from a human reading the
 * conversation.
 */
const INVISIBLE_CHARS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;

export interface SanitizeResult {
  text: string;
  ok: boolean;
  error?: string;
  /** True when the input was truncated to fit the cap. */
  truncated: boolean;
}

export function sanitizeMessage(raw: unknown): SanitizeResult {
  if (raw === undefined || raw === null) {
    return { text: "", ok: false, error: "`message` is required.", truncated: false };
  }
  if (typeof raw !== "string") {
    return { text: "", ok: false, error: "`message` must be a string.", truncated: false };
  }

  let text = raw
    // Normalize so visually identical inputs behave identically.
    .normalize("NFC")
    .replace(CONTROL_CHARS, "")
    .replace(INVISIBLE_CHARS, "")
    // Collapse long runs of blank lines — a wall of newlines is a cheap way to
    // push real content out of a reviewer's view.
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();

  if (text.length === 0) {
    return { text: "", ok: false, error: "`message` is required.", truncated: false };
  }

  let truncated = false;
  if (text.length > MAX_MESSAGE_LENGTH) {
    text = text.slice(0, MAX_MESSAGE_LENGTH).trim();
    truncated = true;
  }

  return { text, ok: true, truncated };
}

/** Session ids come from a cookie and are used as checkpointer thread keys. */
export function sanitizeSessionId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  // Conservative allowlist: our own ids are UUIDs or "s-<ts>-<rand>". Anything
  // else is corrupted, or an attempt to collide with someone else's thread.
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(trimmed)) return null;
  return trimmed;
}
