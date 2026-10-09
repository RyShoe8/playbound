import { listGames } from "@/lib/catalog";
import { comparisons, type Comparison } from "@/lib/data/comparisons";

/**
 * Comparisons whose games are all publicly available.
 *
 * A comparison page resolves both games through getGame, which returns only
 * published games. When one is a draft, testing or retired title the page falls
 * through to notFound() — but a statically generated route answers that with
 * HTTP 200 and the empty "page not found" shell, so crawlers saw dozens of thin
 * pages with no H1 that were never meant to exist. Listing, generating and
 * sitemapping only the pairs that can render keeps every comparison URL real.
 *
 * Fails open: if the catalog cannot be read at all, every comparison is
 * returned rather than silently emptying the sitemap and the index.
 */
export async function availableComparisons(): Promise<Comparison[]> {
  let live: Set<string>;
  try {
    live = new Set((await listGames()).map((g) => g.slug));
  } catch {
    return comparisons;
  }
  if (live.size === 0) return comparisons;
  return comparisons.filter((c) => live.has(c.aSlug) && (Boolean(c.bExternal) || live.has(c.bSlug)));
}

export async function availableComparisonsFeaturing(slug: string): Promise<Comparison[]> {
  return (await availableComparisons()).filter((c) => c.aSlug === slug || c.bSlug === slug);
}
