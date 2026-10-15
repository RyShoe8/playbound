import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verifyTerrariaInstallation, stageTerrariaRelease } from "./terrariaUpdates.js";
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-terraria-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function install(root) {
  const directory = path.join(root, "1458/Linux"); fs.mkdirSync(directory, { recursive: true });
  const elf = Buffer.alloc(64); elf.writeUInt32BE(0x7f454c46); elf[4] = 2; elf[5] = 1; elf.writeUInt16LE(62, 18);
  const expected = {};
  for (const [name, bytes] of [["TerrariaServer.bin.x86_64", elf], ["TerrariaServer.exe", Buffer.from("managed assembly")], ["mscorlib.dll", Buffer.from("managed runtime")]]) {
    fs.writeFileSync(path.join(directory, name), bytes, { mode: 0o755 });
    expected[name] = { size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  }
  return { directory, expected };
}
test("offline validation checks all package hashes before runtime dependencies", t => {
  const root = fixture(t), { directory, expected } = install(root);
  const command = (_exe, args, opts) => { assert.ok(args[0].endsWith("TerrariaServer.bin.x86_64")); assert.deepEqual(Object.keys(opts.env).sort(), ["LANG", "LD_LIBRARY_PATH", "PATH"]); return Buffer.from("libc.so.6 => /lib/libc.so.6 (0x123)\n"); };
  assert.equal(verifyTerrariaInstallation(root, { expected, command }).buildId, "1.4.5.8");
  fs.writeFileSync(path.join(directory, "TerrariaServer.exe"), "managed assemblz");
  assert.throws(() => verifyTerrariaInstallation(root, { expected, command: assert.fail }), /differ/);
});
test("missing libraries, custom files, hard links and linked roots are rejected", t => {
  const root = fixture(t), { directory, expected } = install(root);
  assert.throws(() => verifyTerrariaInstallation(root, { expected, command: () => Buffer.from("libSDL.so => not found") }), /dependencies/);
  fs.writeFileSync(path.join(directory, "custom.cfg"), "private settings");
  assert.throws(() => verifyTerrariaInstallation(root, { expected, command: assert.fail }), /custom/);
  fs.unlinkSync(path.join(directory, "custom.cfg"));
  const linked = path.join(fixture(t), "linked.exe"); fs.linkSync(path.join(directory, "TerrariaServer.exe"), linked);
  assert.throws(() => verifyTerrariaInstallation(root, { expected, command: assert.fail }), /links/);
  fs.unlinkSync(linked);
  try { fs.renameSync(path.join(root, "1458"), path.join(root, "real")); fs.symlinkSync(path.join(root, "real"), path.join(root, "1458"), "junction"); }
  catch (error) { if (error.code === "EPERM") return; throw error; }
  assert.throws(() => verifyTerrariaInstallation(root, { expected, command: assert.fail }), /real directories/);
});
test("unreviewed downloads never extract or replace even staging files", async t => {
  const stage = path.join(fixture(t), `.pb-update-terraria-${randomUUID()}`);
  const { directory } = install(stage);
  const before = fs.readFileSync(path.join(directory, "TerrariaServer.exe"));
  await assert.rejects(stageTerrariaRelease(stage, { verify: () => ({ buildId: "1.4.5.8" }), request: async (url, opts) => {
    assert.equal(url, "https://terraria.org/api/download/pc-dedicated-server/terraria-server-1458.zip");
    assert.equal(opts.redirect, "error"); return new Response("unexpected package");
  }, run: assert.fail }), /SHA-256/);
  assert.deepEqual(fs.readFileSync(path.join(directory, "TerrariaServer.exe")), before);
  assert.equal(fs.existsSync(path.join(stage, ".pb-terraria-download")), false);
});
test("bounded ZIP extraction rejects traversal, symlinks, duplicates and oversized entries", { skip: process.platform !== "linux" }, t => {
  const root = fixture(t), helper = fileURLToPath(new URL("./terrariaArchive.py", import.meta.url));
  for (const kind of ["traversal", "symlink", "duplicate", "oversized"]) {
    const zip = path.join(root, `${kind}.zip`);
    execFileSync("/usr/bin/python3", ["-c", "import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1],'w',compression=zipfile.ZIP_DEFLATED) as z:\n i=zipfile.ZipInfo('1458/Linux/../../escape' if sys.argv[2]=='traversal' else '1458/Linux/TerrariaServer.bin.x86_64')\n if sys.argv[2]=='symlink': i.external_attr=0o120777<<16\n z.writestr(i,b'x' if sys.argv[2]!='oversized' else b'x'*(64*1024**2+1),compress_type=zipfile.ZIP_DEFLATED)\n if sys.argv[2]=='duplicate': z.writestr(i,b'x')", zip, kind], { stdio: "pipe" });
    assert.throws(() => execFileSync("/usr/bin/python3", [helper, zip, path.join(root, kind)], { stdio: "pipe" }));
    assert.equal(fs.existsSync(path.join(root, "escape")), false);
  }
});
