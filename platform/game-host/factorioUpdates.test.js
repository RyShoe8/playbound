import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { prepareFactorioRelease, stageFactorioRelease, verifyFactorioInstallation } from "./factorioUpdates.js";
const archive = Buffer.from("fixture official package");
const sha = createHash("sha256").update(archive).digest("hex");
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pb-factorio-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function payload(destination, version = "2.0.77") {
  fs.mkdirSync(path.join(destination, "bin/x64"), { recursive: true });
  fs.mkdirSync(path.join(destination, "data/base"), { recursive: true });
  const elf = Buffer.alloc(64); elf.writeUInt32BE(0x7f454c46); elf[4] = 2; elf[5] = 1; elf.writeUInt16LE(62, 18);
  fs.writeFileSync(path.join(destination, "bin/x64/factorio"), elf, { mode: 0o755 });
  fs.writeFileSync(path.join(destination, "data/base/info.json"), JSON.stringify({ version }));
}
const verify = root => verifyFactorioInstallation(root, { command: (_binary, args, options) => {
  assert.deepEqual(args, ["--version"]);
  assert.equal(options.env.HOME, "/nonexistent");
  assert.deepEqual(Object.keys(options.env).sort(), ["HOME", "LANG", "PATH"]);
  const version = JSON.parse(fs.readFileSync(path.join(root, "data/base/info.json"))).version;
  return Buffer.from(`Version: ${version} (build 1, linux64, headless)\n`);
} });
function network({ version = "2.0.77", sums = `${sha}  factorio-headless_linux_${version}.tar.xz\n`, bytes = archive, redirect } = {}) {
  return async url => {
    if (url.endsWith("latest-releases")) return new Response(JSON.stringify({ stable: { headless: version }, experimental: { headless: "9.9.9" } }));
    if (url.endsWith("sha256sums/")) return new Response(sums);
    if (redirect) return new Response(null, { status: 302, headers: { location: redirect } });
    assert.equal(url, `https://factorio.com/get-download/${version}/headless/linux64`);
    return new Response(bytes);
  };
}
function options(overrides = {}) {
  return { request: network(), verify, run: async (command, args) => {
    assert.equal(command, "/usr/bin/python3");
    assert.ok(args[0].endsWith("factorioArchive.py"));
    assert.deepEqual(fs.readFileSync(args[1]), archive);
    payload(args[2]);
  }, ...overrides };
}
test("official stable checksum is verified before extraction and executable validation", async t => {
  const destination = path.join(fixture(t), "official");
  assert.equal((await prepareFactorioRelease(destination, options())).buildId, "2.0.77");
  assert.equal(verify(destination).buildId, "2.0.77");
  fs.writeFileSync(path.join(destination, "bin/x64/factorio"), Buffer.alloc(64));
  assert.throws(() => verify(destination), /differs/);
});
test("tampered, truncated, missing or duplicate checksums fail without execution", async t => {
  const root = fixture(t);
  for (const request of [network({ bytes: Buffer.from("tampered") }), network({ bytes: Buffer.alloc(0) }), network({ sums: "" }), network({ sums: `${sha}  factorio-headless_linux_2.0.77.tar.xz\n`.repeat(2) }), network({ version: "../../secret" })]) {
    const destination = path.join(root, randomUUID());
    await assert.rejects(prepareFactorioRelease(destination, options({ request, run: assert.fail, verify: assert.fail })));
    assert.equal(fs.existsSync(destination), false);
    assert.equal(fs.existsSync(`${destination}.tar.xz`), false);
  }
});
test("redirects, metadata and disk safety fail closed", async t => {
  const root = fixture(t);
  for (const redirect of ["http://factorio.com/file", "https://evil.test/file", "https://user:password@factorio.com/file", "https://factorio.com:4430/file"]) {
    await assert.rejects(prepareFactorioRelease(path.join(root, randomUUID()), options({ request: network({ redirect }), run: assert.fail })), /trusted/);
  }
  await assert.rejects(prepareFactorioRelease(path.join(root, randomUUID()), options({ request: async () => new Response("x".repeat(1024 ** 2 + 1)), run: assert.fail })), /size limit/);
  const destination = path.join(root, randomUUID());
  await assert.rejects(prepareFactorioRelease(destination, options({ diskCheck: () => { throw new Error("Disk headroom"); }, run: assert.fail })), /headroom/);
  assert.equal(fs.existsSync(`${destination}.tar.xz`), false);
});
test("custom installations, hard links and executable/data version mismatch cannot validate", async t => {
  const root = path.join(fixture(t), "official");
  await prepareFactorioRelease(root, options());
  fs.writeFileSync(path.join(root, "custom.cfg"), "custom configuration");
  assert.throws(() => verify(root), /custom or missing/);
  fs.unlinkSync(path.join(root, "custom.cfg"));
  const binary = path.join(root, "bin/x64/factorio");
  fs.linkSync(binary, path.join(fixture(t), "linked"));
  assert.throws(() => verify(root), /links/);
});
test("missing baselines and incompatible headless versions never start an unverified executable", async t => {
  const root = path.join(fixture(t), "official");
  payload(root);
  assert.throws(() => verifyFactorioInstallation(root, { command: assert.fail }));
  fs.rmSync(root, { recursive: true });
  await prepareFactorioRelease(root, options());
  assert.throws(() => verifyFactorioInstallation(root, { command: () => Buffer.from("Version: 2.0.76 (build 1, linux64, headless)") }), /version or runtime/);
  const marker = path.join(root, ".pb-factorio-release.json"), record = JSON.parse(fs.readFileSync(marker));
  record.buildId = "2.0.78"; fs.writeFileSync(marker, JSON.stringify(record));
  assert.throws(() => verifyFactorioInstallation(root, { command: assert.fail }), /data version/);
});
test("staged updates reject downgrade and preserve original installation on download failure", async t => {
  const root = fixture(t), stage = path.join(root, `.pb-update-factorio-${randomUUID()}`);
  await prepareFactorioRelease(stage, options());
  await assert.rejects(stageFactorioRelease(stage, options({ request: network({ bytes: Buffer.from("wrong") }) })), /SHA-256/);
  assert.equal(verify(stage).buildId, "2.0.77");
  await assert.rejects(stageFactorioRelease(stage, options({ request: network({ version: "2.0.76" }), run: async (_command, args) => payload(args[2], "2.0.76") })), /downgrade/);
  assert.equal(verify(stage).buildId, "2.0.77");
  assert.equal((await stageFactorioRelease(stage, options())).buildId, "2.0.77");
});
test("bounded extraction rejects traversal, symlinks and duplicate files", { skip: process.platform !== "linux" }, t => {
  const root = fixture(t), helper = fileURLToPath(new URL("./factorioArchive.py", import.meta.url));
  for (const kind of ["traversal", "symlink", "duplicate"]) {
    const bundle = path.join(root, `${kind}.tar.xz`);
    execFileSync("/usr/bin/python3", ["-c", "import tarfile,io,sys\nwith tarfile.open(sys.argv[1],'w:xz') as t:\n m=tarfile.TarInfo('factorio/../escape' if sys.argv[2]=='traversal' else 'factorio/bin/x64/factorio')\n m.size=1\n if sys.argv[2]=='symlink': m.type=tarfile.SYMTYPE; m.linkname='/etc/passwd'; m.size=0\n t.addfile(m,io.BytesIO(b'x'))\n if sys.argv[2]=='duplicate': t.addfile(m,io.BytesIO(b'x'))", bundle, kind]);
    assert.throws(() => execFileSync("/usr/bin/python3", [helper, bundle, path.join(root, kind)], { stdio: "pipe" }));
    assert.equal(fs.existsSync(path.join(root, "escape")), false);
  }
});
