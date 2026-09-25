import { afterEach, describe, expect, it, vi } from "vitest";
import { queryManagedPlayerCount } from "./playerQuery";

afterEach(() => vi.unstubAllGlobals());

describe("managed player count", () => {
  it("finds the exact VPS address and preserves a true zero", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [
      { address: "192.0.2.1:1234", players: 8 }, { address: "192.0.2.1:1235", players: 0 },
    ] })));
    expect(await queryManagedPlayerCount({ queryKind: "openra-master", host: "192.0.2.1", port: 1235 })).toBe(0);
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
    expect(await queryManagedPlayerCount({ queryKind: "hurry-curry-registry", host: "192.0.2.1", port: 27034 })).toBeNull();
  });
});
