import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validInstallationComponent, verifyReviewedComponent, stageReviewedComponent, REVIEWED_COMPONENTS } from "./reviewedComponentUpdates.js";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-component-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const stage = path.join(root, `.pb-update-morrowind-${randomUUID()}`); fs.mkdirSync(stage);
  const data = Buffer.alloc(32); data.write("\x7fELF"); data[4] = 2; data[5] = 1; data.writeUInt16LE(62, 18);
  fs.writeFileSync(path.join(stage, "tes3mp-server.x86_64"), data, { mode: 0o755 });
  return { root, stage, data, profile: { ...REVIEWED_COMPONENTS.morrowind, bytes: 32, sha256: createHash("sha256").update(data).digest("hex") } };
}

test("component names admit native filenames without admitting paths, traversal or hidden files", () => {
  for (const name of ["tes3mp-server.x86_64", "rvgl.64", "bf1942_lnxded.static", "bin_unix"]) assert.equal(validInstallationComponent(name), true);
  for (const name of [".", "..", "../world", "/world", "dir/file", "dir\\file", ".hidden", "bad\nname"]) assert.equal(validInstallationComponent(name), false);
});

test("component verification rejects modified engines and preserves unrelated saved data", (t) => {
  const f = fixture(t); fs.writeFileSync(path.join(f.stage, "world.json"), "save");
  assert.deepEqual(verifyReviewedComponent(f.stage, "morrowind", { profile: f.profile }), { buildId: "0.8.1" });
  fs.writeFileSync(path.join(f.stage, "tes3mp-server.x86_64"), Buffer.alloc(32));
  assert.throws(() => verifyReviewedComponent(f.stage, "morrowind", { profile: f.profile }), /checksum/);
  assert.equal(fs.readFileSync(path.join(f.stage, "world.json"), "utf8"), "save");
});

test("download rejects redirect credential leaks, changed archives and oversize bodies before replacing the engine", async (t) => {
  const f = fixture(t), verify = () => ({ buildId: "fixture" });
  for (const location of ["https://evil.test/game", "https://user:secret@rvgl.org/game", "http://rvgl.org/game"]) {
    await assert.rejects(stageReviewedComponent(f.stage, "morrowind", { verify, request: async () => ({ statusCode: 302, headers: { location }, stream: Readable.from([]) }) }), /untrusted/);
  }
  for (const data of [Buffer.from("bad"), Buffer.alloc(8)]) {
    await assert.rejects(stageReviewedComponent(f.stage, "morrowind", { verify, profile: { ...f.profile, archiveBytes: 4 }, request: async () => ({ statusCode: 200, stream: Readable.from([data]) }) }), /SHA-256|size limit/);
  }
  assert.deepEqual(fs.readFileSync(path.join(f.stage, "tes3mp-server.x86_64")), f.data);
  assert.ok(!fs.existsSync(path.join(f.stage, ".reviewed-download")));
});

test("staging validates downloaded and extracted bytes without touching saved data", async (t) => {
  const f = fixture(t), archive = Buffer.from("reviewed archive"), profile = { ...f.profile, archiveBytes: archive.length, archiveSha256: createHash("sha256").update(archive).digest("hex") };
  fs.writeFileSync(path.join(f.stage, "world.json"), "save");
  await stageReviewedComponent(f.stage, "morrowind", { profile, verify: (root, key) => verifyReviewedComponent(root, key, { profile }), request: async (_url, options) => {
    assert.equal(options.followRedirects, false); return { statusCode: 200, stream: Readable.from([archive]) };
  }, run: async (command, args) => {
    assert.equal(command, "/usr/bin/python3"); assert.equal(args[1], "morrowind"); fs.writeFileSync(args[3], f.data, { mode: 0o755 });
  } });
  assert.equal(fs.readFileSync(path.join(f.stage, "world.json"), "utf8"), "save");
});

test("archive reader rejects duplicate, special and changed members", { skip: process.platform !== "linux" }, () => {
  execFileSync("/usr/bin/python3", [fileURLToPath(new URL("./reviewedComponentArchive.test.py", import.meta.url))], { timeout: 30_000, maxBuffer: 8192 });
});
