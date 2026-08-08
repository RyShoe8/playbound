import type { Edition, InstallMethod } from "@/lib/editionTypes";
import { INSTALL_METHOD_LABELS } from "@/lib/editionTypes";

/**
 * Turning an install method into something a reader can act on.
 *
 * The UI renders an InstallAction and never branches on installMethod itself,
 * so adding a storefront or a new installer means adding a resolver here — no
 * component, route or schema changes. That is the "make installation
 * extensible" requirement: one registry, one shape out.
 */

export type InstallActionKind =
  /** Navigate somewhere (storefront, download, mobile store). */
  | "link"
  /** Hand off to the PlayBound desktop launcher via playbound://. */
  | "launcher"
  /** Play immediately in this tab. */
  | "browser"
  /** Nothing to click — show written steps. */
  | "instructions";

export interface InstallAction {
  kind: InstallActionKind;
  /** Button copy, e.g. "Install with PlayBound". */
  label: string;
  href?: string;
  /** Set when the destination is off-site. */
  external?: boolean;
  steps?: { platform?: string; text: string; command?: string | null }[];
  /** Shown under the button — caveats, client requirements, size. */
  note?: string;
  /** Why the action is unavailable, when it is. */
  unavailableReason?: string;
  /** Telemetry discriminator; mirrors the method that produced this. */
  method: InstallMethod;
}

type Resolver = (edition: Edition) => InstallAction;

function unavailable(edition: Edition, reason: string): InstallAction {
  return {
    kind: "instructions",
    label: INSTALL_METHOD_LABELS[edition.installMethod],
    method: edition.installMethod,
    unavailableReason: reason,
  };
}

/**
 * One resolver per install method.
 *
 * Each reads only its own config block, so a missing or malformed config for
 * one method can never affect another, and an unconfigured edition degrades to
 * an explanatory message rather than a dead button.
 */
const RESOLVERS: Record<InstallMethod, Resolver> = {
  playbound_installer: (edition) => {
    const cfg = edition.installConfig.playbound_installer;
    if (!cfg?.kind) {
      return unavailable(edition, "No installer recipe configured for this edition yet.");
    }
    return {
      kind: "launcher",
      label: "Install with PlayBound",
      // The launcher resolves edition metadata from the API by this path.
      href: `playbound://install/${edition.gameSlug}?edition=${encodeURIComponent(edition.slug)}`,
      method: "playbound_installer",
      note: cfg.note ?? undefined,
      steps: Array.isArray(cfg.steps) && cfg.steps.length ? cfg.steps : undefined,
    };
  },

  browser: (edition) => {
    const url = edition.installConfig.browser?.playUrl || edition.links.website;
    if (!url) return unavailable(edition, "No play URL configured for this edition yet.");
    return {
      kind: "browser",
      label: "Play now",
      href: url,
      external: true,
      method: "browser",
    };
  },

  steam: (edition) => {
    const appId = edition.installConfig.steam?.appId;
    if (!appId) return unavailable(edition, "No Steam app ID configured for this edition yet.");
    return {
      kind: "link",
      label: "Open in Steam",
      href: `https://store.steampowered.com/app/${appId}`,
      external: true,
      method: "steam",
    };
  },

  epic: (edition) => {
    const cfg = edition.installConfig.epic;
    const href = cfg?.launchUrl || (cfg?.productSlug
      ? `https://store.epicgames.com/p/${cfg.productSlug}`
      : undefined);
    if (!href) return unavailable(edition, "No Epic Games link configured for this edition yet.");
    return { kind: "link", label: "Get on Epic Games", href, external: true, method: "epic" };
  },

  gog: (edition) => {
    const href = edition.installConfig.gog?.productUrl;
    if (!href) return unavailable(edition, "No GOG link configured for this edition yet.");
    return { kind: "link", label: "Get on GOG", href, external: true, method: "gog" };
  },

  itch: (edition) => {
    const href = edition.installConfig.itch?.pageUrl;
    if (!href) return unavailable(edition, "No itch.io link configured for this edition yet.");
    return { kind: "link", label: "Get on itch.io", href, external: true, method: "itch" };
  },

  official_download: (edition) => {
    const cfg = edition.installConfig.official_download;
    const href = cfg?.url || edition.links.website;
    if (!href) return unavailable(edition, "No download URL configured for this edition yet.");
    const size = cfg?.sizeMB ? `${cfg.sizeMB >= 1024 ? (cfg.sizeMB / 1024).toFixed(1) + " GB" : cfg.sizeMB + " MB"}` : null;
    return {
      kind: "link",
      label: "Download",
      href,
      external: true,
      method: "official_download",
      note: size ? `Download size ${size}.` : undefined,
    };
  },

  external_installer: (edition) => {
    const cfg = edition.installConfig.external_installer;
    if (!cfg?.url) {
      return unavailable(edition, "No installer URL configured for this edition yet.");
    }
    return {
      kind: "link",
      label: "Get the installer",
      href: cfg.url,
      external: true,
      method: "external_installer",
      note: cfg.instructions,
    };
  },

  mobile_store: (edition) => {
    const cfg = edition.installConfig.mobile_store;
    const href = cfg?.androidUrl || cfg?.iosUrl;
    if (!href) return unavailable(edition, "No app store link configured for this edition yet.");
    const both = Boolean(cfg?.androidUrl && cfg?.iosUrl);
    return {
      kind: "link",
      label: both ? "Get on mobile" : cfg?.androidUrl ? "Get on Google Play" : "Get on the App Store",
      href,
      external: true,
      method: "mobile_store",
    };
  },

  manual: (edition) => {
    const steps = edition.installConfig.manual?.steps ?? [];
    if (steps.length === 0) {
      return unavailable(edition, "Installation instructions haven't been written yet.");
    }
    return {
      kind: "instructions",
      label: "How to install",
      steps,
      method: "manual",
    };
  },
};

/** Resolve the primary install action for an edition. */
export function resolveInstallAction(edition: Edition): InstallAction {
  const resolver = RESOLVERS[edition.installMethod];
  if (!resolver) {
    // An install method stored by a newer deploy than this one is running.
    return unavailable(edition, "This installation method isn't supported by this version yet.");
  }
  return resolver(edition);
}

/**
 * Secondary actions worth offering alongside the primary one — a mobile build
 * for a desktop edition, the raw download beside a launcher install.
 */
export function resolveSecondaryActions(edition: Edition): InstallAction[] {
  const out: InstallAction[] = [];
  const cfg = edition.installConfig;

  if (edition.installMethod !== "mobile_store" && cfg.mobile_store) {
    const mobile = RESOLVERS.mobile_store(edition);
    if (!mobile.unavailableReason) out.push(mobile);
  }
  if (edition.installMethod !== "browser" && cfg.browser?.playUrl) {
    const browser = RESOLVERS.browser(edition);
    if (!browser.unavailableReason) out.push(browser);
  }
  if (edition.installMethod === "playbound_installer" && cfg.official_download?.url) {
    const direct = RESOLVERS.official_download(edition);
    if (!direct.unavailableReason) {
      out.push({ ...direct, label: "Download manually" });
    }
  }
  return out;
}

/** Which config key a method reads. Drives the admin form's conditional fields. */
export function configKeyFor(method: InstallMethod): keyof Edition["installConfig"] {
  return method;
}
