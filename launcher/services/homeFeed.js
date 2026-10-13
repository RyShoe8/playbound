/** The homepage is public; account credentials would bypass its CDN cache. */
function createHomeFeedClient({ apiFetch, getApiBase }) {
  let previous;
  let pending;
  async function request() {
    let failure;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await apiFetch(`${getApiBase()}/api/launcher/home`, {
          headers: { accept: 'application/json', 'user-agent': 'playbound-launcher' },
        }, 30_000);
        if (!response.ok) throw new Error(`Homepage returned HTTP ${response.status}`);
        const feed = await response.json();
        if (!Array.isArray(feed.released) || !Array.isArray(feed.popular)
          || !Array.isArray(feed.editions) || !Array.isArray(feed.mods)) {
          throw new Error('Homepage returned an invalid feed');
        }
        previous = feed;
        return feed;
      } catch (error) { failure = error; }
    }
    if (previous) return previous;
    throw failure;
  }
  return () => {
    if (!pending) pending = request().finally(() => { pending = null; });
    return pending;
  };
}
module.exports = { createHomeFeedClient };
