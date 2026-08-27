/**
 * Where a party's game server runs: the PlayBound VPS, or the host's own PC.
 *
 * This is the one place Connect answers that question, for the site, the
 * launcher API and the admin views alike.
 *
 * ── Why self-hosting is safe by default ──────────────────────────────────
 * Hosting on a home connection normally founders on NAT: the host's router
 * will not accept inbound traffic, and automatic port mapping is not always
 * available (probing a real home network during this work found neither UPnP
 * nor NAT-PMP). Connect already solves that a different way — it puts the
 * party on one overlay segment, so every member shares an L2 network and the
 * host is directly addressable with no port forwarding at all. That is the
 * same mechanism virtual-lan games have always used, and it is live in
 * production.
 *
 * So reachability inside a party is a solved problem, and self-hosting is a
 * reasonable default: lower latency, and the host keeps control of the room.
 * Port mapping stays as a second path for reaching a self-hosted room from
 * *outside* the party — a public lobby — where the overlay does not apply.
 *
 * ── Where the data comes from ────────────────────────────────────────────
 * Nothing here is hand-copied per game. Port and protocol, needed only for the
 * public-lobby path, are read from HOSTABLE_GAMES, already the authority on
 * what a game listens on. Adding a game there gives it self-hosting for free.
 */

import { HOSTABLE_GAMES, isHostableGame } from "@/lib/gameHost/catalog";
import {
  getMultiplayerAdapter,
  MULTIPLAYER_ADAPTERS,
  type PartyHostMode,
  type SelfHostConfig,
} from "./adapters";

export type { PartyHostMode };

/**
 * Games whose *client* can host, where that is not already obvious.
 *
 * Only `managed-server` games need to be listed. For them a dedicated server
 * is frequently a separate binary, so "the client can host too" has to be
 * seen to be believed — Warzone 2100 is here because its adapter note records
 * exactly that ("Native IP hosting and automated VPS dedicated server").
 *
 * `direct-ip` and `virtual-lan` games are deliberately absent: peer hosting is
 * the only way those games work at all, so their client hosting is not a
 * claim, it is the existing behaviour.
 */
export const CLIENT_HOSTING_VERIFIED: ReadonlySet<string> = new Set<string>([
  /*
   * Each entry records what established that this game's client can host.
   * Anything without evidence stays out — listUnverifiedClientHosting() is
   * what tracks the rest.
   */

  // Adapter note: "Native IP hosting and automated VPS dedicated server."
  "warzone-2100",

  /*
   * Our own launcher/services/openraNat.js exists for no other reason than to
   * open the inbound port an OpenRA *client* needs in order to host. Hosting
   * from the client is a thing this codebase already supports.
   */
  "openra",

  // Esc in-game -> "host game" starts a listen server on 6567, the port we
  // already have on file. https://mindustry.fandom.com/wiki/Multiplayer
  "mindustry",

  // Online -> Local Networking -> Create Server, default port 2759, matching
  // ours. https://github.com/supertuxkart/stk-code/blob/master/NETWORKING.md
  "supertuxkart",

  // The LAN screen offers joining a server or starting one.
  // https://www.hedgewars.org/wiki/Network_Game_Guide
  "hedgewars",

  /*
   * Qualified: every BZFlag game runs on bzfs, but the client can start it
   * ("either be run manually or started from within the game"), and bzfs ships
   * with the game. If a player turns out not to have it, hosting fails at the
   * game rather than anywhere in PlayBound.
   * https://wiki.bzflag.org/Creating_a_server
   */
  "bzflag",

  /*
   * The four below were confirmed in the client by hand, which is the standard
   * this list is meant to hold to.
   */

  // Create a world others connect to, with an announce option.
  "luanti",

  // Client can create a multiplayer server.
  "xonotic",

  // Start a multiplayer game, with local / invite-only / public visibility.
  "openttd",

  /*
   * The catalog slug, `0ad`, not the `0-ad` spelling HOSTABLE_GAMES uses. This
   * said "0-ad" and so never matched the live game: 0 A.D. was offered only
   * the dedicated mode despite its client hosting fine. canSelfHost now
   * resolves through the adapter's canonical slug so either spelling works,
   * but the entry names the real one.
   */
  "0ad",

  /*
   * Same idTech/Quake lineage as Xonotic, which was confirmed by hand: the
   * client starts a listen server from its own multiplayer menu. Enabled on
   * that basis rather than a separate test for each.
   */
  "openarena",
  "wolfenstein-enemy-territory",

  // Starting a new game brings up a server other players join — the client is
  // the host, which is exactly what this list is for.
  "freeciv",

  // The client offers "Host Networked Game" alongside starting a local one.
  "triplea",
]);

export interface HostModeOption {
  mode: PartyHostMode;
  available: boolean;
  label: string;
  hint: string;
}

/** True when the game's own networking is peer-hosted to begin with. */
function isPeerHostedGame(gameSlug: string): boolean {
  const type = getMultiplayerAdapter(gameSlug).adapterType;
  return type === "direct-ip" || type === "virtual-lan";
}

/**
 * Can a player host this game on their own machine?
 *
 * Three ways to qualify, in descending order of certainty:
 *   1. The adapter says so outright.
 *   2. The game is peer-hosted anyway, so hosting is how it already works.
 *   3. It is a managed-server game whose client hosting has been verified.
 */
export function canSelfHost(gameSlug: string): boolean {
  const adapter = getMultiplayerAdapter(gameSlug);
  if (adapter.selfHost) return adapter.selfHost.verified;
  if (isPeerHostedGame(gameSlug)) return true;
  /*
   * Checked against the adapter's canonical slug as well as the caller's, so
   * an alias spelling reads the same entry. Without this, `0ad` and `0-ad`
   * disagreed about whether the same game could be client-hosted.
   */
  return CLIENT_HOSTING_VERIFIED.has(adapter.gameSlug) || CLIENT_HOSTING_VERIFIED.has(gameSlug);
}

/**
 * Port/protocol for reaching a self-hosted room from outside the party.
 *
 * Null is not a failure. Party members reach the host over the overlay, which
 * needs no mapping — this is only consulted for the public-lobby path, and a
 * game with no port on file simply does not get one.
 */
export function publicLobbyPortFor(gameSlug: string): Pick<SelfHostConfig, "port" | "protocol"> | null {
  const declared = getMultiplayerAdapter(gameSlug).selfHost;
  if (declared?.port) return { port: declared.port, protocol: declared.protocol };
  const hostable = HOSTABLE_GAMES[gameSlug];
  if (!hostable) return null;
  return { port: hostable.defaultPort, protocol: hostable.protocol };
}

export function canUseDedicated(gameSlug: string): boolean {
  return isHostableGame(gameSlug);
}

/**
 * Every host mode a game supports.
 *
 * Empty means the game has no PlayBound-run multiplayer, and callers should
 * show no picker at all.
 */
export function hostModesFor(gameSlug: string): PartyHostMode[] {
  const modes: PartyHostMode[] = [];
  if (canSelfHost(gameSlug)) modes.push("self");
  if (canUseDedicated(gameSlug)) modes.push("dedicated");
  return modes;
}

/**
 * The mode to preselect: self-hosting wherever the game supports it.
 *
 * Safe because the party overlay carries reachability — see the file header.
 * A game that cannot be client-hosted falls back to the VPS.
 */
export function defaultHostMode(gameSlug: string): PartyHostMode | null {
  const modes = hostModesFor(gameSlug);
  if (modes.includes("dedicated")) return "dedicated";
  if (modes.includes("self")) return "self";
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
      mode: "self" as const,
      available: canSelfHost(gameSlug),
      label: "My computer",
      hint: "Your PC runs the game. Lowest latency, and your party reaches it over the PlayBound network — no port forwarding. The room ends when you quit.",
    },
    {
      mode: "dedicated" as const,
      available: canUseDedicated(gameSlug),
      label: "PlayBound server",
      hint: "We host the room on our server. It stays up even if you leave, and anyone can join without being in your party.",
    },
  ].filter((option) => option.available);
}

export interface HostModeConfigProblem {
  gameSlug: string;
  problem: string;
}

/**
 * Catch adapters that resolve to no multiplayer at all.
 *
 * A game typed `managed-server` promises a dedicated server on the VPS. If it
 * is not in HOSTABLE_GAMES there is no such server, and because
 * `managed-server` is also not peer-hosted, canSelfHost() says no too — so
 * hostModesFor() returns nothing and the game silently has no PlayBound
 * multiplayer whatsoever. Nothing surfaces that: the party UI just shows no
 * picker, which looks identical to a single-player game.
 *
 * Both GoldenEye: Source and Mr. Boom sat in that state, Mr. Boom while its
 * own notes field said outright that no dedicated server existed. This is the
 * check that would have caught them, and it is asserted in the test suite so
 * a new adapter cannot reintroduce the shape.
 *
 * Deliberately not a runtime throw. A misconfigured adapter should fail the
 * build, not take down a request path at 3am for a game nobody is playing.
 */
export function findHostModeConfigProblems(): HostModeConfigProblem[] {
  const problems: HostModeConfigProblem[] = [];

  for (const adapter of Object.values(MULTIPLAYER_ADAPTERS)) {
    const slug = adapter.gameSlug;

    if (adapter.adapterType === "managed-server" && !isHostableGame(slug)) {
      problems.push({
        gameSlug: slug,
        problem:
          "typed managed-server but absent from HOSTABLE_GAMES, so it has no dedicated server and " +
          "cannot self-host either — it resolves to no multiplayer at all. Add it to HOSTABLE_GAMES, " +
          "or retype it (direct-ip when the client hosts, official when PlayBound does not run it).",
      });
      continue;
    }

    /*
     * A declared selfHost that is turned off is fine and expected — that is
     * how a game waits for its host-and-join test. A declared selfHost with
     * no port is not: nothing can be mapped for a public lobby, and the
     * missing field is invisible until someone tries to host one.
     */
    if (adapter.selfHost?.verified && !adapter.selfHost.port) {
      problems.push({
        gameSlug: slug,
        problem: "declares a verified selfHost with no port, so a public lobby cannot be mapped.",
      });
    }
  }

  /*
   * The reverse direction: a game the VPS is configured to run, which claims
   * PlayBound does not run its multiplayer. One of the two is wrong.
   */
  for (const hostable of Object.values(HOSTABLE_GAMES)) {
    const adapter = MULTIPLAYER_ADAPTERS[hostable.slug];
    if (adapter && adapter.adapterType === "official") {
      problems.push({
        gameSlug: hostable.slug,
        problem: "is in HOSTABLE_GAMES but typed `official`, which says PlayBound does not run its multiplayer.",
      });
    }
  }

  return problems;
}

/**
 * Managed-server games still waiting on a host-and-join test before their
 * client-hosting option appears. Peer-hosted games are excluded — they never
 * needed verifying.
 */
export function listUnverifiedClientHosting(): Array<{
  gameSlug: string;
  title: string;
  port: number;
  protocol: "udp" | "tcp" | "both";
}> {
  return Object.values(HOSTABLE_GAMES)
    .filter((game) => !CLIENT_HOSTING_VERIFIED.has(game.slug) && !isPeerHostedGame(game.slug))
    .map((game) => ({
      gameSlug: game.slug,
      title: game.title,
      port: game.defaultPort,
      protocol: game.protocol,
    }));
}
