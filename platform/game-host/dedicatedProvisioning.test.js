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

test("Barotrauma gets a separate executable and capped XML per customer", async () => {
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
});

test("Trackmania keeps each account private and changes only the intended XML tags", async () => {
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
});
