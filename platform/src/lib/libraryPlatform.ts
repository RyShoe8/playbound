/**
 * Which device a library entry belongs to.
 *
 * A library entry is per-platform, not per-account: installing SuperTuxKart
 * from the Play Store on a phone says nothing about whether it is installed on
 * the user's desktop. Showing it in the desktop library would be a claim we
 * cannot support, and "Play" there would do nothing.
 *
 *   desktop  installed through the PlayBound launcher
 *   android  installed from Google Play
 *   ios      installed from the App Store
 *   web      browser games, which need no install and run anywhere
 */
export const LIBRARY_PLATFORMS = ["desktop", "android", "ios", "web"] as const;
export type LibraryPlatform = (typeof LIBRARY_PLATFORMS)[number];

export const LIBRARY_PLATFORM_LABELS: Record<LibraryPlatform, string> = {
  desktop: "Desktop",
  android: "Android",
  ios: "iOS",
  web: "Browser",
};

export function isLibraryPlatform(value: unknown): value is LibraryPlatform {
  return typeof value === "string" && (LIBRARY_PLATFORMS as readonly string[]).includes(value);
}

/**
 * Best guess at the platform from a User-Agent.
 *
 * Deliberately server-side: the client could claim any platform, and a wrong
 * claim would put a game in the wrong library. Defaults to desktop, which is
 * also what every pre-existing entry is — they were all written by the
 * launcher, which only runs on desktop.
 */
export function platformFromUserAgent(ua: string | null | undefined): LibraryPlatform {
  const raw = ua || "";
  // iPadOS 13+ reports a desktop Safari UA, distinguishable only by touch
  // support, which is not visible here. Those land in "desktop" — the same
  // place the launcher would put them, so nothing is lost.
  if (/iPhone|iPad|iPod/i.test(raw)) return "ios";
  if (/Android/i.test(raw)) return "android";
  return "desktop";
}

/** Platform for a request, from its User-Agent header. */
export function platformFromRequest(req: Request): LibraryPlatform {
  return platformFromUserAgent(req.headers.get("user-agent"));
}

/**
 * Platforms whose entries should be visible to a viewer on `platform`.
 *
 * Browser games are included everywhere: they need no install and run on
 * whatever device is asking, so hiding them from a desktop viewer because
 * they were first played on a phone would be wrong.
 */
export function visiblePlatformsFor(platform: LibraryPlatform): LibraryPlatform[] {
  return platform === "web" ? ["web"] : [platform, "web"];
}
