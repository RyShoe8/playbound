import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { verifyUnvanquishedInstallation, validateUnvanquishedOverrides, stageUnvanquishedRelease } from "./unvanquishedUpdates.js";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-unvanquished-"));t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const stage = path.join(root, `.pb-update-unvanquished-${randomUUID()}`);fs.mkdirSync(path.join(stage, "pkg"), { recursive: true });
  const data = Buffer.alloc(32); data.write("\x7fELF"); data[4] = 2; data.writeUInt16LE(62, 18);
  const files = {};
  for (const name of ["daemonded", "nacl_loader", "pkg/unvanquished_1.0.0.dpk"]) {
    fs.writeFileSync(path.join(stage, name), data, { mode: 0o755 }); files[name] = { bytes: data.length, sha256: createHash("sha256").update(data).digest("hex"), executable: !name.startsWith("pkg/") };
  }
  const options = { profiles: { "1.0.0": { files } }, command: () => Buffer.from("libc.so.6 => /lib/libc.so.6") };
  return { root, stage, options };
}
test("native engine, sandbox and DPK bytes must match one compatible release", (t) => {
  const f = fixture(t); assert.equal(verifyUnvanquishedInstallation(f.stage, f.options).buildId, "1.0.0");
  fs.writeFileSync(path.join(f.stage, "pkg/unvanquished_2.0.0.dpk"), "another module");
  assert.throws(() => verifyUnvanquishedInstallation(f.stage, f.options), /mixed or unreviewed/);
  fs.unlinkSync(path.join(f.stage, "pkg/unvanquished_2.0.0.dpk"));
  fs.writeFileSync(path.join(f.stage, "nacl_loader"), Buffer.alloc(32));
  assert.throws(() => verifyUnvanquishedInstallation(f.stage, f.options), /differ from the reviewed/);
});
test("global data overrides block updates rather than silently selecting an incompatible module", (t) => {
  const f = fixture(t), home = path.join(f.root, "home"), packages = path.join(home, ".local/share/unvanquished/pkg");
  validateUnvanquishedOverrides(home);fs.mkdirSync(packages, { recursive: true });fs.writeFileSync(path.join(packages, "override.dpk"), "custom");
  assert.throws(() => validateUnvanquishedOverrides(home), /overrides require operator review/);
});
test("untrusted redirects and changed downloads preserve the staged game and clean temporary files", async (t) => {
  const f = fixture(t), verify = () => ({ buildId: "0.55.3" });
  await assert.rejects(stageUnvanquishedRelease(f.stage, { verify, request: async (_url, options) => {
    assert.equal(options.followRedirects, false);
    return { statusCode: 302, headers: { location: "https://untrusted.test/game.zip" }, stream: Readable.from([]) };
  } }), /untrusted/);
  await assert.rejects(stageUnvanquishedRelease(f.stage, { verify, request: async () => ({ statusCode: 200, stream: Readable.from([Buffer.from("invalid archive")]) }) }), /SHA-256/);
  assert.ok(fs.existsSync(path.join(f.stage, "daemonded")));assert.ok(!fs.existsSync(path.join(f.stage, ".pb-unvanquished-download")));
});
test("bounded nested ZIP extraction refuses changed, duplicate and unsafe entries", { skip: process.platform !== "linux" }, () => {
  execFileSync("/usr/bin/python3", [fileURLToPath(new URL("./unvanquishedArchive.test.py", import.meta.url))], { timeout: 30_000, maxBuffer: 8192 });
});
