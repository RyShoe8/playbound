import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// recipes.js reads HOME once at import, so point it at a scratch directory first.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "pb-host-"));
process.env.HOME = HOME;
const { recipes, acceptedSettingsFor } = await import("./recipes.js");
const { createWorldBackup, listWorldBackups, restoreWorldBackup } = await import("./dedicatedDataBackups.js");

const ID = "64b0c0ffee64b0c0ffee1234";
const customer = (slug, limit = 6) => ({
  managed: true, customerOwned: true, partyId: ID, name: "Paid server",
  settings: acceptedSettingsFor(slug, { maxPlayers: limit }),
});

test("Freeciv enforces the slot cap through maxplayers in a startup script", async () => {
  assert.deepEqual(acceptedSettingsFor("freeciv", { maxPlayers: 6, other: 1 }), { maxPlayers: 6 });
  const ctx = customer("freeciv", 6);
  await recipes.freeciv.prepareSpawn(5556, ctx);
  const args = recipes.freeciv.args(5556, ctx);
  const script = args[args.indexOf("--read") + 1];
  assert.match(script, /\.serv$/);
  assert.equal(fs.readFileSync(script, "utf8"), "set maxplayers 6\n");
  assert.ok(script.startsWith(path.join(HOME, "freeciv-servers", `pb-${ID}`)));
  assert.equal(args[args.indexOf("--saves") + 1], path.join(HOME, "freeciv-servers", `pb-${ID}`, "saves"));
  assert.ok(fs.existsSync(path.join(HOME, "freeciv-servers", `pb-${ID}`, "saves")));
});

test("free-rotation and party Freeciv rooms keep their old command lines where no cap applies", () => {
  assert.deepEqual(recipes.freeciv.args(5556, { managed: false }), ["-p", "5556"]);
  const community = recipes.freeciv.args(5556, { managed: true, partyId: "community-1", settings: { maxPlayers: 8 } });
  assert.ok(community.includes("--read"));
  assert.ok(!community.includes("--saves"));
  assert.deepEqual(recipes.freeciv.spawnEnv(5556, { managed: true }), {});
});

test("customer Morrowind servers live in their own home, with the cap applied", () => {
  const ctx = customer("morrowind", 5);
  assert.equal(recipes.morrowind.cwd(25565, ctx), path.join(HOME, "morrowind-servers", `pb-${ID}`));
  assert.equal(recipes.morrowind.spawnEnv(25565, ctx).HOME, path.join(HOME, "morrowind-servers", `pb-${ID}`));
  const shared = recipes.morrowind.cwd(25565, { managed: true, partyId: "community-12345678" });
  assert.ok(shared.startsWith(path.join(HOME, "tes3mp")));
});

test("world backups cover Freeciv saves and Morrowind data, one server at a time", () => {
  const saves = path.join(HOME, "freeciv-servers", `pb-${ID}`, "saves");
  fs.mkdirSync(saves, { recursive: true });
  fs.writeFileSync(path.join(saves, "game.sav.gz"), "turn 42");
  const data = path.join(HOME, "morrowind-servers", `pb-${ID}`, "server", "data", "player");
  fs.mkdirSync(data, { recursive: true });
  fs.writeFileSync(path.join(data, "alice.json"), "{}");

  for (const [slug, file] of [["freeciv", path.join(saves, "game.sav.gz")], ["morrowind", path.join(data, "alice.json")]]) {
    const backup = createWorldBackup(ID, slug, 3, HOME);
    assert.equal(backup.files, 1);
    fs.writeFileSync(file, "changed");
    restoreWorldBackup(ID, slug, backup.id, 3, HOME);
    assert.notEqual(fs.readFileSync(file, "utf8"), "changed", `${slug} restore brings the old data back`);
    assert.ok(listWorldBackups(ID, slug, HOME).length >= 2, `${slug} keeps a before-restore point`);
  }
});

test("backups refuse games without persistent world data and malformed server IDs", () => {
  assert.throws(() => createWorldBackup(ID, "hurry-curry", 3, HOME), /no persistent world-data backup/);
  assert.throws(() => createWorldBackup("../etc", "freeciv", 3, HOME), /Invalid customer server ID/);
  assert.throws(() => createWorldBackup(ID, "constructor", 3, HOME), /no persistent world-data backup/);
});

test("the worker-thread runner does the same work off the event loop and hides host paths", async () => {
  const { runWorldBackup } = await import("./worldBackupRunner.js");
  const id = "0123456789abcdef01234567";
  const saves = path.join(HOME, "freeciv-servers", `pb-${id}`, "saves");
  fs.mkdirSync(saves, { recursive: true });
  fs.writeFileSync(path.join(saves, "a.sav"), "x");
  const made = await runWorldBackup("createWorldBackup", [id, "freeciv", 3]);
  assert.equal(made.files, 1);
  assert.equal((await runWorldBackup("listWorldBackups", [id, "freeciv"])).length, 1);
  await assert.rejects(runWorldBackup("createWorldBackup", [id, "hurry-curry", 3]), /no persistent world-data backup/);
  await assert.rejects(runWorldBackup("createWorldBackup", ["ffffffffffffffffffffffff", "freeciv", 3]), /No saved world data exists/);
  await assert.rejects(runWorldBackup("rmSync", [id]), /Unknown world-backup operation/);
});

test("the agent route only accepts games the backup module supports", async () => {
  const { WORLD_BACKUP_GAMES, isWorldBackupGame } = await import("./dedicatedDataBackups.js");
  assert.deepEqual([...WORLD_BACKUP_GAMES].sort(), ["freeciv", "luanti", "mindustry", "morrowind", "openttd"]);
  assert.equal(isWorldBackupGame("constructor"), false);
  const source = fs.readFileSync(new URL("./index.js", import.meta.url), "utf8");
  assert.match(source, /world-backups/);
  assert.match(source, /Stop the server before restoring/);
});
