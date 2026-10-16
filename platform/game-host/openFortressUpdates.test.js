import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { Readable } from "node:stream";
import { OPEN_FORTRESS_RELEASE, openFortressModVersion, openFortressArchive, openFortressArchivePath, stageOpenFortress, recordOpenFortressVerification, inspectOpenFortressInstallation, retainedOpenFortressPackage } from "./openFortressUpdates.js";
import { PAIRED_RUNTIMES } from "./pairedRuntimeUpdates.js";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-of-update-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const stage = path.join(root, ".pb-update-open-fortress-" + randomUUID());
  fs.mkdirSync(stage);
  return { root, stage };
}

test("Open Fortress metadata uses its fixed publisher and rejects ambiguous headers", async () => {
  assert.deepEqual(await openFortressModVersion(async (url, input) => {
    assert.equal(url, OPEN_FORTRESS_RELEASE.url); assert.equal(input.method, "HEAD"); assert.equal(input.redirect, "error");
    return new Response(null, { headers: { etag: OPEN_FORTRESS_RELEASE.etag, "content-length": String(OPEN_FORTRESS_RELEASE.archiveBytes) } });
  }), { etag: OPEN_FORTRESS_RELEASE.etag, bytes: OPEN_FORTRESS_RELEASE.archiveBytes });
  for (const headers of [{}, { etag: "weak", "content-length": "1" }, { etag: OPEN_FORTRESS_RELEASE.etag, "content-length": "-1" }]) {
    await assert.rejects(openFortressModVersion(async () => new Response(null, { headers })), /metadata/);
  }
});

test("unknown mod releases never download or stage an SDK", async t => {
  const f = fixture(t); let called = false;
  await assert.rejects(stageOpenFortress(f.stage, {
    request: async () => new Response(null, { headers: { etag: '"123-456"', "content-length": "123" } }),
    run: async () => { called = true; }, archiveRequest: async () => { called = true; },
  }), /compatibility review/);
  assert.equal(called, false); assert.deepEqual(fs.readdirSync(f.stage), []);
});

test("redirected or changed archives cannot become cached packages", async t => {
  const f = fixture(t);
  for (const response of [{ statusCode: 302, stream: Readable.from(["bad"]) }, { statusCode: 200, stream: Readable.from(["bad"]) }]) {
    await assert.rejects(openFortressArchive(f.root, { request: async (url, input) => {
      assert.equal(url, OPEN_FORTRESS_RELEASE.url); assert.equal(input.followRedirects, false); return response;
    } }), /download failed|checksum/);
    assert.equal(fs.existsSync(openFortressArchivePath(f.root)), false);
    assert.deepEqual(fs.readdirSync(path.join(f.root, ".pb-artifact-cache")), []);
  }
});

test("changed cache files fail closed rather than being reused or overwritten", async t => {
  const f = fixture(t), cache = openFortressArchivePath(f.root);
  fs.mkdirSync(path.dirname(cache)); fs.writeFileSync(cache, "tampered");
  let requested = false;
  await assert.rejects(openFortressArchive(f.root, { request: async () => { requested = true; } }), /differs from review/);
  assert.equal(requested, false); assert.equal(fs.readFileSync(cache, "utf8"), "tampered");
});

test("occupied staging paths and missing disk headroom are rejected before downloads", async t => {
  const f = fixture(t); fs.mkdirSync(path.join(f.stage, "source-sdk"));
  const request = async () => new Response(null, { headers: { etag: OPEN_FORTRESS_RELEASE.etag, "content-length": String(OPEN_FORTRESS_RELEASE.archiveBytes) } });
  await assert.rejects(stageOpenFortress(f.stage, { request, run: async () => assert.fail("must not run") }), /inspection/);
  await assert.rejects(openFortressArchive(f.root, { diskCheck: () => { throw new Error("Insufficient disk"); }, request: async () => assert.fail("must not download") }), /Insufficient disk/);
});

test("SDK and mod assembly uses isolated anonymous installation before verifying the complete pair", async t => {
  const f = fixture(t), calls = [];
  fs.writeFileSync(path.join(f.root, "private-config.fixture"), "untouched");
  const result = await stageOpenFortress(f.stage, {
    request: async () => new Response(null, { headers: { etag: OPEN_FORTRESS_RELEASE.etag, "content-length": String(OPEN_FORTRESS_RELEASE.archiveBytes) } }),
    resolveArchive: async root => { assert.equal(root, f.root); return path.join(f.root, "reviewed.7z"); },
    run: async (command, args) => {
      calls.push(command);
      if (command === "/usr/bin/env") {
        if (calls.length === 1) throw new Error("SteamCMD download failed; the current installation was preserved");
        assert.equal(args[0], "-i"); assert.ok(args.includes("anonymous")); assert.ok(args.includes("previous2021"));
        const sdk = args[args.indexOf("+force_install_dir") + 1]; assert.equal(sdk, path.join(f.stage, "source-sdk"));
        fs.mkdirSync(path.join(sdk, "steamapps"));
        fs.writeFileSync(path.join(sdk, "steamapps/appmanifest_244310.acf"), '"appid" "244310" "buildid" "6982827" "BetaKey" "previous2021" "StateFlags" "4"');
      } else {
        assert.equal(command, "/usr/bin/python3"); assert.equal(args.at(-1), path.join(f.stage, "runtime"));
        fs.mkdirSync(path.join(f.stage, "runtime"));
      }
      return "";
    },
    verify: root => { assert.equal(root, f.stage); return { buildId: PAIRED_RUNTIMES["open-fortress"].latest }; },
  });
  assert.equal(result.buildId, PAIRED_RUNTIMES["open-fortress"].latest);
  assert.deepEqual(calls, ["/usr/bin/env", "/usr/bin/env", "/usr/bin/python3"]);
  assert.deepEqual(fs.readdirSync(f.stage), ["runtime"]);
  assert.equal(fs.readFileSync(path.join(f.root, "private-config.fixture"), "utf8"), "untouched");
});

test("SDK authorization and disk failures are not retried", async t => {
  for (const message of ["SteamCMD download authorization was denied", "SteamCMD could not write the staged download", "Update command timed out"]) {
    const f = fixture(t); let attempts = 0;
    await assert.rejects(stageOpenFortress(f.stage, {
      request: async () => new Response(null, { headers: { etag: OPEN_FORTRESS_RELEASE.etag, "content-length": String(OPEN_FORTRESS_RELEASE.archiveBytes) } }),
      resolveArchive: async () => path.join(f.root, "reviewed.7z"),
      run: async () => { attempts++; throw new Error(message); },
    }), error => error.message === message);
    assert.equal(attempts, 1);
    assert.equal(fs.existsSync(path.join(f.stage, "runtime")), false);
  }
});

test("fast inventory binds its verification record to the runtime and trusted launcher", t => {
  const f = fixture(t), runtime = path.join(f.stage, "runtime");
  for (const name of ["srcds_linux", "open_fortress/bin/server.so", "bin/steamclient.so", "open_fortress/maps/dm_2fort.bsp", "sdk-build.json"]) {
    const file = path.join(runtime, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, "fixture");
  }
  const profile = { versions: [{ buildId: "fixture", treeSha256: "a".repeat(64), launcherSha256: createHash("sha256").update("fixture").digest("hex") }] };
  recordOpenFortressVerification(f.stage, { buildId: "fixture" }, { profile });
  assert.equal(inspectOpenFortressInstallation(f.stage, { profile }).buildId, "fixture");
  fs.writeFileSync(path.join(runtime, "srcds_linux"), "tampered");
  assert.throws(() => inspectOpenFortressInstallation(f.stage, { profile }), /launcher differs/);
  fs.writeFileSync(path.join(runtime, "srcds_linux"), "fixture");
  fs.renameSync(runtime, path.join(f.stage, "old-runtime")); fs.mkdirSync(runtime);
  assert.throws(() => inspectOpenFortressInstallation(f.stage, { profile }), /changed and needs full verification/);
});

test("explicit updates reuse only unconsumed completed rollback packages of the reviewed build", t => {
  const f = fixture(t), good = { id: randomUUID(), key: "open-fortress", action: "rollback", status: "completed", beforeBuild: "reviewed" };
  const inspect = root => { assert.equal(root, path.join(f.root, ".pb-rollback-open-fortress-" + good.id)); return { buildId: "reviewed" }; };
  const select = rows => retainedOpenFortressPackage({ all: () => rows }, f.root, { inspect, latest: "reviewed" });
  assert.equal(select([good]).job.id, good.id);
  for (const changed of [{ packageReusedBy: "other-job" }, { status: "interrupted" }, { action: "update" }, { beforeBuild: "unknown" }, { id: "../outside" }, { key: "team-fortress-2" }]) assert.equal(select([{ ...good, ...changed }]), null);
  assert.equal(retainedOpenFortressPackage({ all: () => [good] }, f.root, { inspect: () => { throw new Error("changed package"); }, latest: "reviewed" }), null);
});
