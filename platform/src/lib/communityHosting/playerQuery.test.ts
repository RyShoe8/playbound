import { afterEach, describe, expect, it, vi } from "vitest";
import { managedQueryKind, queryManagedOccupancy, queryManagedPlayerCount } from "./playerQuery";

afterEach(() => vi.unstubAllGlobals());

describe("managed player count", () => {
  it("falls back to the game's live query when a stored profile has no usable method", () => {
    expect(managedQueryKind("luanti", { queryVerified: true, queryKind: "none" })).toBe("luanti-master");
    expect(managedQueryKind("counter-strike-2", { queryVerified: false, queryKind: "none" })).toBe("agent-local");
    expect(managedQueryKind("unknown-game", null)).toBeNull();
  });
  it("finds the exact VPS address and preserves a true zero", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [
      { address: "192.0.2.1:1234", players: 8 }, { address: "192.0.2.1:1235", players: 0, maxplayers: 4 },
    ] })));
    expect(await queryManagedPlayerCount({ queryKind: "openra-master", host: "192.0.2.1", port: 1235 })).toBe(0);
    expect(await queryManagedOccupancy({ queryKind: "openra-master", host: "192.0.2.1", port: 1235 })).toEqual({ players: 0, maxPlayers: 4 });
  });
  it("treats absence or failure as unknown", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [] })));
    expect(await queryManagedPlayerCount({ queryKind: "openra-master", host: "192.0.2.1", port: 1235 })).toBeNull();
    expect(await queryManagedPlayerCount({ queryKind: "none", host: "192.0.2.1", port: 1235 })).toBeNull();
  });
  it("reads Hurry Curry's exact registered address and preserves zero", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [
      { address: ["ws://192.0.2.1:27033"], players_online: 8 },
      { address: ["ws://192.0.2.1:27032"], players_online: 0 },
    ] })));
    expect(await queryManagedPlayerCount({ queryKind: "hurry-curry-registry", host: "192.0.2.1", port: 27032 })).toBe(0);
    expect(await queryManagedOccupancy({ queryKind: "hurry-curry-registry", host: "192.0.2.1", port: 27032 })).toEqual({ players: 0, maxPlayers: null });
    expect(await queryManagedPlayerCount({ queryKind: "hurry-curry-registry", host: "192.0.2.1", port: 27034 })).toBeNull();
  });
  it("reads Luanti's public list by exact address and port", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ list: [
      { address: "192.0.2.1", port: 30001, clients: 9 },
      { address: "192.0.2.1", port: 30000, clients: 0, clients_max: 16 },
    ] }) })));
    expect(await queryManagedPlayerCount({ queryKind: "luanti-master", host: "192.0.2.1", port: 30000 })).toBe(0);
    expect(await queryManagedOccupancy({ queryKind: "luanti-master", host: "192.0.2.1", port: 30000 })).toEqual({ players: 0, maxPlayers: 16 });
    expect(await queryManagedPlayerCount({ queryKind: "luanti-master", host: "192.0.2.1", port: 30002 })).toBeNull();
  });
  it("counts humans, not bots, on Hypersomnia", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [
      { ip: "192.0.2.1:8413", num_online_humans: 5, num_playing: 12 },
      { ip: "192.0.2.1:8412", num_online_humans: 0, num_playing: 8, slots: 16 },
    ] })));
    expect(await queryManagedPlayerCount({ queryKind: "hypersomnia-master", host: "192.0.2.1", port: 8412 })).toBe(0);
    expect(await queryManagedOccupancy({ queryKind: "hypersomnia-master", host: "192.0.2.1", port: 8412 })).toEqual({ players: 0, maxPlayers: 16 });
    expect(await queryManagedPlayerCount({ queryKind: "hypersomnia-master", host: "192.0.2.1", port: 8414 })).toBeNull();
  });
});
