import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verifyRimworldInstallation, stageRimworldRelease, RIMWORLD_BUILD } from "./rimworldUpdates.js";
test("reviewed bridge and dependency lock stay pinned across deployments", () => {
  for (const [name, expected] of [["./rimworld/PlayBoundBridge.cs", RIMWORLD_BUILD.bridgeSha256], ["./rimworldPackages.lock.json", RIMWORLD_BUILD.lockSha256]]) {
    const content = fs.readFileSync(new URL(name, import.meta.url), "utf8").replace(/\r\n/g, "\n");
    assert.equal(createHash("sha256").update(content).digest("hex"), expected, `${name} requires an explicit source-build review`);
  }
});
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-rimworld-build-")); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bytes = Buffer.alloc(64); bytes.writeUInt32BE(0x7f454c46); bytes[4] = 2; bytes[5] = 1; bytes.writeUInt16LE(62, 18);
  const hash = value => createHash("sha256").update(value).digest("hex");
  const profile = { binary: { bytes: bytes.length, sha256: hash(bytes) }, legacyBinary: { bytes: 1, sha256: "unused" }, licenseSha256: hash("license\n"), version: "fixture" };
  fs.writeFileSync(path.join(root, "RTServer"), bytes, { mode: 0o755 }); fs.writeFileSync(path.join(root, "UPSTREAM-LICENSE"), "license\r\n");
  return { root, profile, bytes };
}
const command = (_exe, _args, opts) => { assert.deepEqual(opts.env, { PATH: "/usr/bin:/bin", LANG: "C" }); return Buffer.from("libc.so.6 => /lib/libc.so.6 (0x123)\n"); };
test("RimWorld accepts only the reviewed patched binary and original upstream license", { skip: process.platform !== "linux" }, t => {
  const { root, profile, bytes } = fixture(t);
  assert.equal(verifyRimworldInstallation(root, { profile, command }).buildId, "fixture");
  bytes[30] = 1; fs.writeFileSync(path.join(root, "RTServer"), bytes);
  assert.throws(() => verifyRimworldInstallation(root, { profile, command: assert.fail }), /reviewed patched/);
});
test("custom world data, unsafe links, license edits and missing libraries block updates", { skip: process.platform !== "linux" }, t => {
  const { root, profile } = fixture(t), options = { profile, command };
  assert.throws(() => verifyRimworldInstallation(root, { profile, command: () => Buffer.from("libicu => not found") }), /dependencies/);
  fs.mkdirSync(path.join(root, "Assets")); assert.throws(() => verifyRimworldInstallation(root, options), /custom/); fs.rmdirSync(path.join(root, "Assets"));
  const license = path.join(root, "UPSTREAM-LICENSE"); fs.writeFileSync(license, "modified license"); assert.throws(() => verifyRimworldInstallation(root, options), /license/);
  fs.unlinkSync(license); fs.linkSync(path.join(root, "RTServer"), license); assert.throws(() => verifyRimworldInstallation(root, options), /unsafe/);
});
test("failed source builds preserve staged engine bytes and reject arbitrary paths", async t => {
  const { root } = fixture(t), stage = path.join(root, `.pb-update-rimworld-together-${randomUUID()}`); fs.mkdirSync(stage); fs.writeFileSync(path.join(stage, "RTServer"), "original");
  await assert.rejects(stageRimworldRelease(stage, { verify: () => {}, run: async (_exe, args) => {
    assert.equal(args[1], stage + "-source"); fs.mkdirSync(args[1]); throw new Error("RimWorld build refused");
  } }), /refused/);
  assert.equal(fs.readFileSync(path.join(stage, "RTServer"), "utf8"), "original"); assert.equal(fs.existsSync(stage + "-source"), false);
  await assert.rejects(stageRimworldRelease(root, { verify: assert.fail, run: assert.fail }), /worker directory/);
});
test("RimWorld source extraction and bridge hooks reject unreviewed input", { skip: process.platform !== "linux" }, () => {
  execFileSync("/usr/bin/python3", [fileURLToPath(new URL("./rimworldSourceBuild.test.py", import.meta.url))], { timeout: 10000, stdio: "pipe" });
});
