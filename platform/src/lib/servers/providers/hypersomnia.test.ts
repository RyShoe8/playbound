import { describe, expect, it } from "vitest";
import { parseHypersomniaServers } from "./hypersomnia";

/**
 * The bot trap is the reason this file exists.
 *
 * A live sample of the official server list reported `num_playing: 8` on a
 * server whose eight player names were all "Cyber…" — the game's own bots —
 * while `num_online_humans` was 0. Summing `num_playing` would have advertised
 * a population made entirely of AI, which docs/player-counts.md forbids
 * outright. These tests pin the field choice so nobody "fixes" the count by
 * reaching for the bigger number.
 */

const row = (over: Record<string, unknown> = {}) => ({
  name: "[US] Central US #2",
  ip: "154.12.226.211:8001",
  site_displayed_address: "arena-us.hypersomnia.io:8001",
  arena: "de_billan",
  game_mode: "Bomb Defusal",
  slots: 16,
  num_online_humans: 3,
  num_playing: 8,
  num_spectating: 0,
  is_ranked: false,
  ...over,
});

describe("parseHypersomniaServers", () => {
  it("counts humans, not bots", () => {
    const [server] = parseHypersomniaServers([row()]);
    expect(server?.players).toBe(3);
  });

  it("reports a bot-only server as empty rather than full", () => {
    const [server] = parseHypersomniaServers([row({ num_online_humans: 0, num_playing: 8 })]);
    expect(server?.players).toBe(0);
  });

  it("returns null, not zero, when the count is missing", () => {
    // The whole point of the policy: unknown must not render as "0 online".
    const [server] = parseHypersomniaServers([row({ num_online_humans: undefined })]);
    expect(server?.players).toBeNull();
  });

  it("returns null when the count is not a usable number", () => {
    for (const bad of ["3", null, -1, Number.NaN]) {
      const [server] = parseHypersomniaServers([row({ num_online_humans: bad })]);
      expect(server?.players, `for ${String(bad)}`).toBeNull();
    }
  });

  it("prefers the published hostname over the raw socket address", () => {
    // Official instances move machines; the displayed address survives it.
    const [server] = parseHypersomniaServers([row()]);
    expect(server?.host).toBe("arena-us.hypersomnia.io");
    expect(server?.port).toBe(8001);
  });

  it("falls back to the raw ip when no hostname is published", () => {
    const [server] = parseHypersomniaServers([
      row({ site_displayed_address: undefined, official_url: undefined }),
    ]);
    expect(server?.host).toBe("154.12.226.211");
    expect(server?.port).toBe(8001);
  });

  it("skips rows with no usable address or name", () => {
    expect(
      parseHypersomniaServers([
        row({ site_displayed_address: "not-an-address", official_url: undefined, ip: undefined }),
        row({ name: "   " }),
      ])
    ).toEqual([]);
  });

  it("labels ranked instances distinctly from casual ones", () => {
    const [ranked] = parseHypersomniaServers([row({ is_ranked: true })]);
    expect(ranked?.gameType).toBe("Bomb Defusal (Ranked)");
    const [casual] = parseHypersomniaServers([row({ is_ranked: false })]);
    expect(casual?.gameType).toBe("Bomb Defusal");
  });

  it("carries the slot count through as maxPlayers", () => {
    const [server] = parseHypersomniaServers([row()]);
    expect(server?.maxPlayers).toBe(16);
    const [unknown] = parseHypersomniaServers([row({ slots: 0 })]);
    expect(unknown?.maxPlayers).toBeNull();
  });

  it("sorts populated servers above empty and unknown ones", () => {
    const parsed = parseHypersomniaServers([
      row({ name: "empty", num_online_humans: 0 }),
      row({ name: "unknown", num_online_humans: undefined }),
      row({ name: "busy", num_online_humans: 9 }),
    ]);
    expect(parsed.map((s) => s.name)).toEqual(["busy", "empty", "unknown"]);
  });

  it("tolerates a non-array payload", () => {
    expect(parseHypersomniaServers(null)).toEqual([]);
    expect(parseHypersomniaServers({ servers: [] })).toEqual([]);
  });
});
