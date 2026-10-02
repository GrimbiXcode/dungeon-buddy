/**
 * Einfaches In-Memory-Rate-Limit (Fenster mit fester Dauer).
 * Reicht für eine selbst gehostete Einzelinstanz und speichert nichts dauerhaft.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function consumeRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count++;
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  return {
    allowed: bucket.count <= limit,
    /** Erste abgelehnte Anfrage in diesem Fenster (zum einmaligen Protokollieren) */
    firstDenied: bucket.count === limit + 1,
    retryAfterMs: bucket.resetAt - now,
  };
}

/** Aktueller Zählerstand ohne zu erhöhen. */
export function peekRateLimit(key: string): number {
  const bucket = buckets.get(key);
  return bucket && bucket.resetAt > Date.now() ? bucket.count : 0;
}

export function resetRateLimits() {
  buckets.clear();
}
