import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { verifyAssaultCubeInstallation, stageAssaultCubeRelease } from "./assaultcubeUpdates.js";
import { createInstallationCoordinator, createInstallationStore } from "./installationJobs.js";
import { runInstallationUpdate } from "./installationUpdateWorker.js";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-assaultcube-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root;
}
function install(root, buildId = "1.3.0.2") {
  const directory = path.join(root, "bin_unix"); fs.mkdirSync(directory, { recursive: true }); const files = {};
  for (const name of ["linux_64_client", "linux_64_server"]) {
    const data = Buffer.alloc(128); data.writeUInt32BE(0x7f454c46); data[4] = 2; data[5] = 1; data.writeUInt16LE(62, 18); data.write(buildId, 64);
    fs.writeFileSync(path.join(directory, name), data, { mode: 0o755 });
    files[name] = { size: data.length, sha256: createHash("sha256").update(data).digest("hex") };
  }
  fs.writeFileSync(path.join(directory, ".pb-native-release.json"), JSON.stringify({ version: 1, buildId, files }));
}
function setup(t) {
  const root = fixture(t), gamesRoot = path.join(root, "games"), stateDir = path.join(root, "state"), current = path.join(gamesRoot, "assaultcube"); install(current);
  fs.mkdirSync(path.join(current, "config")); fs.writeFileSync(path.join(current, "config/private.cfg"), "original settings");
  const rooms = [], launches = [];
  const coordinator = createInstallationCoordinator({ gamesRoot, stateDir, rooms: () => rooms, scan: async () => 0, launch: async (job) => launches.push(job) });
  const store = createInstallationStore(stateDir);
  const options = { scan: async () => 0, disk: () => ({ free: 100 * 1024 ** 3, reserve: 8 * 1024 ** 3 }),
    run: async (command, args) => {
      if (command.endsWith("du")) { assert.equal(args.at(-1), path.join(current, "bin_unix")); return "512 fixture"; }
      assert.ok(command.endsWith("cp")); assert.equal(args.at(-2), path.join(current, "bin_unix"));
      fs.cpSync(args.at(-2), args.at(-1), { recursive: true }); return "";
    },
    stageAssaultCube: async (stage) => { assert.equal(fs.existsSync(path.join(stage, "config")), false); install(stage, "1.3.0.3"); },
  };
  return { gamesRoot, stateDir, current, rooms, launches, coordinator, store, options };
}
test("native-only updates and rollback preserve the live data directory and newer configuration", async (t) => {
  const f = setup(t), rootIdentity = fs.statSync(f.current).ino, configIdentity = fs.statSync(path.join(f.current, "config")).ino;
  f.rooms.push({ gameSlug: "assaultcube" }); const update = f.coordinator.queue("assaultcube", "update", "test");
  assert.throws(() => f.coordinator.beginStart("assaultcube"), /paused/); await f.coordinator.tick(); assert.equal(f.launches.length, 0);
  f.rooms.length = 0; await f.coordinator.tick(); assert.equal(f.launches.length, 1);
  await runInstallationUpdate({ id: update.id, ...f }, f.options);
  assert.equal(f.store.read(update.id).status, "completed"); assert.equal(verifyAssaultCubeInstallation(f.current).buildId, "1.3.0.3");
  assert.equal(fs.existsSync(path.join(f.gamesRoot, `.pb-rollback-assaultcube-${update.id}`, "config")), false);
  fs.writeFileSync(path.join(f.current, "config/private.cfg"), "new settings after update");
  const rollback = f.coordinator.queue("assaultcube", "rollback", "test"); f.store.write({ ...rollback, status: "launching" });
  await runInstallationUpdate({ id: rollback.id, ...f }, f.options);
  assert.equal(f.store.read(rollback.id).status, "completed"); assert.equal(verifyAssaultCubeInstallation(f.current).buildId, "1.3.0.2");
  assert.equal(fs.readFileSync(path.join(f.current, "config/private.cfg"), "utf8"), "new settings after update");
  assert.equal(fs.statSync(f.current).ino, rootIdentity); assert.equal(fs.statSync(path.join(f.current, "config")).ino, configIdentity);
});
for (const restoreFails of [false, true]) {
  test(`component activation failure ${restoreFails ? "keeps starts blocked if restore also fails" : "restores the previous native directory"}`, async (t) => {
    const f = setup(t), job = f.coordinator.queue("assaultcube", "update", "test"); f.store.write({ ...job, status: "launching" });
    const rename = fs.renameSync, active = path.join(f.current, "bin_unix");
    fs.renameSync = (from, to) => {
      if (to === active && (String(from).includes(`.pb-update-assaultcube-${job.id}`) || (restoreFails && String(from).includes(`.pb-rollback-assaultcube-${job.id}`)))) throw new Error("fixture rename failure");
      return rename(from, to);
    };
    try { await runInstallationUpdate({ id: job.id, ...f }, f.options); } finally { fs.renameSync = rename; }
    assert.equal(f.store.read(job.id).status, restoreFails ? "interrupted" : "failed");
    assert.equal(fs.readFileSync(path.join(f.current, "config/private.cfg"), "utf8"), "original settings");
    if (restoreFails) assert.throws(() => f.coordinator.beginStart("assaultcube"), /paused/);
    else assert.equal(verifyAssaultCubeInstallation(f.current).buildId, "1.3.0.2");
  });
}
test("native verification rejects custom files and modified executables, but never reads private configuration", (t) => {
  const f = setup(t); verifyAssaultCubeInstallation(f.current);
  fs.writeFileSync(path.join(f.current, "bin_unix/linux_64_server"), Buffer.alloc(128));
  assert.throws(() => verifyAssaultCubeInstallation(f.current), /reviewed/);
  install(f.current); fs.writeFileSync(path.join(f.current, "bin_unix/custom-plugin.so"), "custom");
  assert.throws(() => verifyAssaultCubeInstallation(f.current), /custom/);
  assert.equal(fs.readFileSync(path.join(f.current, "config/private.cfg"), "utf8"), "original settings");
});
test("unknown release versions and unreviewed artifacts cannot replace native files", async (t) => {
  for (const tag of ["v1.3.0.3", "../other", "v1.3.0.2"]) {
    const stage = path.join(fixture(t), `.pb-update-assaultcube-${randomUUID()}`); install(stage);
    await assert.rejects(stageAssaultCubeRelease(stage, { run: async () => assert.fail("no extraction"), request: async () => Response.json({ tag_name: tag, draft: false, prerelease: false, assets: [] }) }));
    assert.equal(verifyAssaultCubeInstallation(stage).buildId, "1.3.0.2");
  }
});
test("bounded archive extraction writes only native files and rejects links, traversal, duplicates and special modes", { skip: process.platform !== "linux" }, (t) => {
  const root = fixture(t), helper = fileURLToPath(new URL("./nativeArchive.py", import.meta.url));
  for (const variant of ["valid", "traversal", "symlink", "hardlink", "duplicate", "suid", "oversized"]) {
    const archive = path.join(root, `${variant}.tar.bz2`), output = path.join(root, variant);
    execFileSync("/usr/bin/python3", ["-c", `import io,sys,tarfile
with tarfile.open(sys.argv[1], 'w:bz2') as archive:
 for name in ['bin_unix/linux_64_client','bin_unix/linux_64_server','config/private.cfg']:
  if name=='bin_unix/linux_64_server' and sys.argv[2] in ['symlink','hardlink','suid','oversized']:continue
  member=tarfile.TarInfo(name);member.size=4;member.mode=0o755;archive.addfile(member,io.BytesIO(b'data'))
 variant=sys.argv[2]
 if variant!='valid':
  member=tarfile.TarInfo('../escape' if variant=='traversal' else 'bin_unix/linux_64_server');member.size=4;member.mode=0o755
  if variant=='symlink':member.type=tarfile.SYMTYPE;member.linkname='/tmp/elsewhere';member.size=0
  if variant=='hardlink':member.type=tarfile.LNKTYPE;member.linkname='config/private.cfg';member.size=0
  if variant=='suid':member.mode=0o4755
  if variant=='oversized':member.size=17*1024**2
  archive.addfile(member,io.BytesIO(b'data') if member.size==4 else None)
`, archive, variant]);
    const result = spawnSync("/usr/bin/python3", [helper, archive, output]);
    assert.equal(result.status, variant === "valid" ? 0 : 1, variant);
    assert.equal(fs.existsSync(path.join(root, "escape")), false);
    if (variant === "valid") assert.deepEqual(fs.readdirSync(output).sort(), ["linux_64_client", "linux_64_server"]);
  }
});
