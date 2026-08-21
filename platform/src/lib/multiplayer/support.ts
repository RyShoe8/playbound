/**
 * Whether a game is played with other people — one answer, in one place.
 *
 * There were four of these. `launcherInstall.ts` and `playTogether/multiplayer.ts`
 * both exported a function called `isMultiplayerGame` with different rules,
 * DiscoverFilters had a third inline, and the launcher consumed whichever the
 * API happened to serve. On ten realistic games they disagreed six times:
 *
 *   - a co-op-only game counted for the party picker but was hidden by the
 *     discover page's own "Multiplayer only" filter
 *   - a game with a server browser was offered in the party picker and then
 *     refused on join, because the picker and the join check used different
 *     rules
 *   - hotseat, LAN and split-screen counted for the party system and nowhere
 *     else
 *
 * Two identically named functions in two modules is what let that drift: an
 * import looks correct either way. Hence one name, one module, no re-exports
 * that could grow their own logic later.
 *
 * Types only, so this is safe to import from client components.
 */

import type { Game } from "@/lib/data/types";

/**
 * What counts as multiplayer, matched against features and tags.
 *
 * Both fields are read on purpose. The canonical vocabulary in
 * `gamePayload.FEATURES` covers Multiplayer, Singleplayer and Co-op, and
 * `dropPlayModeTags` strips the first two from tags on save — but hotseat, LAN
 * and split-screen are not in FEATURES at all and live in tags, so a
 * features-only rule would miss exactly the cases this list exists to catch.
 *
 * Written as anchored patterns rather than substrings because the short ones
 * are dangerous: a bare "lan" matches island, planet, Highlander and Milan.
 */
const MULTIPLAYER_PATTERNS: readonly RegExp[] = [
  /multi[-\s]?player/i,
  /\bco[-\s]?op/i, // co-op, coop, cooperative
  /\bmmo/i, // mmo, mmorpg
  /\bpvp/i,
  /hot[-\s]?seat/i,
  /\blan\b/i, // word-bounded — see above
  /split[-\s]?screen/i,
  /\bteam play/i,
  /cross[-\s]?play/i,
  /dedicated server/i,
  /deathmatch|battle royale/i,
];

type MultiplayerInput = {
  features?: string[];
  tags?: string[];
  launchMethods?: string[];
  /** Explicit override, when a curator has answered this directly. */
  multiplayer?: boolean;
};

/** A game with a server list is multiplayer whatever its features say. */
export function hasServerBrowser(game: { launchMethods?: string[] } | null | undefined): boolean {
  return Boolean(game?.launchMethods?.includes("server"));
}

/**
 * True when the game is played with other people, server list or not.
 *
 * An explicit `multiplayer` boolean wins over everything — including a false,
 * which is how a curator says "no" about a game whose tags would otherwise
 * read as yes.
 */
export function supportsMultiplayer(game: MultiplayerInput | null | undefined): boolean {
  if (!game) return false;
  if (typeof game.multiplayer === "boolean") return game.multiplayer;
  if (hasServerBrowser(game)) return true;

  const haystack = [...(game.features ?? []), ...(game.tags ?? [])].join(" | ");
  return MULTIPLAYER_PATTERNS.some((pattern) => pattern.test(haystack));
}

/**
 * Install kinds the launcher cannot party.
 *
 * `external` opens a website — there is no process for the launcher to start
 * with a host and port, so there is nothing for a party to coordinate.
 */
const UNPARTYABLE_KINDS = new Set(["external"]);

type LauncherPartyInput = MultiplayerInput & {
  launcherInstall?: { enabled?: boolean; kind?: string } | null;
};

/**
 * True when a party can actually put people into this game from the launcher.
 *
 * Narrower than `supportsMultiplayer` on purpose. A browser MMO is genuinely
 * multiplayer and genuinely cannot be partied through the launcher, because
 * the launcher never launches it — so party health for it measures nothing,
 * and a status light against it is noise dressed as a signal.
 */
export function supportsLauncherParty(game: LauncherPartyInput | null | undefined): boolean {
  if (!game || !supportsMultiplayer(game)) return false;
  const install = game.launcherInstall;
  if (!install?.enabled) return false;
  return !UNPARTYABLE_KINDS.has(String(install.kind));
}

/** Convenience for callers holding a full catalog Game. */
export function gameSupportsMultiplayer(game: Game | null | undefined): boolean {
  return supportsMultiplayer(game ?? undefined);
}
