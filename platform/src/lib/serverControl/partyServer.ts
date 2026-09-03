/**
 * Server control for a party's room.
 *
 * Connect already decides where a party's server runs (see hostModes.ts). This
 * turns that decision into a control surface: which adapter, or a plain reason
 * why there are no controls to show.
 *
 * The reason matters as much as the adapter. "No controls" has several very
 * different causes — the party self-hosts, the game has no profile yet, the
 * room has not started — and a host staring at an empty panel deserves to be
 * told which.
 */

import { isHostableGame, getHostableGame } from "@/lib/gameHost/catalog";
import type { ServerControlAdapter } from "./adapter";
import { getServerSettingProfile, type ServerSettingValues } from "./settings";
import { createVpsAgentAdapter, type VpsAgentClient } from "./vpsAgent";
import { createLocalAdapter } from "./localAdapter";

/** The fields of a party document this module reads. Kept narrow on purpose. */
export interface PartyServerSource {
  _id: { toString(): string };
  gameSlug: string;
  gameTitle?: string | null;
  editionSlug?: string | null;
  openRaMod?: string | null;
  hostMode?: string | null;
  selfHostReady?: boolean | null;
  selfHostPort?: { port?: number | null } | null;
  selfHostControl?: {
    settings?: ServerSettingValues | null;
    desiredRevision?: number;
    appliedRevision?: number;
    lastError?: string | null;
  } | null;
  hosted?: {
    roomId?: string | null;
    status?: string | null;
    host?: string | null;
    port?: number | null;
    name?: string | null;
    error?: string | null;
    provisionedAt?: Date | null;
    settings?: ServerSettingValues | null;
  } | null;
}

/**
 * When the controls are being used, which decides what a change costs.
 *
 * `live` is a server that exists: a change reaches a running process, and for
 * most games that means a restart someone pays for. `pre-launch` is the room
 * that has not been asked for yet — the host is choosing what it starts as,
 * which costs nothing because there is nobody on it to disconnect.
 */
export type ServerControlPhase = "live" | "pre-launch";

export type ServerControlAvailability =
  | { available: true; phase: ServerControlPhase }
  | { available: false; reason: string };

/**
 * Whether this party has a server PlayBound can control, and if not, why.
 *
 * `hostMode` null means the game's own default, which for a hostable game is
 * the VPS — so an old party created before host modes existed still gets its
 * controls rather than a shrug.
 */
export function serverControlAvailability(party: PartyServerSource): ServerControlAvailability {
  const slug = String(party.gameSlug || "");
  const title = party.gameTitle || slug || "this game";

  if (party.hostMode === "public" || party.hostMode === "couch") {
    return {
      available: false,
      reason:
        party.hostMode === "public"
          ? "This party is on a community server, which PlayBound does not administer."
          : "This party is playing on one PC, so there is no server to control.",
    };
  }

  if (!isHostableGame(slug)) {
    return { available: false, reason: `PlayBound does not host ${title} servers.` };
  }

  const profile = getServerSettingProfile(slug);
  if (!profile) {
    return { available: false, reason: `PlayBound has no server settings for ${title} yet.` };
  }

  /*
   * An assessed game with nothing to change is not the same as an unassessed
   * one, and it must not render an empty panel. Freeciv is the case: one map
   * per game, rules fixed at creation, so the profile exists to record that
   * rather than to offer anything.
   */
  if (profile.settings.length === 0) {
    return { available: false, reason: `${title} servers have nothing PlayBound can change.` };
  }

  /*
   * A self-hosted room is controllable through the leader's launcher, which
   * owns the dedicated process — see localAdapter. The room existing is the
   * launcher's business, not ours, so there is no roomId to wait for.
   */
  if (party.hostMode === "self") return { available: true, phase: "live" };

  /*
   * A room that has not started is the best moment to choose its settings, not
   * the one moment they are hidden.
   *
   * This used to be a refusal — "the room has not started yet" — which meant
   * the only way to get a server on the right map was to launch one on the
   * wrong map and then restart it, disconnecting the party to fix something
   * nobody had been able to set in the first place. The values chosen now are
   * planned state; provisionPartyHost starts the room with them.
   */
  if (!party.hosted?.roomId) return { available: true, phase: "pre-launch" };

  return { available: true, phase: "live" };
}

export interface PartyAdapterOptions {
  client?: VpsAgentClient;
  /**
   * Persist a replaced room. A restart hands out a new roomId and can hand out
   * a new port, and a party still pointing at the old address cannot rejoin —
   * so this is not optional in practice, only in this signature.
   */
  save?: (party: PartyServerSource) => Promise<unknown>;
}

/**
 * The adapter for a party's room, or null when there is nothing to control.
 * Check `serverControlAvailability` first if you want to say why.
 */
export function createPartyServerAdapter(
  party: PartyServerSource,
  opts: PartyAdapterOptions = {}
): ServerControlAdapter | null {
  const availability = serverControlAvailability(party);
  if (!availability.available) return null;
  /*
   * There is no process to adapt before the room is asked for. Settings chosen
   * in that phase are stored on the party and handed to the agent at spawn —
   * see provisionPartyHost — so callers wanting that path check the phase
   * rather than expecting an adapter here.
   */
  if (availability.phase === "pre-launch") return null;

  const slug = String(party.gameSlug);

  if (party.hostMode === "self") {
    return createLocalAdapter({
      room: {
        partyId: String(party._id),
        gameSlug: slug,
        ready: Boolean(party.selfHostReady),
        host: null,
        port: party.selfHostPort?.port ?? null,
        settings: party.selfHostControl?.settings || {},
        desiredRevision: Number(party.selfHostControl?.desiredRevision) || 0,
        appliedRevision: Number(party.selfHostControl?.appliedRevision) || 0,
        lastError: party.selfHostControl?.lastError ?? null,
      },
      save: async (next) => {
        const control = party.selfHostControl ?? (party.selfHostControl = {});
        control.settings = next.settings;
        control.desiredRevision = next.desiredRevision;
        control.lastError = null;
        await opts.save?.(party);
      },
    });
  }

  return createVpsAgentAdapter({
    client: opts.client,
    room: {
      partyId: String(party._id),
      gameSlug: slug,
      // The agent keys recipes by its own slug, which is not always the
      // catalog's — 0 A.D. is `0ad` here and `0-ad` on the box.
      hostSlug: getHostableGame(slug)?.slug || slug,
      roomId: party.hosted?.roomId || null,
      name: party.hosted?.name || "PlayBound.club Party",
      editionSlug: party.editionSlug || null,
      mod: party.openRaMod || null,
      settings: party.hosted?.settings || {},
    },
    onRoomChanged: async (next) => {
      const hosted = party.hosted ?? (party.hosted = {});
      hosted.settings = next.settings;
      /*
       * A live apply changes the settings and nothing else — same process,
       * same port. Writing the address fields then would replace a working
       * host:port with nulls and break every member's join for a change that
       * was supposed to cost nothing.
       */
      if (!next.addressUnchanged) {
        hosted.roomId = next.roomId;
        hosted.host = next.host;
        hosted.port = next.port;
        hosted.name = next.name;
        hosted.status = "ready";
        hosted.error = null;
        hosted.provisionedAt = new Date();
      }
      await opts.save?.(party);
    },
  });
}
