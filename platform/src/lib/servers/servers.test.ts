import { describe, expect, it } from "vitest";
import { mapSteamServerListRows } from "./providers/steam-server-list";

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
