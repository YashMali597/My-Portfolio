// Best-effort in-memory rate limiter, scoped to one warm serverless/edge
// instance. Good enough for a portfolio site's traffic; a real multi-tenant
// product would need a shared store (e.g. Vercel Edge Config / KV) instead.
interface Bucket {
  count: number;
  windowStart: number;
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;

const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string): { allowed: boolean } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false };
  }

  bucket.count += 1;
  return { allowed: true };
}
