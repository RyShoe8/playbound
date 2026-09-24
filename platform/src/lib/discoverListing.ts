import type { Game } from "@/lib/data/types";

/** Fields consumed by the Discover filters and game cards. */
export type DiscoverListingGame = Pick<Game,
  | "slug" | "title" | "genres" | "tags" | "features" | "sizeMB"
  | "launchMethods" | "art" | "coverImage" | "browserPlayable"
  | "steamDeck" | "platforms" | "hardwareRequirements" | "access"
  | "status" | "website"
> & { multiplayer?: boolean; isMultiplayer?: boolean };

export function toDiscoverListingGame(game: Game): DiscoverListingGame {
  const multiplayer = game as Game & { multiplayer?: boolean; isMultiplayer?: boolean };
  return {
    slug: game.slug,
    title: game.title,
    genres: game.genres,
    tags: game.tags,
    features: game.features,
    sizeMB: game.sizeMB,
    launchMethods: game.launchMethods,
    art: game.art,
    coverImage: game.coverImage,
    browserPlayable: game.browserPlayable,
    steamDeck: game.steamDeck,
    platforms: game.platforms,
    hardwareRequirements: game.hardwareRequirements,
    access: game.access,
    status: game.status,
    website: game.website,
    multiplayer: multiplayer.multiplayer,
    isMultiplayer: multiplayer.isMultiplayer,
  };
}
