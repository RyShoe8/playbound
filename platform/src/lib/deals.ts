import { listActiveDiscounts } from "@/lib/storeDiscounts/service";
import type { DiscountedGame } from "@/lib/dealsShared";

/**
 * Discounted games for /deals — sourced from the stores directly, not from
 * PlayBound's own catalog.
 *
 * This used to read `listGames()` and check `access.*Cents` on PlayBound's own
 * paid titles, which made "On sale now" empty almost every day: the catalog
 * only carries around eighteen paid games, and verified live, essentially none
 * of them are ever discounted on a normal day. The replacement scans the
 * stores themselves — see `src/lib/storeDiscounts/` — the same way the free
 * half of the page already works from store data rather than a catalog match.
 *
 * `DEEP_DISCOUNT_MIN_PERCENT` and the pure formatting helpers still live in
 * `lib/dealsShared.ts` and are re-exported here so server callers keep one
 * import site. See that file for why the split exists (a client-component
 * import boundary).
 */
export {
  DEEP_DISCOUNT_MIN_PERCENT,
  percentOff,
  formatCents,
} from "@/lib/dealsShared";
export type { DiscountedGame } from "@/lib/dealsShared";

/** Currently active store discounts at or above the deep-discount bar, deepest first. */
export async function listDiscountedGames(): Promise<DiscountedGame[]> {
  return listActiveDiscounts();
}
