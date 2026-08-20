/**
 * Cross-platform library union: show a title on this device when it is owned
 * locally, or owned elsewhere on a game that also runs here.
 */

import { normalizePlatform } from "@/lib/compatibility/compatibility";
import {
  isLibraryPlatform,
  type LibraryPlatform,
  visiblePlatformsFor,
} from "@/lib/libraryPlatform";

export type LibraryUnionGame = {
  slug: string;
  platforms?: string[];
  browserPlayable?: boolean;
  androidStoreUrl?: string | null;
  iosStoreUrl?: string | null;
  steamAppId?: string | null;
  launcherInstall?: { enabled?: boolean; kind?: string | null } | null;
};

export type LibraryRowInput = {
  gameSlug: string;
  platform?: string;
  installed?: boolean;
  saved?: boolean;
};

export type LibraryUnionEntry = {
  gameSlug: string;
  /** Installed on the viewer’s platform (or web). */
  installed: boolean;
  /** Saved locally and not installed here. */
  saved: boolean;
  /** Included because owned on another platform, not installed here. */
  ownedElsewhere: boolean;
};

function platformOf(r: { platform?: string }): LibraryPlatform {
  return isLibraryPlatform(r.platform) ? r.platform : "desktop";
}

function hasDesktopPath(game: LibraryUnionGame): boolean {
  const platforms = (game.platforms ?? []).map(normalizePlatform);
  if (platforms.some((p) => p === "windows" || p === "macos" || p === "linux")) {
    return true;
  }
  if (game.steamAppId) return true;
  if (game.launcherInstall?.enabled && game.launcherInstall.kind) return true;
  return false;
}

function hasMobilePath(game: LibraryUnionGame): boolean {
  if (game.androidStoreUrl || game.iosStoreUrl) return true;
  const platforms = (game.platforms ?? []).map(normalizePlatform);
  return platforms.some((p) => p === "android" || p === "ios");
}

/** Game can run on more than one device family (desktop ↔ mobile). */
export function isCrossPlatformGame(game: LibraryUnionGame): boolean {
  if (game.browserPlayable) return true;
  return hasDesktopPath(game) && hasMobilePath(game);
}

/** Whether this viewer can install/play the game on their current platform. */
export function gameCompatibleWithLibraryPlatform(
  game: LibraryUnionGame,
  viewer: LibraryPlatform
): boolean {
  if (game.browserPlayable) return true;
  const platforms = (game.platforms ?? []).map(normalizePlatform);

  if (viewer === "web") return game.browserPlayable || platforms.includes("web");

  if (viewer === "android") {
    return Boolean(game.androidStoreUrl) || platforms.includes("android");
  }
  if (viewer === "ios") {
    return Boolean(game.iosStoreUrl) || platforms.includes("ios");
  }

  // desktop
  return hasDesktopPath(game) || platforms.includes("web");
}

/**
 * Build the library list for a viewer: local rows plus remote-owned
 * cross-platform titles that can run on this device.
 */
export function buildLibraryUnionEntries(
  rows: LibraryRowInput[],
  gamesBySlug: Map<string, LibraryUnionGame>,
  viewerPlatform: LibraryPlatform
): { entries: LibraryUnionEntry[]; hiddenElsewhereCount: number } {
  const visible = new Set(visiblePlatformsFor(viewerPlatform));
  const bySlug = new Map<
    string,
    { localInstalled: boolean; localSaved: boolean; remoteOwned: boolean }
  >();

  for (const r of rows) {
    const slug = r.gameSlug;
    const p = platformOf(r);
    const owned = Boolean(r.installed) || Boolean(r.saved);
    if (!owned) continue;

    const cur = bySlug.get(slug) ?? {
      localInstalled: false,
      localSaved: false,
      remoteOwned: false,
    };

    if (visible.has(p)) {
      if (r.installed) cur.localInstalled = true;
      if (r.saved && !r.installed) cur.localSaved = true;
    } else {
      cur.remoteOwned = true;
    }
    bySlug.set(slug, cur);
  }

  const entries: LibraryUnionEntry[] = [];
  let hiddenElsewhereCount = 0;
  const countedHidden = new Set<string>();

  for (const [slug, state] of bySlug) {
    const localOwned = state.localInstalled || state.localSaved;
    if (localOwned) {
      entries.push({
        gameSlug: slug,
        installed: state.localInstalled,
        saved: state.localSaved && !state.localInstalled,
        ownedElsewhere: state.remoteOwned && !state.localInstalled,
      });
      continue;
    }

    if (!state.remoteOwned) continue;

    const game = gamesBySlug.get(slug);
    const compatible =
      viewerPlatform === "web" ||
      (game ? gameCompatibleWithLibraryPlatform(game, viewerPlatform) : false);

    if (compatible) {
      entries.push({
        gameSlug: slug,
        installed: false,
        saved: false,
        ownedElsewhere: true,
      });
    } else if (!countedHidden.has(slug)) {
      countedHidden.add(slug);
      hiddenElsewhereCount += 1;
    }
  }

  return { entries, hiddenElsewhereCount };
}
