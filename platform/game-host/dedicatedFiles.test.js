import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { manageDedicatedFiles, MAX_FILE_BYTES, MAX_TRANSFER_BYTES, FILE_CHUNK_BYTES } from "./dedicatedFiles.js";
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
test("generated engine credentials are neither listed nor downloadable", t => {
  const {run,root}=fixture(t);
  const names=["Commands.dat","dedicated-account.json","dedicated_cfg.txt","cluster.ini","serversettings.xml","server.cfg","playbound.cfg","ServerConfig.json"];
  for(const name of names)fs.writeFileSync(path.join(root,name),"fixture-private-value");
  assert.deepEqual(run({action:"list"}).entries.map(entry=>entry.name),["world.json"]);
  for(const name of names){
    assert.throws(()=>run({action:"read",path:name}));
    assert.throws(()=>run({action:"download",path:name}));
    assert.throws(()=>run({action:"write",path:name,expectedEtag:"",contentBase64:"e30="}));
  }
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

test("chunked saves replace atomically, retry safely, download and restore beyond the old limit", t => {
  const { run, root } = fixture(t);
  const original = run({ action: "stat", path: "world.json" });
  const bytes = Buffer.alloc(MAX_FILE_BYTES + 123, 42);
  const session = run({ action: "upload-begin", path: "world.json", actor: "owner", expectedEtag: original.etag, bytes: bytes.length });
  const request = { path: "world.json", actor: "owner", uploadId: session.uploadId };
  assert.throws(() => run({ ...request, action: "upload-commit" }), /incomplete/);
  for (let offset = 0; offset < bytes.length; offset += FILE_CHUNK_BYTES) {
    const chunk = { ...request, action: "upload-chunk", offset, contentBase64: bytes.subarray(offset, offset + FILE_CHUNK_BYTES).toString("base64") };
    run(chunk); run(chunk);
    assert.equal(fs.readFileSync(path.join(root, "world.json"), "utf8"), original.text);
  }
  run({ ...request, action: "upload-commit" });
  const info = run({ action: "stat", path: "world.json" });
  assert.equal(info.bytes, bytes.length);
  assert.equal(info.contentBase64, "");
  const chunks = [];
  for (let offset = 0; offset < info.bytes; offset += FILE_CHUNK_BYTES) chunks.push(Buffer.from(run({ action: "read-chunk", path: "world.json", offset, version: info.version }).contentBase64, "base64"));
  assert.deepEqual(Buffer.concat(chunks), bytes);
  run({ action: "delete", path: "world.json", expectedEtag: info.etag });
  const revision = run({ action: "history" }).history.find(item => item.bytes === bytes.length);
  run({ action: "restore", path: "world.json", revision: revision.id, expectedEtag: "" });
  assert.deepEqual(fs.readFileSync(path.join(root, "world.json")), bytes);
});

test("upload sessions cannot cross users, files, or servers and reject bad offsets and changed files", t => {
  const { run, home } = fixture(t);
  const before = run({ action: "stat", path: "world.json" });
  const session = run({ action: "upload-begin", path: "world.json", actor: "owner", expectedEtag: before.etag, bytes: 2 });
  const request = { path: "world.json", actor: "owner", uploadId: session.uploadId, action: "upload-chunk", offset: 0, contentBase64: "e30=" };
  assert.throws(() => run({ ...request, actor: "other" }), /another user/);
  assert.throws(() => run({ ...request, path: "other.json" }), /another user/);
  const other = "ffffffffffffffffffffffff";
  fs.mkdirSync(path.join(home, "luanti-servers", `pb-${other}`));
  assert.throws(() => manageDedicatedFiles(other, "luanti", request, home));
  assert.throws(() => run({ ...request, offset: 1 }), /Invalid upload chunk/);
  assert.throws(() => run({ ...request, offset: -1 }), /Invalid upload chunk/);
  run(request);
  assert.throws(() => run({ ...request, contentBase64: "W10=" }), /differs/);
  run({ action: "write", path: "world.json", expectedEtag: before.etag, contentBase64: "MQ==" });
  assert.throws(() => run({ ...request, action: "upload-commit" }), /changed/);
  assert.throws(() => run({ action: "read-chunk", path: "world.json", offset: 0, version: before.version }), /changed/);
  run({ ...request, action: "upload-cancel" });
  assert.equal(run({ action: "read", path: "world.json" }).text, "1");
});

test("upload lifetime, pending count, quota and transfer bounds stay bounded", t => {
  const { run, root } = fixture(t);
  const input = { action: "upload-begin", path: "new.dat", actor: "owner", expectedEtag: "", bytes: 2 };
  assert.throws(() => run({ ...input, bytes: MAX_TRANSFER_BYTES + 1 }), /maximum/);
  const first = run(input);
  const second = run(input);
  assert.throws(() => run(input), /Two uploads/);
  const folder = path.join(root, ".playbound-file-uploads", first.uploadId);
  const old = new Date(Date.now() - 61 * 60 * 1000);
  fs.utimesSync(folder, old, old);
  run({ action: "list" });
  assert.equal(fs.existsSync(folder), false);
  assert.throws(() => run({ ...input, action: "upload-commit", uploadId: first.uploadId }));
  run({ ...input, action: "upload-cancel", uploadId: second.uploadId });
  const session = run(input);
  t.mock.method(fs, "statfsSync", () => ({ bavail: 1, bsize: 4096, blocks: 1_000_000 }));
  assert.throws(() => run({ ...input, action: "upload-chunk", uploadId: session.uploadId, offset: 0, contentBase64: "e30=" }), /disk space/);
  assert.equal(fs.existsSync(path.join(root, "new.dat")), false);
});
