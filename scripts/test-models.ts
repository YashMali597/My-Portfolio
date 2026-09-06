// Smoke test for the model layer. Run with:
//
//   npx tsx scripts/test-models.ts
//
// Calls the router model, the generation model, and the local embedder with
// trivial inputs and reports latency for each. The point is to confirm both
// free-tier keys work and the local model downloads before anything gets built
// on top of them — not to test quality.
//
// Exits 0 if all three succeed, 1 otherwise.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Minimal .env loader so this runs without adding a dotenv dependency.
// Real env vars always win over the file.
function loadEnvFile(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = join(here, "..", ".env");
  let raw: string;
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    return; // No .env file — rely on the ambient environment.
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env) && value) process.env[key] = value;
  }
}

loadEnvFile();

const { checkModelEnv } = await import("../lib/agent/config");
const { getRouterModel, getGenerationModel, ROUTER_MODEL, GENERATION_MODEL } =
  await import("../lib/agent/models");
const { embedText, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } = await import(
  "../lib/knowledge/embeddings"
);

const ms = (start: number) => `${(performance.now() - start).toFixed(0)}ms`;

function ok(label: string, detail: string, elapsed: string) {
  console.log(`  PASS  ${label.padEnd(12)} ${elapsed.padStart(8)}   ${detail}`);
}

function fail(label: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.log(`  FAIL  ${label.padEnd(12)} ${" ".repeat(8)}   ${message.split("\n")[0]}`);
  if (err instanceof Error && err.name === "MissingEnvError") {
    console.log(err.message);
  }
}

async function main() {
  console.log("\nModel layer smoke test\n");

  const env = checkModelEnv();
  if (!env.ok) {
    console.log(`  Missing env: ${env.missing.join(", ")}`);
    console.log("  Those checks will fail below with instructions.\n");
  }

  let failures = 0;

  // 1. Router — Groq
  try {
    const start = performance.now();
    const res = await getRouterModel().invoke(
      "Reply with exactly one word: ping"
    );
    const text = String(res.content).trim().replace(/\s+/g, " ").slice(0, 40);
    ok("router", `${ROUTER_MODEL} -> "${text}"`, ms(start));
  } catch (err) {
    fail("router", err);
    failures++;
  }

  // 2. Generation — Gemini
  try {
    const start = performance.now();
    const res = await getGenerationModel().invoke(
      "Reply with exactly one word: pong"
    );
    const text = String(res.content).trim().replace(/\s+/g, " ").slice(0, 40);
    ok("generation", `${GENERATION_MODEL} -> "${text}"`, ms(start));
  } catch (err) {
    fail("generation", err);
    failures++;
  }

  // 3. Embeddings — local MiniLM.
  // First run includes the model download, so expect several seconds.
  try {
    const start = performance.now();
    const vector = await embedText("hello world");
    const elapsed = ms(start);

    if (vector.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `expected ${EMBEDDING_DIMENSIONS} dimensions, got ${vector.length}`
      );
    }
    const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
    ok(
      "embeddings",
      `${EMBEDDING_MODEL} -> ${vector.length}d, |v|=${norm.toFixed(3)}`,
      elapsed
    );

    // Second call should hit the cached pipeline and be dramatically faster.
    const warmStart = performance.now();
    await embedText("hello again");
    ok("  (cached)", "second call, pipeline reused", ms(warmStart));
  } catch (err) {
    fail("embeddings", err);
    failures++;
  }

  console.log("");
  if (failures > 0) {
    console.log(`  ${failures} of 3 checks failed.\n`);
    process.exit(1);
  }
  console.log("  All 3 checks passed.\n");
}

main().catch((err) => {
  console.error("\nUnexpected error:", err);
  process.exit(1);
});
