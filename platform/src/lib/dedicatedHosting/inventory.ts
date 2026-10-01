import { cacheLife, cacheTag } from "next/cache";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import Edition from "@/lib/models/Edition";
import CommunityServerProfile from "@/lib/models/CommunityServerProfile";
import { DEDICATED_ONLY_GAMES, HOSTABLE_SLUGS, HOSTABLE_SLUG_ALIASES } from "@/lib/gameHost/catalog";
import { isPendingDedicatedGame } from "./pendingGames";

export const HOSTING_INVENTORY_TAG = "hosting-inventory";

export type HostingInventoryGame = { gameSlug: string; title: string; editions: string[] };

export function assembleHostingInventory(
  games: Array<{ slug: string; title: string }>,
  editions: Array<{ gameSlug: string; slug: string; isDefault?: boolean }>,
  profiles: Array<{ gameSlug: string; editionSlug?: string | null }>,
): HostingInventoryGame[] {
  const byGame = new Map(games.filter((game) => !isPendingDedicatedGame(game.slug)).map((game) => [game.slug, { gameSlug: game.slug, title: game.title, editions: [] as string[] }]));
  for (const edition of editions) {
    const game = byGame.get(edition.gameSlug);
    if (game && !edition.isDefault && edition.slug !== "official" && edition.slug !== "base") game.editions.push(edition.slug);
  }
  for (const profile of profiles) {
    const game = byGame.get(profile.gameSlug);
    if (game && profile.editionSlug && profile.editionSlug !== "base" && profile.editionSlug !== "official") game.editions.push(profile.editionSlug);
  }
  return [...byGame.values()].map((game) => ({ ...game, editions: [...new Set(game.editions)] })).sort((a, b) => a.title.localeCompare(b.title));
}

/** Catalog records are authoritative. Code recipes only establish whether a DB game can be hosted. */
export async function loadHostingInventory(): Promise<HostingInventoryGame[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(HOSTING_INVENTORY_TAG);
  try {
    await dbConnect();
    const supported = new Set([...HOSTABLE_SLUGS.filter((slug) => !HOSTABLE_SLUG_ALIASES[slug]), ...Object.keys(DEDICATED_ONLY_GAMES)]);
    const [games, profiles] = await Promise.all([
      CatalogGame.find({ slug: { $in: [...supported] }, status: { $ne: "archived" } }).select("slug title").lean() as Promise<Array<{ slug: string; title: string }>>,
      CommunityServerProfile.find({ verification: { $ne: "blocked" } }).select("gameSlug editionSlug").lean() as Promise<Array<{ gameSlug: string; editionSlug?: string | null }>>,
    ]);
    const gameSlugs = new Set(games.map((game) => game.slug));
    const editions = await Edition.find({ gameSlug: { $in: [...gameSlugs] }, status: { $ne: "archived" }, visibility: { $ne: "hidden" }, suppressesSeed: { $ne: true } })
      .select("gameSlug slug isDefault").lean() as Array<{ gameSlug: string; slug: string; isDefault?: boolean }>;
    return assembleHostingInventory(games, editions, profiles);
  } catch {
    // The tier's explicit enrollment is the offline fallback, never the seed catalog.
    return [];
  }
}
