import { describe, it, expect } from "vitest";
import { createVpsAgentAdapter, type VpsAgentClient, type VpsRoomRef } from "./vpsAgent";
import { ServerControlUnsupported } from "./adapter";
import type { GameHostRoom } from "@/lib/gameHost/client";

function roomRef(over: Partial<VpsRoomRef> = {}): VpsRoomRef {
  return {
    partyId: "party1",
    gameSlug: "warzone-2100",
    hostSlug: "warzone-2100",
    roomId: "room_a",
    name: "PlayBound.club Party",
    editionSlug: null,
    mod: null,
    settings: {},
    ...over,
  };
}

/** An agent that starts with one room and records what it is asked to do. */
function fakeClient(initial: Partial<GameHostRoom>[] = [{ roomId: "room_a" }]) {
  const rooms: GameHostRoom[] = initial.map((r, i) => ({
    roomId: r.roomId || `room_${i}`,
    partyId: r.partyId || "party1",
    host: r.host || "203.0.113.10",
    port: r.port ?? 2100,
    gameSlug: r.gameSlug || "warzone-2100",
    name: r.name || "PlayBound.club Party",
    createdAt: r.createdAt ?? 1_700_000_000_000,
    settings: r.settings,
  }));
  const calls: {
    created: unknown[];
    deleted: string[];
    commands: { roomId: string; command: string }[];
  } = { created: [], deleted: [], commands: [] };
  let nextId = 1;
  let listFails: string | null = null;
  let createFails: string | null = null;
  let commandFails: string | null = null;
  let commandResponse = "";

  const client: VpsAgentClient = {
    async listRooms() {
      if (listFails) return { ok: false, error: listFails };
      return { ok: true, rooms: [...rooms] };
    },
    async createRoom(opts) {
      calls.created.push(opts);
      if (createFails) return { error: createFails };
      const room: GameHostRoom = {
        roomId: `room_new_${nextId++}`,
        partyId: opts.partyId,
        host: "203.0.113.10",
        port: 2101,
        gameSlug: opts.gameSlug,
        name: opts.name,
        createdAt: 1_700_000_001_000,
        settings: opts.settings,
      };
      rooms.push(room);
      return room;
    },
    async deleteRoom(roomId) {
      calls.deleted.push(roomId);
      const i = rooms.findIndex((r) => r.roomId === roomId);
      if (i >= 0) rooms.splice(i, 1);
      return true;
    },
    async sendCommand(roomId, command) {
      calls.commands.push({ roomId, command });
      if (commandFails) return { ok: false, error: commandFails };
      return { ok: true, response: commandResponse };
    },
  };

  return {
    client,
    calls,
    rooms,
    failList: (message: string) => (listFails = message),
    failCreate: (message: string) => (createFails = message),
    failCommand: (message: string) => (commandFails = message),
    replyWith: (text: string) => (commandResponse = text),
  };
}

describe("status", () => {
  it("reports a running room", async () => {
    const agent = fakeClient();
    const state = await createVpsAgentAdapter({ room: roomRef(), client: agent.client }).getStatus();
    expect(state.status).toBe("running");
    expect(state.host).toBe("203.0.113.10");
    expect(state.port).toBe(2100);
  });

  it("reports stopped when the agent answers and the room is gone", async () => {
    const agent = fakeClient([]);
    const state = await createVpsAgentAdapter({ room: roomRef(), client: agent.client }).getStatus();
    expect(state.status).toBe("stopped");
  });

  it("does not call an unreachable agent a stopped server", async () => {
    /*
     * These are different facts and the difference is expensive: a host told
     * the room is down restarts it, and restarting drops everyone on a room
     * that was fine — the agent was merely unreachable.
     */
    const agent = fakeClient();
    agent.failList("Game host unreachable");
    const state = await createVpsAgentAdapter({ room: roomRef(), client: agent.client }).getStatus();
    expect(state.status).toBe("unknown");
    expect(state.error).toBe("Game host unreachable");
  });
});

describe("reading settings", () => {
  it("fills the defaults the running room did not override", async () => {
    const agent = fakeClient([{ roomId: "room_a", settings: { maxPlayers: 4 } }]);
    const view = await createVpsAgentAdapter({ room: roomRef(), client: agent.client }).getSettings();
    expect(view.values.maxPlayers).toBe(4);
    expect(view.values.map).toBe("Sk-Mountain");
    expect(view.definitions.length).toBeGreaterThan(0);
  });

  it("believes the agent over our own record", async () => {
    // The room outlived a deploy, or a create dropped a key. Either way the
    // host is entitled to see the server as it actually is.
    const agent = fakeClient([{ roomId: "room_a", settings: { maxPlayers: 4 } }]);
    const view = await createVpsAgentAdapter({
      room: roomRef({ settings: { maxPlayers: 8 } }),
      client: agent.client,
    }).getSettings();
    expect(view.values.maxPlayers).toBe(4);
  });
});

describe("applying settings", () => {
  it("restarts the room with the new values", async () => {
    const agent = fakeClient();
    const adapter = createVpsAgentAdapter({ room: roomRef(), client: agent.client });

    const result = await adapter.applySettings({ maxPlayers: 4, techLevel: 2 });

    expect(result.outcome).toBe("restarted");
    expect(result.applied).toEqual({ maxPlayers: 4, techLevel: 2 });
    expect(agent.calls.deleted).toEqual(["room_a"]);
    expect(agent.calls.created).toHaveLength(1);
    // Unchanged settings ride along, or the restart would silently reset them.
    const sent = (agent.calls.created[0] as { settings: Record<string, unknown> }).settings;
    expect(sent).toMatchObject({ maxPlayers: 4, techLevel: 2, map: "Sk-Mountain", bases: 2 });
    expect(result.state.status).toBe("running");
  });

  it("hands back the new address, because the old one no longer works", async () => {
    const agent = fakeClient();
    const seen: unknown[] = [];
    const adapter = createVpsAgentAdapter({
      room: roomRef(),
      client: agent.client,
      onRoomChanged: async (next) => void seen.push(next),
    });

    await adapter.applySettings({ maxPlayers: 4 });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ roomId: "room_new_1", host: "203.0.113.10", port: 2101 });
  });

  it("does not restart a room for a change that is not a change", async () => {
    const agent = fakeClient();
    const adapter = createVpsAgentAdapter({ room: roomRef(), client: agent.client });

    const result = await adapter.applySettings({ maxPlayers: 8, map: "Sk-Mountain" });

    expect(result.outcome).toBe("unchanged");
    expect(agent.calls.deleted).toEqual([]);
    expect(agent.calls.created).toEqual([]);
  });

  it("reports what the schema refused instead of sending it on", async () => {
    const agent = fakeClient();
    const adapter = createVpsAgentAdapter({ room: roomRef(), client: agent.client });

    const result = await adapter.applySettings({ maxPlayers: 1, rconPassword: "hunter2" });

    expect(result.outcome).toBe("unchanged");
    expect(result.rejected.map((r) => r.key).sort()).toEqual(["maxPlayers", "rconPassword"]);
    expect(agent.calls.created).toEqual([]);
  });

  it("surfaces a failed respawn rather than claiming success", async () => {
    const agent = fakeClient();
    agent.failCreate("Host is at capacity (8 rooms)");
    const adapter = createVpsAgentAdapter({ room: roomRef(), client: agent.client });

    const result = await adapter.applySettings({ maxPlayers: 4 });

    expect(result.state.status).toBe("failed");
    expect(result.state.error).toMatch(/capacity/);
  });

  it("keeps applying to the room the restart created", async () => {
    // The second apply must not delete the roomId we were constructed with —
    // that room is gone, and its id now belongs to nothing.
    const agent = fakeClient();
    const adapter = createVpsAgentAdapter({ room: roomRef(), client: agent.client });

    await adapter.applySettings({ maxPlayers: 4 });
    await adapter.applySettings({ maxPlayers: 6 });

    expect(agent.calls.deleted).toEqual(["room_a", "room_new_1"]);
    const second = (agent.calls.created[1] as { settings: Record<string, unknown> }).settings;
    expect(second.maxPlayers).toBe(6);
  });
});

describe("what this adapter will not pretend to do", () => {
  it("declares no live apply, no players, no console", () => {
    const adapter = createVpsAgentAdapter({ room: roomRef(), client: fakeClient().client });
    expect(adapter.capabilities).toMatchObject({
      settings: true,
      restart: true,
      players: false,
      console: false,
      liveApply: false,
    });
  });

  it("throws rather than returning an empty player list", async () => {
    const adapter = createVpsAgentAdapter({ room: roomRef(), client: fakeClient().client });
    await expect(adapter.getPlayers()).rejects.toBeInstanceOf(ServerControlUnsupported);
    await expect(adapter.sendCommand("status")).rejects.toBeInstanceOf(ServerControlUnsupported);
  });
});

describe("a game with a live control channel", () => {
  function etRef(over: Partial<VpsRoomRef> = {}): VpsRoomRef {
    return roomRef({
      gameSlug: "wolfenstein-enemy-territory",
      hostSlug: "wolfenstein-enemy-territory",
      ...over,
    });
  }

  it("declares what the channel makes possible", () => {
    const et = createVpsAgentAdapter({ room: etRef(), client: fakeClient().client });
    expect(et.capabilities).toMatchObject({ players: true, console: true, liveApply: true });

    // Same adapter, different game: Warzone reads a file once at spawn.
    const wz = createVpsAgentAdapter({ room: roomRef(), client: fakeClient().client });
    expect(wz.capabilities).toMatchObject({ players: false, console: false, liveApply: false });
  });

  it("changes a map without touching the room", async () => {
    const agent = fakeClient();
    const adapter = createVpsAgentAdapter({ room: etRef(), client: agent.client });

    const result = await adapter.applySettings({ map: "goldrush" });

    expect(result.outcome).toBe("applied-live");
    expect(result.applied).toEqual({ map: "goldrush" });
    expect(agent.calls.commands).toEqual([{ roomId: "room_a", command: "map goldrush" }]);
    // The whole point: nobody was disconnected.
    expect(agent.calls.deleted).toEqual([]);
    expect(agent.calls.created).toEqual([]);
  });

  it("tells the caller the address did not move", async () => {
    // A live apply must not have the party's host:port rewritten to nulls.
    const agent = fakeClient();
    const seen: { addressUnchanged?: boolean }[] = [];
    const adapter = createVpsAgentAdapter({
      room: etRef(),
      client: agent.client,
      onRoomChanged: async (next) => void seen.push(next),
    });

    await adapter.applySettings({ g_warmup: 30 });

    expect(seen).toHaveLength(1);
    expect(seen[0].addressUnchanged).toBe(true);
  });

  it("restarts the whole batch when one key needs a restart", async () => {
    /*
     * sv_maxclients is latched, so it can only arrive at spawn. Sending the
     * live half first would leave the server holding part of a change if the
     * respawn then failed — and the host was told this costs one restart.
     */
    const agent = fakeClient();
    const adapter = createVpsAgentAdapter({ room: etRef(), client: agent.client });

    const result = await adapter.applySettings({ map: "radar", sv_maxclients: 32 });

    expect(result.outcome).toBe("restarted");
    expect(agent.calls.commands).toEqual([]);
    expect(agent.calls.deleted).toEqual(["room_a"]);
    const sent = (agent.calls.created[0] as { settings: Record<string, unknown> }).settings;
    expect(sent).toMatchObject({ map: "radar", sv_maxclients: 32 });
  });

  it("reports a command the server refused without claiming the rest failed", async () => {
    const agent = fakeClient();
    agent.failCommand("rcon timed out");
    const adapter = createVpsAgentAdapter({ room: etRef(), client: agent.client });

    const result = await adapter.applySettings({ map: "radar" });

    expect(result.applied).toEqual({});
    expect(result.rejected).toEqual([{ key: "map", reason: "rcon timed out" }]);
  });

  it("reads the players off the running server", async () => {
    const agent = fakeClient();
    agent.replyWith(
      [
        "map: oasis",
        "num score ping name            lastmsg address               qport rate",
        "  0    12   48 Ryan^7                0 203.0.113.9:27960      12345 25000",
      ].join("\n")
    );
    const adapter = createVpsAgentAdapter({ room: etRef(), client: agent.client });

    const players = await adapter.getPlayers();

    expect(agent.calls.commands).toEqual([{ roomId: "room_a", command: "status" }]);
    expect(players).toEqual([{ name: "Ryan", id: "0", pingMs: 48, score: 12 }]);
  });

  it("keeps live values that the agent's spawn record cannot know about", async () => {
    /*
     * The agent records what a room was started with. A map changed over rcon
     * an hour later is not in that record and never will be, so the panel has
     * to take spawn-time keys from the agent and live keys from us.
     */
    const agent = fakeClient([
      { roomId: "room_a", settings: { sv_maxclients: 32 } },
    ]);
    const adapter = createVpsAgentAdapter({
      room: etRef({ settings: { map: "radar", sv_maxclients: 8 } }),
      client: agent.client,
    });

    const view = await adapter.getSettings();

    expect(view.values.map).toBe("radar");
    expect(view.values.sv_maxclients).toBe(32);
  });
});
