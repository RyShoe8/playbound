import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verifyNativePackageInstallation, prepareNativePackage, stageNativePackageRelease, NATIVE_PACKAGE_PROFILES } from "./nativePackageUpdates.js";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-native-package-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bytes = Buffer.alloc(64); bytes.writeUInt32BE(0x7f454c46); bytes[4] = 2; bytes[5] = 1; bytes.writeUInt16LE(62, 18);
  const profile = { binary: "bzfs", binaryBytes: bytes.length, binarySha256: createHash("sha256").update(bytes).digest("hex"), version: "fixture" };
  fs.writeFileSync(path.join(root, profile.binary), bytes, { mode: 0o755 });
  return { root, profile, bytes };
}
const command = (_exe, _args, opts) => {
  assert.deepEqual(opts.env, { PATH: "/usr/bin:/bin", LANG: "C" });
  return Buffer.from("libc.so.6 => /lib/libc.so.6 (0x123)\n");
};
test("native validation checks exact reviewed bytes before loading dependencies", { skip: process.platform !== "linux" }, t => {
  const { root, profile, bytes } = fixture(t);
  assert.equal(verifyNativePackageInstallation(root, "bzflag", { profile, requireRoot: false, command }).buildId, "fixture");
  bytes[30] = 1; fs.writeFileSync(path.join(root, profile.binary), bytes);
  assert.throws(() => verifyNativePackageInstallation(root, "bzflag", { profile, requireRoot: false, command: assert.fail }), /differs/);
});
test("missing libraries, custom files and hardlinks fail closed", { skip: process.platform !== "linux" }, t => {
  const { root, profile } = fixture(t), options = { profile, requireRoot: false, command };
  assert.throws(() => verifyNativePackageInstallation(root, "bzflag", { ...options, command: () => Buffer.from("libmissing => not found") }), /dependencies/);
  fs.writeFileSync(path.join(root, "custom.cfg"), "settings");
  assert.throws(() => verifyNativePackageInstallation(root, "bzflag", options), /custom/);
  fs.unlinkSync(path.join(root, "custom.cfg"));
  const link = root + "-hardlink"; t.after(() => fs.rmSync(link, { force: true })); fs.linkSync(path.join(root, profile.binary), link);
  assert.throws(() => verifyNativePackageInstallation(root, "bzflag", options), /root-owned/);
});
test("native directories cannot be symlink aliases", t => {
  const { root, profile } = fixture(t), link = root + "-alias";
  t.after(() => fs.rmSync(link, { force: true }));
  try { fs.symlinkSync(root, link, "junction"); } catch (error) { if (error.code === "EPERM") return; throw error; }
  assert.throws(() => verifyNativePackageInstallation(link, "bzflag", { profile, requireRoot: false, command }), /real isolated/);
});
test("both fixed downloads reject unreviewed packages before extraction or promotion", async t => {
  for (const game of Object.keys(NATIVE_PACKAGE_PROFILES)) {
    const root = fixture(t).root + "-download"; t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    await assert.rejects(prepareNativePackage(root, game, { run: assert.fail, verify: assert.fail, request: async (url, opts) => {
      assert.equal(url, NATIVE_PACKAGE_PROFILES[game].url); assert.equal(opts.redirect, "error");
      return new Response("unreviewed package");
    } }), /SHA-256/);
    assert.deepEqual(fs.readdirSync(root), []);
  }
});
test("promotion never accepts caller-selected paths or unsupported games", async () => {
  for (const [stage, game] of [["/tmp/arbitrary", "bzflag"], ["/tmp/.pb-update-bzflag-not-a-uuid", "bzflag"], ["/tmp/anything", "custom"]]) {
    await assert.rejects(stageNativePackageRelease(stage, game, { run: assert.fail }), /reviewed worker/);
  }
});
test("real Debian extraction and root promotion reject unsafe fixtures", { skip: process.platform !== "linux" }, () => {
  execFileSync("/usr/bin/python3", [fileURLToPath(new URL("./nativePackageBoundary.test.py", import.meta.url))], { timeout: 30000, stdio: "pipe" });
});
