/**
 * Deep links and installability for the PlayBound Launcher.
 */
import type { Game } from "@/lib/data/types";
import { isPcInstallCandidate, type LauncherInstall } from "@/lib/launcherInstall";
import { launcherInstallBySlug } from "@/lib/data/launcherInstall";
import { isBrowserGame } from "@/lib/gameLaunch";

export function resolveLauncherInstall(game: Pick<Game, "slug" | "launcherInstall" | "website">): LauncherInstall | null {
  if (game.launcherInstall?.kind) return game.launcherInstall;
  return launcherInstallBySlug[game.slug] ?? null;
}

/** True when the site should show Install with PlayBound Launcher. */
export function isLauncherInstallable(
  game: Pick<Game, "slug" | "platforms" | "launchMethods" | "browserPlayable" | "launcherInstall" | "website">
): boolean {
  if (isBrowserGame(game)) return false;
  if (!isPcInstallCandidate(game)) return false;
  const recipe = resolveLauncherInstall(game);
  return Boolean(recipe?.enabled && recipe.kind);
}

/** @deprecated Prefer isLauncherInstallable(game). Kept for callers that only have a slug. */
export function isOneClickSlug(slug: string): boolean {
  const seed = launcherInstallBySlug[slug];
  return Boolean(seed?.enabled && seed.kind);
}

/** Deep link that hands off to the installed PlayBound Launcher. */
export function launcherInstallUrl(slug: string, editionSlug?: string | null): string {
  if (editionSlug) {
    return `playbound://install/${slug}?edition=${encodeURIComponent(editionSlug)}`;
  }
  return `playbound://install/${slug}`;
}

/** Join a multiplayer server via the PlayBound Launcher. */
export function launcherJoinUrl(
  slug: string,
  host: string,
  port: number,
  name?: string,
  /** OpenRA engine variant (ra/cnc/d2k) when the server list knows it. See deepLinks.js. */
  gameMod?: string | null
): string {
  const q = new URLSearchParams({ host, port: String(port) });
  if (name) q.set("name", name.slice(0, 80));
  if (gameMod) q.set("gameMod", gameMod);
  return `playbound://join/${slug}?${q.toString()}`;
}

/** One-click mod install into the base game folder. */
export function launcherInstallModUrl(slug: string): string {
  return `playbound://install-mod/${slug}`;
}

/** Deep link that opens the browser connect page (remint). Prefer launcherSyncUrl for sync. */
export function launcherAuthUrl(): string {
  return "playbound://auth";
}

/** Deep link that syncs local installs with the saved launcher token (no remint). */
export function launcherSyncUrl(): string {
  return "playbound://sync";
}

/** Deep link that hands a one-time handoff code to the desktop app (never the durable bearer). */
export function launcherLinkUrl(code: string): string {
  return `playbound://link?code=${encodeURIComponent(code)}`;
}

/** Launch an installed game via the PlayBound Launcher. */
export function launcherPlayUrl(slug: string, editionSlug?: string | null): string {
  if (editionSlug) {
    return `playbound://play/${slug}?edition=${encodeURIComponent(editionSlug)}`;
  }
  return `playbound://play/${slug}`;
}

/** Launch an installed mod (portable client or its base game) via the launcher. */
export function launcherPlayModUrl(slug: string): string {
  return `playbound://play-mod/${slug}`;
}

/** Uninstall a game via the launcher. */
export function launcherUninstallUrl(slug: string, editionSlug?: string | null): string {
  /*
   * Editions are the installable unit, and the launcher's deep link has always
   * accepted one here — uninstall is in its EDITION_ACTIONS set alongside
   * install and play. Without the parameter this removed the whole game, which
   * is the wrong scope when a player has three editions and wants one gone.
   */
  if (editionSlug) {
    return `playbound://uninstall/${slug}?edition=${encodeURIComponent(editionSlug)}`;
  }
  return `playbound://uninstall/${slug}`;
}

/** Open a game install folder via the launcher. */
export function launcherOpenFolderUrl(slug: string): string {
  return `playbound://open-folder/${slug}`;
}

/** Point the launcher at an existing install (Select .exe). */
export function launcherLocateUrl(slug: string): string {
  return `playbound://locate/${slug}`;
}

/** Uninstall / untrack a mod via the launcher. */
export function launcherUninstallModUrl(slug: string): string {
  return `playbound://uninstall-mod/${slug}`;
}

/** Open a mod install folder via the launcher. */
export function launcherOpenModFolderUrl(slug: string): string {
  return `playbound://open-folder-mod/${slug}`;
}
