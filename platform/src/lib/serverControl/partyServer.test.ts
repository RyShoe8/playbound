import { describe, it, expect } from "vitest";
import {
  createPartyServerAdapter,
  serverControlAvailability,
  type PartyServerSource,
} from "./partyServer";
import type { VpsAgentClient } from "./vpsAgent";
import type { GameHostRoom } from "@/lib/gameHost/client";
import { HOSTABLE_GAMES } from "@/lib/gameHost/catalog";
import { SERVER_SETTING_PROFILES } from "./settings";

function party(over: Partial<PartyServerSource> = {}): PartyServerSource {
  return {
    _id: { toString: () => "party1" },
    gameSlug: "warzone-2100",
    gameTitle: "Warzone 2100",
    editionSlug: null,
    openRaMod: null,
    hostMode: "dedicated",
    hosted: { roomId: "room_a", status: "ready", host: "203.0.113.10", port: 2100 },
    ...over,
  };
}

describe("whether a party has a server to control", () => {
  it("does for a hostable game on the PlayBound VPS", () => {
    expect(serverControlAvailability(party())).toEqual({ available: true });
  });

  it("treats an old party with no host mode as the game's default", () => {
    // hostMode predates nothing here — parties created before host modes exist
    // with null, and for a hostable game that has always meant the VPS.
    expect(serverControlAvailability(party({ hostMode: null }))).toEqual({ available: true });
  });

  it("controls a room on the leader's own PC through their launcher", () => {
    /*
     * A self-hosted room used to be uncontrollable, because it was the game's
     * own listen server started from a menu. The launcher now owns a dedicated
     * process for it, so there is something to configure — and no roomId to
     * wait for, since the room is the launcher's business rather than ours.
     */
    expect(serverControlAvailability(party({ hostMode: "self", hosted: { roomId: null } }))).toEqual({
      available: true,
    });
    expect(createPartyServerAdapter(party({ hostMode: "self" }))?.kind).toBe("local");
    expect(createPartyServerAdapter(party())?.kind).toBe("vps-agent");
  });

  it("says which reason applies rather than showing an empty panel", () => {
    const pub = serverControlAvailability(party({ hostMode: "public" }));
    expect((pub as { reason: string }).reason).toMatch(/community server/);

    /*
     * Hostable, but nothing has declared its settings yet — picked at runtime
     * rather than named, so growing the coverage does not break this test.
     * Once every hostable game is profiled there is no such case left, and the
     * branch is exercised by the assertion below instead.
     */
    const unprofiled = Object.keys(HOSTABLE_GAMES).find((s) => !SERVER_SETTING_PROFILES[s]);
    if (unprofiled) {
      const noProfile = serverControlAvailability(
        party({ gameSlug: unprofiled, gameTitle: "Some Game" })
      );
      expect((noProfile as { reason: string }).reason).toMatch(/no server settings for Some Game/);
    }

    // A game PlayBound does not host at all takes a different branch.
    const notHosted = serverControlAvailability(
      party({ gameSlug: "holocure", gameTitle: "HoloCure" })
    );
    expect((notHosted as { reason: string }).reason).toMatch(/does not host HoloCure/);

    const noRoom = serverControlAvailability(party({ hosted: { roomId: null } }));
    expect((noRoom as { reason: string }).reason).toMatch(/has not started/);
  });

  it("returns no adapter when there is nothing to control", () => {
    expect(createPartyServerAdapter(party({ hostMode: "couch" }))).toBe(null);
    expect(createPartyServerAdapter(party({ hosted: { roomId: null } }))).toBe(null);
  });
});

describe("persisting a restarted room", () => {
  function client(): VpsAgentClient {
    const room: GameHostRoom = {
      roomId: "room_a",
      partyId: "party1",
      host: "203.0.113.10",
      port: 2100,
      gameSlug: "warzone-2100",
      name: "PlayBound.club Party",
      createdAt: 1_700_000_000_000,
    };
    return {
      async listRooms() {
        return { ok: true, rooms: [room] };
      },
      async createRoom(opts) {
        return {
          roomId: "room_b",
          partyId: opts.partyId,
          host: "203.0.113.10",
          port: 2109,
          gameSlug: opts.gameSlug,
          name: opts.name,
          createdAt: 1_700_000_001_000,
          settings: opts.settings,
        };
      },
      async deleteRoom() {
        return true;
      },
      async sendCommand() {
        return { ok: true, response: "" };
      },
    };
  }

  it("writes the new address onto the party, because the old one is dead", async () => {
    /*
     * The restart already stopped the old room. A party left pointing at
     * room_a:2100 cannot rejoin anything — every member's join URL is built
     * from these fields.
     */
    const doc = party();
    let saves = 0;
    const adapter = createPartyServerAdapter(doc, {
      client: client(),
      save: async () => void saves++,
    })!;

    await adapter.applySettings({ maxPlayers: 4 });

    expect(doc.hosted).toMatchObject({
      roomId: "room_b",
      host: "203.0.113.10",
      port: 2109,
      status: "ready",
      error: null,
    });
    expect(doc.hosted?.settings).toMatchObject({ maxPlayers: 4, map: "Sk-Mountain" });
    expect(saves).toBe(1);
  });

  it("leaves the party untouched when nothing changed", async () => {
    const doc = party();
    let saves = 0;
    const adapter = createPartyServerAdapter(doc, {
      client: client(),
      save: async () => void saves++,
    })!;

    const result = await adapter.applySettings({ maxPlayers: 8 });

    expect(result.outcome).toBe("unchanged");
    expect(doc.hosted?.roomId).toBe("room_a");
    expect(saves).toBe(0);
  });

  it("carries the party's stored settings into the restarted room", async () => {
    const doc = party({
      hosted: { roomId: "room_a", status: "ready", settings: { techLevel: 3 } },
    });
    let sent: Record<string, unknown> | undefined;
    const base = client();
    const adapter = createPartyServerAdapter(doc, {
      client: {
        ...base,
        async createRoom(opts) {
          sent = opts.settings;
          return base.createRoom(opts);
        },
      },
      save: async () => {},
    })!;

    await adapter.applySettings({ maxPlayers: 4 });

    // An earlier choice must survive a later one, or every save quietly resets
    // everything the host set before it.
    expect(sent).toMatchObject({ techLevel: 3, maxPlayers: 4 });
  });
});
