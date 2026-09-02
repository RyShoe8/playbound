/**
 * What we put on a game server's command line.
 *
 * Run: node services/localServer.test.js
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { buildServerArgs, cvarArgs } = require("./localServer");

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
