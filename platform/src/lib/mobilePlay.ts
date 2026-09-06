import type { DeviceType } from "@/lib/compatibility/compatibility";
import type { LaunchMethod } from "@/lib/data/types";
import { isBrowserGame } from "@/lib/gameLaunch";

export type MobileOs = "android" | "ios" | "other";

export type MobileOutboundLabel =
  | "Play Free"
  | "Get on Google Play"
  | "Get on the App Store"
  | "Download APK"
  | "Open official site";

export type MobileOutbound = {
  href: string;
  label: MobileOutboundLabel;
};

export type MobilePlayGame = {
  website: string;
  androidStoreUrl?: string | null;
  iosStoreUrl?: string | null;
  browserPlayable: boolean;
  launchMethods: LaunchMethod[];
};

/**
 * Whether an Android URL is a Play Store listing or a direct download.
 *
 * androidStoreUrl has always been documented as "Google Play / Android
 * download page", but the label was hard-coded to Google Play — so a game
 * distributed as an APK from its own site advertised a store listing it does
 * not have. Re-Volt is the case: RVGL publishes an Android build, and it has
 * never been on Play.
 */
export function isPlayStoreUrl(url: string | null | undefined): boolean {
  try {
    return /(^|\.)play\.google\.com$/i.test(new URL(String(url)).hostname);
  } catch {
    return false;
  }
}

/** A link that hands the browser an APK rather than a page about one. */
export function isApkUrl(url: string | null | undefined): boolean {
  try {
    return /\.apk$/i.test(new URL(String(url)).pathname);
  } catch {
    return false;
  }
}

/** What to call an Android destination, based on what it actually is. */
function androidLabel(url: string): MobileOutboundLabel {
  if (isPlayStoreUrl(url)) return "Get on Google Play";
  if (isApkUrl(url)) return "Download APK";
  return "Open official site";
}

/** Desktop & Linux get the PlayBound Launcher; phones/tablets never do. */
export function shouldOfferLauncher(device: DeviceType): boolean {
  return device === "desktop" || device === "macos" || device === "linux";
}

/**
 * Server/UA fallback when viewport class is unavailable.
 * Phones/tablets reporting mobile OS never get launcher downloads.
 */
export function shouldOfferLauncherFromUa(ua: string | null | undefined): boolean {
  const raw = ua || "";
  if (/Android/i.test(raw)) return false;
  if (/iPhone|iPad|iPod/i.test(raw)) return false;
  return true;
}

export function parseMobileOs(ua: string | null | undefined): MobileOs {
  const raw = ua || "";
  if (/Android/i.test(raw)) return "android";
  if (/iPhone|iPad|iPod/i.test(raw)) return "ios";
  return "other";
}

/**
 * Outbound install/play target for mobile/tablet.
 * Prefer browser play → matching store URL → official website.
 */
export function resolveMobileOutbound(
  game: MobilePlayGame,
  os: MobileOs
): MobileOutbound {
  if (isBrowserGame(game)) {
    return { href: game.website, label: "Play Free" };
  }

  if (os === "android" && game.androidStoreUrl) {
    return { href: game.androidStoreUrl, label: androidLabel(game.androidStoreUrl) };
  }
  if (os === "ios" && game.iosStoreUrl) {
    return { href: game.iosStoreUrl, label: "Get on the App Store" };
  }

  // Prefer any available store only when the OS is genuinely ambiguous.
  // A known iOS user must never be sent to Google Play (and vice versa).
  if (os === "other" && game.androidStoreUrl && !game.iosStoreUrl) {
    return { href: game.androidStoreUrl, label: androidLabel(game.androidStoreUrl) };
  }
  if (os === "other" && game.iosStoreUrl && !game.androidStoreUrl) {
    return { href: game.iosStoreUrl, label: "Get on the App Store" };
  }

  /*
   * No store we can send this person to, so do not imply there is one.
   *
   * This used to read "Get It Free", which on a phone is a promise to install
   * an app — and MobileOutboundCta picks its icon from the label, so it drew a
   * download arrow for games that have no mobile build to download. Re-Volt is
   * the case: listed for Android because RVGL has an Android build, but it is
   * not on Google Play, so the button offered an install that does not exist.
   *
   * "Open official site" is what actually happens next, and the component
   * already draws an external-link icon for it — that branch existed before
   * anything returned this label.
   */
  return { href: game.website, label: "Open official site" };
}
