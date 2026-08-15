import type { DeviceType } from "@/lib/compatibility/compatibility";
import type { LaunchMethod } from "@/lib/data/types";
import { isBrowserGame } from "@/lib/gameLaunch";

export type MobileOs = "android" | "ios" | "other";

export type MobileOutboundLabel =
  | "Play Free"
  | "Get It Free"
  | "Get on Google Play"
  | "Get on the App Store"
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
    return { href: game.androidStoreUrl, label: "Get on Google Play" };
  }
  if (os === "ios" && game.iosStoreUrl) {
    return { href: game.iosStoreUrl, label: "Get on the App Store" };
  }

  // Prefer any available store if OS is ambiguous.
  if (game.androidStoreUrl && !game.iosStoreUrl) {
    return { href: game.androidStoreUrl, label: "Get on Google Play" };
  }
  if (game.iosStoreUrl && !game.androidStoreUrl) {
    return { href: game.iosStoreUrl, label: "Get on the App Store" };
  }

  return { href: game.website, label: "Get It Free" };
}
