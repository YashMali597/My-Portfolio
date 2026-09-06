// Environment configuration for the agent model layer.
//
// This is the single place that reads the provider API keys. Everything else
// (models.ts, the graph in later prompts) imports from here so a missing key
// produces one clear, actionable message instead of a provider SDK's stack
// trace three layers deep.

/**
 * Where a developer goes to generate each key. This is help text printed in an
 * error message — NEVER put an actual key here. Keys are read from the
 * environment only (see `read()` below), so a value placed here would not
 * authenticate anything; it would just be a secret sitting in source control.
 */
const KEY_SOURCES: Record<string, string> = {
  GOOGLE_API_KEY: "https://aistudio.google.com/apikey (free tier available)",
  GROQ_API_KEY: "https://console.groq.com/keys (free tier available)",
};

class MissingEnvError extends Error {
  constructor(missing: string[]) {
    const lines = [
      "",
      "  Missing required environment variable" + (missing.length > 1 ? "s" : "") + ":",
      "",
      ...missing.map((k) => `    ${k}  ->  get one at ${KEY_SOURCES[k]}`),
      "",
      "  Add " + (missing.length > 1 ? "them" : "it") + " to your .env file (see .env.example),",
      "  or export " + (missing.length > 1 ? "them" : "it") + " in your shell before running again.",
      "",
    ];
    super(lines.join("\n"));
    this.name = "MissingEnvError";
    // Drop the stack — the message is the whole point, and a stack here only
    // buries it. Callers that want a trace can still read `.cause`-style info
    // from the message itself.
    this.stack = `${this.name}: ${this.message}`;
  }
}

function read(name: keyof typeof KEY_SOURCES): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new MissingEnvError([name]);
  }
  return value.trim();
}

/** Google AI Studio key, used by the Gemini generation model. */
export function getGoogleApiKey(): string {
  return read("GOOGLE_API_KEY");
}

/** Groq key, used by the low-latency router model. */
export function getGroqApiKey(): string {
  return read("GROQ_API_KEY");
}

/**
 * Validate every key up front and throw once listing all of them, rather than
 * failing on the first one and making the developer re-run to find the next.
 * Call this at process start (scripts, route handlers) — the individual
 * getters above are what the model factories use lazily.
 */
export function assertModelEnv(): void {
  const missing = Object.keys(KEY_SOURCES).filter((k) => {
    const v = process.env[k];
    return !v || v.trim() === "";
  });
  if (missing.length > 0) {
    throw new MissingEnvError(missing);
  }
}

/**
 * Non-throwing variant, for callers that want to render their own UI/message
 * instead of crashing (e.g. a health-check route).
 */
export function checkModelEnv(): { ok: boolean; missing: string[] } {
  const missing = Object.keys(KEY_SOURCES).filter((k) => {
    const v = process.env[k];
    return !v || v.trim() === "";
  });
  return { ok: missing.length === 0, missing };
}

export { MissingEnvError };
