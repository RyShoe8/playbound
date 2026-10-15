import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verifyOpenMohaaInstallation, stageOpenMohaaRelease } from "./openmohaaUpdates.js";
import { installationKey, installationDependencies } from "./installationTargets.js";

test("OpenMoHAA and its canonical game share one installation maintenance key", () => {
  for (const slug of ["openmohaa", "medal-of-honor-allied-assault"]) {
    assert.equal(installationKey(slug), "openmohaa"); assert.deepEqual(installationDependencies(slug), ["openmohaa"]);
  }
});
test("the dedicated engine and game module must both match approved native bytes", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-mohaa-"));t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const data = Buffer.alloc(32); data.write("\x7fELF"); data[4] = 2; data.writeUInt16LE(62, 18);
  const profile = { version: "fixture", files: {} };
  for (const name of ["omohaaded", "game.so"]) {
    fs.writeFileSync(path.join(root, name), data, { mode: 0o755 }); profile.files[name] = { bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") };
  }
  const options = { profile, command: () => Buffer.from("libc.so.6 => /lib/libc.so.6") };
  assert.equal(verifyOpenMohaaInstallation(root, options).buildId, "fixture");
  const changed = Buffer.from(data); changed[25] = 1; fs.writeFileSync(path.join(root, "game.so"), changed);
  assert.throws(() => verifyOpenMohaaInstallation(root, options), /differs from reviewed/);
});
test("download failures leave engine, retail assets and private configuration untouched", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-mohaa-")); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const stage = path.join(root, `.pb-update-openmohaa-${randomUUID()}`); fs.mkdirSync(stage); fs.writeFileSync(path.join(stage, "retail.pk3"), "original-assets");
  await assert.rejects(stageOpenMohaaRelease(stage, { verify: () => ({ buildId: "0.82.1" }), request: async () => new Response("unavailable", { status: 503 }), run: async () => { throw new Error("extraction must not run"); } }), /download failed/);
  assert.equal(fs.readFileSync(path.join(stage, "retail.pk3"), "utf8"), "original-assets");
});
test("OpenMoHAA archive rejects traversal, duplicate entries, links and changed modules", { skip: process.platform !== "linux" }, () => {
  execFileSync("/usr/bin/python3", [fileURLToPath(new URL("./openmohaaArchive.test.py", import.meta.url))], { timeout: 30_000, maxBuffer: 8192 });
});
