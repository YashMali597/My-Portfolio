// Client for the real RAG backend at /api/copilot (see api/copilot.ts).
// Reads the newline-delimited JSON event stream and dispatches it via
// callbacks so the UI's "retrieving"/"thinking" indicators and token reveal
// reflect actual server-side latency instead of a fixed timer.
export interface RagHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export interface RagStreamCallbacks {
  onPhase?: (phase: "retrieving" | "thinking") => void;
  onToken: (token: string) => void;
  onError?: (message: string) => void;
}

export async function streamRagResponse(
  query: string,
  history: RagHistoryTurn[],
  callbacks: RagStreamCallbacks
): Promise<void> {
  const response = await fetch("/api/copilot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, history }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Copilot API responded with ${response.status}`);
  }
  // Guards against e.g. a plain `vite dev`/`vite preview` server with no
  // /api function deployed, which serves the SPA's index.html (200 OK) for
  // any unmatched route instead of a real ndjson stream — without this check
  // the reader below would finish with zero tokens and zero errors, leaving
  // the UI in a silent, permanently-empty "streaming" state.
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("ndjson")) {
    throw new Error("Copilot API returned an unexpected response");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      newlineIndex = buffer.indexOf("\n");
      if (!line) continue;

      let event: { type?: string; phase?: string; text?: string; message?: string };
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }

      if (event.type === "phase" && (event.phase === "retrieving" || event.phase === "thinking")) {
        callbacks.onPhase?.(event.phase);
      } else if (event.type === "token" && typeof event.text === "string") {
        callbacks.onToken(event.text);
      } else if (event.type === "error" && typeof event.message === "string") {
        callbacks.onError?.(event.message);
      }
    }
  }
}
