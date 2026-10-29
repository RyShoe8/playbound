import { unstable_cache } from "next/cache";
import { listGamesForJoin } from "@/lib/catalog";
import { listStoredPublicEditionChips } from "@/lib/editions";

export type EditionChipMap = Record<string, Array<[slug: string, name: string]>>;

/**
 * Edition chips for game cards, read from the live catalog.
 *
 * The static `editionChipsData.ts` is generated from the editions seed, which
 * the database has since moved past: editions deleted or hidden in admin kept
 * their chips, so cards linked to pages that answer "Edition Not Found". This
 * applies the same rules as the static generator (stored editions only, no
 * lone generic Official) but over what the pages themselves resolve, so a chip
 * can only point at an edition that exists.
 *
 * Cached for 15 minutes under the catalog tag; admin edits drop it. Returns
 * null on failure so the caller can fall back to the static data rather than
 * show no chips at all.
 */
async function computeEditionChips(): Promise<EditionChipMap | null> {
  try {
    const games = await listGamesForJoin({ includeTesting: false });
    const byGame = await listStoredPublicEditionChips(games.map((game) => game.slug));
    return Object.fromEntries(byGame);
  } catch (err) {
    console.error("[edition chips] live read failed, using static data:", err);
    return null;
  }
}

export function loadEditionChips(): Promise<EditionChipMap | null> {
  return unstable_cache(computeEditionChips, ["edition-chips-live"], {
    revalidate: 900,
    tags: ["catalog", "editions"],
  })();
}
