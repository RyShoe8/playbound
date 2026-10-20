/** The homepage is public; account credentials would bypass its CDN cache. */
// A cold edge can legitimately take well over ten seconds, so a short first attempt
// must be followed by a patient one rather than giving up and showing an error.
const ATTEMPT_TIMEOUTS_MS = [15_000, 30_000];
const ATTEMPT_TIMEOUT_MS = ATTEMPT_TIMEOUTS_MS[0];
const SHOW_CACHED_AFTER_MS = 1_500;
const MAX_CACHED_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The editorial homepage feed.
 *
 * The network can be slow in ways nothing else on the page is (a cold CDN edge, a
 * stalled connection), and the whole page used to wait out two 30-second
 * attempts. Now the last good feed is kept — in memory and, through `store`, on
 * disk — and shown if a fresh one has not arrived within a moment. The fresh one
 * is still fetched and saved for next time, so a slow start is slow once.
 */
function createHomeFeedClient({ apiFetch, getApiBase, store, now = Date.now, showCachedAfterMs = SHOW_CACHED_AFTER_MS }) {
  let previous;
  let previousAt = 0;
  let pending;
  let storedRead = false;

  function remember(feed) {
    previous = feed;
    previousAt = now();
    try { store?.write?.({ at: previousAt, feed }); } catch { /* a cache that cannot be written is only a cache */ }
  }

  function cached() {
    if (!previous && !storedRead) {
      storedRead = true;
      try {
        const stored = store?.read?.();
        if (stored && Array.isArray(stored.feed?.released) && now() - Number(stored.at) <= MAX_CACHED_AGE_MS) {
          previous = stored.feed;
          previousAt = Number(stored.at);
        }
      } catch { /* unreadable cache: behave as if there were none */ }
    }
    return previous && now() - previousAt <= MAX_CACHED_AGE_MS ? previous : undefined;
  }

  async function request() {
    let failure;
    for (let attempt = 0; attempt < ATTEMPT_TIMEOUTS_MS.length; attempt++) {
      try {
        const response = await apiFetch(`${getApiBase()}/api/launcher/home`, {
          headers: { accept: 'application/json', 'user-agent': 'playbound-launcher' },
        }, ATTEMPT_TIMEOUTS_MS[attempt]);
        if (!response.ok) throw new Error(`Homepage returned HTTP ${response.status}`);
        const feed = await response.json();
        if (!Array.isArray(feed.released) || !Array.isArray(feed.popular)
          || !Array.isArray(feed.editions) || !Array.isArray(feed.mods)) {
          throw new Error('Homepage returned an invalid feed');
        }
        remember(feed);
        return feed;
      } catch (error) { failure = error; }
    }
    const fallback = cached();
    if (fallback) return fallback;
    throw failure;
  }

  return () => {
    const fallback = cached();
    if (!pending) pending = request().finally(() => { pending = null; });
    const fresh = pending;
    if (!fallback) return fresh;
    // A slow refresh must not hold the page: after a moment, show what we have.
    let timer;
    const stale = new Promise(resolve => { timer = setTimeout(() => resolve(fallback), showCachedAfterMs); });
    return Promise.race([fresh, stale]).finally(() => clearTimeout(timer));
  };
}
module.exports = { createHomeFeedClient, ATTEMPT_TIMEOUT_MS, ATTEMPT_TIMEOUTS_MS, SHOW_CACHED_AFTER_MS };
