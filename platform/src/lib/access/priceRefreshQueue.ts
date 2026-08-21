/**
 * Ordering for the nightly price refresh.
 *
 * The refresh can only afford so many storefront lookups per run, so the order
 * it visits games in decides which prices are ever updated at all. Ordering by
 * natural document order — which is what it did — meant the head of the list
 * was eligible every night, spent the whole budget every night, and the tail
 * was never priced.
 *
 * Pulled out of the route so the rotation is testable. Whether a capped job
 * eventually covers everything is a property worth asserting, not assuming.
 */

export type CheckedOffer = { lastCheckedAt?: string | null };

/**
 * When a game was last priced, taken from its stalest offer.
 *
 * A game with no offers, or one that has never been checked, sorts to 0 — the
 * front of the queue. That is deliberate: an offer with no price yet is more
 * urgent than one carrying a price from yesterday.
 */
export function stalestCheckedAt(offers: readonly CheckedOffer[]): number {
  let oldest = Number.POSITIVE_INFINITY;
  for (const offer of offers) {
    const at = offer.lastCheckedAt ? new Date(offer.lastCheckedAt).getTime() : 0;
    oldest = Math.min(oldest, Number.isFinite(at) ? at : 0);
  }
  return Number.isFinite(oldest) ? oldest : 0;
}

/**
 * Least-recently-priced first.
 *
 * `getOffers` is called once per entry rather than from inside the comparator,
 * which would re-parse every offer array O(n log n) times.
 */
export function orderByStalest<T>(
  items: readonly T[],
  getOffers: (item: T) => readonly CheckedOffer[]
): T[] {
  return items
    .map((item) => ({ item, stalest: stalestCheckedAt(getOffers(item)) }))
    .sort((a, b) => a.stalest - b.stalest)
    .map((row) => row.item);
}
