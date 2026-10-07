const buckets = new Map<string, { count: number; reset: number }>();

/** Fixed-window in-memory limiter (single-process deployment). Returns true if allowed. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}

export class RateLimitError extends Error {
  constructor() {
    super("Too many requests, slow down.");
  }
}

export function enforceRateLimit(key: string, limit = 10, windowMs = 60_000) {
  if (!rateLimit(key, limit, windowMs)) throw new RateLimitError();
}
