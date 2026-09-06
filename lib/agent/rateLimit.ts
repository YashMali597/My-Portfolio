// In-memory token bucket for /api/agent.
//
// Purpose is narrow and specific: the provider keys behind this endpoint sit on
// free tiers measured in tens of requests per day. One impatient visitor
// holding down enter — or one bot — can exhaust the whole day's quota for every
// other visitor. This is quota protection, not security.
//
// In-memory is the right scale here. A serverless instance handles a handful of
// concurrent visitors and buckets reset on cold start, which is acceptable for
// a portfolio. A distributed limiter (Upstash/Redis) is the upgrade path if
// this ever sees real traffic.

export interface RateLimitResult {
  allowed: boolean;
  /** Requests left in the current window. */
  remaining: number;
  /** Seconds until the next token is available (only meaningful when blocked). */
  retryAfter: number;
  /** Which limit rejected the request, for the error message. */
  scope?: "session" | "ip" | "global";
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

interface BucketConfig {
  capacity: number;
  /** Tokens restored per second. */
  refillPerSec: number;
}

/**
 * Per-session: a single conversation. Generous enough for real use — burst of
 * 6, then roughly one question every 12 seconds.
 */
const SESSION: BucketConfig = { capacity: 6, refillPerSec: 1 / 12 };

/**
 * Per-IP: catches someone clearing their cookie to get a fresh session id.
 */
const IP: BucketConfig = { capacity: 12, refillPerSec: 1 / 10 };

/**
 * Global: the real quota backstop. Even distinct legitimate visitors together
 * cannot burn the whole daily allowance in a minute.
 */
const GLOBAL: BucketConfig = { capacity: 30, refillPerSec: 1 / 4 };

const sessionBuckets = new Map<string, Bucket>();
const ipBuckets = new Map<string, Bucket>();
const globalBucket: Bucket = { tokens: GLOBAL.capacity, lastRefill: Date.now() };

/** Drop buckets that have fully refilled, so the maps don't grow forever. */
const SWEEP_INTERVAL_MS = 5 * 60_000;
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [map, cfg] of [
    [sessionBuckets, SESSION],
    [ipBuckets, IP],
  ] as const) {
    for (const [key, bucket] of map) {
      const refilled =
        bucket.tokens + ((now - bucket.lastRefill) / 1000) * cfg.refillPerSec;
      if (refilled >= cfg.capacity) map.delete(key);
    }
  }
}

/** Take one token if available. Does not mutate on refusal. */
function take(bucket: Bucket, cfg: BucketConfig, now: number): RateLimitResult {
  const elapsedSec = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(cfg.capacity, bucket.tokens + elapsedSec * cfg.refillPerSec);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true, remaining: Math.floor(bucket.tokens), retryAfter: 0 };
  }
  const needed = 1 - bucket.tokens;
  return {
    allowed: false,
    remaining: 0,
    retryAfter: Math.ceil(needed / cfg.refillPerSec),
  };
}

function bucketFor(map: Map<string, Bucket>, key: string, cfg: BucketConfig): Bucket {
  let b = map.get(key);
  if (!b) {
    b = { tokens: cfg.capacity, lastRefill: Date.now() };
    map.set(key, b);
  }
  return b;
}

/**
 * Check all three limits. Checked cheapest-scope-first, and only the first
 * failing scope is reported — but note every scope that is checked consumes a
 * token, so they are evaluated in order and short-circuit on refusal.
 */
export function checkRateLimit(sessionId: string, ip: string): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const session = take(bucketFor(sessionBuckets, sessionId, SESSION), SESSION, now);
  if (!session.allowed) return { ...session, scope: "session" };

  const perIp = take(bucketFor(ipBuckets, ip, IP), IP, now);
  if (!perIp.allowed) return { ...perIp, scope: "ip" };

  const global = take(globalBucket, GLOBAL, now);
  if (!global.allowed) return { ...global, scope: "global" };

  return { allowed: true, remaining: Math.min(session.remaining, perIp.remaining), retryAfter: 0 };
}

/** Human-readable refusal, shown directly to the visitor. */
export function rateLimitMessage(result: RateLimitResult): string {
  const wait = result.retryAfter > 60
    ? `${Math.ceil(result.retryAfter / 60)} minute${result.retryAfter > 120 ? "s" : ""}`
    : `${result.retryAfter} second${result.retryAfter === 1 ? "" : "s"}`;

  if (result.scope === "global") {
    return `The agent is busy right now — this site runs on free-tier model quotas shared by everyone. Try again in about ${wait}.`;
  }
  return `You're sending questions faster than the free-tier quota allows. Try again in about ${wait}.`;
}

/** Test hook. */
export function resetRateLimits(): void {
  sessionBuckets.clear();
  ipBuckets.clear();
  globalBucket.tokens = GLOBAL.capacity;
  globalBucket.lastRefill = Date.now();
}
