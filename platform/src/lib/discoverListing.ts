import type { Game } from "@/lib/data/types";
import type { HardwareRequirementsBlock, RequirementSpec } from "@/lib/hardware/types";

function cardRequirements(block?: HardwareRequirementsBlock | null): HardwareRequirementsBlock | undefined {
  if (!block) return undefined;
  const compact = (spec?: RequirementSpec): RequirementSpec | undefined => spec && ({
    os: spec.os, arch: spec.arch, cpuTier: spec.cpuTier, cpuText: spec.cpuText,
    gpuTier: spec.gpuTier, gpuText: spec.gpuText, ramMB: spec.ramMB,
    vramMB: spec.vramMB, storageMB: spec.storageMB, apis: spec.apis,
  });
  return { min: compact(block.min), recommended: compact(block.recommended) };
}

/** Fields consumed by the Discover filters and game cards. */
export type DiscoverListingGame = Pick<Game,
  | "slug" | "title" | "genres" | "tags" | "features" | "sizeMB"
  | "launchMethods" | "art" | "coverImage" | "browserPlayable"
  | "steamDeck" | "platforms" | "hardwareRequirements" | "access"
  | "status" | "website"
  | "hasControllerSupport"
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
    hardwareRequirements: cardRequirements(game.hardwareRequirements),
    access: game.access,
    status: game.status,
    website: game.website,
    hasControllerSupport: game.hasControllerSupport,
    multiplayer: multiplayer.multiplayer,
    isMultiplayer: multiplayer.isMultiplayer,
  };
}

/**
 * What a game card on the home page, the "more like this" row and the
 * editions row actually read. Deliberately not a superset of the Discover
 * listing: hardwareRequirements (the Discover hardware filter's input) and
 * the description were ~2 KB of each ~3.3 KB record and nothing on these
 * surfaces reads them, while the home page ships 90+ of these records.
 */
export type HomeCardGame = Omit<DiscoverListingGame, "hardwareRequirements"> &
  Pick<Game, "tagline" | "releaseYear" | "androidStoreUrl" | "iosStoreUrl"> & {
    launcherInstall?: { kind?: string; url?: string };
  };

export function toHomeCardGame(game: Game): HomeCardGame {
  const install = game.launcherInstall as { kind?: string; url?: string } | undefined;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hardwareRequirements: _hw, ...listing } = toDiscoverListingGame(game);
  return {
    ...listing,
    tagline: game.tagline,
    releaseYear: game.releaseYear,
    androidStoreUrl: game.androidStoreUrl,
    iosStoreUrl: game.iosStoreUrl,
    ...(install?.kind === "external" ? { launcherInstall: { kind: install.kind, url: install.url } } : {}),
  };
}
