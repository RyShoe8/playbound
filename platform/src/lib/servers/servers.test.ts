import { describe, expect, it } from "vitest";
import { mapSteamServerListRows } from "./providers/steam-server-list";
import { parseOsrsWorlds, osrsWorldsToServers } from "./providers/old-school-runescape";

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
