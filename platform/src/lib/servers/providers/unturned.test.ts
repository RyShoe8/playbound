import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../geo", () => ({ attachGeo: vi.fn(async rows => rows) }));
import { fetchUnturnedServers, fetchUnturnedPlayerCount } from "./unturned";
import { mapSteamServerListRows } from "./steam-server-list";
import { hasServerBrowser } from "../browserGames";
import { managedQueryKind } from "@/lib/communityHosting/playerQuery";
import { hostModesFor } from "@/lib/multiplayer/hostModes";
import { coerceSettingValues } from "@/lib/serverControl/settings";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("Unturned integration", () => {
  it("offers public and dedicated party modes with a local occupancy query", () => {
    expect(hasServerBrowser("unturned")).toBe(true);
    expect(hostModesFor("unturned")).toEqual(expect.arrayContaining(["public", "dedicated"]));
    expect(managedQueryKind("unturned", {queryKind:"none"})).toBe("agent-local");
    expect(coerceSettingValues("unturned", {map:"Russia", pve:true, perspective:"First", maxPlayers:8}).rejected).toEqual([]);
    expect(coerceSettingValues("unturned", {map:"PEI\nShutdown", perspective:"invalid"}).rejected).toHaveLength(2);
  });
  it("preserves missing occupancy and uses the query port for direct connect", () => {
    const [server] = mapSteamServerListRows([{addr:"192.0.2.1:27015",gameport:27016,bots:0}], "unturned");
    expect(server).toMatchObject({port:27015,players:null,maxPlayers:null,bots:0});
  });
  it("loads real server rows without appending a synthetic concurrency row", async () => {
    vi.stubEnv("STEAM_WEB_API_KEY", "fixture-only");
    const fetch = vi.fn(async (url: string) => {
      expect(new URL(url).searchParams.get("filter")).toBe("\\appid\\304930");
      return {ok:true,json:async()=>({response:{servers:[{addr:"192.0.2.1:27015",players:2,max_players:24}]}})};
    });
    vi.stubGlobal("fetch",fetch);
    expect(await fetchUnturnedServers()).toEqual([expect.objectContaining({players:2,gameType:"unturned"})]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new URL(fetch.mock.calls[0][0] as unknown as string).searchParams.get("filter")).toBe("\\appid\\304930");
  });
  it("fails honestly without discovery credentials or a valid upstream response", async () => {
    vi.stubEnv("STEAM_WEB_API_KEY", "");
    await expect(fetchUnturnedServers()).rejects.toThrow("STEAM_WEB_API_KEY");
    vi.stubEnv("STEAM_WEB_API_KEY", "fixture-only");
    vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({response:{}})})));
    await expect(fetchUnturnedServers()).rejects.toThrow("unavailable");
  });
  it("uses the exact Steam application count and rejects a missing count", async () => {
    vi.stubEnv("STEAM_WEB_API_KEY", "fixture-only");
    vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({response:{result:1,player_count:123}})})));
    expect(await fetchUnturnedPlayerCount()).toEqual({players:123,servers:0});
    vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({response:{result:1}})})));
    await expect(fetchUnturnedPlayerCount()).rejects.toThrow("unavailable");
  });
});
