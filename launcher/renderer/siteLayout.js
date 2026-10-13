export function homepageSelections(catalog, feed) {
  const bySlug = new Map(catalog.map(game => [game.slug, game]));
  const resolve = slugs => (slugs || []).map(slug => bySlug.get(slug)).filter(Boolean);
  return {
    released: feed ? resolve(feed.released) : catalog.filter(game => !game.releaseYear || game.releaseYear <= new Date().getFullYear()).sort((a, b) => {
      const date = game => Date.parse(game.publishedAt || game.createdAt || "") || 0;
      return date(b) - date(a) || a.title?.localeCompare(b.title || "") || 0;
    }),
    popular: feed ? resolve(feed.popular).slice(0, 8) : catalog.slice(0, 8),
    editions: (feed?.editions || []).filter(item => bySlug.has(item.gameSlug)).slice(0, 8).map(item => ({...item, game: bySlug.get(item.gameSlug)})),
    mods: (feed?.mods || []).filter(mod => bySlug.has(mod.baseGameSlug)).slice(0, 8),
  };
}
export function diversifyOffers(offers, limit) {
  const stores = new Map();
  for (const offer of offers) { const key = offer.store || 'other'; if (!stores.has(key)) stores.set(key, []); stores.get(key).push(offer); }
  const result = [];
  while (result.length < limit && stores.size) {
    for (const [key, queue] of stores) { if (result.length >= limit) break; result.push(queue.shift()); if (!queue.length) stores.delete(key); }
  }
  return result;
}
