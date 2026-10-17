import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "pb-dedicated-"));
process.env.HOME = HOME;
const { recipes, acceptedSettingsFor } = await import("./recipes.js");
const { createWorldBackup, restoreWorldBackup, WORLD_BACKUP_GAMES } = await import("./dedicatedDataBackups.js");

const NEW = ["battlefield-1942-anthology", "counter-strike-source", "goldeneye-source", "terraria", "unturned", "rimworld-together", "core-keeper", "vintage-story", "factorio", "necesse", "dont-starve-together", "barotrauma", "trackmania"];
const ID_A = "64b0c0ffee64b0c0ffee1234";
const ID_B = "64b0c0ffee64b0c0ffee9999";
const ctxFor = (slug, id = ID_A, limit = 6, name = "Paid server") => ({
  managed: true, customerOwned: true, partyId: id, name,
  settings: acceptedSettingsFor(slug, { maxPlayers: limit }),
});
const read = (...p) => JSON.parse(fs.readFileSync(path.join(HOME, ...p), "utf8"));

test("every paid-plan recipe accepts the slot cap the platform sends", () => {
  for (const slug of NEW) {
    assert.ok(recipes[slug], `${slug} has a recipe`);
    assert.deepEqual(acceptedSettingsFor(slug, { maxPlayers: 6, other: 1 }), { maxPlayers: 6 }, slug);
  }
});

test("Quake II Enhanced does not advertise the incompatible Original server", () => {
  assert.equal(recipes["quake-ii"], undefined);
  assert.equal(recipes["quake-ii-enhanced"], undefined);
});

test("command-line games pass the cap to the server", () => {
  const css = recipes["counter-strike-source"].args(27060, ctxFor("counter-strike-source"));
  assert.equal(css[css.indexOf("-maxplayers") + 1], "6");
  assert.equal(css[css.indexOf("+map") + 1], "de_dust2");
  assert.equal(css[css.indexOf("+clientport") + 1], "28060");
  assert.ok(css.includes("-nohltv"));
  const ges = recipes["goldeneye-source"].args(27120, ctxFor("goldeneye-source"));
  assert.equal(ges[ges.indexOf("-maxplayers") + 1], "6");
  assert.equal(ges[ges.indexOf("+map") + 1], "ge_archives");
  const terraria = recipes.terraria.args(7777, ctxFor("terraria", ID_A, 9));
  assert.equal(terraria[terraria.indexOf("-maxplayers") + 1], "9");
  const unturned = recipes.unturned.args(27075, ctxFor("unturned", ID_A, 12));
  assert.deepEqual(unturned, [`+InternetServer/pb-${ID_A}`]);
});

test("GoldenEye: Source uses a chosen installed map on restart", () => {
  const settings = acceptedSettingsFor("goldeneye-source", { map: "ge_facility", mp_timelimit: 20 });
  const args = recipes["goldeneye-source"].args(27120, { ...ctxFor("goldeneye-source"), settings });
  assert.equal(args[args.indexOf("+map") + 1], "ge_facility");
  assert.equal(args[args.indexOf("+mp_timelimit") + 1], "20");
});

test("Counter-Strike: Source uses an accepted starting map and time limit", () => {
  const settings = acceptedSettingsFor("counter-strike-source", { map: "cs_office", mp_timelimit: 25, unwanted: "quit" });
  assert.deepEqual(settings, { map: "cs_office", mp_timelimit: 25 });
  const args = recipes["counter-strike-source"].args(27060, { ...ctxFor("counter-strike-source"), settings });
  assert.equal(args[args.indexOf("+map") + 1], "cs_office");
  assert.equal(args[args.indexOf("+mp_timelimit") + 1], "25");
  const unsafe = recipes["counter-strike-source"].args(27060, { ...ctxFor("counter-strike-source"), settings: { map: "cs_office;quit" } });
  assert.equal(unsafe[unsafe.indexOf("+map") + 1], "de_dust2");
});

test("party-hosted recipes honor the admin slot cap without a customer subscription", () => {
  const party = { partyId: ID_A, managed: false, customerOwned: false, settings: { maxPlayers: 5 } };
  const css = recipes["counter-strike-source"].args(27060, party);
  assert.equal(css[css.indexOf("-maxplayers") + 1], "5");
  const terraria = recipes.terraria.args(7870, party);
  assert.equal(terraria[terraria.indexOf("-maxplayers") + 1], "5");
});

test("config-file games write the cap into the server's own config", async () => {
  await recipes["rimworld-together"].prepareSpawn(25590, ctxFor("rimworld-together"));
  const rwt = read("rimworld-together-servers", `pb-${ID_A}`, "Configs", "ServerConfig.json");
  assert.equal(rwt.MaxPlayers, 6);
  assert.equal(rwt.Port, 25590);
  assert.equal(rwt.EnableServerBrowser, false);
  const rwtCtx = ctxFor("rimworld-together");
  rwtCtx.settings = acceptedSettingsFor("rimworld-together", { maxPlayers: 4, description: "Our colony", storyteller: "Randy", messageOfTheDay: "Welcome", "difficulty.IsDifficultyEnforced": true, "difficulty.ThreatScale": 1.5 });
  await recipes["rimworld-together"].prepareSpawn(25590, rwtCtx);
  assert.equal(read("rimworld-together-servers", `pb-${ID_A}`, "Configs", "ServerConfig.json").Description, "Our colony");
  assert.equal(read("rimworld-together-servers", `pb-${ID_A}`, "Configs", "StorytellerConfig.json").DefName, "Randy");
  assert.equal(read("rimworld-together-servers", `pb-${ID_A}`, "Configs", "ChatConfig.json").MessageOfTheDay, "Welcome");
  assert.equal(read("rimworld-together-servers", `pb-${ID_A}`, "Configs", "DifficultyConfig.json").ThreatScale, 1.5);

  await recipes["core-keeper"].prepareSpawn(1300, ctxFor("core-keeper", ID_A, 8));
  assert.equal(read("core-keeper-servers", `pb-${ID_A}`, "data", "ServerConfig.json").maxNumberPlayers, 8);

  await recipes["vintage-story"].prepareSpawn(42420, ctxFor("vintage-story", ID_A, 10));
  const vs = read("vintage-story-servers", `pb-${ID_A}`, "data", "serverconfig.json");
  assert.equal(vs.MaxClients, 10);
  assert.equal(vs.Port, 42420);
});

test("Factorio gets a config, a save path and its cap, without running the game", async () => {
  const dir = path.join(HOME, "factorio-servers", `pb-${ID_A}`);
  fs.mkdirSync(path.join(dir, "saves"), { recursive: true });
  fs.writeFileSync(path.join(dir, "saves", "save.zip"), "existing save");
  await recipes.factorio.prepareSpawn(34197, ctxFor("factorio", ID_A, 5));
  const settings = read("factorio-servers", `pb-${ID_A}`, "server-settings.json");
  assert.equal(settings.max_players, 5);
  assert.deepEqual(settings.visibility, { public: false, lan: false });
  assert.match(fs.readFileSync(path.join(dir, "config.ini"), "utf8"), new RegExp(`write-data=${dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.equal(fs.readFileSync(path.join(dir, "saves", "save.zip"), "utf8"), "existing save");
  const args = recipes.factorio.args(34197, ctxFor("factorio", ID_A, 5));
  assert.equal(args[args.indexOf("--port") + 1], "34197");
});

test("each customer's files stay in their own folder", async () => {
  await recipes["core-keeper"].prepareSpawn(1300, ctxFor("core-keeper", ID_B, 4));
  assert.equal(read("core-keeper-servers", `pb-${ID_B}`, "data", "ServerConfig.json").maxNumberPlayers, 4);
  assert.equal(read("core-keeper-servers", `pb-${ID_A}`, "data", "ServerConfig.json").maxNumberPlayers, 8);
  for (const slug of NEW) {
    const env = recipes[slug].spawnEnv(1, ctxFor(slug));
    assert.equal(env.HOME, path.join(HOME, `${slug}-servers`, `pb-${ID_A}`), slug);
  }
});

test("a world the game already chose is not overwritten, but the cap is always re-applied", async () => {
  const file = path.join(HOME, "core-keeper-servers", `pb-${ID_A}`, "data", "ServerConfig.json");
  fs.writeFileSync(file, JSON.stringify({ gameId: "abc", world: 3, worldName: "Kept", maxNumberPlayers: 99 }));
  await recipes["core-keeper"].prepareSpawn(1300, ctxFor("core-keeper", ID_A, 7));
  const config = read("core-keeper-servers", `pb-${ID_A}`, "data", "ServerConfig.json");
  assert.equal(config.world, 3);
  assert.equal(config.worldName, "Kept");
  assert.equal(config.gameId, "abc");
  assert.equal(config.maxNumberPlayers, 7);
});

test("names cannot break out of a command line or config value", () => {
  const args = recipes.unturned.args(27075, ctxFor("unturned", ID_A, 6, 'Bad "name"\nwith\\stuff'));
  const name = args[args.indexOf("-name") + 1];
  assert.doesNotMatch(name, /["\n\\]/);
  const css = recipes["counter-strike-source"].args(27060, ctxFor("counter-strike-source", ID_A, 6, 'x"; quit; "'));
  const host = css[css.indexOf("+hostname") + 1];
  assert.equal(host.startsWith('"') && host.endsWith('"') && !host.slice(1, -1).includes('"'), true);
});

test("config files are private to the agent", { skip: process.platform === "win32" }, async () => {
  const file = path.join(HOME, "rimworld-together-servers", `pb-${ID_A}`, "Configs", "ServerConfig.json");
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test("new port ranges do not overlap any other recipe", () => {
  const span = (r) => [r.portStart, r.portEnd + (r.portStride || 1) - 1];
  const others = Object.entries(recipes).filter(([slug, r]) => !NEW.includes(slug) && r.portStart);
  for (const slug of NEW) {
    const [a, b] = span(recipes[slug]);
    for (const [otherSlug, other] of others) {
      const [c, d] = span(other);
      assert.ok(b < c || a > d, `${slug} ${a}-${b} overlaps ${otherSlug} ${c}-${d}`);
    }
  }
  for (const [i, x] of NEW.entries()) {
    for (const y of NEW.slice(i + 1)) {
      const [a, b] = span(recipes[x]); const [c, d] = span(recipes[y]);
      assert.ok(b < c || a > d, `${x} overlaps ${y}`);
    }
  }
});

test("world backups cover the folder each paid-plan recipe writes its world to", () => {
  // The game creates these on first run; here a world file is put where each game keeps it.
  const worldFile = {
    terraria: ["Worlds", "world.wld"],
    factorio: ["saves", "save.zip"],
    "core-keeper": ["data", "world.dat"],
    "vintage-story": ["data", "Saves", "default.vcdbs"],
    "rimworld-together": ["Assets", "Saves", "colony.json"],
  };
  for (const [slug, parts] of Object.entries(worldFile)) {
    assert.ok(WORLD_BACKUP_GAMES.includes(slug), `${slug} is backed up`);
    const file = path.join(HOME, `${slug}-servers`, `pb-${ID_B}`, ...parts);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "world v1");
    const backup = createWorldBackup(ID_B, slug, 3, HOME);
    assert.ok(backup.files >= 1, `${slug} backed up its world`);
    fs.writeFileSync(file, "world v2");
    restoreWorldBackup(ID_B, slug, backup.id, 3, HOME);
    assert.equal(fs.readFileSync(file, "utf8"), "world v1", `${slug} restores its world`);
  }
});

test("installed status follows whether each server binary is present", async () => {
  const { listInstalled, resolveRecipe } = await import("./recipes.js");
  const installed = listInstalled();
  for (const slug of NEW) assert.equal(installed[slug], Boolean(resolveRecipe(slug)?.binary), `${slug} installed status matches its binary`);
});


test("OpenRA-family customer homes never share another server's writable cache", () => {
  for (const [slug, directory] of [["openra","openra-servers"],["openhv","openhv-servers"],["earth-2140-trilogy","earth-2140-servers"]]) {
    const first=recipes[slug].spawnEnv(1234,ctxFor(slug,ID_A));
    const second=recipes[slug].spawnEnv(1234,ctxFor(slug,ID_B));
    assert.equal(first.HOME,path.join(HOME,directory,`pb-${ID_A}`));
    assert.notEqual(first.HOME,second.HOME);
    for (const key of ["XDG_DATA_HOME","XDG_CONFIG_HOME","XDG_CACHE_HOME","XDG_STATE_HOME"]) assert.equal(first[key],first.HOME);
    assert.equal(recipes[slug].spawnEnv(1234,{managed:true,customerOwned:false}).HOME,HOME);
  }
});


test("OpenHV applies its declared single-player and bot-lock settings", () => {
  const args=recipes.openhv.args(1255,{name:"Fixture",settings:{"Server.EnableSingleplayer":true,"Server.LockBots":true}});
  assert.ok(args.includes("Server.EnableSingleplayer=True"));
  assert.ok(args.includes("Server.LockBots=True"));
  const defaults=recipes.openhv.args(1255,{settings:{"Server.LockBots":"True"}});
  assert.ok(defaults.includes("Server.LockBots=False"));
});


test("TripleA customer maps and Java user home are private per server", async () => {
  for (const id of [ID_A,ID_B]) {
    const ctx=ctxFor("triplea",id),home=path.join(HOME,"triplea-servers",`pb-${id}`);
    await recipes.triplea.prepareSpawn(3303,ctx);
    assert.equal(recipes.triplea.spawnEnv(3303,ctx).MAPS_FOLDER,path.join(home,"downloadedMaps"));
    assert.equal(recipes.triplea.spawnEnv(3303,ctx).HOME,home);
    assert.equal(recipes.triplea.cwd(3303,ctx),home);
    assert.ok(recipes.triplea.args(3303,ctx).includes(`-Duser.home=${home}`));
    assert.ok(fs.statSync(path.join(home,"downloadedMaps")).isDirectory());
  }
  assert.ok(!recipes.triplea.args(3303,{customerOwned:false}).some(arg=>arg.startsWith("-Duser.home=")));
});

test("Veloren customer configuration and world roots are private while community data stays put", async () => {
  for (const id of [ID_A,ID_B]) {
    const ctx=ctxFor("veloren",id),home=path.join(HOME,"veloren-servers",`pb-${id}`);
    const environment=recipes.veloren.spawnEnv(14004,ctx);
    assert.equal(environment.HOME,home);
    assert.equal(recipes.veloren.cwd(14004,ctx),home);
    assert.equal(environment.VELOREN_USERDATA,path.join(home,"userdata"));
    const settings=path.join(environment.VELOREN_USERDATA,"server","server_config","settings.ron");
    fs.mkdirSync(path.dirname(settings),{recursive:true});fs.writeFileSync(settings,"(max_players: 24,)");
    await recipes.veloren.prepareSpawn(14004,ctx);
    assert.match(fs.readFileSync(settings,"utf8"),/max_players: 6/);
    assert.ok(fs.existsSync(path.join(environment.VELOREN_USERDATA,"server-cli","settings.ron")));
  }
  assert.ok(recipes.veloren.spawnEnv(14004,{customerOwned:false}).VELOREN_USERDATA.endsWith(path.join("veloren","userdata")));
});


test("OpenRA identity preparation never creates service-owned customer homes",()=>{
  const ctx={...ctxFor("openra"),identityProfile:"openra-unix-v1"};
  assert.deepEqual(recipes.openra.spawnEnv(1234,ctx),{});
  assert.deepEqual(recipes.openhv.spawnEnv(1255,{...ctx,identityProfile:"openhv-unix-v1"}),{});
  assert.deepEqual(recipes["earth-2140-trilogy"].spawnEnv(1275,{...ctx,identityProfile:"earth-2140-trilogy-unix-v1"}),{});
});
