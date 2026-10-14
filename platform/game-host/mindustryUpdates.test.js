import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { verifyMindustryInstallation, stageMindustryRelease } from "./mindustryUpdates.js";
import { runInstallationUpdate } from "./installationUpdateWorker.js";
import { createInstallationCoordinator, createInstallationStore } from "./installationJobs.js";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-mindustry-update-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "server-release.jar"), "old JAR");
  return root;
}
const body = Buffer.from("fixture server JAR");
const digest = "sha256:" + createHash("sha256").update(body).digest("hex");
function release(overrides = {}) {
  return { draft: false, prerelease: false, tag_name: "v160.7", assets: [{ name: "server-release.jar", size: body.length, digest,
    browser_download_url: "https://github.com/Anuken/Mindustry/releases/download/v160.7/server-release.jar" }], ...overrides };
}
function network(metadata = release(), assetResponse = () => new Response(body)) {
  return async (url, options) => {
    assert.equal(options.signal.aborted, false);
    assert.equal(options.headers.Authorization, undefined);
    if (url === "https://api.github.com/repos/Anuken/Mindustry/releases/latest") return Response.json(metadata);
    return assetResponse(url, options);
  };
}
const verify = () => ({ buildId: "160.7" });

test("download validates the official digest and version without running the JAR", async (t) => {
  const root = fixture(t);
  let checked = 0;
  const result = await stageMindustryRelease(root, { request: network(), verify: (dir) => {
    assert.deepEqual(fs.readFileSync(path.join(dir, "server-release.jar")), body);
    return verify();
  }, diskCheck: () => checked++ });
  assert.equal(result.buildId, "160.7");
  assert.ok(checked > 0);
});

for (const [name, metadata] of [
  ["prerelease", release({ prerelease: true })], ["draft", release({ draft: true })],
  ["tag traversal", release({ tag_name: "../../other" })], ["missing digest", release({ assets: [{ ...release().assets[0], digest: null }] })],
  ["wrong source", release({ assets: [{ ...release().assets[0], browser_download_url: "https://example.com/other.jar" }] })],
  ["oversized asset", release({ assets: [{ ...release().assets[0], size: 257 * 1024 ** 2 }] })],
]) test(`rejects ${name} before replacing the staged JAR`, async (t) => {
  const root = fixture(t);
  await assert.rejects(stageMindustryRelease(root, { request: network(metadata), verify }), /Mindustry/);
  assert.equal(fs.readFileSync(path.join(root, "server-release.jar"), "utf8"), "old JAR");
});

test("checksum, truncation and disk failures leave the previous JAR intact", async (t) => {
  for (const [contents, diskCheck] of [[Buffer.from("bad digest value!!"), () => {}], [body.subarray(0, 4), () => {}], [body, () => { throw new Error("Update stopped: disk reserve"); }]]) {
    const root = fixture(t);
    await assert.rejects(stageMindustryRelease(root, { request: network(release(), () => new Response(contents)), verify, diskCheck }));
    assert.equal(fs.readFileSync(path.join(root, "server-release.jar"), "utf8"), "old JAR");
  }
});

test("release redirects must remain HTTPS on trusted artifact hosts", async (t) => {
  for (const target of ["http://github.com/unsafe", "https://example.com/payload", "https://user:password@github.com/payload", "https://github.com:8443/payload"]) {
    const root = fixture(t);
    await assert.rejects(stageMindustryRelease(root, { request: network(release(), () => new Response(null, { status: 302, headers: { location: target } })), verify }), /trusted/);
  }
  const root = fixture(t);
  let calls = 0;
  await stageMindustryRelease(root, { request: network(release(), (url) => {
    calls++;
    return url.startsWith("https://github.com/") ? new Response(null, { status: 302, headers: { location: "https://release-assets.githubusercontent.com/fixture" } }) : new Response(body);
  }), verify });
  assert.equal(calls, 2);
});

test("version mismatch or failed JAR validation prevents successful staging", async (t) => {
  const root = fixture(t);
  await assert.rejects(stageMindustryRelease(root, { request: network(), verify: () => ({ buildId: "1" }) }), /does not match/);
});

function commands({ java = "openjdk 21.0.1", major = 61, manifest = "Main-Class: mindustry.server.ServerLauncher\n" } = {}) {
  return (program, args) => {
    if (program === "/usr/bin/java") { assert.deepEqual(args, ["--version"]); return Buffer.from(java); }
    assert.equal(program, "/usr/bin/unzip");
    if (args[0] === "-tqq") return Buffer.alloc(0);
    if (args.at(-1) === "version.properties") return Buffer.from("build=160.7\n");
    if (args.at(-1) === "META-INF/MANIFEST.MF") return Buffer.from(manifest);
    const header = Buffer.alloc(8); header.writeUInt32BE(0xcafebabe); header.writeUInt16BE(major, 6); return header;
  };
}
test("offline checks require server entry point, usable Java, and regular files", (t) => {
  const root = fixture(t);
  assert.equal(verifyMindustryInstallation(root, { command: commands() }).buildId, "160.7");
  assert.throws(() => verifyMindustryInstallation(root, { command: commands({ java: "openjdk 11" }) }), /newer installed Java/);
  assert.throws(() => verifyMindustryInstallation(root, { command: commands({ manifest: "Main-Class: some.client.Main\n" }) }), /metadata/);
  fs.writeFileSync(path.join(root, "run-server"), "custom wrapper");
  assert.throws(() => verifyMindustryInstallation(root, { command: commands() }), /custom launchers/);
});

test("metadata and redirect loops are bounded", async (t) => {
  const root = fixture(t);
  await assert.rejects(stageMindustryRelease(root, { request: async () => new Response("x".repeat(1024 * 1024 + 1)), verify }), /size limit/);
  await assert.rejects(stageMindustryRelease(root, { request: network(release(), () => new Response(null, { status: 302, headers: { location: "https://github.com/loop" } })), verify }), /redirect limit/);
});

test("Linux JAR update and rollback use the existing queue without invoking SteamCMD", { skip: process.platform !== "linux" }, async (t) => {
  const root = fixture(t);
  const gamesRoot = path.join(root, "games"), stateDir = path.join(root, "state");
  const current = path.join(gamesRoot, "mindustry");
  fs.mkdirSync(current, { recursive: true });
  const jar = (directory, build) => execFileSync("/usr/bin/python3", ["-c", [
    "import sys,zipfile,struct",
    "with zipfile.ZipFile(sys.argv[1], 'w') as z:",
    " z.writestr('version.properties', 'build='+sys.argv[2]+'\\n')",
    " z.writestr('META-INF/MANIFEST.MF', 'Main-Class: mindustry.server.ServerLauncher\\n')",
    " z.writestr('mindustry/server/ServerLauncher.class', struct.pack('>IHH',0xcafebabe,0,61))",
  ].join("\n"), path.join(directory, "server-release.jar"), build]);
  jar(current, "159.7");
  const world = path.join(root, "world.save");fs.writeFileSync(world, "customer progress");
  const coordinator = createInstallationCoordinator({ gamesRoot, stateDir, rooms: () => [], scan: async () => 0 });
  const store = createInstallationStore(stateDir);
  const job = coordinator.queue("mindustry", "update", "fixture-admin");
  assert.throws(() => coordinator.beginStart("mindustry"), /paused/);
  store.write({ ...job, status: "launching" });
  await runInstallationUpdate({ id: job.id, gamesRoot, stateDir }, {
    scan: async () => 0, disk: () => ({ free: 100 * 1024 ** 3, reserve: 8 * 1024 ** 3 }),
    run: async (command, args) => {
      if (command.endsWith("du")) return "1024 fixture";
      assert.equal(command, "/usr/bin/cp");
      fs.cpSync(args.at(-2), args.at(-1), { recursive: true });return "";
    },
    stageRelease: async (stage) => { jar(stage, "160.7"); return verifyMindustryInstallation(stage); },
  });
  assert.equal(store.read(job.id).status, "completed", store.read(job.id).message);
  assert.equal(verifyMindustryInstallation(current).buildId, "160.7");
  const rollback = coordinator.queue("mindustry", "rollback", "fixture-admin");
  store.write({ ...rollback, status: "launching" });
  await runInstallationUpdate({ id: rollback.id, gamesRoot, stateDir }, { scan: async () => 0 });
  assert.equal(store.read(rollback.id).status, "completed", store.read(rollback.id).message);
  assert.equal(verifyMindustryInstallation(current).buildId, "159.7");
  assert.equal(fs.readFileSync(world, "utf8"), "customer progress");
});
