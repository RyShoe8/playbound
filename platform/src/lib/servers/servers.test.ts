import { describe, expect, it } from "vitest";
import { pickHostPort } from "./providers/openrct2";
import { mapSteamServerListRows } from "./providers/team-fortress-2";

describe("openrct2 pickHostPort", () => {
  it("unwraps nested ip.v4 from the master API", () => {
    const endpoint = pickHostPort({
      ip: { v4: ["158.69.192.150"], v6: [] },
      port: 11753,
    });
    expect(endpoint).toEqual({ host: "158.69.192.150", port: 11753 });
  });

  it("accepts a flat IP string", () => {
    const endpoint = pickHostPort({ ip: "1.2.3.4", port: 7777 });
    expect(endpoint).toEqual({ host: "1.2.3.4", port: 7777 });
  });

  it("does not stringify objects to [object Object]", () => {
    const endpoint = pickHostPort({
      ip: { v4: [], v6: [] },
      port: 11753,
    });
    expect(endpoint).toBeNull();
  });

  it("falls back to addresses[]", () => {
    const endpoint = pickHostPort({
      addresses: [{ ip: "10.0.0.2", port: 9000 }],
    });
    expect(endpoint).toEqual({ host: "10.0.0.2", port: 9000 });
  });
});

describe("team-fortress-2 mapSteamServerListRows", () => {
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
