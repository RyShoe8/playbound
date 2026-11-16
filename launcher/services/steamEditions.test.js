"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { editionSteamAppId, editionExeHint, isDedicatedServerExe, needsSteamDetection } = require("./steamEditions");

test("reads the Steam app id however the edition names it", () => {
  // Lambda Wars: store method only.
  assert.equal(editionSteamAppId({ installMethod: "steam", installConfig: { steam: { appId: "270370" } } }), "270370");
  // Reactive Drop: PlayBound recipe that hands off to Steam.
  assert.equal(editionSteamAppId({ installConfig: { steam: { appId: "563560" }, playbound_installer: { kind: "external", steamAppId: "563560", url: "steam://install/563560" } } }), "563560");
  assert.equal(editionSteamAppId({ installConfig: { playbound_installer: { kind: "external", url: "steam://install/563560" } } }), "563560");
  // Alien Swarm's virtual edition: a steam:// link only.
  assert.equal(editionSteamAppId({ installConfig: { external_installer: { url: "steam://install/630" } } }), "630");
  assert.equal(editionSteamAppId({ installAction: { href: "steam://run/630" } }), "630");
});

test("non-Steam editions have no app id", () => {
  assert.equal(editionSteamAppId({ installConfig: { playbound_installer: { kind: "direct-zip", url: "https://mirror.playbound.club/games/a.zip" } } }), null);
  // A download recipe that only records a Steam app id (HoloCure vanilla from
  // itch.io) is never treated as a Steam install.
  assert.equal(editionSteamAppId({ installMethod: "playbound_installer", installConfig: { steam: { appId: "2420510" }, playbound_installer: { kind: "direct-zip", steamAppId: "2420510", url: "https://mirror.playbound.club/launcher-packages/games/holocure/HoloCure.zip" } } }), null);
  assert.equal(editionSteamAppId({ installConfig: { playbound_installer: { kind: "github-zip", repo: "a/b" }, external_installer: { url: "steam://install/1" } } }), null);
  assert.equal(editionSteamAppId({ installMethod: "gog", installConfig: { gog: { productId: "1" } }, installAction: { href: "https://www.gog.com/game/x" } }), null);
  assert.equal(editionSteamAppId({ installAction: { href: "https://store.steampowered.com/app/630" } }), null);
  assert.equal(editionSteamAppId(null), null);
});

test("the recipe's exe hint is passed through", () => {
  assert.equal(editionExeHint({ installConfig: { playbound_installer: { exeHint: "^reactivedrop\\.exe$" } } }), "^reactivedrop\\.exe$");
  assert.equal(editionExeHint({ installConfig: { steam: { appId: "270370" } } }), null);
});

test("dedicated-server binaries are recognised and re-detected", () => {
  assert.equal(isDedicatedServerExe(String.raw`D:\SteamLibrary\steamapps\common\Alien Swarm\srcds.exe`), true);
  assert.equal(isDedicatedServerExe("C:/games/hl/hlds.exe"), true);
  assert.equal(isDedicatedServerExe(String.raw`D:\SteamLibrary\steamapps\common\Alien Swarm\swarm.exe`), false);
  const exists = () => true;
  assert.equal(needsSteamDetection({ exe: String.raw`D:\x\srcds.exe` }, exists), true);
  assert.equal(needsSteamDetection({ exe: String.raw`D:\x\swarm.exe` }, exists), false);
  assert.equal(needsSteamDetection({ exe: String.raw`D:\x\swarm.exe` }, () => false), true);
  assert.equal(needsSteamDetection(undefined, exists), true);
});
