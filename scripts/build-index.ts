// Build-time index builder for the /knowledge base.
//
//   npm run knowledge:build
//
// Loads and validates every knowledge document, chunks it on H2 boundaries,
// embeds each chunk with the local MiniLM model, and writes the whole thing to
// lib/knowledge/index.json.
//
// This is a BUILD step, not a runtime one. index.json is committed (or
// regenerated in CI) and read once per server start — nothing here runs per
// request. Re-run it whenever /knowledge changes.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadKnowledgeDocuments } from "../lib/knowledge/loader";
import { chunkDocuments, embeddableText } from "../lib/knowledge/chunker";
import {
  embedTexts,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
} from "../lib/knowledge/embeddings";
import type { KnowledgeIndex } from "../lib/knowledge/search";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(HERE, "..", "lib", "knowledge", "index.json");

/** Embed in batches so a large knowledge base doesn't build one giant tensor. */
const BATCH_SIZE = 32;

async function main() {
  const started = performance.now();
  console.log("\nBuilding knowledge index\n");

  // 1. Load + validate.
  const docs = loadKnowledgeDocuments();
  const byType = docs.reduce<Record<string, number>>((acc, d) => {
    acc[d.type] = (acc[d.type] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`  Documents: ${docs.length}`);
  for (const [type, n] of Object.entries(byType).sort()) {
    console.log(`    ${type.padEnd(12)} ${n}`);
  }

  // 2. Chunk.
  const allChunks = chunkDocuments(docs);

  // Drop placeholder scaffolding before it reaches the index. Indexing it is
  // actively harmful: the vague template text matches every query weakly and
  // crowds out real content, and a retrieved placeholder could be recited to a
  // recruiter as if it were a real achievement.
  const placeholders = allChunks.filter((c) => c.isPlaceholder);
  const chunks = allChunks.filter((c) => !c.isPlaceholder);

  if (placeholders.length > 0) {
    console.log(`\n  Excluded ${placeholders.length} placeholder chunk(s) from the index:`);
    for (const p of placeholders) {
      console.log(`    ${p.sourceFile} > ${p.heading}`);
    }
    console.log("    (unfilled ⟨...⟩ template markers — fill or delete these sections)");
  }

  if (chunks.length === 0) {
    throw new Error("Chunking produced 0 chunks — is /knowledge empty?");
  }

  const ids = new Set<string>();
  for (const c of chunks) {
    if (ids.has(c.id)) {
      throw new Error(
        `Duplicate chunk id "${c.id}" — two sections share a heading within the same entry.`
      );
    }
    ids.add(c.id);
  }

  const tokens = chunks.reduce((s, c) => s + c.approxTokens, 0);
  const longest = chunks.reduce((m, c) => Math.max(m, c.text.length), 0);
  console.log(`\n  Chunks: ${chunks.length}`);
  console.log(`    avg ~${Math.round(tokens / chunks.length)} tokens, longest ${longest} chars`);

  const flagged = chunks.filter((c) => c.verifyFlags.length > 0);
  const flagCount = flagged.reduce((s, c) => s + c.verifyFlags.length, 0);
  console.log(
    `    ${flagCount} VERIFY flag(s) across ${flagged.length} chunk(s), stripped from indexed text`
  );

  // 3. Embed.
  console.log(`\n  Embedding with ${EMBEDDING_MODEL} (first run downloads the model)...`);
  const texts = chunks.map(embeddableText);
  const vectors: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const embedded = await embedTexts(batch);
    vectors.push(...embedded);
    process.stdout.write(
      `\r    ${Math.min(i + BATCH_SIZE, texts.length)}/${texts.length}`
    );
  }
  process.stdout.write("\n");

  for (const [i, v] of vectors.entries()) {
    if (v.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Chunk "${chunks[i].id}" embedded to ${v.length} dims, expected ${EMBEDDING_DIMENSIONS}`
      );
    }
  }

  // 4. Write.
  const index: KnowledgeIndex = {
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    builtAt: new Date().toISOString(),
    chunks: chunks.map((c, i) => ({
      id: c.id,
      text: c.text,
      heading: c.heading,
      sourceType: c.sourceType,
      sourceSlug: c.sourceSlug,
      sourceFile: c.sourceFile,
      documentTitle: c.documentTitle,
      approxTokens: c.approxTokens,
      // Round to 6dp — the precision beyond that is noise, and it cuts the
      // file size substantially.
      embedding: vectors[i].map((n) => Number(n.toFixed(6))),
    })),
  };

  writeFileSync(OUT_PATH, JSON.stringify(index), "utf8");

  const sizeKb = (JSON.stringify(index).length / 1024).toFixed(0);
  console.log(`\n  Wrote lib/knowledge/index.json`);
  console.log(`    ${index.chunks.length} chunks, ${EMBEDDING_DIMENSIONS}d, ${sizeKb} KB`);
  console.log(`    built in ${((performance.now() - started) / 1000).toFixed(1)}s\n`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
