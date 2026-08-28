import { Redis } from "@upstash/redis";

/**
 * A cache that outlives a single function instance.
 *
 * The in-process Map in party.ts only helps when two requests happen to land
 * on the same warm instance. That is common under steady traffic and close to
 * useless under a burst — a burst is precisely when Vercel scales out and
 * every new instance starts with an empty Map, so four party members polling
 * the same party do four identical database reads.
 *
 * Upstash over HTTP rather than a TCP Redis on purpose: this is the same
 * connection-exhaustion problem the Mongo pool has, and a TCP client would
 * reintroduce it — every cold lambda opening a socket against a connection
 * cap. HTTP has no persistent connection to run out of.
 *
 * ── Fail open, always ───────────────────────────────────────────────────────
 * This sits on the party polling path. A cache is an optimisation, never a
 * dependency: if Upstash is slow, unreachable, or unconfigured, every function
 * here degrades to "cache miss" and the caller does the read it would have
 * done anyway. Nothing in this file may throw.
 */

/*
 * The Vercel Marketplace integration provisions under a `redis_` prefix and
 * the legacy KV names (Vercel KV was Upstash underneath). Bare UPSTASH_* is
 * accepted too so a hand-configured project or a local .env works unchanged.
 */
function readEnv(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

const REST_URL = readEnv(
  "redis_KV_REST_API_URL",
  "KV_REST_API_URL",
  "UPSTASH_REDIS_REST_URL"
);
const REST_TOKEN = readEnv(
  "redis_KV_REST_API_TOKEN",
  "KV_REST_API_TOKEN",
  "UPSTASH_REDIS_REST_TOKEN"
);

let client: Redis | null = null;
if (REST_URL && REST_TOKEN) {
  try {
    client = new Redis({ url: REST_URL, token: REST_TOKEN });
  } catch (err) {
    console.warn("[shared-cache] disabled — client init failed:", err);
    client = null;
  }
}

/** True when a shared cache is configured. Callers do not need to branch on it. */
export const sharedCacheEnabled = client !== null;

/*
 * A slow cache is worse than no cache on a request path — the whole point is
 * to be faster than the read it replaces, and config-sync is a party document
 * plus three collection scans, so roughly the 50-200ms range.
 *
 * Measured warm GETs at a median of 60ms and a p100 of 186ms from a home
 * connection; from a function co-located with the store it is far lower. 250ms
 * therefore sits above normal variance but below the cost of the work being
 * avoided: when it does fire, skipping the cache really is the faster path.
 */
const TIMEOUT_MS = 250;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, ms);
    work
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(null);
      });
  });
}

/** Cached value, or null for a miss / disabled cache / any failure. */
export async function sharedCacheGet<T>(key: string): Promise<T | null> {
  if (!client) return null;
  try {
    // Upstash decodes JSON for us; a shape mismatch is treated as a miss.
    return (await withTimeout(client.get<T>(key), TIMEOUT_MS)) ?? null;
  } catch {
    return null;
  }
}

/**
 * Store a value under a TTL. Never awaited for correctness — the caller
 * already has the value, so a failed write costs nothing but a future miss.
 */
export async function sharedCacheSet(
  key: string,
  value: unknown,
  ttlMs: number
): Promise<void> {
  if (!client) return;
  try {
    // px = expiry in milliseconds; these TTLs are sub-second-granular.
    await withTimeout(client.set(key, value, { px: Math.max(1, ttlMs) }), TIMEOUT_MS);
  } catch {
    /* Ignored: see the fail-open note at the top. */
  }
}
