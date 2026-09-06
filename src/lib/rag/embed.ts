// Thin client for Voyage AI's embeddings endpoint. Used both by the
// build-time ingestion script (scripts/build-rag.ts) and by the /api/copilot
// serverless function at request time — this is the single place that knows
// how to call the embeddings provider, so swapping providers later only
// means editing this file.
const VOYAGE_MODEL = "voyage-3-lite";
const VOYAGE_ENDPOINT = "https://api.voyageai.com/v1/embeddings";

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error("VOYAGE_API_KEY is not set");
  }

  const res = await fetch(VOYAGE_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input: texts, model: VOYAGE_MODEL }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Voyage embeddings request failed: ${res.status} ${body}`);
  }

  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}

export async function embedText(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  return vector;
}
