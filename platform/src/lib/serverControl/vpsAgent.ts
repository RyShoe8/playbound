/**
 * Server control over the PlayBound game-host agent on the VPS.
 *
 * The agent already provisions and kills rooms — see docs/playbound-connect.md.
 * What it gained for this is the ability to be told what settings to start a
 * room with, and to say what settings the room it is running actually has.
 *
 * There is no live control channel to a PlayBound room yet, so every change
 * here is delivered the only honest way: stop the room, start it again with the
 * new values. That disconnects everyone, which is exactly why the schema
 * carries `apply` and why nothing should call this without having shown the
 * host what it costs.
 *
 * The agent is talked to through an injected client rather than imported
 * directly, so the restart path is testable without a VPS.
 */

import {
  createHostRoom,
  deleteHostRoom,
  listHostRooms,
  sendRoomCommand,
  type GameHostRoom,
} from "@/lib/gameHost/client";
import {
  ServerControlUnsupported,
  type ApplySettingsResult,
  type ServerControlAdapter,
  type ServerControlCapabilities,
  type ServerPlayer,
  type ServerRuntimeState,
  type ServerSettingsView,
} from "./adapter";
import {
  coerceSettingValues,
  defaultSettingValues,
  getServerSettingProfile,
  strongestApplyMode,
  type ServerSettingValues,
} from "./settings";
import { buildRconCommands, parseQuake3Status } from "./rcon";

/** The slice of the game-host client this adapter needs. */
export interface VpsAgentClient {
  listRooms(): Promise<{ ok: true; rooms: GameHostRoom[] } | { ok: false; error: string }>;
  createRoom(opts: {
    gameSlug: string;
    partyId: string;
    name?: string;
    editionSlug?: string | null;
    mod?: string | null;
    settings?: ServerSettingValues;
  }): Promise<GameHostRoom | { error: string }>;
  deleteRoom(roomId: string): Promise<boolean>;
  sendCommand(
    roomId: string,
    command: string
  ): Promise<{ ok: true; response: string } | { ok: false; error: string }>;
}

export const liveVpsAgentClient: VpsAgentClient = {
  listRooms: listHostRooms,
  createRoom: createHostRoom,
  deleteRoom: deleteHostRoom,
  sendCommand: sendRoomCommand,
};

/**
 * Everything the adapter needs to find and re-create one party's room.
 *
 * `gameSlug` is the catalog's and keys the settings schema; `hostSlug` is the
 * agent's own name for the same game, which is not always the same string —
 * 0 A.D. is `0ad` in the catalog and `0-ad` on the box.
 */
export interface VpsRoomRef {
  partyId: string;
  gameSlug: string;
  hostSlug: string;
  roomId: string | null;
  name: string;
  editionSlug: string | null;
  mod: string | null;
  /** What the host has chosen so far. Empty means "all defaults". */
  settings: ServerSettingValues;
}

/**
 * What this adapter can do for a given game.
 *
 * Not a constant, because it is not a property of the adapter: Warzone reads a
 * challenge file once at spawn and never listens again, while ET takes rcon on
 * its own port. The game's profile declares which, and the panel renders from
 * this rather than offering a control the server would ignore.
 */
function capabilitiesFor(gameSlug: string): ServerControlCapabilities {
  const channel = getServerSettingProfile(gameSlug)?.controlChannel ?? null;
  return {
    settings: true,
    restart: true,
    players: channel !== null,
    console: channel !== null,
    liveApply: channel !== null,
  };
}

function stateFromRoom(ref: VpsRoomRef, room: GameHostRoom | null): ServerRuntimeState {
  if (!room) {
    return {
      status: "stopped",
      gameSlug: ref.gameSlug,
      host: null,
      port: null,
      name: null,
      startedAt: null,
      error: null,
    };
  }
  return {
    status: "running",
    gameSlug: ref.gameSlug,
    host: room.host || null,
    port: room.port ?? null,
    name: room.name || null,
    startedAt: room.createdAt ? new Date(room.createdAt) : null,
    error: null,
  };
}

export interface VpsAgentAdapterOptions {
  room: VpsRoomRef;
  client?: VpsAgentClient;
  /**
   * Called whenever the room is replaced, because a restart hands out a new
   * roomId and can hand out a new port — and a party still pointing at the old
   * address is a party that cannot rejoin. Persisting that is the caller's job;
   * this adapter does not own the party document.
   */
  onRoomChanged?: (next: {
    roomId: string;
    host: string | null;
    port: number | null;
    name: string | null;
    settings: ServerSettingValues;
    /**
     * True when only the settings moved and the room is the same process on
     * the same port — a live apply. Without it a caller would write the nulls
     * above over a perfectly good address and break every member's join.
     */
    addressUnchanged?: boolean;
  }) => Promise<void>;
}

export function createVpsAgentAdapter(opts: VpsAgentAdapterOptions): ServerControlAdapter {
  const client = opts.client ?? liveVpsAgentClient;
  // Local to this adapter: a restart replaces both, and getStatus after it
  // must describe the new room rather than the one we were constructed with.
  const ref: VpsRoomRef = { ...opts.room, settings: { ...opts.room.settings } };

  async function findRoom(): Promise<GameHostRoom | null> {
    const listed = await client.listRooms();
    if (!listed.ok) return null;
    return (
      listed.rooms.find((r) => (ref.roomId ? r.roomId === ref.roomId : r.partyId === ref.partyId)) ??
      null
    );
  }

  async function currentState(): Promise<ServerRuntimeState> {
    const listed = await client.listRooms();
    if (!listed.ok) {
      // Not "stopped" — we asked and could not find out. A host told the room
      // is down when the agent is merely unreachable will restart a healthy
      // room and drop everyone on it.
      return {
        status: "unknown",
        gameSlug: ref.gameSlug,
        host: null,
        port: null,
        name: null,
        startedAt: null,
        error: listed.error,
      };
    }
    const room =
      listed.rooms.find((r) => (ref.roomId ? r.roomId === ref.roomId : r.partyId === ref.partyId)) ??
      null;
    return stateFromRoom(ref, room);
  }

  async function spawn(settings: ServerSettingValues): Promise<ServerRuntimeState> {
    const created = await client.createRoom({
      gameSlug: ref.hostSlug,
      partyId: ref.partyId,
      name: ref.name,
      editionSlug: ref.editionSlug,
      mod: ref.mod,
      settings,
    });
    if ("error" in created) {
      return {
        status: "failed",
        gameSlug: ref.gameSlug,
        host: null,
        port: null,
        name: null,
        startedAt: null,
        error: created.error,
      };
    }

    ref.roomId = created.roomId;
    ref.settings = settings;
    await opts.onRoomChanged?.({
      roomId: created.roomId,
      host: created.host || null,
      port: created.port ?? null,
      name: created.name || null,
      settings,
    });
    return stateFromRoom(ref, created);
  }

  async function stopRoom(): Promise<void> {
    if (!ref.roomId) return;
    await client.deleteRoom(ref.roomId);
    ref.roomId = null;
  }

  return {
    kind: "vps-agent",
    capabilities: capabilitiesFor(ref.gameSlug),

    getStatus: currentState,

    async getSettings(): Promise<ServerSettingsView> {
      const profile = getServerSettingProfile(ref.gameSlug);
      const room = await findRoom();
      /*
       * Truth is per-key, and which record holds it depends on how the value
       * gets there.
       *
       * A spawn-time value — a startup arg, a config file — is whatever the
       * running room was started with, and the agent knows that better than we
       * do: the two diverge whenever a room outlives a deploy or a create
       * quietly drops a key. A live value is the opposite. We sent it over rcon
       * after the room started, so the agent's spawn record is stale about it
       * by definition.
       */
      const spawned = (room?.settings as ServerSettingValues | undefined) ?? {};
      const values: ServerSettingValues = { ...defaultSettingValues(ref.gameSlug) };
      for (const def of profile?.settings ?? []) {
        const fromAgent = def.backend === "rcon" ? undefined : spawned[def.key];
        const fromUs = def.backend === "rcon" ? ref.settings[def.key] : undefined;
        const value = fromAgent ?? fromUs;
        if (value !== undefined) values[def.key] = value;
      }
      /* A room with no profile still reports what it was started with. */
      if (!profile) Object.assign(values, spawned, ref.settings);
      return {
        gameSlug: ref.gameSlug,
        definitions: profile?.settings ?? [],
        values,
      };
    },

    async applySettings(input: Record<string, unknown>): Promise<ApplySettingsResult> {
      const { values, rejected } = coerceSettingValues(ref.gameSlug, input);
      const current = { ...defaultSettingValues(ref.gameSlug), ...ref.settings };
      const changed = Object.keys(values).filter((key) => current[key] !== values[key]);

      if (changed.length === 0) {
        return {
          applied: {},
          rejected,
          outcome: "unchanged",
          state: await currentState(),
        };
      }

      const profile = getServerSettingProfile(ref.gameSlug);
      const needsRestart = changed.some(
        (key) => profile?.settings.find((s) => s.key === key)?.backend !== "rcon"
      );
      const next = { ...current, ...values };

      /*
       * One restart-backed key in the batch and the whole batch restarts. The
       * live ones could have gone over the wire first, but then a failed
       * respawn would leave the server holding half a change the host was told
       * cost one restart. Everything lands together or not at all.
       */
      if (needsRestart) {
        if (strongestApplyMode(ref.gameSlug, changed) !== "restart") {
          // A key delivered at spawn that claims to apply live is a promise
          // the server cannot keep, and this is where it would be broken.
          throw new ServerControlUnsupported("vps-agent", "apply that change without a restart");
        }
        await stopRoom();
        const state = await spawn(next);
        return { applied: values, rejected, outcome: "restarted", state };
      }

      if (!profile?.controlChannel || !ref.roomId) {
        throw new ServerControlUnsupported("vps-agent", "change settings without restarting");
      }

      const commands = buildRconCommands(
        ref.gameSlug,
        Object.fromEntries(changed.map((key) => [key, values[key]]))
      );
      const failures: { key: string; reason: string }[] = [];
      const applied: ServerSettingValues = {};
      for (const { key, command } of commands) {
        const sent = await client.sendCommand(ref.roomId, command);
        if (sent.ok) {
          applied[key] = values[key];
        } else {
          // Report per key. A batch that half-landed is the truth here, and
          // saying "failed" about the ones that took would send the host
          // chasing a change that already happened.
          failures.push({ key, reason: sent.error });
        }
      }
      ref.settings = { ...ref.settings, ...applied };
      if (Object.keys(applied).length) {
        await opts.onRoomChanged?.({
          roomId: ref.roomId,
          host: null,
          port: null,
          name: null,
          settings: ref.settings,
          addressUnchanged: true,
        });
      }
      return {
        applied,
        rejected: [...rejected, ...failures],
        outcome: "applied-live",
        state: await currentState(),
      };
    },

    async restart(): Promise<ServerRuntimeState> {
      const settings = { ...defaultSettingValues(ref.gameSlug), ...ref.settings };
      await stopRoom();
      return spawn(settings);
    },

    async start(): Promise<ServerRuntimeState> {
      const existing = await findRoom();
      if (existing) return stateFromRoom(ref, existing);
      return spawn({ ...defaultSettingValues(ref.gameSlug), ...ref.settings });
    },

    async stop(): Promise<ServerRuntimeState> {
      await stopRoom();
      return {
        status: "stopped",
        gameSlug: ref.gameSlug,
        host: null,
        port: null,
        name: null,
        startedAt: null,
        error: null,
      };
    },

    async getPlayers(): Promise<ServerPlayer[]> {
      if (!capabilitiesFor(ref.gameSlug).players || !ref.roomId) {
        throw new ServerControlUnsupported("vps-agent", "list connected players");
      }
      const sent = await client.sendCommand(ref.roomId, "status");
      if (!sent.ok) throw new Error(sent.error);
      return parseQuake3Status(sent.response).map((p) => ({
        name: p.name,
        id: p.id,
        pingMs: p.pingMs,
        score: p.score,
      }));
    },

    async sendCommand(raw: string): Promise<string> {
      if (!capabilitiesFor(ref.gameSlug).console || !ref.roomId) {
        throw new ServerControlUnsupported("vps-agent", "run raw commands");
      }
      const sent = await client.sendCommand(ref.roomId, raw);
      if (!sent.ok) throw new Error(sent.error);
      return sent.response;
    },
  };
}
