const test = require("node:test");
const assert = require("node:assert/strict");
const { buildServerArgs, cvarArgs, createLocalServers } = require("./localServer");
const { localSettingsEngine } = require("./localServerSettings");

test("OpenRA/OpenHV receive native key=value settings without +set", () => {
  for (const binaryHint of ["OpenRA.Server", "OpenHV.Server.exe"]) {
    const args = buildServerArgs({ hostLaunch: { binaryHint, argsTemplate: ["Game.Mod=ra", "Server.ListenPort={port}"] }, port: 1234,
      settings: { "Server.EnableSingleplayer": true, "Server.LockBots": false }, serverName: "Friends Server" });
    assert.deepEqual(args, ["Game.Mod=ra", "Server.ListenPort=1234", "Server.Name=Friends Server", "Server.EnableSingleplayer=True", "Server.LockBots=False"]);
  }
});
test("Teeworlds/DDNet get individual native commands without shell quotes", () => {
  for (const binaryHint of ["teeworlds_srv", "DDNet-Server.exe"]) {
    assert.deepEqual(buildServerArgs({ hostLaunch: { binaryHint, argsTemplate: ['"sv_port {port}"', '"sv_name {name}"'] }, port: 8303, serverName: "Two Friends",
      settings: { sv_map: "dm2", sv_gametype: "ctf", sv_max_clients: 8 } }), ["sv_port 8303", 'sv_name "Two Friends"', "sv_map dm2", "sv_gametype ctf", "sv_max_clients 8"]);
  }
});
test("BZFlag replaces native slot/flag defaults instead of appending cvars", () => {
  assert.deepEqual(buildServerArgs({ hostLaunch: { binaryHint: "bzfs", argsTemplate: ["-p", "{port}", "-offa", "+s", "10", "-mp", "8"] }, port: 5155,
    settings: { maxPlayers: 12, superFlags: 3 } }), ["-p", "5155", "-offa", "-mp", "12", "+s", "3"]);
});
test("Quake maps are commands after all cvars, including slash-delimited MOHAA maps", () => {
  assert.deepEqual(buildServerArgs({ hostLaunch: { binaryHint: "omohaaded", argsTemplate: ["+set", "net_port", "{port}"] }, port: 12203,
    settings: { map: "dm/mohdm2", g_gametype: 2 } }), ["+set", "net_port", "12203", "+set", "g_gametype", "2", "+map", "dm/mohdm2"]);
});
test("Xonotic sends native console commands", () => {
  assert.deepEqual(buildServerArgs({ hostLaunch: { binaryHint: "xonotic-linux64-dedicated", argsTemplate: ["+port", "{port}"] }, port: 26000,
    settings: { gametype: "ctf", maxplayers: 8, minplayers: 4 } }), ["+port", "26000", "+gametype", "ctf", "+maxplayers", "8", "+minplayers", "4"]);
});
test("TES3MP settings stay in declared config files rather than argv", () => {
  assert.deepEqual(buildServerArgs({ hostLaunch: { binaryHint: "tes3mp-server", configFile: "tes3mp.cfg", configKeys: ["maximumPlayers"], argsTemplate: ["--config", "tes3mp.cfg"] }, port: 25565,
    settings: { maximumPlayers: 4 } }), ["--config", "tes3mp.cfg"]);
});
test("unsafe values/keys fail before stopping the current server", () => {
  const options = { hostLaunch: { binaryHint: "OpenRA.Server", argsTemplate: ["Server.ListenPort={port}"] }, port: 1234, settings: { "Server.LockBots": "False;quit" }, exe: "fixture" };
  assert.throws(() => buildServerArgs(options));
  assert.match(createLocalServers().start("party", options).error, /cannot be delivered safely/);
  assert.deepEqual(cvarArgs({ "+quit": "1", valid: '";quit' }), []);
  assert.equal(localSettingsEngine({ binaryHint: "unassessed-server" }), null);
});
