/**
 * A few seconds of per-instance memory in front of a large unstable_cache read.
 *
 * unstable_cache fetches its value from Vercel's data cache and JSON.parses it
 * on every hit. For the full catalog that is ~2 MB per request, and production
 * profiles of real event-loop stalls were topped by exactly that: the data
 * cache client, JSON parsing, UTF-8 decoding and the garbage collector
 * clearing up after it, with database connections timing out behind the
 * blocked loop. Holding the decoded value for a short TTL means a busy
 * instance parses it once per window instead of once per request.
 *
 * The TTL is the staleness budget on top of the cache's own window: an admin
 * write's revalidateTag reaches other instances at most `ttlMs` late. The
 * promise is stored, so concurrent callers share one read, and a rejected read
 * is forgotten so the next caller retries.
 */
const entries = new Map<string, { at: number; value: Promise<unknown> }>();

export function instanceMemo<T>(key: string, ttlMs: number, read: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = entries.get(key);
  if (hit && now - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = read();
  entries.set(key, { at: now, value });
  value.catch(() => {
    if (entries.get(key)?.value === value) entries.delete(key);
  });
  return value;
}
