/** Genres supplied by the same deal feed used by the website. */
export function dealGenres(deals) {
  const options = new Map();
  for (const deal of deals) {
    for (const genre of deal.genres || []) {
      if (typeof genre !== 'string' || !genre.trim()) continue;
      const label = genre.trim();
      options.set(label.toLowerCase(), label);
    }
  }
  return [...options].map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Older cached responses have no type; those predate the filter and count as games. */
export function matchesDealFilters(deal, store, genre, content = 'all') {
  return (content === 'all' || (deal.contentType || 'game') === content)
    && (store === 'all' || (deal.storeKey || deal.store) === store)
    && (genre === 'all' || (deal.genres || []).some(
      value => typeof value === 'string' && value.trim().toLowerCase() === genre
    ));
}
