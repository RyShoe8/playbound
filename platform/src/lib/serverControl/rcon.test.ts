import { describe, it, expect } from "vitest";
import { buildRconCommands, parseQuake3Status, rconValue, UnsafeSettingValue } from "./rcon";

describe("building commands from declared settings", () => {
  it("sets a cvar named after the key", () => {
    expect(buildRconCommands("wolfenstein-enemy-territory", { g_warmup: 30 })).toEqual([
      { key: "g_warmup", command: 'set g_warmup "30"' },
    ]);
  });

  it("writes booleans the way a cvar wants them", () => {
    // `set g_friendlyFire "false"` parses as a non-zero string in the Quake 3
    // console, which is to say it turns friendly fire on.
    expect(rconValue(false)).toBe("0");
    expect(buildRconCommands("wolfenstein-enemy-territory", { g_friendlyFire: false })).toEqual([
      { key: "g_friendlyFire", command: 'set g_friendlyFire "0"' },
    ]);
  });

  it("uses the command form for settings that are not cvars", () => {
    expect(buildRconCommands("wolfenstein-enemy-territory", { map: "goldrush" })).toEqual([
      { key: "map", command: "map goldrush" },
    ]);
  });

  it("says nothing about settings the server cannot be told", () => {
    /*
     * sv_maxclients is latched and delivered at spawn. Emitting a command for
     * it would have the panel report a change the running server ignores.
     */
    expect(buildRconCommands("wolfenstein-enemy-territory", { sv_maxclients: 32 })).toEqual([]);
    // Warzone has no control channel at all; nothing it declares is sendable.
    expect(buildRconCommands("warzone-2100", { maxPlayers: 4 })).toEqual([]);
  });

  it("emits only what it was given", () => {
    const commands = buildRconCommands("wolfenstein-enemy-territory", {
      map: "radar",
      g_warmup: 5,
    });
    expect(commands.map((c) => c.key)).toEqual(["map", "g_warmup"]);
  });

  it("refuses a value that would become a second command", () => {
    /*
     * A console line ends at `;` or a newline. If a value carrying one ever
     * reached a command, a host could run anything the server accepts —
     * including `quit`. Declared enums and numbers make this unreachable
     * today; this is the guard for the day someone adds a free-text setting.
     */
    expect(() =>
      buildRconCommands("wolfenstein-enemy-territory", { g_warmup: '10"; quit' as never })
    ).toThrow(UnsafeSettingValue);
    expect(() =>
      buildRconCommands("wolfenstein-enemy-territory", { map: "oasis\nquit" as never })
    ).toThrow(UnsafeSettingValue);
  });
});

describe("reading a status reply", () => {
  const reply = `map: oasis
num score ping name            lastmsg address               qport rate
--- ----- ---- --------------- ------- --------------------- ----- -----
  0    12   48 Ryan^7                0 203.0.113.9:27960      12345 25000
  1     3  102 Chris ^1the ^7Red     0 198.51.100.4:27961      2345 25000
`;

  it("reads every connected player", () => {
    const players = parseQuake3Status(reply);
    expect(players).toHaveLength(2);
    expect(players[0]).toMatchObject({ name: "Ryan", id: "0", score: 12, pingMs: 48 });
  });

  it("keeps names that contain spaces and strips their colour codes", () => {
    // The columns delimit the name, not whitespace — splitting on spaces turns
    // this player into three of them.
    expect(parseQuake3Status(reply)[1].name).toBe("Chris the Red");
  });

  it("ignores the header rather than reporting it as a player", () => {
    expect(parseQuake3Status("map: oasis\nnum score ping name\n--- ----- ----")).toEqual([]);
    expect(parseQuake3Status("")).toEqual([]);
    expect(parseQuake3Status("Bad rconpassword.")).toEqual([]);
  });
});
