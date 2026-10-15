import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verifyEtlegacyInstallation, etlegacyInventory, etlegacyTreeDigest, stageEtlegacyRelease } from "./etlegacyUpdates.js";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-etlegacy-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const stage = path.join(root, `.pb-update-wolfenstein-enemy-territory-${randomUUID()}`);
  for (const name of ["etlded.x86_64", "legacy/qagame.mp.x86_64.so", "legacy/tvgame.mp.x86_64.so", "legacy/omni-bot/omnibot_et.x86_64.so", "licenses/COPYING"]) {
    const filename = path.join(stage, name); fs.mkdirSync(path.dirname(filename), { recursive: true });
    const data = Buffer.alloc(32); data.write("\x7fELF"); data[4] = 2; data.writeUInt16LE(62, 18);
    fs.writeFileSync(filename, data, { mode: 0o755 });
  }
  const files = etlegacyInventory(stage);
  const options = { profiles: { "fixture-version": { fileCount: files.length, treeSha256: etlegacyTreeDigest(files) } }, command: () => Buffer.from("libc.so.6 => /lib/libc.so.6") };
  return { root, stage, options };
}
test("ET Legacy verifies the engine/mod/bot package together and rejects custom modifications", (t) => {
  const f = fixture(t); assert.equal(verifyEtlegacyInstallation(f.stage, f.options).buildId, "fixture-version");
  fs.appendFileSync(path.join(f.stage, "legacy/qagame.mp.x86_64.so"), "custom-modification");
  assert.throws(() => verifyEtlegacyInstallation(f.stage, f.options), /differs from the reviewed/);
});
test("missing native libraries refuse activation even with approved package bytes", (t) => {
  const f = fixture(t);
  assert.throws(() => verifyEtlegacyInstallation(f.stage, { ...f.options, command: () => Buffer.from("libcurl.so.4 => not found") }), /libraries are missing/);
});
test("unverified downloads leave current package and customer configs untouched", async (t) => {
  const f = fixture(t), config = path.join(f.stage, "server.cfg"); fs.writeFileSync(config, "customer-settings");
  await assert.rejects(stageEtlegacyRelease(f.stage, { verify: () => ({ buildId: "2.85.0" }), request: async () => ({ statusCode: 200, stream: Readable.from([Buffer.from("bad archive")]) }), run: async () => { throw new Error("extract must not run"); } }), /SHA-256/);
  assert.equal(fs.readFileSync(config, "utf8"), "customer-settings");
  assert.ok(!fs.existsSync(path.join(f.stage, ".pb-etlegacy-download")));
});
test("ET Legacy archive rejects links, traversal, duplicate files and changed bytes", { skip: process.platform !== "linux" }, () => {
  execFileSync("/usr/bin/python3", [fileURLToPath(new URL("./etlegacyArchive.test.py", import.meta.url))], { timeout: 30_000, maxBuffer: 8192 });
});
