/**
 * Tests for the RetroArch netplay game registry.
 *
 * Run: node services/retroArchNetplay.test.js
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  NETPLAY_PORT,
  getNetplayConfig,
  isNetplayRomGame,
  listNetplayGames,
  netplayHostArgs,
  netplayJoinArgs,
} = require("./retroArchNetplay");
const { CORES } = require("./ManagedRetroArch");

test("registered games return their config", () => {
  const config = getNetplayConfig("baseball-stars");
  assert.ok(config);
  assert.equal(config.slug, "baseball-stars");
  assert.equal(config.core, "fbneo");
  assert.equal(config.maxPlayers, 2);
  assert.equal(config.netplayPort, NETPLAY_PORT);
});

test("GOG Neo Geo sports trio is registered for FBNeo netplay", () => {
  for (const [slug, rom] of [
    ["super-sidekicks", "ssideki.zip"],
    ["baseball-stars-2", "bstars2.zip"],
    ["soccer-brawl", "socbrawl.zip"],
  ]) {
    const config = getNetplayConfig(slug);
    assert.ok(config, slug);
    assert.equal(config.core, "fbneo");
    assert.equal(config.romFile, rom);
    assert.equal(config.maxPlayers, 2);
    assert.equal(isNetplayRomGame(slug), true);
  }
});

test("unknown slugs return null", () => {
  assert.equal(getNetplayConfig("not-a-real-game"), null);
  assert.equal(getNetplayConfig(""), null);
  assert.equal(getNetplayConfig(null), null);
});

test("isNetplayRomGame reflects registration", () => {
  assert.equal(isNetplayRomGame("baseball-stars"), true);
  assert.equal(isNetplayRomGame("super-sidekicks"), true);
  assert.equal(isNetplayRomGame("unknown"), false);
});

test("every registered game references a core that ManagedRetroArch supports", () => {
  for (const game of listNetplayGames()) {
    assert.ok(
      CORES.includes(game.core),
      `${game.slug} references core "${game.core}" which is not in the CORES list`
    );
  }
});

test("netplayHostArgs produces correct RetroArch flags", () => {
  const args = netplayHostArgs({ corePath: "/cores/fbneo.dll", romPath: "/roms/bstars.zip" });
  assert.deepEqual(args, ["-L", "/cores/fbneo.dll", "/roms/bstars.zip", "-f", "-H"]);
});

test("netplayJoinArgs produces correct RetroArch flags", () => {
  const args = netplayJoinArgs({
    corePath: "/cores/fbneo.dll",
    romPath: "/roms/bstars.zip",
    host: "10.0.0.5",
  });
  assert.deepEqual(args, [
    "-L", "/cores/fbneo.dll", "/roms/bstars.zip", "-f", "-C", "10.0.0.5",
  ]);
});

test("listNetplayGames returns at least one game", () => {
  const games = listNetplayGames();
  assert.ok(games.length >= 1, "expected at least one registered netplay game");
});

test("every registered game has required fields", () => {
  for (const game of listNetplayGames()) {
    assert.ok(game.slug, `missing slug`);
    assert.ok(game.title, `${game.slug}: missing title`);
    assert.ok(game.core, `${game.slug}: missing core`);
    assert.ok(typeof game.maxPlayers === "number" && game.maxPlayers >= 2,
      `${game.slug}: maxPlayers must be >= 2`);
    assert.ok(typeof game.netplayPort === "number" && game.netplayPort > 0,
      `${game.slug}: netplayPort must be a positive number`);
    assert.ok(game.source, `${game.slug}: missing source`);
  }
});
