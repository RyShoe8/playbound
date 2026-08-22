/**
 * Client/server version labels for hostable games on the Connect admin page.
 *
 * Client labels come from launcher install recipes (what we ship to players).
 * Expected server labels mirror platform/game-host/install.sh — live VPS probes
 * in health.gameVersions override these when available.
 */

import { launcherInstallBySlug } from "@/lib/data/launcherInstall";
import { gamesBySlug } from "@/lib/data/games";
import { HOSTABLE_GAMES } from "@/lib/gameHost/catalog";
import type { LauncherInstall } from "@/lib/launcherInstall";

/** Pinned server builds from install.sh — keep in sync when those change. */
export const EXPECTED_SERVER_VERSIONS: Record<string, string> = {
  openra: "Latest GitHub AppImage",
  openttd: "Ubuntu apt",
  luanti: "Ubuntu apt (luanti/minetest)",
  mindustry: "Latest GitHub jar",
  ysoccer: "PlayBound online",
  hedgewars: "Ubuntu apt",
  "warzone-2100": "Ubuntu apt",
  freeciv: "3.2.5",
  bzflag: "Ubuntu apt",
  supertuxkart: "Ubuntu apt",
  xonotic: "0.8.6",
  openarena: "Ubuntu apt",
  triplea: "Manual jar (if installed)",
  "0-ad": "Ubuntu apt",
  "wolfenstein-enemy-territory": "ET: Legacy (etlded)",
};

function installFor(slug: string): LauncherInstall | undefined {
  return launcherInstallBySlug[slug] ?? gamesBySlug.get(slug)?.launcherInstall ?? undefined;
}

function versionFromUrl(url: string): string | null {
  const patterns = [
    /Freeciv-([\d.]+)/i,
    /xonotic-([\d.]+)/i,
    /bzflag-([\d.]+)/i,
    /0ad-([\d.]+)/i,
    /Hedgewars-([\d.]+)/i,
    /openarena-([\d.]+)/i,
    /wesnoth-([\d.]+)/i,
    /ecwolf-([\d.]+)/i,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** Normalized label for party compatibility checks (strip build noise). */
export function normalizeVersionLabel(label: string | null | undefined): string {
  return String(label || "")
    .toLowerCase()
    .replace(/^v(?=\d)/, "")
    .replace(/[^a-z0-9.]+/g, "")
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "");
}

const NON_VERSION_HINTS =
  /error|exception|unrecognized|permission denied|invalid option|unhandled|console mode|gamedir|user error|bwrap|fatal/i;

/** True when a probed label looks like a real semver-ish build (not apt/manual/error text). */
export function hasComparableVersion(label: string | null | undefined): boolean {
  const raw = String(label || "").trim();
  if (!raw || raw === "—") return false;
  if (NON_VERSION_HINTS.test(raw)) return false;
  if (raw.length > 32) return false;
  const normalized = normalizeVersionLabel(raw);
  return /^\d+\.\d+(\.\d+)?(\.\d+)?$/.test(normalized);
}

export function clientVersionForHostableGame(slug: string): string {
  const install = installFor(slug);
  if (install?.versionLabel) return install.versionLabel;
  if (install?.url) {
    const fromUrl = versionFromUrl(install.url);
    if (fromUrl) return fromUrl;
  }
  if (install?.fileName) {
    const fromFile = versionFromUrl(install.fileName);
    if (fromFile) return fromFile;
  }
  if (
    install?.kind === "github-zip" ||
    install?.kind === "github-jar" ||
    install?.kind === "github-installer"
  ) {
    return "GitHub latest";
  }
  if (install?.kind === "openttd-zip") return "OpenTTD CDN latest";
  return "—";
}

export function expectedServerVersionForHostableGame(slug: string): string {
  return EXPECTED_SERVER_VERSIONS[slug] ?? "—";
}

export function versionsLikelyMismatch(
  clientVersion: string,
  serverVersion: string,
  slug?: string
): boolean {
  if (!hasComparableVersion(clientVersion) || !hasComparableVersion(serverVersion)) {
    return false;
  }
  const c = normalizeVersionLabel(clientVersion);
  const s = normalizeVersionLabel(serverVersion);
  if (!c || !s || c === "—" || s === "—") return false;
  if (c.includes("githublatest") || s.includes("ubuntuapt")) return false;
  if (c.includes("playboundonline") && s.includes("playboundonline")) return false;
  if (c === s) return false;
  // Same major.minor prefix (e.g. 3.2.5 client vs 3.2.5 server probe)
  if (c.startsWith(s) || s.startsWith(c)) return false;
  const cMajorMinor = c.match(/^(\d+\.\d+)/)?.[1];
  const sMajorMinor = s.match(/^(\d+\.\d+)/)?.[1];
  if (cMajorMinor && cMajorMinor === sMajorMinor) return false;
  // Mr Boom apt lags the launcher (5.4 vs 5.5) but major is compatible.
  if (slug === "mrboom") {
    const cMajor = c.match(/^(\d+)/)?.[1];
    const sMajor = s.match(/^(\d+)/)?.[1];
    if (cMajor && cMajor === sMajor) return false;
  }
  return true;
}

export type HostableGameVersionRow = {
  slug: string;
  title: string;
  clientVersion: string;
  serverVersion: string;
  serverVersionSource: "detected" | "expected";
  versionMismatch: boolean;
};

export function hostableGameVersionRows(
  detectedServerVersions: Record<string, string | null | undefined> = {}
): HostableGameVersionRow[] {
  return Object.values(HOSTABLE_GAMES).map((game) => {
    const clientVersion = clientVersionForHostableGame(game.slug);
    const detectedRaw = detectedServerVersions[game.slug];
    const detected =
      detectedRaw && hasComparableVersion(String(detectedRaw).trim())
        ? String(detectedRaw).trim()
        : null;
    const serverVersion = detected ?? expectedServerVersionForHostableGame(game.slug);
    return {
      slug: game.slug,
      title: game.title,
      clientVersion,
      serverVersion,
      serverVersionSource: detected ? "detected" : "expected",
      versionMismatch: detected
        ? versionsLikelyMismatch(clientVersion, serverVersion, game.slug)
        : false,
    };
  });
}
