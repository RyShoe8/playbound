import { beforeEach, describe, expect, it, vi } from "vitest";
import { hostedPayloadFromDoc } from "./provision";

describe("hostedPayloadFromDoc", () => {
  it("withholds connection details until the room is ready", () => {
    const payload = hostedPayloadFromDoc("freedoom", "dedicated", {
      status: "pending",
      host: "203.0.113.10",
      port: 10666,
      name: "Allocated but still loading",
      roomCode: "early-code",
    });

    expect(payload.host).toBeNull();
    expect(payload.port).toBeNull();
    expect(payload.name).toBeNull();
    expect(payload.roomCode).toBeNull();
  });

  it("exposes connection details once the room is ready", () => {
    const payload = hostedPayloadFromDoc("freedoom", "dedicated", {
      status: "ready",
      host: "203.0.113.10",
      port: 10666,
      name: "Ready room",
    });

    expect(payload.host).toBe("203.0.113.10");
    expect(payload.port).toBe(10666);
    expect(payload.name).toBe("Ready room");
  });
});

/**
 * Settings chosen before the room existed have to reach the agent at spawn, or
 * the pre-launch phase is a form that does nothing — the host would still have
 * to start a room on the wrong map and restart it to fix that, which is the
 * disconnection the whole phase exists to avoid.
 */
describe("starting a room with what the host planned", () => {
  const created: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    created.length = 0;
    vi.resetModules();
  });

  async function provisionWith(settings: Record<string, unknown>) {
    vi.doMock("./client", () => ({
      isGameHostConfigured: () => true,
      listHostRooms: async () => ({ ok: true as const, rooms: [] }),
      deleteHostRoom: async () => true,
      createHostRoom: async (opts: Record<string, unknown>) => {
        created.push(opts);
        return { roomId: "room_a", host: "203.0.113.10", port: 2100, name: "PlayBound.club Party" };
      },
    }));
    vi.doMock("@/lib/playTogether/partyTelemetry", () => ({
      partyEventProps: () => ({}),
      trackPartyEvent: () => {},
      trackPartyFailure: () => {},
      trackPartyOk: () => {},
    }));
    const { provisionPartyHost } = await import("./provision");
    const party = {
      _id: { toString: () => "party1" },
      gameSlug: "openra",
      editionSlug: null,
      openRaMod: "ra",
      hosted: { status: "none", settings },
      save: async () => {},
    };
    await provisionPartyHost(party as unknown as Parameters<typeof provisionPartyHost>[0]);
    return created[0];
  }

  it("hands the planned values to the agent", async () => {
    const opts = await provisionWith({ "Server.LockBots": true });
    expect(opts?.settings).toEqual({ "Server.LockBots": true });
  });

  it("drops anything the game no longer declares", async () => {
    // Profiles change between the save and the launch; a stale key must not be
    // handed to the agent as though the game still understood it.
    const opts = await provisionWith({ "Server.LockBots": true, "Server.Gone": "x" });
    expect(opts?.settings).toEqual({ "Server.LockBots": true });
  });

  it("sends nothing at all when the host planned nothing", async () => {
    const opts = await provisionWith({});
    expect(opts?.settings).toBeUndefined();
  });
});
