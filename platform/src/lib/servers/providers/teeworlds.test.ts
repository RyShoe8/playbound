import { describe, expect, it } from "vitest";
import { parseTeeworldsServers } from "./teeworlds";

describe("Teeworlds master server parser", () => {
  it("parses addresses, player counts, map and game type", () => {
    const servers = parseTeeworldsServers([
      {
        addresses: ["tw-0.6+udp://198.51.100.5:8303"],
        location: "eu:de",
        info: {
          name: "PlayBound Teeworlds DM",
          game_type: "dm",
          map: { name: "dm1" },
          max_clients: 16,
          max_players: 16,
          passworded: false,
          clients: [{ name: "Player 1" }, { name: "Player 2" }],
        },
      },
    ]);

    expect(servers).toHaveLength(1);
    expect(servers[0]).toMatchObject({
      id: "198.51.100.5:8303",
      name: "PlayBound Teeworlds DM",
      host: "198.51.100.5",
      port: 8303,
      players: 2,
      maxPlayers: 16,
      map: "dm1",
      gameType: "dm",
      password: false,
      country: "DE",
    });
  });

  it("skips servers with invalid addresses or missing name", () => {
    const servers = parseTeeworldsServers([
      { addresses: ["invalid"], info: { name: "Bad Addr" } },
      { addresses: ["udp://198.51.100.5:8303"], info: {} as never },
    ]);
    expect(servers).toEqual([]);
  });
});
