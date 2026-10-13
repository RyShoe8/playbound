import { describe, expect, it } from "vitest";
import { compareServerRows, type ServerSortKey } from "./sort";
import type { GameServer } from "./types";

const row = (id: string, changes: Partial<GameServer> = {}): GameServer => ({
  id, name: "Community Server", host: "localhost", port: 1234, players: null,
  maxPlayers: 16, map: null, gameType: null, location: null, protected: false, ...changes,
});
const latency = (s: GameServer) => s.location?.lat ?? null;
const order = (rows: GameServer[], key: ServerSortKey, dir: "asc" | "desc") =>
  [...rows].sort((a, b) => compareServerRows(a, b, key, dir, latency)).map(s => s.id);

describe("server browser sorting", () => {
  it("sorts the visible game title before identical community names, using natural numbers", () => {
    const rows = [row("b", { gameTitle: "Game 10" }), row("a", { gameTitle: "Game 2" })];
    expect(order(rows, "name", "asc")).toEqual(["a", "b"]);
    expect(order(rows, "name", "desc")).toEqual(["b", "a"]);
  });
  it("sorts populations numerically and keeps unknown distinct from zero", () => {
    const rows = [row("unknown"), row("ten", { players: 10 }), row("zero", { players: 0 }), row("two", { players: 2 })];
    expect(order(rows, "players", "asc")).toEqual(["zero", "two", "ten", "unknown"]);
    expect(order(rows, "players", "desc")).toEqual(["ten", "two", "zero", "unknown"]);
  });
  it("sorts the displayed map rather than hidden game type, with unknown last", () => {
    const rows = [row("unknown", { gameType: "AAA" }), row("ten", { map: "Map 10" }), row("two", { map: "Map 2" })];
    expect(order(rows, "map", "asc")).toEqual(["two", "ten", "unknown"]);
    expect(order(rows, "map", "desc")).toEqual(["ten", "two", "unknown"]);
  });
  it("sorts displayed regions and country codes with unavailable locations last", () => {
    const rows = [row("unknown", { location: { countryCode: "ZZ" } }), row("us", { location: { countryCode: "US", region: "US Central" } }), row("de", { location: { countryCode: "DE" } })];
    expect(order(rows, "location", "asc")).toEqual(["de", "us", "unknown"]);
    expect(order(rows, "location", "desc")).toEqual(["us", "de", "unknown"]);
  });
  it("sorts ping numerically, leaving missing readings last in both directions", () => {
    const rows = [row("unknown"), row("slow", { location: { countryCode: "US", lat: 100 } }), row("fast", { location: { countryCode: "US", lat: 20 } })];
    expect(order(rows, "est", "asc")).toEqual(["fast", "slow", "unknown"]);
    expect(order(rows, "est", "desc")).toEqual(["slow", "fast", "unknown"]);
  });
});
