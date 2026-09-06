// Manual retrieval sanity check.
//
//   npx tsx scripts/test-retrieval.ts "how does the fabric pipeline work?"
//   npx tsx scripts/test-retrieval.ts --type project "uplift modeling"
//   npx tsx scripts/test-retrieval.ts            # runs the default question set
//
// Prints the top-K chunks with similarity scores so retrieval quality can be
// eyeballed against real questions before an agent is built on top of it.

import { searchKnowledge, indexStats } from "../lib/knowledge/search";
import type { SourceType } from "../lib/knowledge/loader";

/** Questions a recruiter or engineer would plausibly ask. Deliberately mixes
 *  well-covered topics with ones the knowledge base does NOT document, so the
 *  weak-retrieval cases are visible too. */
const DEFAULT_QUERIES = [
  "How does the commodity data pipeline work?",
  "What experience does he have with LLMs?",
  "Tell me about the causal inference work",
  "What did he study and where?",
  "Has he worked with SAP?",
  "What are his salary expectations?", // expected: nothing relevant
];

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  let sourceType: SourceType | undefined;
  let topK = 5;
  const rest: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--type" && args[i + 1]) {
      sourceType = args[++i] as SourceType;
    } else if (args[i] === "--topk" && args[i + 1]) {
      topK = Number(args[++i]);
    } else {
      rest.push(args[i]);
    }
  }
  return { query: rest.join(" ").trim(), sourceType, topK };
}

function bar(score: number): string {
  const filled = Math.max(0, Math.min(20, Math.round(score * 20)));
  return "#".repeat(filled).padEnd(20, ".");
}

function preview(text: string, width = 150): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > width ? `${flat.slice(0, width)}...` : flat;
}

async function runQuery(
  query: string,
  sourceType: SourceType | undefined,
  topK: number
) {
  const filter = sourceType ? `  [type=${sourceType}]` : "";
  console.log(`\n${"=".repeat(78)}`);
  console.log(`QUERY: ${query}${filter}`);
  console.log("=".repeat(78));

  const start = performance.now();
  const results = await searchKnowledge(query, { topK, sourceType });
  const elapsed = (performance.now() - start).toFixed(0);

  if (results.length === 0) {
    console.log("  (no results)");
    return;
  }

  results.forEach((r, i) => {
    const { chunk, score } = r;
    console.log(
      `\n  ${i + 1}. ${score.toFixed(3)}  ${bar(score)}  ${chunk.documentTitle} > ${chunk.heading}`
    );
    console.log(`     ${chunk.sourceFile}  (${chunk.sourceType}/${chunk.sourceSlug})`);
    console.log(`     ${preview(chunk.text)}`);
  });
  console.log(`\n  ${results.length} result(s) in ${elapsed}ms`);
}

async function main() {
  const { query, sourceType, topK } = parseArgs(process.argv);

  const stats = indexStats();
  console.log(`\nIndex: ${stats.totalChunks} chunks | ${stats.model} (${stats.dimensions}d)`);
  console.log(`Built: ${stats.builtAt}`);
  console.log(
    `Types: ${Object.entries(stats.byType)
      .sort()
      .map(([t, n]) => `${t}=${n}`)
      .join(", ")}`
  );

  const queries = query ? [query] : DEFAULT_QUERIES;
  for (const q of queries) {
    await runQuery(q, sourceType, topK);
  }
  console.log("");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
