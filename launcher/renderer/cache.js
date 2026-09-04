/**
 * Request memoisation for the renderer's IPC calls.
 *
 * Generic caching, not UI state: a key, a TTL, and a function to call on a
 * miss. Lifted out of shared.js, which had grown to hold both this and the
 * app's own view helpers — the two have nothing to say to each other, and only
 * this half is worth reading on its own.
 *
 * shared.js re-exports all four names, so every existing importer is
 * unaffected and cache.test.mjs still exercises the path the app uses.
 */

/** @type {Map<string, { at: number, data?: any, inflight?: Promise<any> | null }>} */
const ipcCache = new Map();

/**
 * Bumped by every invalidation.
 *
 * Deleting a key does not stop a request that is already in the air, and that
 * request still writes its result when it lands. After an install that meant
 * the pre-install payload — the one that says the game is not installed — could
 * drop back into the cache *after* the invalidation, and the next read would
 * treat it as fresh. The visible symptom was the hero button staying on
 * "Install Game" after the status area already said the install had finished.
 *
 * A request remembers the epoch it started in and declines to cache its result
 * if the world has moved on since.
 */
let cacheEpoch = 0;

export function cachePeek(key, ttlMs) {
  const hit = ipcCache.get(key);
  if (!hit || hit.data === undefined) return null;
  return { data: hit.data, fresh: Date.now() - hit.at <= ttlMs };
}

export function cachePut(key, data) {
  ipcCache.set(key, { at: Date.now(), data, inflight: null });
  return data;
}

export function cacheInvalidate(prefix = "") {
  cacheEpoch++;
  if (!prefix) {
    ipcCache.clear();
    return;
  }
  for (const key of [...ipcCache.keys()]) {
    if (key === prefix || key.startsWith(`${prefix}:`)) ipcCache.delete(key);
  }
}

export async function cacheInvoke(key, ttlMs, fn) {
  const peek = cachePeek(key, ttlMs);
  if (peek?.fresh) return peek.data;
  const hit = ipcCache.get(key);
  if (hit?.inflight) {
    return hit.data !== undefined ? hit.data : hit.inflight;
  }
  const startedAt = cacheEpoch;
  const inflight = Promise.resolve()
    .then(fn)
    .then((data) => {
      // Invalidated while this was in the air — hand the caller the answer it
      // asked for, but do not let it become the cached truth.
      if (cacheEpoch !== startedAt) return data;
      return cachePut(key, data);
    })
    .finally(() => {
      const cur = ipcCache.get(key);
      if (cur) cur.inflight = null;
    });
  ipcCache.set(key, { at: hit?.at || 0, data: hit?.data, inflight });
  if (hit?.data !== undefined) return hit.data;
  return inflight;
}
