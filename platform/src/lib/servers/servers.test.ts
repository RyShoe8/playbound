import { describe, expect, it } from "vitest";
import { isUpstreamTimeout } from "./errors";
import { mapSteamServerListRows } from "./providers/steam-server-list";
import { parseOsrsWorlds, osrsWorldsToServers } from "./providers/old-school-runescape";

describe("isUpstreamTimeout", () => {
  it("recognizes Node timeout DOMExceptions without matching ordinary failures", () => {
    expect(isUpstreamTimeout(new DOMException("The operation was aborted due to timeout", "TimeoutError"))).toBe(true);
    expect(isUpstreamTimeout({ code: 23, message: "timeout" })).toBe(true);
    expect(isUpstreamTimeout(new Error("Steam GetServerList returned 403"))).toBe(false);
    expect(isUpstreamTimeout(new DOMException("The operation was aborted", "AbortError"))).toBe(false);
  });
});

describe("steam-server-list mapSteamServerListRows", () => {
  it("maps Steam GetServerList rows to GameServer", () => {
    const servers = mapSteamServerListRows([
      {
        addr: "192.0.2.10:27015",
        name: "Test TF2",
        appid: 440,
        players: 12,
        max_players: 24,
        map: "ctf_2fort",
        dedicated: true,
        secure: true,
      },
      {
        // malformed — skipped
        addr: "not-an-endpoint",
        name: "Bad",
      },
    ]);
    expect(servers).toHaveLength(1);
    expect(servers[0]).toMatchObject({
      id: "192.0.2.10:27015",
      host: "192.0.2.10",
      port: 27015,
      name: "Test TF2",
      players: 12,
      maxPlayers: 24,
      map: "ctf_2fort",
      protected: false,
    });
  });
});

describe("old-school-runescape parseOsrsWorlds", () => {
  /*
   * Jagex serves the world list as HTML, so this parser is the one piece of
   * server plumbing that breaks silently if upstream markup changes. The
   * fixture is a verbatim pair of rows from oldschool.runescape.com/slu.
   */
  const fixture = `
    <tr class='server-list__row'>
        <td class='server-list__row-cell'>
                <a id='slu-world-301' class='server-list__world-link' href='https://oldschool.runescape.com/game?world=301'>Old School 1</a>
        </td>
        <td class='server-list__row-cell'>1163 players</td>
        <td class='server-list__row-cell server-list__row-cell--country server-list__row-cell--US'>United States</td>
        <td class='server-list__row-cell server-list__row-cell--type'>Free</td>
        <td class='server-list__row-cell'>Trade - Free</td>
    </tr>
    <tr class='server-list__row server-list__row--members'>
        <td class='server-list__row-cell'>
                <a id='slu-world-302' class='server-list__world-link' href='https://oldschool.runescape.com/game?world=302'>Old School 2</a>
        </td>
        <td class='server-list__row-cell'>1966 players</td>
        <td class='server-list__row-cell server-list__row-cell--country server-list__row-cell--GB'>United Kingdom</td>
        <td class='server-list__row-cell server-list__row-cell--type'>Members</td>
        <td class='server-list__row-cell'>Tempoross</td>
    </tr>`;

  it("parses world number, population, country and membership", () => {
    const worlds = parseOsrsWorlds(fixture);
    expect(worlds).toHaveLength(2);
    expect(worlds[0]).toMatchObject({
      world: 301,
      name: "Old School 1",
      players: 1163,
      countryCode: "US",
      members: false,
      activity: "Trade - Free",
    });
    expect(worlds[1]).toMatchObject({ world: 302, players: 1966, countryCode: "GB", members: true });
  });

  it("maps worlds to servers sorted by population", () => {
    const servers = osrsWorldsToServers(parseOsrsWorlds(fixture));
    expect(servers[0].players).toBe(1966);
    expect(servers[0].gameType).toBe("Members");
    expect(servers[0].maxPlayers).toBe(2000);
    expect(servers[0].location?.countryCode).toBe("GB");
    expect(servers[0].name).toContain("World 302");
  });

  it("skips rows without a world number or a player count", () => {
    expect(parseOsrsWorlds("<tr class='server-list__row'><td>nonsense</td></tr>")).toHaveLength(0);
    // A world link with no population cell must not be reported as zero players.
    expect(
      parseOsrsWorlds(`<tr class='server-list__row'><td><a id='slu-world-999'>W</a></td></tr>`)
    ).toHaveLength(0);
  });
});

describe("star-wars-galaxies parseLegendsStatus", () => {
  it("parses online status and player counts", async () => {
    const { parseLegendsStatus } = await import("./providers/star-wars-galaxies");
    expect(parseLegendsStatus("OMEGA · ONLINE · 908 PLAYERS")).toEqual({
      galaxy: "OMEGA",
      online: true,
      players: 908,
    });
    expect(parseLegendsStatus("OMEGA · OFFLINE · 0 PLAYERS")).toEqual({
      galaxy: "OMEGA",
      online: false,
      players: 0,
    });
    expect(parseLegendsStatus("Not matching html")).toBeNull();
  });
});

describe("morrowind parseTes3mpServers", () => {
  it("parses servers and cleans double-quoted hostnames", async () => {
    const { parseTes3mpServers } = await import("./providers/morrowind");
    const raw = `{"list servers":{"18.219.106.85:25565":{"modname": "Default", "passw": false, "hostname": "[NA] Nerevarine Prophecies (0.8.1)", "query_port": 0, "last_update": 55, "players": 9, "version": "0.8.1", "max_players": 64}, "1.2.3.4:25565":{"modname": "Tamriel Rebuilt", "passw": true, "hostname": ""QuotedName"", "query_port": 0, "last_update": 2, "players": 3, "version": "0.8.1", "max_players": 16}}}`;
    const servers = parseTes3mpServers(raw);
    expect(servers).toHaveLength(2);
    expect(servers[0]).toMatchObject({
      id: "tes3mp:18.219.106.85:25565",
      name: "[NA] Nerevarine Prophecies (0.8.1)",
      host: "18.219.106.85",
      port: 25565,
      players: 9,
      maxPlayers: 64,
      map: null,
      gameType: "TES3MP 0.8.1",
      protected: false,
    });
    expect(servers[1]).toMatchObject({
      id: "tes3mp:1.2.3.4:25565",
      name: "QuotedName",
      host: "1.2.3.4",
      port: 25565,
      players: 3,
      maxPlayers: 16,
      map: "Tamriel Rebuilt",
      gameType: "TES3MP 0.8.1",
      protected: true,
    });
  });
});

