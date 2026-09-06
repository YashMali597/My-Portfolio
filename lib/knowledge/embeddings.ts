// Embedding layer for the /knowledge base.
//
// Runs `Xenova/all-MiniLM-L6-v2` locally through @xenova/transformers, so
// indexing and querying the knowledge base costs nothing and needs no API key.
// The model (~23MB, quantized) is downloaded once on first call and cached on
// disk by the library, then held in memory for the lifetime of the process.
//
// Dimensions: 384. Anything that stores these vectors must agree on that —
// see the note at the bottom of this file about the existing Voyage-based
// corpus, whose vectors are NOT interchangeable with these.

import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";

export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIMENSIONS = 384;

/**
 * Cached pipeline promise.
 *
 * Storing the *promise* rather than the resolved pipeline matters: two callers
 * that both miss the cache before the model finishes loading will await the
 * same in-flight load instead of each kicking off their own download. Loading
 * this model twice concurrently is slow and wastes memory.
 */
let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (!pipelinePromise) {
    pipelinePromise = pipeline("feature-extraction", EMBEDDING_MODEL, {
      quantized: true,
    }).catch((err) => {
      // Don't cache a failed load — otherwise a transient network error during
      // the first download poisons every subsequent call in this process.
      pipelinePromise = null;
      throw err;
    });
  }
  return pipelinePromise;
}

/**
 * Warm the model before first use. Optional, but useful in a long-lived
 * process so the first real request doesn't absorb the download/load cost.
 */
export async function warmUpEmbeddings(): Promise<void> {
  await getPipeline();
}

/**
 * Embed a single string into a 384-dimensional unit vector.
 *
 * Mean pooling + L2 normalization are applied by the pipeline, which means the
 * vectors are unit length and cosine similarity reduces to a plain dot product
 * for anything downstream that wants the cheaper operation.
 */
export async function embedText(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  return vector;
}

/**
 * Batch variant. Prefer this when embedding the whole knowledge base — the
 * pipeline batches internally and it is substantially faster than looping
 * over `embedText`.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const extractor = await getPipeline();
  const output = await extractor(texts, {
    pooling: "mean",
    normalize: true,
  });

  // `output` is a Tensor of shape [texts.length, EMBEDDING_DIMENSIONS];
  // `.tolist()` gives us plain nested arrays.
  return output.tolist() as number[][];
}

/* ---------------------------------------------------------------------------
 * Swapping to Gemini's hosted embeddings instead of the local model
 * ---------------------------------------------------------------------------
 * If you'd rather not run a model locally (smaller install, no ~23MB download,
 * no onnxruntime dependency) swap the implementation for Google's endpoint.
 * Note this changes the vector width from 384 to 768, so any stored index must
 * be rebuilt.
 *
 *   import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
 *   import { getGoogleApiKey } from "../agent/config";
 *
 *   const embedder = new GoogleGenerativeAIEmbeddings({
 *     apiKey: getGoogleApiKey(),
 *     model: "text-embedding-004",   // or "embedding-001"
 *   });
 *
 * Then the two exports become one-liners:
 *
 *   export const embedText  = (t: string)    => embedder.embedQuery(t);
 *   export const embedTexts = (ts: string[]) => embedder.embedDocuments(ts);
 *
 * (`@langchain/google-genai` is already a dependency, so no install needed.)
 * ---------------------------------------------------------------------------
 */

/* ---------------------------------------------------------------------------
 * NOTE — this is not the same embedder as src/lib/rag/embed.ts
 * ---------------------------------------------------------------------------
 * The existing RAG stack (src/lib/rag/) embeds via Voyage AI and ships a
 * prebuilt src/lib/rag/embeddings.json. Those vectors have a different width
 * and a different geometry — they cannot be compared against vectors from this
 * file. The two are expected to converge when the retrieval layer is rebuilt
 * against /knowledge; until then, keep them strictly separate.
 * ---------------------------------------------------------------------------
 */
