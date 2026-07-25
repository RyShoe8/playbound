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
