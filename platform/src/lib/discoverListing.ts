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

/**
 * A listing game plus the few extra fields the home page's hero and cards
 * read. The home page used to hand full Game records (long descriptions,
 * FAQs, install steps, every control binding) for the whole catalog to
 * client components: ~1.75 MB of RSC payload per visit for data no card
 * shows.
 */
export type HomeCardGame = DiscoverListingGame &
  Pick<Game, "tagline" | "description" | "releaseYear" | "androidStoreUrl" | "iosStoreUrl"> & {
    launcherInstall?: { kind?: string; url?: string };
  };

export function toHomeCardGame(game: Game): HomeCardGame {
  const install = game.launcherInstall as { kind?: string; url?: string } | undefined;
  return {
    ...toDiscoverListingGame(game),
    tagline: game.tagline,
    description: typeof game.description === "string" ? game.description.slice(0, 400) : game.description,
    releaseYear: game.releaseYear,
    androidStoreUrl: game.androidStoreUrl,
    iosStoreUrl: game.iosStoreUrl,
    ...(install?.kind === "external" ? { launcherInstall: { kind: install.kind, url: install.url } } : {}),
  };
}
