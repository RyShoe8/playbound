/**
 * Tests for gamePlayerName service.
 * Run: node services/gamePlayerName.test.js
 */

"use strict";

const assert = require("assert");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const {
  defaultServerName,
  sanitizePlayerName,
  sanitizeServerName,
  updateIniSetting,
  updateYamlProperty,
  updateCvarSetting,
  updateKeyValueSetting,
  autoConfigureGamePlayerName,
  getPlayerNameLaunchArgs,
  getServerNameLaunchArgs,
} = require("./gamePlayerName");

async function runTests() {
  console.log("Running gamePlayerName tests...");

  // 1. sanitizePlayerName
  assert.strictEqual(sanitizePlayerName("Jacky Daytona"), "Jacky Daytona");
  assert.strictEqual(sanitizePlayerName('  Jacky "The Boss" Daytona;  '), "Jacky The Boss Daytona");
  assert.strictEqual(sanitizePlayerName("A".repeat(50)), "A".repeat(32));
  assert.strictEqual(sanitizePlayerName(""), "Player");
  assert.strictEqual(sanitizePlayerName(null), "Player");

  // 1b. defaultServerName & sanitizeServerName
  assert.strictEqual(defaultServerName("Jacky Daytona"), "Jacky Daytona's Server");
  assert.strictEqual(defaultServerName(""), "PlayBound Server");
  assert.strictEqual(defaultServerName("Player"), "PlayBound Server");
  assert.strictEqual(defaultServerName(null), "PlayBound Server");
  assert.strictEqual(sanitizeServerName('  "Party" Room; \n '), "Party Room");
  assert.strictEqual(sanitizeServerName(""), "PlayBound Server");

  // 2. updateIniSetting
  const iniSample = "[network]\nclient_name = OldName\nother = 123\n";
  const iniUpdated = updateIniSetting(iniSample, "network", "client_name", "Jacky");
  assert.match(iniUpdated, /client_name = Jacky/);
  assert.match(iniUpdated, /other = 123/);

  const iniMissingSection = "foo = bar\n";
  const iniAdded = updateIniSetting(iniMissingSection, "General", "PlayerName", "Jacky");
  assert.match(iniAdded, /\[General\]/);
  assert.match(iniAdded, /PlayerName = Jacky/);

  // 3. updateYamlProperty
  const yamlSample = "Player:\n\tName: OldPlayer\n\nSound:\n\tVolume: 10\n";
  const yamlUpdated = updateYamlProperty(yamlSample, "Player", "Name", "Jacky");
  assert.match(yamlUpdated, /Name: Jacky/);
  assert.match(yamlUpdated, /Volume: 10/);

  const yamlNoPlayer = "Sound:\n\tVolume: 10\n";
  const yamlAdded = updateYamlProperty(yamlNoPlayer, "Player", "Name", "Jacky");
  assert.match(yamlAdded, /Player:/);
  assert.match(yamlAdded, /Name: Jacky/);

  // 4. updateCvarSetting
  const cvarSample = 'seta name "OldPlayer"\nseta cg_fov "90"\n';
  const cvarUpdated = updateCvarSetting(cvarSample, "name", "Jacky");
  assert.match(cvarUpdated, /seta name "Jacky"/);
  assert.match(cvarUpdated, /seta cg_fov "90"/);

  const cvarNone = 'seta cg_fov "90"\n';
  const cvarAdded = updateCvarSetting(cvarNone, "name", "Jacky");
  assert.match(cvarAdded, /seta name "Jacky"/);

  // 5. updateKeyValueSetting
  const kvSample = 'playername.singleplayer = "Old"\nplayername.multiplayer = "Old"\n';
  const kvUpdated = updateKeyValueSetting(kvSample, "playername.singleplayer", "Jacky", { quote: true });
  assert.match(kvUpdated, /playername\.singleplayer = "Jacky"/);

  // 6. getPlayerNameLaunchArgs
  assert.deepStrictEqual(getPlayerNameLaunchArgs("openarena", "Jacky"), ["+set", "name", "Jacky"]);
  assert.deepStrictEqual(getPlayerNameLaunchArgs("openarena", "Jacky", ["+set", "name", "Other"]), []);
  assert.deepStrictEqual(getPlayerNameLaunchArgs("xonotic", "Jacky"), ["+name", "Jacky"]);
  assert.deepStrictEqual(getPlayerNameLaunchArgs("freeciv", "Jacky"), ["--name", "Jacky"]);
  assert.deepStrictEqual(getPlayerNameLaunchArgs("hedgewars", "Jacky"), ["--nick", "Jacky"]);
  assert.deepStrictEqual(getPlayerNameLaunchArgs("space-station-14", "Jacky"), ["--username", "Jacky"]);
  assert.deepStrictEqual(getPlayerNameLaunchArgs("opentyrian-2000", "Jacky"), ["--net-player-name=Jacky"]);
  assert.deepStrictEqual(getPlayerNameLaunchArgs("assaultcube", "Jacky"), ["-nJacky"]);
  assert.deepStrictEqual(getPlayerNameLaunchArgs("openra", "Jacky"), ["Player.Name=Jacky"]);

  // 6b. getServerNameLaunchArgs
  assert.deepStrictEqual(getServerNameLaunchArgs("openarena", "Jacky's Server"), ["+set", "sv_hostname", "Jacky's Server"]);
  assert.deepStrictEqual(getServerNameLaunchArgs("openarena", "Jacky's Server", ["+set", "sv_hostname", "Other"]), []);
  assert.deepStrictEqual(getServerNameLaunchArgs("xonotic", "Jacky's Server"), ["+hostname", "Jacky's Server"]);
  assert.deepStrictEqual(getServerNameLaunchArgs("openra", "Jacky's Server"), ["Server.Name=Jacky's Server"]);
  assert.deepStrictEqual(getServerNameLaunchArgs("freeciv", "Jacky's Server"), ["--ServerName", "Jacky's Server"]);
  assert.deepStrictEqual(getServerNameLaunchArgs("0ad", "Jacky's Server", ["-autostart"]), ["-autostart-matchname=Jacky's Server"]);

  // 7. autoConfigureGamePlayerName integration with temp dir
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "pb-player-test-"));
  try {
    const gameDir = path.join(tmpDir, "game");
    const appData = path.join(tmpDir, "appdata");
    const localAppData = path.join(tmpDir, "localappdata");
    await fsp.mkdir(gameDir, { recursive: true });
    await fsp.mkdir(appData, { recursive: true });
    await fsp.mkdir(localAppData, { recursive: true });

    // OpenRA test (player name + server name)
    await autoConfigureGamePlayerName({
      slug: "openra",
      playerName: "Jacky Daytona",
      appDataDir: appData,
    });
    const openRaContent = await fsp.readFile(path.join(appData, "OpenRA", "settings.yaml"), "utf8");
    assert.match(openRaContent, /Name: Jacky Daytona/);
    assert.match(openRaContent, /Server:\n\tName: Jacky Daytona's Server/);

    // 0 A.D. test (player name + match name)
    await autoConfigureGamePlayerName({
      slug: "0ad",
      playerName: "Jacky Daytona",
      appDataDir: appData,
      localAppDataDir: localAppData,
    });
    const zeroAdContent = await fsp.readFile(path.join(appData, "0ad", "config", "user.cfg"), "utf8");
    assert.match(zeroAdContent, /playername\.singleplayer = "Jacky Daytona"/);
    assert.match(zeroAdContent, /playername\.multiplayer = "Jacky Daytona"/);
    assert.match(zeroAdContent, /autostart\.matchname = "Jacky Daytona's Server"/);
    assert.match(zeroAdContent, /multiplayer\.server\.matchname = "Jacky Daytona's Server"/);

    // KeeperFX test (PLAYER_NAME + SESSION_NAME)
    await fsp.writeFile(path.join(gameDir, "keeperfx.cfg"), "PLAYER_NAME = Old\nSESSION_NAME = OldSession\n");
    await autoConfigureGamePlayerName({
      slug: "keeperfx",
      gameDir,
      playerName: "Jacky Daytona",
      appDataDir: appData,
    });
    const keeperContent = await fsp.readFile(path.join(gameDir, "keeperfx.cfg"), "utf8");
    assert.match(keeperContent, /PLAYER_NAME = Jacky Daytona/);
    assert.match(keeperContent, /SESSION_NAME = Jacky Daytona's Server/);

    // TES3MP test (player name + server hostname)
    await fsp.writeFile(path.join(gameDir, "tes3mp-client-default.cfg"), "[General]\nname = Old\n");
    await fsp.writeFile(path.join(gameDir, "tes3mp-server-default.cfg"), "[General]\nhostname = OldHost\n");
    await autoConfigureGamePlayerName({
      slug: "tes3mp",
      gameDir,
      playerName: "Jacky Daytona",
      appDataDir: appData,
    });
    const tes3mpContent = await fsp.readFile(path.join(gameDir, "tes3mp-client-default.cfg"), "utf8");
    assert.match(tes3mpContent, /name = Jacky Daytona/);
    const tes3mpSrvContent = await fsp.readFile(path.join(gameDir, "tes3mp-server-default.cfg"), "utf8");
    assert.match(tes3mpSrvContent, /hostname = Jacky Daytona's Server/);

    // OpenTTD test (client_name + server_name)
    await autoConfigureGamePlayerName({
      slug: "openttd",
      playerName: "Jacky Daytona",
      appDataDir: appData,
    });
    const ttdContent = await fsp.readFile(path.join(appData, "OpenTTD", "private.cfg"), "utf8");
    assert.match(ttdContent, /client_name = Jacky Daytona/);
    assert.match(ttdContent, /server_name = Jacky Daytona's Server/);

    console.log("All gamePlayerName tests passed successfully!");
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
