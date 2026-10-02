import type { PublicHostingGame } from "./publicTier";
import type { HostingInventoryGame } from "./inventory";

/** Popularity comes from live playtime, with the catalog's install-count fallback. */
export function rankedHostingGames(
  enrolled: PublicHostingGame[],
  inventory: HostingInventoryGame[],
  popularSlugs: string[],
): PublicHostingGame[] {
  const titles = new Map(inventory.map((game) => [game.gameSlug, game.title]));
  const rank = new Map(popularSlugs.map((slug, index) => [slug, index]));
  return enrolled.map((game) => ({ ...game, title: titles.get(game.gameSlug) || game.title }))
    .sort((a, b) => (rank.get(a.gameSlug) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.gameSlug) ?? Number.MAX_SAFE_INTEGER) || a.title.localeCompare(b.title));
}
