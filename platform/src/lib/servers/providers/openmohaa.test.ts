import { describe, expect, it } from "vitest";
import {
  normalizeMasterHost,
  parse333networksMohaaList,
} from "./openmohaa";

const fixture = [
  [
    {
      ip: "::ffff:198.51.100.10",
      hostport: 12203,
      hostname: "[HaVoK] Public Rifles &lt;KoTH&gt;",
      mapname: "dm/mohdm6",
      gametype: "-=K-O-T-H=-",
      numplayers: 7,
      maxplayers: 32,
      country: "US",
      gamename: "mohaa",
    },
    {
      ip: "203.0.113.5",
      hostport: 12204,
      hostname: "Empty Server",
      mapname: "dm/mohdm1",
      gametype: "Free-For-All",
      numplayers: 0,
      maxplayers: 16,
      country: "NL",
      gamename: "mohaa",
    },
    {
      ip: "203.0.113.9",
      hostport: 12205,
      hostname: "Missing count",
      mapname: "dm/mohdm2",
      maxplayers: 16,
      country: "DE",
      gamename: "mohaa",
    },
  ],
  { players: 7, total: 3 },
];

describe("333networks OpenMoHAA / MOHAA parser", () => {
  it("normalizes IPv4-mapped IPv6 addresses", () => {
    expect(normalizeMasterHost("::ffff:198.51.100.10")).toBe("198.51.100.10");
    expect(normalizeMasterHost("198.51.100.10")).toBe("198.51.100.10");
    expect(normalizeMasterHost("")).toBeNull();
  });

  it("maps list rows, decodes entities, and uses hostport for join", () => {
    const { servers, players, serverCount } = parse333networksMohaaList(fixture);
    expect(players).toBe(7);
    expect(serverCount).toBe(3);
    expect(servers).toHaveLength(2);
    expect(servers[0]).toMatchObject({
      id: "mohaa:198.51.100.10:12203",
      name: "[HaVoK] Public Rifles <KoTH>",
      host: "198.51.100.10",
      port: 12203,
      players: 7,
      maxPlayers: 32,
      map: "dm/mohdm6",
      gameType: "-=K-O-T-H=-",
      location: { countryCode: "US" },
      protected: false,
    });
    expect(servers[1]).toMatchObject({
      host: "203.0.113.5",
      players: 0,
      location: { countryCode: "NL" },
    });
  });

  it("omits rows with missing numplayers instead of inventing zero", () => {
    const { servers } = parse333networksMohaaList(fixture);
    expect(servers.some((s) => s.host === "203.0.113.9")).toBe(false);
  });

  it("rejects malformed top-level payloads", () => {
    expect(() => parse333networksMohaaList({ error: "nope" })).toThrow(/malformed/);
    expect(() => parse333networksMohaaList([{}, { players: 0 }])).toThrow(/non-array/);
  });
});
