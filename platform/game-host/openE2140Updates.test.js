import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { stageOpenE2140Release, verifyOpenE2140Installation } from "./openE2140Updates.js";
import { createInstallationCoordinator, createInstallationStore } from "./installationJobs.js";
import { runInstallationUpdate } from "./installationUpdateWorker.js";

function image() {
  const data = Buffer.alloc(512);
  data.writeUInt32BE(0x7f454c46); data[4] = 2; data[5] = 1; data.writeUInt16LE(62, 18);
  data.write("hsqs", 256); data.writeUInt32LE(131072, 268); data.writeUInt16LE(4, 284); data.writeBigUInt64LE(256n, 296);
  return data;
}
const digest = (data) => "sha256:" + createHash("sha256").update(data).digest("hex");
function install(root, buildId = "release-20260920") {
  fs.mkdirSync(root, { recursive: true });
  const data = image();
  fs.writeFileSync(path.join(root, "OpenE2140"), data, { mode: 0o755 });
  fs.writeFileSync(path.join(root, ".pb-opene2140-release.json"), JSON.stringify({ version: 1, buildId, digest: digest(data), size: data.length }));
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-earth-2140-trilogy-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function transport({ missingDigest = false, wrongVersion = false, prerelease = false, unofficial = false } = {}) {
  const data = image(), tag = "release-20300101", name = `OpenE2140-${tag}-x86_64.AppImage`;
  return {
    request: async (url) => url.startsWith("https://api.github.com/") ? Response.json({ tag_name: tag, draft: false, prerelease,
      assets: [{ name, size: data.length, digest: missingDigest ? null : digest(data), browser_download_url: `https://github.com/${unofficial ? "other/repository" : "OpenE2140/OpenE2140"}/releases/download/${tag}/${name}` }],
    }) : new Response(data),
    run: async (command, args, options) => {
      assert.equal(command, "/usr/bin/unsquashfs"); assert.equal(args[0], "-cat"); assert.ok(options.maxOutput);
      return args.at(-1).endsWith("VERSION") ? "opene2140-engine-20260919\n" : `Metadata:\n\tVersion: ${wrongVersion ? "release-20260920" : tag}\n`;
    },
  };
}
test("OpenE2140 stages only a verified official AppImage with matching embedded mod version", async (t) => {
  const stage = path.join(fixture(t), `.pb-update-earth-2140-trilogy-${randomUUID()}`); install(stage);
  const result = await stageOpenE2140Release(stage, transport());
  assert.equal(result.buildId, "release-20300101");
  assert.equal(verifyOpenE2140Installation(stage).buildId, "release-20300101");
  assert.deepEqual(fs.readdirSync(stage).sort(), [".pb-opene2140-release.json", "OpenE2140"]);
});
for (const option of ["missingDigest", "wrongVersion", "prerelease", "unofficial"]) {
  test(`OpenE2140 refuses ${option} without replacing the staged binary`, async (t) => {
    const stage = path.join(fixture(t), `.pb-update-earth-2140-trilogy-${randomUUID()}`); install(stage);
    const before = fs.readFileSync(path.join(stage, "OpenE2140"));
    await assert.rejects(stageOpenE2140Release(stage, transport({ [option]: true })));
    assert.deepEqual(fs.readFileSync(path.join(stage, "OpenE2140")), before);
  });
}
test("OpenE2140 rejects custom files, unknown legacy binaries, and same-size edits after verification", async (t) => {
  const root = fixture(t); install(root); verifyOpenE2140Installation(root);
  const filename = path.join(root, "OpenE2140"), before = fs.statSync(filename), data = fs.readFileSync(filename);
  data[511] = 1; fs.writeFileSync(filename, data); fs.utimesSync(filename, before.atime, before.mtime);
  assert.throws(() => verifyOpenE2140Installation(root), /differs/);
  install(root); fs.writeFileSync(path.join(root, "custom-map"), "preserve me");
  assert.throws(() => verifyOpenE2140Installation(root), /custom/);
  fs.unlinkSync(path.join(root, "custom-map")); fs.unlinkSync(path.join(root, ".pb-opene2140-release.json"));
  assert.throws(() => verifyOpenE2140Installation(root), /size/);
  await assert.rejects(stageOpenE2140Release(root, transport()), /isolated/);
});
test("OpenE2140 shared lock includes OpenRA rooms and pending starts; duplicate release is harmless", async (t) => {
  const root = fixture(t), gamesRoot = path.join(root, "games"), stateDir = path.join(root, "state"); install(path.join(gamesRoot, "earth-2140-trilogy"));
  const rooms = [], launches = [];
  const coordinator = createInstallationCoordinator({ gamesRoot, stateDir, rooms: () => rooms, scan: async () => 0, launch: async (job) => launches.push(job), sameProcess: () => true });
  const release = coordinator.beginStart("openra"), release2 = coordinator.beginStart("openra");
  const job = coordinator.queue("earth-2140-trilogy", "update", "test");
  assert.throws(() => coordinator.beginStart("openra"), /paused/);
  assert.throws(() => coordinator.beginStart("opene2140"), /paused/);
  assert.equal(coordinator.blockedReason("luanti"), null);
  release(); release(); await coordinator.tick(); assert.equal(launches.length, 0);
  release2(); rooms.push({ gameSlug: "openra", editionSlug: "earth-2140-trilogy" });
  await coordinator.tick(); assert.equal(launches.length, 0);
  rooms.length = 0; await coordinator.tick(); assert.equal(launches.length, 1);
  assert.equal(launches[0].id, job.id);
});
test("OpenE2140 worker activates and rolls back through the existing non-Steam queue", async (t) => {
  const root = fixture(t), gamesRoot = path.join(root, "games"), stateDir = path.join(root, "state"), current = path.join(gamesRoot, "earth-2140-trilogy"); install(current);
  const coordinator = createInstallationCoordinator({ gamesRoot, stateDir, rooms: () => [], scan: async () => 0 });
  const store = createInstallationStore(stateDir);
  const options = { scan: async () => 0, disk: () => ({ free: 100 * 1024 ** 3, reserve: 8 * 1024 ** 3 }),
    run: async (command, args) => {
      if (command.endsWith("du")) return "512 fixture";
      assert.ok(command.endsWith("cp")); fs.cpSync(args.at(-2), args.at(-1), { recursive: true }); return "";
    }, stageOpenE2140: (stage, options) => stageOpenE2140Release(stage, { ...options, ...transport() }),
  };
  const update = coordinator.queue("earth-2140-trilogy", "update", "test"); store.write({ ...update, status: "launching" });
  await runInstallationUpdate({ id: update.id, gamesRoot, stateDir }, options);
  assert.equal(store.read(update.id).status, "completed"); assert.equal(verifyOpenE2140Installation(current).buildId, "release-20300101");
  const rollback = coordinator.queue("earth-2140-trilogy", "rollback", "test"); store.write({ ...rollback, status: "launching" });
  await runInstallationUpdate({ id: rollback.id, gamesRoot, stateDir }, options);
  assert.equal(store.read(rollback.id).status, "completed"); assert.equal(verifyOpenE2140Installation(current).buildId, "release-20260920");
});
