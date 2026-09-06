// Robust JSON extraction from model output.
//
// WHY THIS IS NOT A ONE-LINER: the naive approach — take the first `{`, the
// last `}`, and JSON.parse the span — breaks badly on reasoning models. Models
// like Groq's `openai/gpt-oss-*` emit analysis before the answer, and that
// analysis frequently contains braces. The naive span then covers
// "reasoning { ... } more reasoning { real json }" and fails to parse.
//
// This cost a real bug: the router silently fell back to `out_of_scope` with
// confidence 0.3 on questions it had actually classified correctly, and the
// grounding judge returned PARSE_ERROR instead of a verdict.
//
// Strategy: scan for every top-level balanced `{...}` region, parse each, and
// return the last one that both parses AND contains an expected key. Last
// wins because reasoning comes first and the real answer comes last.

/** Every balanced brace-delimited span in the text, in order. */
function balancedSpans(text: string): string[] {
  const spans: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
      continue;
    }
    if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        spans.push(text.slice(start, i + 1));
        start = -1;
      }
      if (depth < 0) depth = 0;
    }
  }
  return spans;
}

/**
 * Parse the most plausible JSON object out of a model response.
 *
 * @param requiredKeys if given, prefer an object containing at least one of
 *   these — this is what distinguishes the real payload from a brace-laden
 *   aside in the model's reasoning.
 */
export function parseJsonLoose(
  raw: string,
  requiredKeys: string[] = []
): Record<string, unknown> | null {
  if (!raw) return null;

  // Strip fenced code blocks' markers, keeping their contents.
  const cleaned = raw.replace(/```(?:json)?/gi, "");

  const candidates: Record<string, unknown>[] = [];
  for (const span of balancedSpans(cleaned)) {
    try {
      const parsed = JSON.parse(span);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        candidates.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Not valid JSON — a brace in prose. Skip it.
    }
  }
  if (candidates.length === 0) return null;

  if (requiredKeys.length > 0) {
    // Last match wins: reasoning precedes the final answer.
    for (let i = candidates.length - 1; i >= 0; i--) {
      if (requiredKeys.some((k) => k in candidates[i])) return candidates[i];
    }
  }
  return candidates[candidates.length - 1];
}
