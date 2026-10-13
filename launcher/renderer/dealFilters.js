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

export function matchesDealFilters(deal, store, genre) {
  return (store === 'all' || (deal.storeKey || deal.store) === store)
    && (genre === 'all' || (deal.genres || []).some(
      value => typeof value === 'string' && value.trim().toLowerCase() === genre
    ));
}
