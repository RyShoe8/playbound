/**
 * What we put on a game server's command line.
 *
 * Run: node services/localServer.test.js
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { buildServerArgs, cvarArgs, writeServerConfig } = require("./localServer");

const ET_HOST = {
  argsTemplate: ["+set", "dedicated", "1", "+set", "net_port", "{port}"],
};

test("fills the port into the game's own host template", () => {
  const args = buildServerArgs({ hostLaunch: ET_HOST, port: 27960, settings: {} });
  assert.deepEqual(args, ["+set", "dedicated", "1", "+set", "net_port", "27960"]);
});

test("appends declared settings as cvars", () => {
  const args = buildServerArgs({
    hostLaunch: ET_HOST,
    port: 27960,
    settings: { g_gametype: 2, sv_maxclients: 32 },
  });
  assert.deepEqual(args.slice(6), ["+set", "g_gametype", "2", "+set", "sv_maxclients", "32"]);
});

test("writes booleans the way a cvar wants them", () => {
  // `+set g_friendlyFire false` is a non-empty string, which is to say it turns
  // friendly fire on.
  assert.deepEqual(cvarArgs({ g_friendlyFire: false }), ["+set", "g_friendlyFire", "0"]);
  assert.deepEqual(cvarArgs({ g_friendlyFire: true }), ["+set", "g_friendlyFire", "1"]);
});

test("refuses a value that would become a second console command", () => {
  /*
   * These land on a command line the game parses as console input. A value
   * carrying a quote or a semicolon stops being a value — the platform coerces
   * against the schema before this, and this is the second gate.
   */
  assert.deepEqual(cvarArgs({ map: 'oasis"; quit' }), []);
  assert.deepEqual(cvarArgs({ map: "oasis\nquit" }), []);
  assert.deepEqual(cvarArgs({ map: "goldrush" }), ["+set", "map", "goldrush"]);
});

test("says no rather than guessing when a game declares no host template", () => {
  // Eleven games declare one. Inventing argv for the rest would spawn a client
  // that sits on a title screen while the party waits for a server.
  assert.equal(buildServerArgs({ hostLaunch: {}, port: 1, settings: {} }), null);
  assert.equal(buildServerArgs({ hostLaunch: null, port: 1, settings: {} }), null);
});

test("substitutes into templates that carry the port inside a longer argument", () => {
  const args = buildServerArgs({
    hostLaunch: { argsTemplate: ["Server.ListenPort={port}"] },
    port: 1255,
    settings: {},
  });
  assert.deepEqual(args, ["Server.ListenPort=1255"]);
});

test("writes TES3MP config-file server settings", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "playbound-tes3mp-"));
  const file = path.join(dir, "tes3mp-server-default.cfg");
  const scriptsDir = path.join(dir, "server", "scripts");
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.writeFileSync(path.join(scriptsDir, "config.lua"), 'config.gameMode = "Default"\n');
  fs.writeFileSync(file, "[General]\nport = 25565\nmaximumPlayers = 64\nhostname = TES3MP server\npassword =\n");
  writeServerConfig(dir, {
    configFile: "tes3mp-server-default.cfg",
    configKeys: ["port", "hostname", "maximumPlayers", "password"],
    scriptConfigFile: "server/scripts/config.lua",
    scriptConfigKeys: ["gameMode"],
  }, 25570, { gameMode: "Roleplay", hostname: "Friends only", maximumPlayers: 6, password: "scrib" });
  const actual = fs.readFileSync(file, "utf8");
  assert.match(actual, /^port = 25570$/m);
  assert.match(actual, /^hostname = Friends only$/m);
  assert.match(actual, /^maximumPlayers = 6$/m);
  assert.match(actual, /^password = scrib$/m);
  assert.match(fs.readFileSync(path.join(scriptsDir, "config.lua"), "utf8"), /^config\.gameMode = "Roleplay"$/m);
  fs.rmSync(dir, { recursive: true, force: true });
});
