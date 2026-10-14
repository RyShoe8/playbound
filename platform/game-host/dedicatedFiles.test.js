import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { manageDedicatedFiles, MAX_FILE_BYTES } from "./dedicatedFiles.js";
const id = "0123456789abcdef01234567";
function fixture(t) {
  t.mock.method(fs, "statfsSync", () => ({ bavail: 10_000_000, bsize: 4096, blocks: 20_000_000 }));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pb-files-"));
  assert.equal(path.dirname(home), path.resolve(os.tmpdir()));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const root = path.join(home, "luanti-servers", `pb-${id}`);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, "world.json"), '{"day":1}');
  return { home, root, run: body => manageDedicatedFiles(id, "luanti", body, home) };
}
test("browse, download, optimistic edits, delete and restore stay in one customer's data", t => {
  const { run } = fixture(t);
  assert.equal(run({ action: "list" }).entries[0].name, "world.json");
  const first = run({ action: "read", path: "world.json" });
  assert.equal(first.text, '{"day":1}');
  assert.throws(() => run({ action: "write", path: "world.json", contentBase64: "e30=", expectedEtag: "wrong" }), /changed/);
  const saved = run({ action: "write", path: "world.json", contentBase64: "e30=", expectedEtag: first.etag });
  assert.equal(run({ action: "read", path: "world.json" }).text, "{}");
  const revision = run({ action: "history" }).history[0];
  run({ action: "delete", path: "world.json", expectedEtag: saved.etag });
  assert.equal(run({ action: "list" }).entries.length, 0);
  run({ action: "restore", path: "world.json", revision: revision.id, expectedEtag: "" });
  assert.equal(run({ action: "read", path: "world.json" }).text, first.text);
});
test("rejects traversal, secrets, executable code, other servers and malformed uploads", t => {
  const { run } = fixture(t);
  for (const name of ["../world.json", "/etc/passwd", "C:\\world.json", "%2e%2e/world.json", ".env", "gslt.txt", "rcon.cfg", "plugins/payload.json", "mods/a.zip", "evil.js", "evil.jar", "evil.sh"]) {
    assert.throws(() => run({ action: "write", path: name, expectedEtag: "", contentBase64: "e30=" }));
  }
  assert.throws(() => run({ action: "write", path: "new.json", expectedEtag: "", contentBase64: "!invalid" }), /Invalid/);
  assert.throws(() => run({ action: "restore", path: "world.json", revision: "../" }), /Invalid/);
});
test("rejects linked roots, files, directories, and hard links", t => {
  const { run, home, root } = fixture(t);
  const outside = path.join(home, "outside.json"); fs.writeFileSync(outside, "private");
  fs.linkSync(outside, path.join(root, "hard.json"));
  assert.throws(() => run({ action: "read", path: "hard.json" }), /Links/);
  try { fs.symlinkSync(outside, path.join(root, "link.json")); }
  catch (error) { if (error.code === "EPERM") { t.diagnostic("Windows disallows symbolic links for this test user; hard-link guard verified"); return; } throw error; }
  assert.throws(() => run({ action: "read", path: "link.json" }), /Links/);
  fs.symlinkSync(path.join(home, "missing"), path.join(root, "dangling.json"));
  assert.throws(() => run({ action: "write", path: "dangling.json", expectedEtag: "", contentBase64: "" }), /Links/);
  assert.deepEqual(run({ action: "list" }).entries.map(e => e.name), ["world.json"]);
  fs.mkdirSync(path.join(home, "outside-folder"));
  fs.symlinkSync(path.join(home, "outside-folder"), path.join(root, "linked-folder"), "junction");
  assert.throws(() => run({ action: "list", path: "linked-folder" }), /Links/);
  fs.renameSync(root, `${root}-real`);
  fs.symlinkSync(`${root}-real`, root, "junction");
  assert.throws(() => run({ action: "list" }), /Links/);
});
test("file and history limits remain bounded", t => {
  const { run, root } = fixture(t);
  fs.writeFileSync(path.join(root, "big.dat"), Buffer.alloc(MAX_FILE_BYTES + 1));
  assert.throws(() => run({ action: "read", path: "big.dat" }), /limit/);
  for (let i = 0; i < 55; i++) {
    const current = run({ action: "read", path: "world.json" });
    run({ action: "write", path: "world.json", expectedEtag: current.etag, contentBase64: Buffer.from(String(i)).toString("base64") });
  }
  assert.equal(run({ action: "history" }).history.length, 50);
  assert.throws(() => run({ action: "write", path: "new.json", contentBase64: "e30=" }), /changed/);
});
test("disk safety fails closed without changing the file", t => {
  const { run } = fixture(t), before = run({ action: "read", path: "world.json" });
  t.mock.method(fs, "statfsSync", () => ({ bavail: 1, bsize: 4096, blocks: 1_000_000 }));
  assert.throws(() => run({ action: "write", path: "world.json", expectedEtag: before.etag, contentBase64: "e30=" }), /disk space/);
  assert.equal(run({ action: "read", path: "world.json" }).etag, before.etag);
});
test("supports the full advertised transfer size without a large-input regex failure", t => {
  const { run } = fixture(t);
  run({ action: "write", path: "largest.dat", expectedEtag: "", contentBase64: Buffer.alloc(MAX_FILE_BYTES, 42).toString("base64") });
  assert.equal(run({ action: "read", path: "largest.dat" }).bytes, MAX_FILE_BYTES);
  assert.throws(() => run({ action: "write", path: "large.dat", expectedEtag: "", contentBase64: "A".repeat(4 * 1024 ** 2 + 4) }), /oversized/);
});
