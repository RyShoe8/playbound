import { describe, expect, it } from "vitest";
import { parseRenegadeXServers } from "./renegade-x";

describe("Renegade X master-server parser", () => {
  it("maps player counts, capacity, map, prefix and password state", () => {
    const [server] = parseRenegadeXServers([{
      Name: "All Out War",
      NamePrefix: "[Totem Arts]",
      IP: "198.51.100.10",
      Port: 7777,
      Players: 17,
      Bots: 3,
      "Current Map": "CNC-Field",
      "Game Version": "Release 1.1.1094",
      Variables: { "Player Limit": 64, "Game Type": 1, bPassworded: true },
    }]);

    expect(server).toMatchObject({
      name: "[Totem Arts] All Out War",
      host: "198.51.100.10",
      port: 7777,
      players: 17,
      maxPlayers: 64,
      map: "CNC-Field",
      protected: true,
    });
  });

  it("skips rows with no honest player count instead of reporting zero", () => {
    expect(parseRenegadeXServers([{ Name: "Broken", IP: "198.51.100.20", Port: 7777 }])).toEqual([]);
  });

  it("rejects malformed top-level responses", () => {
    expect(() => parseRenegadeXServers({ error: "nope" })).toThrow(/non-array/);
  });
});
