/** Install recipe kinds supported by the PlayBound Launcher. */
export const LAUNCHER_INSTALL_KINDS = [
  "github-zip",
  "github-installer",
  "github-jar",
  "direct-zip",
  "direct-installer",
  "direct-exe",
  "openttd-zip",
  "external",
] as const;

export type LauncherInstallKind = (typeof LAUNCHER_INSTALL_KINDS)[number];

/** Stored on CatalogGame and used by site CTAs + launcher API. */
export type LauncherInstall = {
  enabled: boolean;
  kind: LauncherInstallKind;
  repo?: string | null;
  assetPattern?: string | null;
  exeHint?: string | null;
  url?: string | null;
  fileName?: string | null;
  versionLabel?: string | null;
  knownExePaths?: string[];
  /** Expanded game/content root for mods (installer games where exe is nested). */
  installRoot?: string | null;
  connectArgs?: string[];
  note?: string | null;
};

/** Shape returned to the Electron launcher (catalog row). */
export type LauncherCatalogEntry = {
  slug: string;
  title: string;
  blurb: string;
  kind: LauncherInstallKind;
  repo?: string;
  assetPattern?: string;
  exeHint?: string;
  url?: string;
  fileName?: string;
  versionLabel?: string;
  knownExePaths?: string[];
  installRoot?: string;
  connectArgs?: string[];
  note?: string;
  approxSize?: string;
  art: [string, string];
};

export function sizeLabelFromMB(sizeMB: number): string | undefined {
  if (!sizeMB || sizeMB <= 0) return undefined;
  return sizeMB >= 1000 ? `~${(sizeMB / 1000).toFixed(1)} GB` : `~${Math.round(sizeMB)} MB`;
}

export function isPcInstallCandidate(game: {
  platforms?: string[];
  launchMethods?: string[];
  browserPlayable?: boolean;
}): boolean {
  const platforms = game.platforms ?? [];
  const methods = game.launchMethods ?? [];
  if (game.browserPlayable && !methods.includes("install")) return false;
  if (!methods.includes("install")) return false;
  return platforms.some((p) => /windows|macos|linux/i.test(p));
}

export function defaultLauncherInstallForWebsite(website: string): LauncherInstall {
  return {
    enabled: true,
    kind: "external",
    url: website,
  };
}

/** One-click: make a draft PC-installable with an enabled external launcher recipe. */
export function enableInstallerSupportFields(game: {
  launchMethods: string[];
  platforms: string[];
  website: string;
  launcherInstall?: LauncherInstall | null;
}): {
  launchMethods: string[];
  platforms: string[];
  browserPlayable: false;
  launcherInstall: LauncherInstall;
} {
  const launchMethods = game.launchMethods.includes("install")
    ? [...game.launchMethods]
    : [...game.launchMethods, "install"];
  const platforms = game.platforms.some((p) => /windows/i.test(p))
    ? [...game.platforms]
    : [...game.platforms, "Windows"];

  const existing = game.launcherInstall;
  const launcherInstall =
    existing?.kind != null
      ? {
          ...existing,
          enabled: true,
          url: existing.url || game.website || existing.url,
        }
      : defaultLauncherInstallForWebsite(game.website || "https://example.com");

  return {
    launchMethods,
    platforms,
    browserPlayable: false,
    launcherInstall,
  };
}

export function toLauncherCatalogEntry(input: {
  slug: string;
  title: string;
  tagline: string;
  sizeMB: number;
  art: { from: string; to: string };
  launcherInstall: LauncherInstall;
}): LauncherCatalogEntry {
  const li = input.launcherInstall;
  const entry: LauncherCatalogEntry = {
    slug: input.slug,
    title: input.title,
    blurb: input.tagline,
    kind: li.kind,
    art: [input.art.from, input.art.to],
    approxSize: sizeLabelFromMB(input.sizeMB),
  };
  if (li.repo) entry.repo = li.repo;
  if (li.assetPattern) entry.assetPattern = li.assetPattern;
  if (li.exeHint) entry.exeHint = li.exeHint;
  if (li.url) entry.url = li.url;
  if (li.fileName) entry.fileName = li.fileName;
  if (li.versionLabel) entry.versionLabel = li.versionLabel;
  if (li.knownExePaths?.length) entry.knownExePaths = li.knownExePaths;
  if (li.installRoot) entry.installRoot = li.installRoot;
  if (li.connectArgs?.length) entry.connectArgs = li.connectArgs;
  if (li.note) entry.note = li.note;
  return entry;
}
