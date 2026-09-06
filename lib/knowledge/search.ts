// In-memory semantic search over the prebuilt knowledge index.
//
// At this scale (tens to low hundreds of chunks) a linear scan over a JSON
// file beats any vector database on both latency and operational cost — a
// full pass is well under a millisecond, and there is no service to run,
// migrate, or pay for. Revisit only if the knowledge base grows by orders of
// magnitude.
//
// The index is loaded once per process and cached. It is a build artifact
// produced by `npm run knowledge:build`.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { embedText, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from "./embeddings";
import type { SourceType } from "./loader";

export interface IndexedChunk {
  id: string;
  text: string;
  heading: string;
  sourceType: SourceType;
  sourceSlug: string;
  sourceFile: string;
  documentTitle: string;
  approxTokens: number;
  embedding: number[];
}

export interface KnowledgeIndex {
  model: string;
  dimensions: number;
  builtAt: string;
  chunks: IndexedChunk[];
}

export interface SearchResult {
  /** Cosine similarity in [-1, 1]; in practice ~0.0-0.9 for this model. */
  score: number;
  chunk: Omit<IndexedChunk, "embedding">;
}

export interface SearchOptions {
  topK?: number;
  /** Restrict the scan to one source type, or several. */
  sourceType?: SourceType | SourceType[];
  /** Restrict to a specific entry (e.g. one project slug). */
  sourceSlug?: string;
  /** Drop results below this similarity. Default 0 (keep everything). */
  minScore?: number;
}

const HERE = dirname(fileURLToPath(import.meta.url));

function resolveIndexPath(): string | null {
  const candidates = [
    // Source/dev layout and Netlify included_files layout.
    join(process.cwd(), "lib", "knowledge", "index.json"),
    // Original colocated layout used when running directly from lib/knowledge.
    join(HERE, "index.json"),
    // Bundled function layouts can place the compiled module under a function
    // directory while preserving included files at the deployment root.
    join(HERE, "..", "..", "lib", "knowledge", "index.json"),
    join(HERE, "..", "..", "..", "lib", "knowledge", "index.json"),
  ];

  return candidates.find((path) => existsSync(path)) ?? null;
}

let cachedIndex: KnowledgeIndex | null = null;

export function loadIndex(): KnowledgeIndex {
  if (cachedIndex) return cachedIndex;

  const indexPath = resolveIndexPath();
  if (!indexPath) {
    throw new Error(
      "\n  lib/knowledge/index.json not found.\n" +
        "  Run `npm run knowledge:build` to generate it.\n"
    );
  }

  const parsed = JSON.parse(readFileSync(indexPath, "utf8")) as KnowledgeIndex;

  // Guard against the most damaging silent failure in this whole layer: an
  // index built with a different embedder. The vectors would still be numbers
  // of plausible shape, similarity would still compute, and results would be
  // quietly meaningless.
  if (parsed.model !== EMBEDDING_MODEL) {
    throw new Error(
      `\n  Index was built with "${parsed.model}" but the runtime embedder is ` +
        `"${EMBEDDING_MODEL}".\n  Re-run \`npm run knowledge:build\`.\n`
    );
  }
  if (parsed.dimensions !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `\n  Index dimension mismatch: ${parsed.dimensions} vs ${EMBEDDING_DIMENSIONS}.\n` +
        `  Re-run \`npm run knowledge:build\`.\n`
    );
  }

  cachedIndex = parsed;
  return parsed;
}

/**
 * Cosine similarity.
 *
 * MiniLM vectors come out L2-normalized, so this reduces to a dot product —
 * but the norms are computed anyway rather than assumed, because a rounded or
 * hand-edited index.json would otherwise skew scores with no visible symptom.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function matchesFilter(chunk: IndexedChunk, opts: SearchOptions): boolean {
  if (opts.sourceType) {
    const allowed = Array.isArray(opts.sourceType)
      ? opts.sourceType
      : [opts.sourceType];
    if (!allowed.includes(chunk.sourceType)) return false;
  }
  if (opts.sourceSlug && chunk.sourceSlug !== opts.sourceSlug) return false;
  return true;
}

/**
 * Rank knowledge chunks against a query.
 *
 * `sourceType` pre-filters before scoring, so once the router has classified a
 * question as being about projects, the scan skips everything else — both
 * faster and more precise, since a profile chunk can't crowd out a real answer.
 */
export async function searchKnowledge(
  query: string,
  opts: SearchOptions = {}
): Promise<SearchResult[]> {
  const { topK = 5, minScore = 0 } = opts;

  if (!query.trim()) return [];

  const index = loadIndex();
  const queryVector = await embedText(query);

  const results: SearchResult[] = [];
  for (const chunk of index.chunks) {
    if (!matchesFilter(chunk, opts)) continue;
    const score = cosineSimilarity(queryVector, chunk.embedding);
    if (score < minScore) continue;
    const { embedding: _embedding, ...rest } = chunk;
    results.push({ score, chunk: rest });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

/** Fetch every chunk of one entry, in document order. Useful when the agent
 *  has identified a project and wants its full narrative rather than fragments. */
export function getChunksBySlug(
  sourceSlug: string
): Omit<IndexedChunk, "embedding">[] {
  return loadIndex()
    .chunks.filter((c) => c.sourceSlug === sourceSlug)
    .map(({ embedding: _embedding, ...rest }) => rest);
}

/** Index stats, for health checks and the manual test script. */
export function indexStats() {
  const index = loadIndex();
  const byType: Record<string, number> = {};
  for (const c of index.chunks) {
    byType[c.sourceType] = (byType[c.sourceType] ?? 0) + 1;
  }
  return {
    model: index.model,
    dimensions: index.dimensions,
    builtAt: index.builtAt,
    totalChunks: index.chunks.length,
    byType,
  };
}
