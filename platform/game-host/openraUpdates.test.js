import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { appImageOffset, validateArchiveListing, buildOpenRARelease, verifyOpenRAInstallation, seedOpenRABaseline, validateOpenRABaseline, stageOpenRARelease } from "./openraUpdates.js";
import { createInstallationCoordinator, createInstallationStore } from "./installationJobs.js";
import { runInstallationUpdate } from "./installationUpdateWorker.js";

const version = "release-20300101";
const packages = [["ra", "Red-Alert"], ["cnc", "Tiberian-Dawn"], ["d2k", "Dune-2000"]];
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-openra-update-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));return root;
}
function image() {
  const data = Buffer.alloc(512);
  data.writeUInt32BE(0x7f454c46);data[4] = 2;data[5] = 1;data.writeUInt16LE(62, 18);
  data.write("hsqs", 256);data.writeUInt32LE(131072, 268);data.writeUInt16LE(4, 284);data.writeBigUInt64LE(256n, 296);
  return data;
}
function bundle(root, mod, build = version) {
  fs.mkdirSync(root, { recursive: true });
  for (const file of ["OpenRA.Server", "OpenRA.Server.dll", "OpenRA.Game.dll", "OpenRA.Mods.Common.dll", "OpenRA.Mods.Cnc.dll", "libhostfxr.so", "libcoreclr.so"]) fs.writeFileSync(path.join(root, file), "engine", { mode: 0o755 });
  fs.writeFileSync(path.join(root, "VERSION"), build + "\n");
  fs.writeFileSync(path.join(root, "OpenRA.Server.runtimeconfig.json"), '{"runtimeOptions":{"tfm":"net6.0"}}');
  if (mod === "d2k") fs.writeFileSync(path.join(root, "OpenRA.Mods.D2k.dll"), "D2K assembly");
  for (const folder of [mod, `${mod}-content`]) {
    fs.mkdirSync(path.join(root, "mods", folder), { recursive: true });
    fs.writeFileSync(path.join(root, "mods", folder, "mod.yaml"), `Metadata:\n\tVersion: ${build}\n`);
  }
}
function transport({ badDigest = false, prerelease = false, missing = false, wrongMod = false } = {}) {
  const data = image();
  const release = { tag_name: version, draft: false, prerelease, assets: packages.map(([, title]) => ({
    name: `OpenRA-${title}-x86_64.AppImage`, size: data.length,
    digest: badDigest ? null : "sha256:" + createHash("sha256").update(data).digest("hex"),
    browser_download_url: `https://github.com/OpenRA/OpenRA/releases/download/${version}/OpenRA-${title}-x86_64.AppImage`,
  })) };
  if (missing) release.assets.pop();
  return {
    request: async (url) => url.startsWith("https://api.github.com/") ? Response.json(release) : new Response(data),
    run: async (command, args) => {
      assert.equal(command, "/usr/bin/unsquashfs");
      if (args[0] === "-lln") return "drwxr-xr-x 0/0 1 2030-01-01 00:00 squashfs-root/usr/lib/openra\n-rwxr-xr-x 0/0 100 2030-01-01 00:00 squashfs-root/usr/lib/openra/OpenRA.Server\n";
      assert.equal(args.at(-1), "usr/lib/openra");
      const destination = args[args.indexOf("-d") + 1];
      bundle(path.join(destination, "usr/lib/openra"), path.basename(destination), wrongMod ? "release-19990101" : version);
      return "";
    },
  };
}

test("three verified packages build one engine with all matching official games", async (t) => {
  const root = fixture(t);
  const output = await buildOpenRARelease(path.join(root, "work"), transport());
  assert.equal(verifyOpenRAInstallation(output).buildId, version);
  assert.doesNotThrow(() => validateOpenRABaseline(output));
});

for (const options of [{ badDigest: true }, { prerelease: true }, { missing: true }, { wrongMod: true }]) {
  test(`rejects unsupported release metadata or versions: ${JSON.stringify(options)}`, async (t) => {
    const root = fixture(t);
    await assert.rejects(buildOpenRARelease(path.join(root, "work"), transport(options)));
  });
}

test("AppImage validation requires x86_64 and a bounded SquashFS superblock", (t) => {
  const root = fixture(t), filename = path.join(root, "image");
  const data = image();fs.writeFileSync(filename, data);assert.equal(appImageOffset(filename), 256);
  data.writeUInt16LE(183, 18);fs.writeFileSync(filename, data);assert.throws(() => appImageOffset(filename), /x86_64/);
  data.writeUInt16LE(62, 18);data.writeBigUInt64LE(10000n, 296);fs.writeFileSync(filename, data);assert.throws(() => appImageOffset(filename), /bounded/);
});

test("archive listing rejects traversal, links, special files and oversized extraction", () => {
  for (const line of [
    "-rw-r--r-- 0/0 1 2030-01-01 00:00 squashfs-root/usr/lib/openra/../../escape",
    "lrwxrwxrwx 0/0 1 2030-01-01 00:00 squashfs-root/usr/lib/openra/link -> /etc",
    "lrwxrwxrwx 0/0 1 2030-01-01 00:00 squashfs-root/usr/lib/openra -> /etc",
    "-rwsr-xr-x 0/0 1 2030-01-01 00:00 squashfs-root/usr/lib/openra/setuid",
    "brw-r--r-- 0/0 1 2030-01-01 00:00 squashfs-root/usr/lib/openra/device",
    "-rw-r--r-- 0/0 3000000000 2030-01-01 00:00 squashfs-root/usr/lib/openra/big",
    "lrwxrwxrwx 0/0 1 2030-01-01 00:00 squashfs-root/usr -> /etc",
  ]) assert.throws(() => validateArchiveListing(line), /OpenRA/);
});

test("legacy adoption changes metadata only and refuses custom files", async (t) => {
  const root = fixture(t), reference = await buildOpenRARelease(path.join(root, "reference"), transport());
  const current = path.join(root, "current");fs.cpSync(reference, current, { recursive: true });
  fs.unlinkSync(path.join(current, ".pb-openra-manifest.json"));
  seedOpenRABaseline(current, reference);validateOpenRABaseline(current);
  fs.writeFileSync(path.join(current, "custom.save"), "customer data");
  assert.throws(() => seedOpenRABaseline(current, reference), /differs/);
  assert.throws(() => validateOpenRABaseline(current), /custom changes/);
  assert.equal(fs.readFileSync(path.join(current, "custom.save"), "utf8"), "customer data");
});

test("staged replacement retains a full baseline, and cannot target the live directory", async (t) => {
  const root = fixture(t), reference = await buildOpenRARelease(path.join(root, "reference"), transport());
  await assert.rejects(stageOpenRARelease(reference, transport()), /isolated worker/);
  const stage = path.join(root, `.pb-update-openra-${randomUUID()}`);fs.cpSync(reference, stage, { recursive: true });
  await stageOpenRARelease(stage, transport());validateOpenRABaseline(stage);
  assert.equal(fs.existsSync(path.join(stage, ".pb-openra-work")), false);
});

test("coordinated archive activation and rollback never invoke SteamCMD", async (t) => {
  const root = fixture(t), reference = await buildOpenRARelease(path.join(root, "reference"), transport());
  const gamesRoot = path.join(root, "games"), stateDir = path.join(root, "state");fs.mkdirSync(gamesRoot);
  fs.cpSync(reference, path.join(gamesRoot, "openra"), { recursive: true });
  const coordinator = createInstallationCoordinator({ gamesRoot, stateDir, rooms: () => [], scan: async () => 0 });
  const store = createInstallationStore(stateDir), job = coordinator.queue("openra", "update", "fixture-admin");
  assert.throws(() => coordinator.beginStart("openra"), /paused/);
  store.write({ ...job, status: "launching" });
  await runInstallationUpdate({ id: job.id, stateDir, gamesRoot }, {
    scan: async () => 0, disk: () => ({ free: 100 * 1024 ** 3, reserve: 8 * 1024 ** 3 }),
    stageArchive: (stage) => stageOpenRARelease(stage, transport()),
    run: async (command, args) => {
      if (command.endsWith("du")) return "1024 fixture";
      assert.equal(command, "/usr/bin/cp");fs.cpSync(args.at(-2), args.at(-1), { recursive: true });return "";
    },
  });
  assert.equal(store.read(job.id).status, "completed", store.read(job.id).message);
  const rollback = coordinator.queue("openra", "rollback", "fixture-admin");store.write({ ...rollback, status: "launching" });
  await runInstallationUpdate({ id: rollback.id, stateDir, gamesRoot }, { scan: async () => 0 });
  assert.equal(store.read(rollback.id).status, "completed", store.read(rollback.id).message);
});
