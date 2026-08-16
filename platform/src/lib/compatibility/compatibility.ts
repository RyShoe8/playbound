/**
 * Device ↔ game platform compatibility helpers.
 * Catalog platform strings are Title-case (see gamePayload.PLATFORMS):
 * Windows, macOS, Linux, Android, iOS, Web.
 */

export type DeviceType = "desktop" | "macos" | "linux" | "tablet" | "mobile";
export type CompatibilityFilterMode = "compatible" | "all";

export type GameLike = {
  platforms?: string[];
  browserPlayable?: boolean;
  steamDeck?: boolean;
};

const DESKTOP_PLATFORMS = new Set(["windows", "macos", "linux", "web", "browser"]);
const MOBILE_PLATFORMS = new Set(["android", "ios", "web", "browser"]);

/** Platforms considered compatible for a device class (normalized lowercase). */
export const PLATFORMS_FOR_DEVICE: Record<DeviceType, ReadonlySet<string>> = {
  desktop: DESKTOP_PLATFORMS,
  macos: new Set(["macos", "web", "browser"]),
  linux: new Set(["linux", "web", "browser"]),
  tablet: MOBILE_PLATFORMS,
  mobile: MOBILE_PLATFORMS,
};

/** Display order + labels for card badges. */
export const PLATFORM_BADGE_ORDER = [
  { key: "web", match: /^(web|browser)$/i, label: "Browser" },
  { key: "windows", match: /^windows$/i, label: "Windows" },
  { key: "macos", match: /^mac\s?os$/i, label: "macOS" },
  { key: "linux", match: /^linux$/i, label: "Linux" },
  { key: "android", match: /^android$/i, label: "Android" },
  { key: "ios", match: /^(ios|iphone|ipad)$/i, label: "iPhone" },
] as const;

export function normalizePlatform(value: string): string {
  const t = value.trim().toLowerCase();
  if (t === "browser" || t === "web") return "web";
  if (t === "mac os" || t === "macos" || t === "osx" || t === "mac") return "macos";
  if (t === "iphone" || t === "ipad") return "ios";
  if (t === "pc" || t === "win") return "windows";
  return t;
}

export function isMobileDevice(device: DeviceType): boolean {
  return device === "mobile" || device === "tablet";
}

/** Map UA parser device string → DeviceType (SSR seed only). */
export function deviceTypeFromUaDevice(
  uaDevice: string | undefined | null,
  uaOs?: string | null
): DeviceType {
  const d = (uaDevice || "").toLowerCase();
  const os = (uaOs || "").toLowerCase();
  if (d === "mobile") return "mobile";
  if (d === "tablet") return "tablet";
  if (os === "macos" || os === "mac os" || os === "darwin") return "macos";
  if (os === "linux") return "linux";
  return "desktop";
}

/** Mods inherit the base game, then apply their own platform list if set. */
export function isModCompatible(
  mod: GameLike,
  baseGame: GameLike | null | undefined,
  device: DeviceType
): boolean {
  if (baseGame && !isGameCompatible(baseGame, device)) return false;
  if (mod.platforms?.length) {
    return isGameCompatible({ platforms: mod.platforms }, device);
  }
  return Boolean(baseGame) || isGameCompatible(mod, device);
}

/** Editions inherit the parent game's platforms unless they declare their own. */
export function isEditionCompatible(
  edition: GameLike,
  game: GameLike,
  device: DeviceType
): boolean {
  if (!isGameCompatible(game, device)) return false;
  if (edition.platforms?.length) {
    return isGameCompatible({ ...game, platforms: edition.platforms }, device);
  }
  return true;
}

/** Compatible editions first; original order is otherwise preserved. */
export function sortEditionsByCompatibility<T extends GameLike>(
  editions: T[],
  game: GameLike,
  device: DeviceType
): T[] {
  return editions
    .map((edition, index) => ({ edition, index }))
    .sort((a, b) => {
      const ac = isEditionCompatible(a.edition, game, device) ? 0 : 1;
      const bc = isEditionCompatible(b.edition, game, device) ? 0 : 1;
      if (ac !== bc) return ac - bc;
      return a.index - b.index;
    })
    .map((row) => row.edition);
}

export function isGameCompatible(game: GameLike, device: DeviceType): boolean {
  if (game.browserPlayable) return true;

  const platforms = (game.platforms ?? []).map(normalizePlatform);
  const allowed = PLATFORMS_FOR_DEVICE[device];

  if (platforms.some((p) => allowed.has(p))) return true;

  // Steam Deck titles count as desktop & linux compatible even without an explicit native OS.
  if ((device === "desktop" || device === "linux") && game.steamDeck) return true;

  return false;
}

export type IncompatibilityBadge = "Mobile Only" | "PC Game";

/** Badge when showing All Games and the title is not for this device. */
export function incompatibilityBadge(
  game: GameLike,
  device: DeviceType
): IncompatibilityBadge | null {
  if (isGameCompatible(game, device)) return null;
  return isMobileDevice(device) ? "PC Game" : "Mobile Only";
}

export function filterGamesForPreference<T extends GameLike>(
  games: T[],
  mode: CompatibilityFilterMode,
  device: DeviceType
): T[] {
  if (mode === "all") return games;
  return games.filter((g) => isGameCompatible(g, device));
}

/**
 * Prefer compatible titles (~ratio) then fill with popular/incompatible so
 * recommendations stay useful without hard-excluding other platforms.
 */
export function prioritizeCompatible<T extends GameLike>(
  games: T[],
  device: DeviceType,
  options: { ratio?: number; limit?: number } = {}
): T[] {
  const ratio = options.ratio ?? 0.9;
  const limit = options.limit ?? games.length;

  const compatible: T[] = [];
  const other: T[] = [];
  for (const g of games) {
    if (isGameCompatible(g, device)) compatible.push(g);
    else other.push(g);
  }

  const compatibleSlots = Math.min(compatible.length, Math.ceil(limit * ratio));
  const remaining = Math.max(0, limit - compatibleSlots);
  return [...compatible.slice(0, compatibleSlots), ...other.slice(0, remaining)].slice(
    0,
    limit
  );
}

/** Unique badge rows for a game’s platforms (and Steam Deck when flagged). */
export function platformBadgeLabels(game: GameLike): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  const platforms = game.platforms ?? [];

  for (const def of PLATFORM_BADGE_ORDER) {
    if (!platforms.some((p) => def.match.test(p.trim()))) continue;
    if (seen.has(def.key)) continue;
    seen.add(def.key);
    labels.push(def.label);
  }

  // Any leftover platforms not in the known set
  for (const p of platforms) {
    const n = normalizePlatform(p);
    if (PLATFORM_BADGE_ORDER.some((d) => d.key === n)) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    labels.push(p.trim());
  }

  if (game.steamDeck && !seen.has("steamdeck")) {
    labels.push("Steam Deck");
  }

  return labels;
}
