import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInstallationCoordinator, createInstallationStore } from "./installationJobs.js";
import { INSTALLATION_TARGETS, verifyInstallation, prepareInstallationLinks, restoreInstallationLinks, installationKey, installationDependencies } from "./installationTargets.js";
import { runInstallationUpdate, runCommand, steamCommandFailure } from "./installationUpdateWorker.js";
import { isAgentGetPath } from "./agentRoutes.js";
import { prepareBarotraumaRuntime } from "./barotraumaRuntime.js";

const key = "team-fortress-2";
test("Steam update errors retain actionable categories without exposing raw command output", () => {
  assert.match(steamCommandFailure("secret=hidden Access Denied"), /authorization was denied/);
  assert.match(steamCommandFailure("No connection https://private.example"), /could not connect/);
  assert.doesNotMatch(steamCommandFailure("secret=hidden unknown failure"), /hidden|secret/);
});
function installation(directory, build = "100") {
  fs.mkdirSync(path.join(directory, "steamapps"), { recursive: true });
  fs.writeFileSync(path.join(directory, "steamapps/appmanifest_232250.acf"), `"appid" "232250"\n"StateFlags" "4"\n"buildid" "${build}"`);
  fs.writeFileSync(path.join(directory, "srcds_linux64"), "fixture executable");
  fs.chmodSync(path.join(directory, "srcds_linux64"), 0o755);
}
function fixture(t, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-updates-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const gamesRoot = path.join(root, "games");
  const stateDir = path.join(root, "state");
  const current = path.join(gamesRoot, key);
  installation(current);
  const running = [];
  const launches = [];
  const coordinator = createInstallationCoordinator({ gamesRoot, stateDir, rooms: () => running, scan: async () => 0,
    launch: async (job, store) => { launches.push(job); store.write({ ...job, status: "downloading", pid: 123, identity: "fixture" }); },
    sameProcess: () => true, ...overrides,
  });
  return { gamesRoot, stateDir, current, running, launches, coordinator, store: createInstallationStore(stateDir) };
}
function fakeCommands({ failDownload = false } = {}) {
  return async (command, args) => {
    if (command.endsWith("du")) return "1024\tfixture";
    if (command.endsWith("cp")) {
      fs.cpSync(args.at(-2), args.at(-1), { recursive: true, dereference: false, verbatimSymlinks: true });
      return "";
    }
    if (failDownload) throw new Error("Update command failed");
    installation(args[1], "200");
    return "Success! App '232250' fully installed.";
  };
}
const disk = () => ({ free: 100 * 1024 ** 3, reserve: 8 * 1024 ** 3 });

test("Steam updates preserve the installed beta channel and reject a branch switch", async (t) => {
  for (const preserve of [true, false]) {
    const f = fixture(t);
    fs.appendFileSync(path.join(f.current, "steamapps/appmanifest_232250.acf"), '\n"BetaKey" "preview"');
    const job = f.coordinator.queue(key, "update", "fixture-admin"); f.store.write({ ...job, status: "launching" });
    const commands = fakeCommands();
    await runInstallationUpdate({ ...f, id: job.id }, { scan: async () => 0, disk, run: async (command, args, options) => {
      if (command === "/usr/games/steamcmd") {
        assert.deepEqual(args.slice(-3), ["-beta", "preview", "+quit"]);
        installation(args[1], "200");
        if (preserve) fs.appendFileSync(path.join(args[1], "steamapps/appmanifest_232250.acf"), '\n"BetaKey" "preview"');
        return "Success! App '232250' fully installed.";
      }
      return commands(command, args, options);
    } });
    assert.equal(f.store.read(job.id).status, preserve ? "completed" : "failed");
    assert.equal(verifyInstallation(f.current, key).buildId, preserve ? "200" : "100");
  }
});

test("both 0 A.D. recipe aliases hold the same managed installation", () => {
  for (const slug of ["0ad", "0-ad"]) {
    assert.equal(installationKey(slug), "0ad");
    assert.deepEqual(installationDependencies(slug), ["0ad"]);
  }
});

test("update inventory contains recipe slugs only, not runtime data or duplicate aliases", (t) => {
  const f = fixture(t, { gameSlugs: () => ["unturned", "aneurism-iv", "unturned", "../private", { secret: "never returned" }] });
  assert.deepEqual(f.coordinator.snapshot().gameSlugs, ["aneurism-iv", "unturned"]);
  assert.equal(f.coordinator.blockedReason("future-game"), null);
  assert.throws(() => f.coordinator.queue("future-game", "update", "admin"), /Unsupported/);
});

test("Barotrauma worker inventories legacy copies before any depot mutation", async (t) => {
  const f = fixture(t);
  const current = path.join(f.gamesRoot, "barotrauma");
  fs.mkdirSync(path.join(current, "steamapps"), { recursive: true });
  fs.writeFileSync(path.join(current, "steamapps/appmanifest_1026340.acf"), '"appid" "1026340" "StateFlags" "4" "buildid" "100"');
  fs.writeFileSync(path.join(current, "DedicatedServer"), "old binary", { mode: 0o755 });
  const hostHome = path.join(path.dirname(f.gamesRoot), "home");
  const home = path.join(hostHome, "barotrauma-servers/pb-legacy");
  fs.mkdirSync(home, { recursive: true });
  fs.cpSync(current, path.join(home, "runtime"), { recursive: true });
  fs.writeFileSync(path.join(home, "runtime/serversettings.xml"), "private settings");
  const job = f.coordinator.queue("barotrauma", "update", "admin");
  f.store.write({ ...job, status: "launching" });
  await runInstallationUpdate({ ...f, id: job.id }, { hostHome, scan: async () => 0, disk, run: async (command, args) => {
    assert.ok(fs.existsSync(path.join(home, "runtime/.pb-runtime.json")));
    if (command.endsWith("du")) return "1024 fixture";
    if (command.endsWith("cp")) { fs.cpSync(args.at(-2), args.at(-1), { recursive: true }); return ""; }
    fs.writeFileSync(path.join(args[1], "steamapps/appmanifest_1026340.acf"), '"appid" "1026340" "StateFlags" "4" "buildid" "200"');
    fs.writeFileSync(path.join(args[1], "DedicatedServer"), "new binary", { mode: 0o755 });
    return "Success! App '1026340' fully installed.";
  } });
  assert.equal(f.store.read(job.id).status, "completed");
  assert.equal(fs.readFileSync(path.join(home, "runtime/DedicatedServer"), "utf8"), "old binary");
  prepareBarotraumaRuntime(current, home, { disk: () => ({ bavail: 100 * 1024 ** 3, bsize: 1, blocks: 200 * 1024 ** 3 }) });
  assert.equal(fs.readFileSync(path.join(home, "runtime/DedicatedServer"), "utf8"), "new binary");
  assert.equal(fs.readFileSync(path.join(home, "runtime/serversettings.xml"), "utf8"), "private settings");
});

test("queued update gates new starts, preserves occupied rooms and is idempotent", async (t) => {
  const f = fixture(t);
  f.running.push({ gameSlug: key });
  const first = f.coordinator.queue(key, "update", "admin-1");
  assert.equal(f.coordinator.queue(key, "update", "admin-1").id, first.id);
  assert.throws(() => f.coordinator.beginStart("open-fortress"), /paused/);
  assert.equal(f.coordinator.blockedReason("luanti"), null);
  await f.coordinator.tick();
  assert.equal(f.launches.length, 0);
  assert.match(f.store.read(first.id).message, /Waiting for 1/);
  assert.equal(f.running.length, 1);
  f.running.length = 0;
  await Promise.all([f.coordinator.tick(), f.coordinator.tick()]);
  assert.equal(f.launches.length, 1);
});

test("pending starts and unmanaged processes prevent worker dispatch", async (t) => {
  let unmanaged = 1;
  const f = fixture(t, { scan: async () => unmanaged });
  const release = f.coordinator.beginStart(key);
  f.coordinator.queue(key, "update", "admin");
  await f.coordinator.tick();
  assert.equal(f.launches.length, 0);
  release();
  await f.coordinator.tick();
  assert.equal(f.launches.length, 0);
  unmanaged = 0;
  await f.coordinator.tick();
  assert.equal(f.launches.length, 1);
});

test("unknown process state fails closed and waiting cancellation releases gate", async (t) => {
  const f = fixture(t, { scan: async () => { throw new Error("Cannot verify processes"); } });
  const job = f.coordinator.queue(key, "update", "admin");
  await f.coordinator.tick();
  assert.equal(f.launches.length, 0);
  assert.match(f.store.read(job.id).message, /Cannot verify/);
  f.coordinator.cancel(job.id);
  assert.equal(f.coordinator.blockedReason(key), null);
});

test("cancellation during scan never dispatches a stale queued request", async (t) => {
  let scanComplete;
  const f = fixture(t, { scan: () => new Promise((resolve) => { scanComplete = resolve; }) });
  const job = f.coordinator.queue(key, "update", "admin");
  const tick = f.coordinator.tick();
  f.coordinator.cancel(job.id);
  scanComplete(0);
  await tick;
  assert.equal(f.launches.length, 0);
});

test("lost worker after restart blocks starts for operator inspection", async (t) => {
  const f = fixture(t);
  const job = f.coordinator.queue(key, "update", "admin");
  await f.coordinator.tick();
  const recovered = createInstallationCoordinator({ ...f, rooms: () => [], sameProcess: () => false });
  await recovered.tick();
  assert.equal(f.store.read(job.id).status, "interrupted");
  assert.match(recovered.blockedReason(key), /paused/);
  assert.throws(() => recovered.cancel(job.id), /Only a waiting/);
});

test("staged update and rollback preserve old files and customer save links", async (t) => {
  const f = fixture(t);
  const save = path.join(path.dirname(f.gamesRoot), "customer-save");
  fs.mkdirSync(save);
  fs.writeFileSync(path.join(save, "world.txt"), "original save");
  if (process.platform !== "win32") fs.symlinkSync(save, path.join(f.current, "Servers"));
  const job = f.coordinator.queue(key, "update", "admin");
  f.store.write({ ...job, status: "launching" });
  await runInstallationUpdate({ ...f, id: job.id }, { run: fakeCommands(), disk, scan: async () => 0 });
  assert.equal(f.store.read(job.id).status, "completed");
  assert.equal(verifyInstallation(f.current, key).buildId, "200");
  assert.equal(verifyInstallation(path.join(f.gamesRoot, `.pb-rollback-${key}-${job.id}`), key).buildId, "100");
  assert.equal(fs.readFileSync(path.join(save, "world.txt"), "utf8"), "original save");
  if (process.platform !== "win32") assert.equal(fs.readlinkSync(path.join(f.current, "Servers")), save);
  const rollback = f.coordinator.queue(key, "rollback", "admin");
  f.store.write({ ...rollback, status: "launching" });
  await runInstallationUpdate({ ...f, id: rollback.id }, { disk, scan: async () => 0 });
  assert.equal(f.store.read(rollback.id).status, "completed");
  assert.equal(verifyInstallation(f.current, key).buildId, "100");
  assert.equal(f.store.read(job.id).rollbackConsumed, true);
});

test("failed download leaves running installation untouched", async (t) => {
  const f = fixture(t);
  const job = f.coordinator.queue(key, "update", "admin");
  f.store.write({ ...job, status: "launching" });
  await runInstallationUpdate({ ...f, id: job.id }, { run: fakeCommands({ failDownload: true }), disk, scan: async () => 0 });
  assert.equal(f.store.read(job.id).status, "failed");
  assert.equal(verifyInstallation(f.current, key).buildId, "100");
  assert.equal(f.coordinator.blockedReason(key), null);
});

test("disk headroom is checked before copying and late process arrival prevents activation", async (t) => {
  const f = fixture(t);
  const job = f.coordinator.queue(key, "update", "admin");
  f.store.write({ ...job, status: "launching" });
  await runInstallationUpdate({ ...f, id: job.id }, { run: fakeCommands(), disk: () => ({ free: 0, reserve: 1 }), scan: async () => 0 });
  assert.match(f.store.read(job.id).message, /Not enough free disk/);
  assert.equal(verifyInstallation(f.current, key).buildId, "100");
  const next = f.coordinator.queue(key, "update", "admin");
  f.store.write({ ...next, status: "launching" });
  let scans = 0;
  await runInstallationUpdate({ ...f, id: next.id }, { run: fakeCommands(), disk, scan: async () => ++scans > 1 ? 1 : 0 });
  assert.match(f.store.read(next.id).message, /activation was refused/);
  assert.equal(verifyInstallation(f.current, key).buildId, "100");
});

test("incomplete manifests and unsupported targets cannot be queued; update GET is private", (t) => {
  const f = fixture(t);
  assert.throws(() => f.coordinator.queue("../luanti", "update", "admin"), /Unsupported/);
  fs.writeFileSync(path.join(f.current, "steamapps/appmanifest_232250.acf"), '"appid" "232250" "StateFlags" "6" "buildid" "100"');
  assert.throws(() => f.coordinator.queue(key, "update", "admin"), /incomplete/);
  assert.equal(isAgentGetPath("/updates"), true);
});

test("staging redirects absolute internal links and detaches external links during downloads", { skip: process.platform === "win32" }, (t) => {
  const f = fixture(t);
  const stage = path.join(f.gamesRoot, "stage");
  fs.cpSync(f.current, stage, { recursive: true });
  fs.symlinkSync(path.join(f.current, "srcds_linux64"), path.join(stage, "internal"));
  fs.symlinkSync("/var/lib/playbound-host/customer-data", path.join(stage, "external"));
  const links = prepareInstallationLinks(stage, f.current, true);
  assert.equal(fs.realpathSync(path.join(stage, "internal")), path.join(stage, "srcds_linux64"));
  assert.throws(() => fs.lstatSync(path.join(stage, "external")), { code: "ENOENT" });
  restoreInstallationLinks(links);
  assert.equal(fs.readlinkSync(path.join(stage, "external")), "/var/lib/playbound-host/customer-data");
});

test("Linux staging uses real low-priority copy commands without touching production installations", { skip: process.platform === "win32" }, async (t) => {
  const f = fixture(t);
  const job = f.coordinator.queue(key, "update", "fixture-admin");
  f.store.write({ ...job, status: "launching" });
  await runInstallationUpdate({ ...f, id: job.id }, {
    disk, scan: async () => 0,
    run: async (command, args, options) => command.endsWith("steamcmd")
      ? fakeCommands()(command, args) : runCommand(command, args, options),
  });
  assert.equal(f.store.read(job.id).status, "completed");
  assert.equal(verifyInstallation(f.current, key).buildId, "200");
});

test("real detached worker completes IPC startup on Node 20 and records a fail-closed result", { skip: process.platform === "win32" }, async (t) => {
  const f = fixture(t, { launch: undefined });
  const job = f.coordinator.queue(key, "update", "fixture-admin");
  await f.coordinator.tick();
  // A temporary games root cannot pass the production scanner. No Steam
  // command or real installation is reached, but the real worker must run.
  const deadline = Date.now() + 5000;
  while (f.store.read(job.id).status === "launching" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(f.store.read(job.id).status, "failed");
  assert.equal(verifyInstallation(f.current, key).buildId, "100");
});

for (const [game, target] of Object.entries(INSTALLATION_TARGETS)) {
  if (target.strategy) continue; // Non-Steam fixtures exercise their distinct verification and release paths.
  if (target.blockedReason) {
    test(`${game}: refuses updates when runtime migration is unimplemented`, (t) => {
      const f = fixture(t);
      assert.throws(() => f.coordinator.queue(game, "update", "admin"), /private runtime copies/);
      assert.match(f.coordinator.snapshot().targets.find((row) => row.key === game).blockedReason, /private runtime copies/);
    });
    continue;
  }
  test(`${game}: fixed depot, required files, staged update and rollback`, async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-depot-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const gamesRoot = path.join(root, "games"), stateDir = path.join(root, "state");
    function installed(directory, build) {
      fs.mkdirSync(path.join(directory, "steamapps"), { recursive: true });
      fs.writeFileSync(path.join(directory, "steamapps", `appmanifest_${target.appId}.acf`), `"appid" "${target.appId}" "StateFlags" "4" "buildid" "${build}"`);
      for (const file of [...target.binaries, ...(target.files || [])]) {
        const filename = path.join(directory, file);
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        fs.writeFileSync(filename, "fixture", { mode: target.binaries.includes(file) ? 0o755 : 0o644 });
      }
    }
    const current = path.join(gamesRoot, game);
    installed(current, "100");
    const store = createInstallationStore(stateDir);
    const coordinator = createInstallationCoordinator({ gamesRoot, stateDir, rooms: () => [], scan: async () => 0 });
    const update = coordinator.queue(game, "update", "fixture-admin");
    store.write({ ...update, status: "launching" });
    await runInstallationUpdate({ id: update.id, gamesRoot, stateDir }, { hostHome: root, disk, scan: async () => 0, run: async (command, args) => {
      if (command.endsWith("du")) return "1024 fixture";
      if (command.endsWith("cp")) { fs.cpSync(args.at(-2), args.at(-1), { recursive: true }); return ""; }
      assert.equal(command, "/usr/games/steamcmd");
      assert.deepEqual(args.slice(-3), ["+app_update", String(target.appId), "+quit"]);
      assert.equal(args[3], "anonymous");
      installed(args[1], "200");
      return `Success! App '${target.appId}' fully installed.`;
    } });
    assert.equal(store.read(update.id).status, "completed");
    assert.equal(verifyInstallation(current, game).buildId, "200");
    const rollback = coordinator.queue(game, "rollback", "fixture-admin");
    store.write({ ...rollback, status: "launching" });
    await runInstallationUpdate({ id: rollback.id, gamesRoot, stateDir }, { hostHome: root, scan: async () => 0 });
    assert.equal(store.read(rollback.id).status, "completed", store.read(rollback.id).message);
    assert.equal(verifyInstallation(current, game).buildId, "100");
  });
}
