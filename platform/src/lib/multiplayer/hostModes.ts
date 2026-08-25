/**
 * Where a party's game server runs: the PlayBound VPS, or the host's own PC.
 *
 * This is the one place Connect answers that question, for the site, the
 * launcher API and the admin views alike.
 *
 * Nothing here is hand-copied per game. A game's listen port and protocol are
 * the same whether the VPS runs it or a player does, so both are read from
 * HOSTABLE_GAMES — already the authority for "what does this game listen on".
 * Adding a game to that catalog therefore gives it self-hosting support for
 * free, which is the point: deploying to a future game is one entry, not two
 * that can drift apart.
 *
 * The only per-game fact that cannot be derived is whether the game's *client*
 * can host at all. A dedicated server is frequently a separate binary, and
 * "the client has a Host button" is not something to assume — so it lives in
 * SELF_HOST_VERIFIED below and is added only after someone has really hosted a
 * game and had another player join it.
 */

import { HOSTABLE_GAMES, isHostableGame } from "@/lib/gameHost/catalog";
import { getMultiplayerAdapter, type PartyHostMode, type SelfHostConfig } from "./adapters";

export type { PartyHostMode };

/**
 * Games where hosting from the player's own machine has been confirmed by an
 * actual host-and-join test.
 *
 * Warzone 2100 is here on the strength of its adapter note — "Native IP
 * hosting and automated VPS dedicated server" — which records that both paths
 * were exercised for that game.
 *
 * Every other VPS-hostable game already has working port/protocol data and
 * needs nothing but a real test to join this list. Adding a slug here is what
 * turns the option on in the UI.
 */
export const SELF_HOST_VERIFIED: ReadonlySet<string> = new Set<string>([
  "warzone-2100",
]);

export interface HostModeOption {
  mode: PartyHostMode;
  /** Whether this mode can actually be picked for this game right now. */
  available: boolean;
  label: string;
  hint: string;
}

/**
 * Self-host settings for a game, or null when the game cannot be self-hosted.
 *
 * An adapter may declare `selfHost` explicitly — that wins, and is how a game
 * that is *not* VPS-hostable can still offer self-hosting. Otherwise the
 * config is derived from the game-host catalog.
 */
export function selfHostConfigFor(gameSlug: string): SelfHostConfig | null {
  const declared = getMultiplayerAdapter(gameSlug).selfHost;
  if (declared) {
    return declared.verified ? declared : null;
  }
  const hostable = HOSTABLE_GAMES[gameSlug];
  if (!hostable) return null;
  if (!SELF_HOST_VERIFIED.has(gameSlug)) return null;
  return {
    port: hostable.defaultPort,
    protocol: hostable.protocol,
    verified: true,
  };
}

export function canSelfHost(gameSlug: string): boolean {
  return selfHostConfigFor(gameSlug) !== null;
}

export function canUseDedicated(gameSlug: string): boolean {
  return isHostableGame(gameSlug);
}

/**
 * Every host mode a game supports.
 *
 * Returns an empty array for a game with no PlayBound-run multiplayer at all,
 * which callers should read as "do not show a picker".
 */
export function hostModesFor(gameSlug: string): PartyHostMode[] {
  const modes: PartyHostMode[] = [];
  if (canUseDedicated(gameSlug)) modes.push("dedicated");
  if (canSelfHost(gameSlug)) modes.push("self");
  return modes;
}

/**
 * The mode to preselect.
 *
 * Dedicated whenever it exists. Connect's whole premise is that most home
 * connections cannot accept inbound traffic (see /connect), and that has not
 * changed: probing a real home network while building this found neither UPnP
 * nor NAT-PMP, so an automatic port mapping is genuinely unavailable to a
 * meaningful share of players. Defaulting to the VPS means a party works
 * without the host having to think about their router; self-hosting stays one
 * click away for anyone who wants it.
 */
export function defaultHostMode(gameSlug: string): PartyHostMode | null {
  const modes = hostModesFor(gameSlug);
  if (modes.includes("dedicated")) return "dedicated";
  return modes[0] ?? null;
}

/** Is this a mode the game actually supports? Guards untrusted input. */
export function isValidHostMode(gameSlug: string, mode: unknown): mode is PartyHostMode {
  return typeof mode === "string" && hostModesFor(gameSlug).includes(mode as PartyHostMode);
}

/** Picker options, in display order, with copy explaining the tradeoff. */
export function hostModeOptions(gameSlug: string): HostModeOption[] {
  return [
    {
      mode: "dedicated" as const,
      available: canUseDedicated(gameSlug),
      label: "PlayBound server",
      hint: "We host the room. Everyone connects out — no port forwarding, and it stays up if you leave.",
    },
    {
      mode: "self" as const,
      available: canSelfHost(gameSlug),
      label: "My computer",
      hint: "Your PC hosts. Lower latency for you, but your router has to accept inbound connections and the room ends when you quit.",
    },
  ].filter((option) => option.available);
}

/** Games wired for self-hosting but still awaiting a real host-and-join test. */
export function listUnverifiedSelfHostCandidates(): Array<{
  gameSlug: string;
  title: string;
  port: number;
  protocol: "udp" | "tcp" | "both";
}> {
  return Object.values(HOSTABLE_GAMES)
    .filter((game) => !SELF_HOST_VERIFIED.has(game.slug))
    .map((game) => ({
      gameSlug: game.slug,
      title: game.title,
      port: game.defaultPort,
      protocol: game.protocol,
    }));
}
