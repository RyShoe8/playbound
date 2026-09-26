import { describe, it, expect } from "vitest";
import { buildRconCommands, parseStatus, rconValue, UnsafeSettingValue } from "./rcon";

const parseQuake3Status = (text: string) => parseStatus("rcon-quake3", text);

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

describe("consoleCommandProblem", () => {
  it("lets ordinary admin commands through", async () => {
    const { consoleCommandProblem } = await import("./rcon");
    for (const ok of ["status", "map oa_dm1", "set g_gravity 400", "kick Player", "clientkick 3", "timelimit 20"]) {
      expect(consoleCommandProblem(ok)).toBeNull();
    }
  });
  it("refuses anything that escapes the product or the slot cap", async () => {
    const { consoleCommandProblem } = await import("./rcon");
    for (const bad of [
      "quit", "/quit", "exec server.cfg", "set rconpassword x", "rconpassword x", "seta sv_maxclients 64",
      "sv_maxclients 64", "set fs_game other", "status; quit", "status\nquit", "vstr evil", "set sv_hostname Foo", "",
    ]) {
      expect(consoleCommandProblem(bad)).not.toBeNull();
    }
  });
});

/* Replies captured from real servers on the PlayBound VPS (2026-09-26). */
const OPENARENA_STATUS = `map: oa_dm1
cl score ping name            address                                 rate 
-- ----- ---- --------------- --------------------------------------- -----
 0     1    0 Liz             ^7bot                                     16384
 1     0   48 Ryan            ^7203.0.113.9:27960                       25000
`;
const XONOTIC_STATUS = `host:     PB probe
map:      stormkeep
players:  3 active (16 max)

#1   [BOT]Toxic          0   0:00:32
   botclient
#2   Ryan                7   0:03:10
   203.0.113.9:26000
`;
const TF2_STATUS = `hostname: PB
map     : cp_dustbowl at: 0 x, 0 y, 0 z
# userid name                uniqueid            connected ping loss state  adr
#      2 "Mega Baboon"       BOT                                     active
#      5 "Ryan"              [U:1:123456]        01:02       50    0 active 203.0.113.9:27005
`;
const CS2_STATUS = `loaded spawngroup(  1)  : SV:  [1: de_inferno | main lump | mapload]
---------players--------
  id     time ping loss      state   rate adr name
   0      BOT    0    0     active      0 'Getaway'
   2    00:10   45    0     active 786432 203.0.113.9:27005 'Ryan'
#end
`;

describe("per-engine status parsing", () => {
  it("reads OpenArena (no lastmsg column, ^7 addresses)", async () => {
    const { parseStatus, parseCurrentMap } = await import("./rcon");
    expect(parseStatus("rcon-quake3", OPENARENA_STATUS)).toEqual([
      { id: "0", name: "Liz", score: 1, pingMs: 0, bot: true, address: null },
      { id: "1", name: "Ryan", score: 0, pingMs: 48, bot: false, address: "203.0.113.9" },
    ]);
    expect(parseCurrentMap("rcon-quake3", OPENARENA_STATUS)).toBe("oa_dm1");
  });
  it("reads Xonotic, Team Fortress 2 and Counter-Strike 2", async () => {
    const { parseStatus, parseCurrentMap } = await import("./rcon");
    expect(parseStatus("rcon-darkplaces", XONOTIC_STATUS)).toEqual([
      { id: "1", name: "[BOT]Toxic", score: 0, pingMs: null, bot: true, address: null },
      { id: "2", name: "Ryan", score: 7, pingMs: null, bot: false, address: "203.0.113.9" },
    ]);
    expect(parseCurrentMap("rcon-darkplaces", XONOTIC_STATUS)).toBe("stormkeep");
    const tf2 = parseStatus("rcon-source", TF2_STATUS);
    expect(tf2.map((p) => [p.id, p.name, p.bot, p.address, p.pingMs])).toEqual([
      ["2", "Mega Baboon", true, null, null],
      ["5", "Ryan", false, "203.0.113.9", 50],
    ]);
    expect(parseCurrentMap("rcon-source", TF2_STATUS)).toBe("cp_dustbowl");
    const cs2 = parseStatus("rcon-source", CS2_STATUS);
    expect(cs2.map((p) => [p.id, p.name, p.bot, p.address])).toEqual([
      ["0", "Getaway", true, null],
      ["2", "Ryan", false, "203.0.113.9"],
    ]);
    expect(parseCurrentMap("rcon-source", CS2_STATUS)).toBe("de_inferno");
  });
});

describe("per-engine commands", () => {
  it("kicks, bans and unbans with each engine's own syntax", async () => {
    const { kickCommand, banCommands, unbanCommands } = await import("./rcon");
    expect(kickCommand("rcon-quake3", "3")).toBe("clientkick 3");
    expect(kickCommand("rcon-darkplaces", "3")).toBe("kick # 3");
    expect(kickCommand("rcon-source", "3")).toBe("kickid 3");
    expect(() => kickCommand("rcon-source", "3; quit")).toThrow();
    expect(banCommands("rcon-source", "203.0.113.9")).toEqual(["addip 0 203.0.113.9"]);
    expect(banCommands("rcon-quake3", "203.0.113.9")).toEqual(["addip 203.0.113.9"]);
    expect(() => banCommands("rcon-quake3", "1.2.3.4; quit")).toThrow();
    expect(unbanCommands("rcon-darkplaces", "203.0.113.9")).toBeNull();
  });
  it("builds a rotation only from the game's own maps", async () => {
    const { rotationCommands } = await import("./rcon");
    const spec = { options: [{ value: "oa_dm1", label: "a" }, { value: "oa_dm2", label: "b" }], changeCommand: "map {value}", rotation: "quake3-vstr" as const };
    expect(rotationCommands(spec, ["oa_dm1", "oa_dm2"])).toEqual([
      'set pb_rot0 "map oa_dm1; set nextmap vstr pb_rot1"',
      'set pb_rot1 "map oa_dm2; set nextmap vstr pb_rot0"',
      'set nextmap "vstr pb_rot0"',
    ]);
    expect(() => rotationCommands(spec, ["oa_dm1", "evil; quit"])).toThrow();
    expect(rotationCommands({ ...spec, rotation: "darkplaces-maplist" }, ["oa_dm2"])).toEqual(['set g_maplist "oa_dm2"', "set g_maplist_shuffle 0"]);
  });
  it("sets Source cvars without `set`", async () => {
    const { buildRconCommands } = await import("./rcon");
    // Any source-channel profile with an rcon setting; asserted after profiles gain one.
    const cmds = buildRconCommands("team-fortress-2", { mp_timelimit: 25 });
    expect(cmds).toEqual([{ key: "mp_timelimit", command: 'mp_timelimit "25"' }]);
  });
});
