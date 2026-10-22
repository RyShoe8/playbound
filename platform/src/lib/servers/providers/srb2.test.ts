import { describe, expect, it, vi, afterEach } from "vitest";
import { parseSrb2Servers, parseSrb2KartServers, fetchSrb2KartServers, fetchSrb2PlayerCount } from "./srb2";
import { hasServerBrowser } from "../browserGames";
const row = { address: ["198.51.100.5", 5029], server_name: "^2Sonic server", num_humans: 3, num_bots: 2, max_connections: 16, map_title: "Greenflower", gametype: "Co-op" };
afterEach(() => vi.unstubAllGlobals());
describe("official SRB2 public lists", () => {
  it("registers both games in the browser", () => {
    expect(hasServerBrowser("srb2")).toBe(true); expect(hasServerBrowser("srb2kart")).toBe(true);
  });
  it("keeps human counts separate from bots and strips game color codes", () => {
    expect(parseSrb2Servers({ servers: [row, row] })).toMatchObject([{ name: "Sonic server", host: "198.51.100.5", port: 5029, players: 3, bots: 2, maxPlayers: 16 }]);
  });
  it("does not replace missing populations with zero", async () => {
    const partial = { ...row, num_humans: undefined };
    expect(parseSrb2Servers({ servers: [partial] })[0].players).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ servers: [partial] }) }));
    await expect(fetchSrb2PlayerCount()).rejects.toThrow("unavailable");
  });
  it("accepts a genuinely empty list and rejects malformed responses", () => {
    expect(parseSrb2Servers({ servers: [] })).toEqual([]);
    expect(() => parseSrb2Servers({ error: "offline" })).toThrow();
    expect(() => parseSrb2Servers({ servers: [{ ...row, address: ["invalid", 0] }] })).toThrow();
  });
  it("parses Kart addresses without inventing player counts", () => {
    expect(parseSrb2KartServers("198.51.100.10 5029 contact%40example.test\n")[0]).toMatchObject({ gameSlug: "srb2kart", players: null, maxPlayers: null, port: 5029 });
    expect(() => parseSrb2KartServers("<html>502 Bad Gateway</html>")).toThrow();
  });
  it("surfaces the Kart master failure instead of an empty list", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 502 }); vi.stubGlobal("fetch", fetcher);
    await expect(fetchSrb2KartServers()).rejects.toThrow("HTTP 502");
    expect(fetcher.mock.calls[0][0]).toContain("/games/SRB2Kart/10/servers?v=2.2");
  });
});
