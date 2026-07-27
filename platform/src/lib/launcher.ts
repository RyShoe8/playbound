/**
 * Games the desktop launcher can one-click install (non-external catalog entries).
 * Keep in sync with launcher/catalog.js kinds: github-zip | github-installer | direct-zip.
 */
export const ONE_CLICK_SLUGS = [
  "openra",
  "endless-sky",
  "warzone-2100",
  "supertuxkart",
  "luanti",
  "xonotic",
  "naev",
] as const;

export type OneClickSlug = (typeof ONE_CLICK_SLUGS)[number];

export function isOneClickSlug(slug: string): slug is OneClickSlug {
  return (ONE_CLICK_SLUGS as readonly string[]).includes(slug);
}

/** Deep link that hands off to the installed PlayBound Launcher. */
export function launcherInstallUrl(slug: string): string {
  return `playbound://install/${slug}`;
}

/** Join a multiplayer server via the PlayBound Launcher. */
export function launcherJoinUrl(slug: string, host: string, port: number, name?: string): string {
  const q = new URLSearchParams({ host, port: String(port) });
  if (name) q.set("name", name.slice(0, 80));
  return `playbound://join/${slug}?${q.toString()}`;
}

/** One-click mod install into the base game folder. */
export function launcherInstallModUrl(slug: string): string {
  return `playbound://install-mod/${slug}`;
}

/** Deep link that opens the launcher auth / library sync flow. */
export function launcherAuthUrl(): string {
  return "playbound://auth";
}

/** Deep link that hands a launcher token to the desktop app. */
export function launcherLinkUrl(token: string): string {
  return `playbound://link?token=${encodeURIComponent(token)}`;
}

/** Launch an installed game via the PlayBound Launcher. */
export function launcherPlayUrl(slug: string): string {
  return `playbound://play/${slug}`;
}
