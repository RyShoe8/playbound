/**
 * Which games a whole party can actually play together.
 *
 * A party is frequently mixed — someone on Windows, someone on Linux — and the
 * game picker has to reflect that. Offering a Windows-only game to a party with
 * a Linux member is not a small cosmetic problem: the leader picks it, the
 * party commits, and the Linux member is stranded on "not available for your
 * platform" with the whole group already waiting.
 *
 * Resolved in one place so the site and the launcher cannot disagree about what
 * a party can play, the same way host modes are.
 */

import { PARTY_MAX_SIZE } from "@/lib/playTogether/types";

/** Presence OS values that correspond to a desktop platform we ship games for. */
const OS_TO_PLATFORM: Record<string, string> = {
  windows: "windows",
  macos: "macos",
  linux: "linux",
};

/**
 * Normalise a catalog platform label. The catalog writes "Windows", "macOS",
 * "Linux", "Web" and friends; presence writes lowercase.
 */
export function normalizePlatform(value: string): string {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "osx" || raw === "mac" || raw === "mac os") return "macos";
  if (raw === "win") return "windows";
  return raw;
}

/**
 * The desktop platforms a party has to satisfy.
 *
 * "unknown" members are skipped on purpose. Presence only exists once someone
 * has the launcher open, so a member who has just been invited, or is on the
 * website, has no OS on record — and narrowing everyone's options based on a
 * value we do not have would be worse than not filtering.
 */
export function requiredPlatformsFor(memberOs: Array<string | null | undefined>): string[] {
  const needed = new Set<string>();
  for (const os of memberOs) {
    const platform = OS_TO_PLATFORM[String(os || "").toLowerCase()];
    if (platform) needed.add(platform);
  }
  return [...needed];
}

/**
 * Can everyone in the party run this game?
 *
 * Browser games pass regardless — a browser is on every desktop, and the
 * catalog marks them `browserPlayable` rather than listing three platforms.
 *
 * A game with no platforms listed also passes. That is missing data, not a
 * statement of incompatibility, and hiding a game because its catalog entry is
 * incomplete is the wrong failure direction: the player can still see it is
 * unsupported at install time, whereas a silently absent game looks like it
 * left the catalog.
 */
export function gamePlayableByAll(
  game: { platforms?: string[] | null; browserPlayable?: boolean | null },
  requiredPlatforms: string[]
): boolean {
  if (requiredPlatforms.length === 0) return true;
  if (game.browserPlayable) return true;

  const supported = new Set((game.platforms || []).map(normalizePlatform).filter(Boolean));
  if (supported.size === 0) return true;
  if (supported.has("web")) return true;

  return requiredPlatforms.every((platform) => supported.has(platform));
}

/**
 * Whether a game can seat this many party members.
 *
 * Unknown capacity defaults to PARTY_MAX_SIZE so the picker does not empty
 * before maxPlayers is curated. Explicit low values (e.g. 2) hide the game
 * from larger parties.
 */
export function fitsPartySize(
  maxPlayers: number | null | undefined,
  memberCount: number
): boolean {
  const seats = typeof maxPlayers === "number" && maxPlayers > 0 ? maxPlayers : PARTY_MAX_SIZE;
  const need = Math.max(1, Number(memberCount) || 1);
  return seats >= need;
}

/**
 * Option label for the party game picker.
 *
 * Genres and Testing share one tag trail. Couch co-op is not tagged here —
 * Multiplayer Type already filters the list to couch or online.
 */
export function partyGameOptionLabel(
  title: string,
  opts: {
    testing?: boolean;
    genres?: readonly string[] | null;
  } = {}
): string {
  const tags: string[] = [];
  for (const genre of opts.genres || []) {
    const trimmed = String(genre || "").trim();
    if (!trimmed) continue;
    if (tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) continue;
    tags.push(trimmed);
    if (tags.length >= 3) break;
  }
  if (opts.testing) tags.push("Testing");
  if (tags.length === 0) return title;
  return `${title} · ${tags.join(" · ")}`;
}

/** Filter a game list down to what the whole party can run. */
export function filterGamesForParty<T extends { platforms?: string[] | null; browserPlayable?: boolean | null }>(
  games: T[],
  requiredPlatforms: string[]
): T[] {
  if (requiredPlatforms.length === 0) return games;
  return games.filter((game) => gamePlayableByAll(game, requiredPlatforms));
}
