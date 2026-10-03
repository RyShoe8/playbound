import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDedicatedRecipes } from "./dedicatedRecipes.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-paid-provision-"));
const games = path.join(root, "games");
const home = path.join(root, "home");
fs.mkdirSync(games);
const firstExisting = (items) => items.find((item) => fs.existsSync(item)) || null;
const recipes = createDedicatedRecipes({
  fs, path, execFile: async () => {}, GAMES_ROOT: games, HOST_HOME: home,
  gameBin: (slug, names) => names.map((name) => path.join(games, slug, name)),
  firstExisting,
  managedPlayerLimit: (ctx) => ctx.settings.maxPlayers,
  customerHomeDir: (name, ctx) => {
    const dir = path.join(home, name, `pb-${ctx.partyId}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  },
  isolatedHomeEnv: (name) => (_port, ctx) => ({ HOME: path.join(home, name, `pb-${ctx.partyId}`) }),
});
const context = (partyId, maxPlayers = 6) => ({ customerOwned: true, partyId, settings: { maxPlayers }, name: "A & B" });

test("Battlefield 1942 isolates settings and caps players without copying game assets", async () => {
  const source = path.join(games, "battlefield-1942-anthology", "mods", "bf1942");
  fs.mkdirSync(path.join(source, "settings"), { recursive: true });
  fs.mkdirSync(path.join(source, "archives", "bf1942"), { recursive: true });
  fs.writeFileSync(path.join(source, "archives", "bf1942", "game.rfa"), "shared asset");
  fs.writeFileSync(path.join(source, "settings", "serversettings.con"), "game.serverPort 14567\ngame.serverMaxPlayers 32\ngame.serverName \"Original\"\n");
  fs.writeFileSync(path.join(source, "settings", "maplist.con"), "game.addLevel berlin GPM_CQ bf1942\n");
  const a = context("bf-a", 12);
  const b = context("bf-b", 4);
  await recipes["battlefield-1942-anthology"].prepareSpawn(14567, a);
  await recipes["battlefield-1942-anthology"].prepareSpawn(14568, b);
  const overlayA = path.join(home, "battlefield-1942-anthology-servers", "pb-bf-a");
  const overlayB = path.join(home, "battlefield-1942-anthology-servers", "pb-bf-b");
  const configA = path.join(overlayA, "settings", "serversettings.con");
  const configB = path.join(overlayB, "settings", "serversettings.con");
  assert.match(fs.readFileSync(configA, "utf8"), /game.serverPort 14567\n/);
  assert.match(fs.readFileSync(configA, "utf8"), /game.serverMaxPlayers 12\n/);
  assert.match(fs.readFileSync(configB, "utf8"), /game.serverPort 14568\n/);
  assert.match(fs.readFileSync(configB, "utf8"), /game.serverMaxPlayers 4\n/);
  assert.match(fs.readFileSync(configA, "utf8"), /game.serverInternet 0\n/);
  assert.equal(fs.readFileSync(path.join(source, "settings", "serversettings.con"), "utf8").includes("Original"), true);
  assert.equal(fs.existsSync(path.join(overlayA, "mods", "bf1942", "archives")), false);
  assert.deepEqual(recipes["battlefield-1942-anthology"].args(14567, a), ["+overlayPath", overlayA]);
  await recipes["battlefield-1942-anthology"].prepareSpawn(14569, a);
  assert.equal((fs.readFileSync(configA, "utf8").match(/game.serverPort /g) || []).length, 1);
});

test("GoldenEye: Source isolates its Windows runtime and Wine prefix per server", async () => {
  const source = path.join(games, "goldeneye-source");
  fs.mkdirSync(path.join(source, "gesource"), { recursive: true });
  fs.writeFileSync(path.join(source, "srcds.exe"), "server");
  fs.writeFileSync(path.join(source, "run-server.sh"), "launcher");
  fs.writeFileSync(path.join(source, "gesource", "gameinfo.txt"), "mod");
  const a = context("ges-a", 8);
  const b = context("ges-b", 4);
  await recipes["goldeneye-source"].prepareSpawn(27120, a);
  await recipes["goldeneye-source"].prepareSpawn(27121, b);
  const rootA = path.join(home, "goldeneye-source-servers", "pb-ges-a");
  const rootB = path.join(home, "goldeneye-source-servers", "pb-ges-b");
  assert.equal(recipes["goldeneye-source"].resolveBinary(recipes["goldeneye-source"].binaries, a), path.join(rootA, "runtime", "run-server.sh"));
  assert.equal(recipes["goldeneye-source"].spawnEnv(27120, a).WINEPREFIX, path.join(rootA, "wineprefix"));
  assert.equal(recipes["goldeneye-source"].spawnEnv(27121, b).WINEPREFIX, path.join(rootB, "wineprefix"));
  assert.equal(fs.readFileSync(path.join(rootA, "runtime", "gesource", "gameinfo.txt"), "utf8"), "mod");
  const args = recipes["goldeneye-source"].args(27120, a);
  assert.equal(args[args.indexOf("-maxplayers") + 1], "8");
  assert.equal(args[args.indexOf("-port") + 1], "27120");
});

test("Necesse uses the bundled Java and keeps its world in the customer's data directory", () => {
  const args = recipes.necesse.args(14160, context("one", 5));
  assert.equal(args[args.indexOf("-slots") + 1], "5");
  assert.equal(args[args.indexOf("-datadir") + 1], path.join(home, "necesse-servers", "pb-one"));
  assert.equal(recipes.necesse.shutdownCommand, "stop\n");
});

test("Don't Starve Together needs a private token and uses unique Steam ports", async () => {
  const ctx = context("two", 8);
  await assert.rejects(recipes["dont-starve-together"].prepareSpawn(11020, ctx), /cluster token/);
  const cluster = path.join(home, "dont-starve-together-servers", "pb-two", "PlayBound", "Cluster_1");
  fs.mkdirSync(cluster, { recursive: true });
  fs.writeFileSync(path.join(cluster, "cluster_token.txt"), "test-token", { mode: 0o600 });
  await recipes["dont-starve-together"].prepareSpawn(11020, ctx);
  assert.match(fs.readFileSync(path.join(cluster, "cluster.ini"), "utf8"), /max_players = 8/);
  const args = recipes["dont-starve-together"].args(11020, ctx);
  assert.equal(args[args.indexOf("-steam_master_server_port") + 1], "11021");
  assert.equal(args[args.indexOf("-steam_authentication_port") + 1], "11022");
  assert.ok(!args.includes("test-token"));
});

test("Unturned permits a token-free admin smoke test but requires a token for Internet rooms", async () => {
  const ctx = context("unturned-one", 8);
  await assert.rejects(recipes.unturned.prepareSpawn(27075, ctx), /login token is required/);
  const audit = { ...ctx, testSpawn: true };
  await recipes.unturned.prepareSpawn(27075, audit);
  const data = path.join(home, "unturned-servers", "pb-unturned-one");
  const config = path.join(data, "Server", "Commands.dat");
  assert.match(fs.readFileSync(config, "utf8"), /MaxPlayers 8/);
  assert.doesNotMatch(fs.readFileSync(config, "utf8"), /GSLT/);
  assert.match(recipes.unturned.args(27075, audit)[0], /^\+LanServer\//);
  fs.writeFileSync(path.join(data, "gslt.txt"), "a".repeat(32), { mode: 0o600 });
  await recipes.unturned.prepareSpawn(27075, ctx);
  assert.match(fs.readFileSync(config, "utf8"), /GSLT a{32}/);
  assert.match(recipes.unturned.args(27075, ctx)[0], /^\+InternetServer\//);
});

test("Barotrauma gets a separate executable and capped XML per customer", async () => {
  assert.equal(recipes.barotrauma.resolveBinary(recipes.barotrauma.binaries), null);
  const source = path.join(games, "barotrauma");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "DedicatedServer"), "executable");
  fs.writeFileSync(path.join(source, "asset.txt"), "shared asset");
  const a = context("three", 6);
  const b = context("four", 9);
  await recipes.barotrauma.prepareSpawn(27220, a);
  await recipes.barotrauma.prepareSpawn(27222, b);
  const binaryA = recipes.barotrauma.resolveBinary(recipes.barotrauma.binaries, a);
  const binaryB = recipes.barotrauma.resolveBinary(recipes.barotrauma.binaries, b);
  assert.notEqual(binaryA, binaryB);
  const xmlA = fs.readFileSync(path.join(path.dirname(binaryA), "serversettings.xml"), "utf8");
  const xmlB = fs.readFileSync(path.join(path.dirname(binaryB), "serversettings.xml"), "utf8");
  assert.match(xmlA, /MaxPlayers="6"/);
  assert.match(xmlB, /MaxPlayers="9"/);
  assert.match(xmlA, /ServerName="A &amp; B"/);
  assert.match(xmlB, /queryport="27223"/);
  assert.equal(fs.readFileSync(path.join(source, "asset.txt"), "utf8"), "shared asset");
  const audit = { ...context("baro-audit"), customerOwned: false };
  await recipes.barotrauma.prepareSpawn(27224, audit);
  assert.equal(recipes.barotrauma.resolveBinary(recipes.barotrauma.binaries, audit),
    path.join(home, "barotrauma-servers-rooms", "pb-baro-audit", "runtime", "DedicatedServer"));
});

test("Trackmania keeps each account private and changes only the intended XML tags", async () => {
  assert.equal(recipes.trackmania.resolveBinary(recipes.trackmania.binaries), null);
  const source = path.join(games, "trackmania", "UserData", "Config");
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(games, "trackmania", "TrackmaniaServer"), "executable");
  fs.writeFileSync(path.join(source, "dedicated_cfg.default.txt"),
    "<dedicated><authorization_levels><level><name>SuperAdmin</name><password>SuperAdmin</password></level></authorization_levels>" +
    "<masterserver_account><login></login><password></password></masterserver_account>" +
    "<server_options><name></name><max_players>32</max_players><hide_server>0</hide_server></server_options>" +
    "<system_config><server_port>2350</server_port><xmlrpc_port>5000</xmlrpc_port></system_config></dedicated>");
  const ctx = context("five", 7);
  const homeDir = path.join(home, "trackmania-servers", "pb-five");
  fs.mkdirSync(homeDir, { recursive: true });
  fs.writeFileSync(path.join(homeDir, "dedicated-account.json"), JSON.stringify({ login: "user", password: "secret" }));
  await recipes.trackmania.prepareSpawn(23520, ctx);
  const binary = recipes.trackmania.resolveBinary(recipes.trackmania.binaries, ctx);
  const xml = fs.readFileSync(path.join(path.dirname(binary), "UserData", "Config", "dedicated_cfg.txt"), "utf8");
  assert.match(xml, /<name>SuperAdmin<\/name>/);
  assert.doesNotMatch(xml, /<password>SuperAdmin<\/password>/);
  assert.match(xml, /<password>[0-9a-f]{48}<\/password>/);
  assert.match(xml, /<name>A &amp; B<\/name>/);
  assert.match(xml, /<max_players>7<\/max_players>/);
  assert.match(xml, /<server_port>23520<\/server_port>/);
  assert.match(xml, /<xmlrpc_port>23521<\/xmlrpc_port>/);
  assert.match(xml, /<login>user<\/login><password>secret<\/password>/);
  const audit = { ...context("track-audit"), customerOwned: false };
  const auditHome = path.join(home, "trackmania-servers-rooms", "pb-track-audit");
  fs.mkdirSync(auditHome, { recursive: true });
  fs.writeFileSync(path.join(auditHome, "dedicated-account.json"), JSON.stringify({ login: "audit", password: "private" }));
  await recipes.trackmania.prepareSpawn(23522, audit);
  assert.equal(recipes.trackmania.resolveBinary(recipes.trackmania.binaries, audit),
    path.join(auditHome, "runtime", "TrackmaniaServer"));
});
