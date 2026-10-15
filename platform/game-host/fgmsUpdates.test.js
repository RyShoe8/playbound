import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { verifyFgmsInstallation, stageFgmsRelease } from "./fgmsUpdates.js";
import { recipes } from "./recipes.js";
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-fgms-update-")); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bytes = Buffer.alloc(64); bytes.writeUInt32BE(0x7f454c46); bytes[4] = 2; bytes[5] = 1; bytes.writeUInt16LE(62, 18);
  fs.writeFileSync(path.join(root, "fgms"), bytes, { mode: 0o755 });
  const profile = { binary: { bytes: 64, sha256: createHash("sha256").update(bytes).digest("hex") }, legacyBinary: { bytes: 1, sha256: "unused" }, version: "fixture" };
  return { root, bytes, profile };
}
test("fgms stays supervised and reserves its query port without a native admin listener", () => {
  const recipe = recipes.flightgear;
  assert.equal(recipe.protocol, "both"); assert.equal(recipe.portSpan, 2); assert.equal(recipe.portStride, 2);
  assert.deepEqual(recipe.args(5004), ["-p", "5004", "-a", "5005", "-b", "0", "-d"]);
  assert.ok(recipe.binaries.some(value => value.endsWith("/fgms")));
  assert.ok(!recipe.binaries.some(value => /(?:fgfs|flightgear)$/.test(value)));
});
test("native relay validation preserves logs but rejects changed engine bytes", { skip: process.platform !== "linux" }, t => {
  const { root, bytes, profile } = fixture(t);
  fs.writeFileSync(path.join(root, "fg_server.log"), "preserved log");
  const command = () => Buffer.from("libc.so.6 => /lib/libc.so.6 (0x123)\n");
  assert.equal(verifyFgmsInstallation(root, { profile, command }).buildId, "fixture");
  bytes[30] = 1; fs.writeFileSync(path.join(root, "fgms"), bytes);
  assert.throws(() => verifyFgmsInstallation(root, { profile, command: assert.fail }), /differs/);
  assert.equal(fs.readFileSync(path.join(root, "fg_server.log"), "utf8"), "preserved log");
});
test("failed or invalid source builds never replace the staged relay", async t => {
  const { root } = fixture(t), stage = path.join(root, `.pb-update-flightgear-${randomUUID()}`); fs.mkdirSync(stage); fs.writeFileSync(path.join(stage, "fgms"), "original");
  await assert.rejects(stageFgmsRelease(stage, { verify: () => {}, run: async (_exe, args) => {
    assert.equal(args[1], stage + "-source"); fs.mkdirSync(args[1]); throw new Error("FlightGear reviewed build refused");
  } }), /refused/);
  assert.equal(fs.readFileSync(path.join(stage, "fgms"), "utf8"), "original"); assert.equal(fs.existsSync(stage + "-source"), false);
  await assert.rejects(stageFgmsRelease(root, { verify: assert.fail, run: assert.fail }), /worker directory/);
});
