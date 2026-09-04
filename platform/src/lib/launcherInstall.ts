/** Install recipe kinds supported by the PlayBound Launcher. */
export const LAUNCHER_INSTALL_KINDS = [
  "github-zip",
  "github-installer",
  "github-jar",
  "direct-zip",
  /**
   * Same fetch as direct-zip, for upstreams that only publish .7z — RetroArch
   * being the one that forced it. The launcher picks the extractor from the
   * file extension, so this exists to let a recipe say what it actually is
   * rather than mislabel a 7z as a zip.
   */
  "direct-7z",
  "direct-installer",
  "direct-exe",
  "openttd-zip",
  "itch-zip",
  /**
   * Owner-supplied: the launcher asks the player to locate a copy they already
   * own, copies it into the library, then overlays our content on top. Used
   * where the base game is commercial and not ours to distribute — the
   * EverQuest Titanium editions and Freelancer. The launcher has handled this
   * since installLocateThenZip; it was simply missing from this union, so the
   * game-level recipe could not express what editions already did.
   */
  "locate-then-zip",
  /** Anonymous public depot via a PlayBound-managed SteamCMD runtime. */
  "steamcmd",
  "external",
] as const;

export type LauncherInstallKind = (typeof LAUNCHER_INSTALL_KINDS)[number];

export type LauncherInstallAddon = {
  id: string;
  name: string;
  description?: string;
  url: string;
  fileName: string;
};

export type SteamPrerequisite = {
  /** Numeric Steam application ID installed through the desktop Steam client. */
  appId: string;
  name: string;
};

/** Stored on CatalogGame and used by site CTAs + launcher API. */
export type LauncherInstall = {
  enabled: boolean;
  kind: LauncherInstallKind;
  repo?: string | null;
  assetPattern?: string | null;
  exeHint?: string | null;
  url?: string | null;
  urlMac?: string | null;
  /** Intel Mac override; urlMac is the Apple Silicon / default build. */
  urlMacX64?: string | null;
  urlLinux?: string | null;
  fileName?: string | null;
  /** itch.io's upload_id for the specific file to grab when a page lists several downloads. */
  uploadId?: string | null;
  versionLabel?: string | null;
  knownExePaths?: string[];
  /** Arguments passed to the installed executable when Play is pressed. */
  launchArgs?: string[];
  steamAppId?: string | null;
  /** Steam-managed runtimes that must finish installing before this installer starts. */
  steamPrerequisites?: SteamPrerequisite[];
  /**
   * MD5 of the downloaded archive, verified before install.
   *
   * The launcher has always supported this — it reads the field and calls
   * verifyChecksumMd5 — but the type never declared it, so no recipe could set
   * one without a type error and nothing in the catalog was ever verified.
   * Worth setting wherever the host publishes a hash.
   */
  checksumMd5?: string | null;
  /** Extra DisplayName strings to match in Windows uninstall registry. */
  registryTitles?: string[];
  /** Expanded game/content root for mods (installer games where exe is nested). */
  installRoot?: string | null;
  connectArgs?: string[];
  note?: string | null;
  detectedVersion?: string | null;
  lastVersionCheckAt?: string | Date | null;
  versionCheckStatus?: string | null;
  versionCheckNote?: string | null;
  autoUpdatePinned?: boolean;
  addons?: LauncherInstallAddon[];
  overlayUrl?: string | null;
  overlayFileName?: string | null;
  /** Relative destination inside the game's own install folder for an overlay archive. */
  overlayDest?: string | null;
  /**
   * After extracting a zip that wraps everything in one folder, promote that
   * folder so overlayDest and exeHint resolve next to the real payload.
   */
  unwrapSingleRoot?: boolean;
  /**
   * Spawn through PlayBound-managed DOSBox Staging even if header sniffing
   * is unsure. Auto-detect still wraps any DOS-era image without this flag.
   */
  needsDosBox?: boolean;
  /**
   * Launch this game elevated.
   *
   * Curated per game rather than inferred, because Windows reports "this
   * executable requires elevation" and "antivirus blocked this executable" as
   * the same EACCES — so a launcher that guessed would throw a UAC prompt at
   * players whose real problem was Defender. Set it only for a title whose
   * loader genuinely demands administrator rights, such as Metal Slug
   * Awakening's msawminloader.exe.
   */
  needsAdmin?: boolean;
  /**
   * Windows-only: framework-dependent titles that need this .NET major
   * (Desktop Runtime). PlayBound downloads a portable copy under userData and
   * launches with DOTNET_ROOT when the machine does not already have one.
   * Space Station 14's SS14.Launcher is the first — net10.0.
   */
  needsDotNetMajor?: number;
  /**
   * Prompt for an existing install before doing anything else.
   *
   * Pairs with "locate-then-zip" for games PlayBound must not distribute: the
   * player points at their own copy, which is then copied into the library and
   * overlaid. Already honoured by the launcher and by edition install configs.
   */
  requiresBaseDir?: boolean;
};

/** Shape returned to the Electron launcher (catalog row). */
export type LauncherCatalogEntry = {
  slug: string;
  title: string;
  blurb: string;
  /** Carried so the launcher can offer the same Features filter the site does. */
  features?: string[];
  kind: LauncherInstallKind;
  repo?: string;
  assetPattern?: string;
  exeHint?: string;
  url?: string;
  urlMac?: string;
  urlMacX64?: string;
  urlLinux?: string;
  fileName?: string;
  uploadId?: string;
  versionLabel?: string;
  knownExePaths?: string[];
  launchArgs?: string[];
  steamAppId?: string;
  steamPrerequisites?: SteamPrerequisite[];
  checksumMd5?: string;
  registryTitles?: string[];
  installRoot?: string;
  connectArgs?: string[];
  note?: string;
  approxSize?: string;
  art: [string, string];
  coverImage?: string | null;
  genres?: string[];
  tags?: string[];
  /**
   * Carried so the launcher can tell a browser game from an installable one the
   * same way the site does. `kind: "external"` covers both — a browser title and
   * a live-service game with its own installer — so it cannot be the signal.
   */
  launchMethods?: string[];
  /** @deprecated Means "has a server browser". Use hasServerBrowser / isMultiplayer. */
  multiplayer?: boolean;
  /** Gates the Servers tab. */
  hasServerBrowser?: boolean;
  /** Drives the Multiplayer filter and chip. */
  isMultiplayer?: boolean;
  addons?: LauncherInstallAddon[];
  overlayUrl?: string;
  overlayFileName?: string;
  overlayDest?: string;
  unwrapSingleRoot?: boolean;
  needsDosBox?: boolean;
  /** Launch elevated; see the note on the install-config field. */
  needsAdmin?: boolean;
  /** Windows: portable .NET Desktop Runtime major to ensure before Play. */
  needsDotNetMajor?: number;
  /** Ask the player to locate a copy they own before installing anything. */
  requiresBaseDir?: boolean;
};

export function absoluteMediaUrl(pathOrUrl: string | null | undefined, origin: string): string | null {
  if (!pathOrUrl) return null;
  const s = String(pathOrUrl).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  const base = origin.replace(/\/$/, "");
  return s.startsWith("/") ? `${base}${s}` : `${base}/${s}`;
}

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

/**
 * Two questions the launcher used to answer with one field.
 *
 * `multiplayer` has always meant "has a browsable server list", because that is
 * what gates the Servers tab. The renderer also uses it for the Multiplayer
 * filter and chip, where it means something else entirely — so a game like
 * GameBuddies, which is nothing but multiplayer party games and has no server
 * list, was filtered out of Multiplayer. Twenty published games are in that
 * position.
 *
 * These two replace it. `multiplayer` is still sent, unchanged, because
 * launchers already in the wild gate the Servers tab on it; redefining it would
 * give all twenty an empty tab until everyone updated. Once builds have aged
 * out it can go.
 */
export { hasServerBrowser, supportsMultiplayer } from "@/lib/multiplayer/support";
import { hasServerBrowser, supportsMultiplayer } from "@/lib/multiplayer/support";

export function defaultLauncherInstallForWebsite(website: string): LauncherInstall {
  return {
    enabled: true,
    kind: "external",
    url: website,
  };
}

/** One-click: enable dedicated / multiplayer server support on a catalog game. */
export function enableServerSupportFields<M extends string>(game: {
  launchMethods: M[];
  features: string[];
}): {
  launchMethods: Array<M | "server">;
  features: string[];
} {
  const launchMethods: Array<M | "server"> = game.launchMethods.includes("server" as M)
    ? [...game.launchMethods]
    : [...game.launchMethods, "server"];
  const features = [...game.features];
  for (const f of ["Multiplayer", "Dedicated Servers"] as const) {
    if (!features.includes(f)) features.push(f);
  }
  return { launchMethods, features };
}

export function disableServerSupportFields<M extends string>(game: {
  launchMethods: M[];
}): {
  launchMethods: M[];
} {
  return {
    launchMethods: game.launchMethods.filter((m) => m !== ("server" as M)),
  };
}

/** One-click: make a draft PC-installable with an enabled external launcher recipe. */
export function enableInstallerSupportFields<M extends string>(game: {
  launchMethods: M[];
  platforms: string[];
  website: string;
  launcherInstall?: LauncherInstall | null;
}): {
  launchMethods: Array<M | "install">;
  platforms: string[];
  browserPlayable: false;
  launcherInstall: LauncherInstall;
} {
  const launchMethods: Array<M | "install"> = game.launchMethods.includes("install" as M)
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
  coverImage?: string | null;
  genres?: string[];
  tags?: string[];
  launchMethods?: string[];
  /** Needed for isMultiplayer — a game can be multiplayer with no server list. */
  features?: string[];
  origin?: string;
}): LauncherCatalogEntry {
  const li = input.launcherInstall;
  const entry: LauncherCatalogEntry = {
    slug: input.slug,
    title: input.title,
    blurb: input.tagline,
    kind: li.kind,
    art: [input.art.from, input.art.to],
    approxSize: sizeLabelFromMB(input.sizeMB),
    genres: Array.isArray(input.genres) ? input.genres : [],
    tags: Array.isArray(input.tags) ? input.tags : [],
    launchMethods: Array.isArray(input.launchMethods) ? input.launchMethods : [],
    features: Array.isArray(input.features) ? input.features : [],
    multiplayer: hasServerBrowser(input),
    hasServerBrowser: hasServerBrowser(input),
    isMultiplayer: supportsMultiplayer(input),
  };
  const cover = absoluteMediaUrl(input.coverImage, input.origin || "https://playbound.club");
  if (cover) entry.coverImage = cover;
  if (li.repo) entry.repo = li.repo;
  if (li.assetPattern) entry.assetPattern = li.assetPattern;
  if (li.exeHint) entry.exeHint = li.exeHint;
  if (li.url) entry.url = li.url;
  if (li.urlMac) entry.urlMac = li.urlMac;
  if (li.urlMacX64) entry.urlMacX64 = li.urlMacX64;
  if (li.urlLinux) entry.urlLinux = li.urlLinux;
  if (li.fileName) entry.fileName = li.fileName;
  if (li.uploadId) entry.uploadId = li.uploadId;
  if (li.versionLabel) entry.versionLabel = li.versionLabel;
  if (li.knownExePaths?.length) entry.knownExePaths = li.knownExePaths;
  if (li.launchArgs?.length) entry.launchArgs = li.launchArgs;
  if (li.steamAppId) entry.steamAppId = li.steamAppId;
  if (li.steamPrerequisites?.length) entry.steamPrerequisites = li.steamPrerequisites;
  if (li.checksumMd5) entry.checksumMd5 = li.checksumMd5;
  if (li.registryTitles?.length) entry.registryTitles = li.registryTitles;
  if (li.installRoot) entry.installRoot = li.installRoot;
  if (li.connectArgs?.length) entry.connectArgs = li.connectArgs;
  if (li.note) entry.note = li.note;
  if (li.addons?.length) entry.addons = li.addons;
  if (li.overlayUrl) entry.overlayUrl = li.overlayUrl;
  if (li.overlayFileName) entry.overlayFileName = li.overlayFileName;
  if (li.overlayDest) entry.overlayDest = li.overlayDest;
  if (li.unwrapSingleRoot) entry.unwrapSingleRoot = true;
  if (li.needsDosBox) entry.needsDosBox = true;
  if (li.needsAdmin) entry.needsAdmin = true;
  if (typeof li.needsDotNetMajor === "number" && li.needsDotNetMajor > 0) {
    entry.needsDotNetMajor = li.needsDotNetMajor;
  }
  /*
   * Without this the launcher never learns it must ask for an existing copy,
   * so an owner-supplied game would fall through to a normal install and fail
   * with nothing to download. LauncherCatalogEntry already declared the field;
   * only the mapping was missing.
   */
  if (li.requiresBaseDir) entry.requiresBaseDir = true;
  return entry;
}
