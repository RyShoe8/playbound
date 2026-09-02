import { describe, it, expect } from "vitest";
import { createLocalAdapter, type LocalRoomRef } from "./localAdapter";
import { ServerControlUnsupported } from "./adapter";

function room(over: Partial<LocalRoomRef> = {}): LocalRoomRef {
  return {
    partyId: "party1",
    gameSlug: "wolfenstein-enemy-territory",
    ready: true,
    host: "192.168.1.20",
    port: 27960,
    settings: {},
    desiredRevision: 0,
    appliedRevision: 0,
    ...over,
  };
}

describe("what a local room can be told", () => {
  it("queues rather than claiming a change landed", async () => {
    /*
     * Nothing can call into a home machine — that is why Connect exists. The
     * host's launcher picks this up, so "applied" would be a guess.
     */
    let saved: { settings: Record<string, unknown>; desiredRevision: number } | null = null;
    const adapter = createLocalAdapter({
      room: room(),
      save: async (next) => void (saved = next),
    });

    const result = await adapter.applySettings({ map: "goldrush" });

    expect(result.outcome).toBe("queued");
    expect(result.applied).toEqual({ map: "goldrush" });
    expect(saved).toMatchObject({ desiredRevision: 1 });
  });

  it("delivers settings the game calls live, because everything goes on the command line", async () => {
    // ET's map is `apply: "live"` over rcon, but a local dedicated server is
    // configured at spawn — so the adapter says it has no live apply and the
    // panel warns about a restart rather than promising a free change.
    const adapter = createLocalAdapter({ room: room() });
    expect(adapter.capabilities.liveApply).toBe(false);
    expect(adapter.capabilities.restart).toBe(true);
  });

  it("counts a revision behind as pending, not running", async () => {
    // The room on the host's PC is still the old one until their launcher
    // catches up. Reporting "running" would show settings that are not in force.
    const adapter = createLocalAdapter({
      room: room({ desiredRevision: 4, appliedRevision: 3 }),
    });
    expect((await adapter.getStatus()).status).toBe("pending");

    const caughtUp = createLocalAdapter({
      room: room({ desiredRevision: 4, appliedRevision: 4 }),
    });
    expect((await caughtUp.getStatus()).status).toBe("running");
  });

  it("is pending before the launcher has confirmed a listener", async () => {
    const adapter = createLocalAdapter({ room: room({ ready: false }) });
    const state = await adapter.getStatus();
    expect(state.status).toBe("pending");
    expect(state.port).toBe(null);
  });

  it("surfaces what the host's launcher reported going wrong", async () => {
    const adapter = createLocalAdapter({
      room: room({ lastError: "The server did not start listening." }),
    });
    const state = await adapter.getStatus();
    expect(state.status).toBe("failed");
    expect(state.error).toMatch(/did not start listening/);
  });

  it("restarts by asking for a new revision, not by changing anything", async () => {
    // The launcher reconciles on the number, so a bump is the only way to ask
    // for a restart — which is why this is a revision and not a settings hash.
    let saved: { desiredRevision: number } | null = null;
    const adapter = createLocalAdapter({
      room: room({ settings: { map: "radar" }, desiredRevision: 2, appliedRevision: 2 }),
      save: async (next) => void (saved = next),
    });

    await adapter.restart();

    expect(saved).toMatchObject({ desiredRevision: 3, settings: { map: "radar" } });
  });

  it("does not spend a revision on a change that is not one", async () => {
    let saves = 0;
    const adapter = createLocalAdapter({
      room: room({ settings: { map: "oasis" } }),
      save: async () => void saves++,
    });

    const result = await adapter.applySettings({ map: "oasis" });

    expect(result.outcome).toBe("unchanged");
    expect(saves).toBe(0);
  });

  it("refuses what it cannot do rather than doing something else", async () => {
    const adapter = createLocalAdapter({ room: room() });
    await expect(adapter.stop()).rejects.toBeInstanceOf(ServerControlUnsupported);
    await expect(adapter.getPlayers()).rejects.toBeInstanceOf(ServerControlUnsupported);
    await expect(adapter.sendCommand("status")).rejects.toBeInstanceOf(ServerControlUnsupported);
  });
});
