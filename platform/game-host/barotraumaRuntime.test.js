import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { baselineBarotraumaHomes, prepareBarotraumaRuntime, recoverBarotraumaRuntime } from "./barotraumaRuntime.js";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-baro-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "games", "barotrauma");
  const home = path.join(root, "home", "barotrauma-servers", "pb-fixture");
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  function write(base, name, contents) {
    const file = path.join(base, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
  function depot(build) {
    write(source, "steamapps/appmanifest_1026340.acf", `"appid" "1026340" "StateFlags" "4" "buildid" "${build}"`);
    write(source, "DedicatedServer", "binary-" + build);
    fs.chmodSync(path.join(source, "DedicatedServer"), 0o755);
    write(source, "DedicatedServer.dll", "dll-" + build);
    write(source, "Content/vanilla.xml", "content-" + build);
    write(source, "serversettings.xml", "shared settings must never leak");
    write(source, "Data/Multiplayer/other.save", "shared save must never leak");
    write(source, "Data/karmasettings.xml", "default engine tuning");
  }
  depot("100");
  const runtime = path.join(home, "runtime");
  const disk = () => ({ bavail: 100 * 1024 ** 3, bsize: 1, blocks: 200 * 1024 ** 3 });
  const prepare = () => prepareBarotraumaRuntime(source, home, { disk });
  return { root, source, home, runtime, depot, write, prepare, disk };
}

test("fresh copies exclude shared settings and saves and repeated starts are stable", (t) => {
  const f = fixture(t);
  f.prepare();
  assert.equal(fs.readFileSync(path.join(f.runtime, "DedicatedServer"), "utf8"), "binary-100");
  assert.equal(fs.existsSync(path.join(f.runtime, "serversettings.xml")), false);
  assert.equal(fs.existsSync(path.join(f.runtime, "Data/Multiplayer/other.save")), false);
  assert.equal(fs.readFileSync(path.join(f.runtime, "Data/karmasettings.xml"), "utf8"), "default engine tuning");
  f.write(f.runtime, "serversettings.xml", "private password/settings");
  f.prepare();
  assert.equal(fs.readFileSync(path.join(f.runtime, "serversettings.xml"), "utf8"), "private password/settings");
  assert.equal(fs.readdirSync(f.home).filter((n) => n.startsWith(".runtime-backup-")).length, 0);
});

test("update and depot rollback replace code but preserve current world, bans and permissions", (t) => {
  const f = fixture(t);
  f.prepare();
  const saved = ["serversettings.xml", "Data/Multiplayer/campaign.save", "Data/Saves/Multiplayer/campaign.save", "Data/clientpermissions.xml", "Data/bannedplayers.xml", "Data/permissionpresets_player.xml"];
  for (const name of saved) f.write(f.runtime, name, "private-" + name);
  f.depot("200");
  f.prepare();
  assert.equal(fs.readFileSync(path.join(f.runtime, "DedicatedServer.dll"), "utf8"), "dll-200");
  for (const name of saved) assert.equal(fs.readFileSync(path.join(f.runtime, name), "utf8"), "private-" + name);
  f.write(f.runtime, "Data/Multiplayer/campaign.save", "progress made on newer engine");
  f.depot("100");
  f.prepare();
  assert.equal(fs.readFileSync(path.join(f.runtime, "DedicatedServer"), "utf8"), "binary-100");
  assert.equal(fs.readFileSync(path.join(f.runtime, "Data/Multiplayer/campaign.save"), "utf8"), "progress made on newer engine");
  const backups = fs.readdirSync(f.home).filter((n) => n.startsWith(".runtime-backup-"));
  assert.equal(backups.length, 2);
  assert.ok(backups.some((name) => fs.readFileSync(path.join(f.home, name, "DedicatedServer"), "utf8") === "binary-200"));
});

test("legacy copies are baselined before depot changes without replacing private settings", (t) => {
  const f = fixture(t);
  fs.cpSync(f.source, f.runtime, { recursive: true });
  f.write(f.runtime, "serversettings.xml", "legacy settings");
  baselineBarotraumaHomes(f.source, path.join(f.root, "home"));
  f.depot("200");
  f.prepare();
  assert.equal(fs.readFileSync(path.join(f.runtime, "DedicatedServer"), "utf8"), "binary-200");
  assert.equal(fs.readFileSync(path.join(f.runtime, "serversettings.xml"), "utf8"), "legacy settings");
});

test("unclassified legacy modifications stop updates without overwriting any files", (t) => {
  const f = fixture(t);
  fs.cpSync(f.source, f.runtime, { recursive: true });
  f.write(f.runtime, "DedicatedServer.dll", "custom patched DLL");
  assert.throws(() => baselineBarotraumaHomes(f.source, path.join(f.root, "home")), /unclassified changes/);
  assert.equal(fs.existsSync(path.join(f.runtime, ".pb-runtime.json")), false);
  assert.equal(fs.readFileSync(path.join(f.runtime, "DedicatedServer.dll"), "utf8"), "custom patched DLL");
});

test("unknown files and engine changes cannot be mistaken for save data", (t) => {
  const f = fixture(t);
  f.prepare();
  f.write(f.runtime, "LocalMods/custom/plugin.dll", "code");
  assert.doesNotThrow(f.prepare); // Routine restarts don't initiate a migration.
  f.depot("200");
  assert.throws(f.prepare, /unclassified changes/);
  assert.equal(fs.readFileSync(path.join(f.runtime, "DedicatedServer"), "utf8"), "binary-100");
});

test("legacy custom copies remain startable but cannot pass update preflight", (t) => {
  const f = fixture(t);
  fs.cpSync(f.source, f.runtime, { recursive: true });
  f.write(f.runtime, "LocalMods/custom/content.xml", "custom content");
  assert.doesNotThrow(f.prepare);
  assert.equal(fs.existsSync(path.join(f.runtime, ".pb-runtime.json")), false);
  assert.throws(() => baselineBarotraumaHomes(f.source, path.join(f.root, "home")), /unclassified/);
});

test("a repaired depot with the same build ID still refreshes changed binaries", (t) => {
  const f = fixture(t);
  f.prepare();
  f.write(f.source, "DedicatedServer.dll", "repaired binary");
  f.prepare();
  assert.equal(fs.readFileSync(path.join(f.runtime, "DedicatedServer.dll"), "utf8"), "repaired binary");
});

test("low disk or retained-copy limits fail before replacing the current runtime", (t) => {
  const f = fixture(t);
  f.prepare();
  f.depot("200");
  assert.throws(() => prepareBarotraumaRuntime(f.source, f.home, { disk: () => ({ bavail: 0, bsize: 1, blocks: 1 }) }), /free disk/);
  for (let i = 0; i < 3; i++) fs.mkdirSync(path.join(f.home, `.runtime-backup-fixture${i}`));
  assert.throws(f.prepare, /archival/);
  assert.equal(fs.readFileSync(path.join(f.runtime, "DedicatedServer"), "utf8"), "binary-100");
});

test("crash between renames restores the old runtime and retains staging for inspection", (t) => {
  const f = fixture(t);
  f.prepare();
  const id = "d573b6b1-3c7a-4adc-a907-3cfd0e81e831";
  fs.renameSync(f.runtime, path.join(f.home, `.runtime-backup-${id}`));
  fs.mkdirSync(path.join(f.home, `.runtime-stage-${id}`));
  f.write(f.home, ".runtime-migration.json", JSON.stringify({ id }));
  assert.throws(() => recoverBarotraumaRuntime(f.home), /retained staging/);
  assert.equal(fs.readFileSync(path.join(f.runtime, "DedicatedServer"), "utf8"), "binary-100");
});

test("crash after activation completes recovery without restoring an older world", (t) => {
  const f = fixture(t);
  f.prepare();
  const id = "d573b6b1-3c7a-4adc-a907-3cfd0e81e831";
  f.write(f.home, ".runtime-migration.json", JSON.stringify({ id }));
  recoverBarotraumaRuntime(f.home);
  assert.equal(fs.existsSync(path.join(f.home, ".runtime-migration.json")), false);
  assert.ok(fs.existsSync(f.runtime));
});

test("links and hardlinks in mutable saves fail closed", { skip: process.platform === "win32" }, (t) => {
  const f = fixture(t);
  f.prepare();
  fs.mkdirSync(path.join(f.runtime, "Data/Multiplayer"), { recursive: true });
  fs.symlinkSync(f.source, path.join(f.runtime, "Data/Multiplayer/escape"));
  f.depot("200");
  assert.throws(f.prepare, /links or special files/);
  fs.unlinkSync(path.join(f.runtime, "Data/Multiplayer/escape"));
  fs.linkSync(path.join(f.source, "DedicatedServer"), path.join(f.runtime, "Data/Multiplayer/hardlink.save"));
  assert.throws(f.prepare, /links or special files/);
});

test("a journal cannot select a path outside its server home", (t) => {
  const f = fixture(t);
  f.write(f.home, ".runtime-migration.json", '{"id":"../../other-server"}');
  assert.throws(() => recoverBarotraumaRuntime(f.home), /migration identity/);
});
