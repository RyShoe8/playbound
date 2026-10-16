import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { appImageOffset } from "./openraUpdates.js";

// Fixed caller-owned profiles; no HTTP request can supply paths or trusted hashes.
export function createVerifiedAppImageInstallation(profile) {
  const { label, binary: BINARY, marker: MARKER, legacy: LEGACY } = profile;
  const cache = new Map();
  function regular(root, name) {
    const filename = path.join(root, name), stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error(`${label} requires regular, unshared installation files`);
    return { filename, stat };
  }
  function metadata(root) {
    if (!fs.existsSync(path.join(root, MARKER))) return LEGACY;
    const { filename, stat } = regular(root, MARKER);
    if (stat.size > 4096) throw new Error(`${label} release record is too large`);
    const value = JSON.parse(fs.readFileSync(filename, "utf8"));
    if (value.version !== 1 || !profile.tag.test(value.buildId) || !/^sha256:[a-f0-9]{64}$/.test(value.digest)
      || !Number.isSafeInteger(value.size) || value.size < 1 || value.size > (profile.maximumBytes || 256 * 1024 ** 2)) throw new Error(`${label} release record is invalid`);
    return value;
  }
  function verifyInstallation(root) {
    const directory = fs.lstatSync(root);
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error(`${label} installation must be a real directory`);
    if (fs.readdirSync(root).some((name) => ![BINARY, MARKER].includes(name))) throw new Error(`${label} custom installation files require review before updating`);
    const record = metadata(root), { filename, stat } = regular(root, BINARY);
    fs.accessSync(filename, fs.constants.X_OK);
    if (stat.size !== record.size) throw new Error(`${label} installed size differs from its official release`);
    const signature = JSON.stringify([stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs, stat.mode, record.digest]);
    if (cache.get(filename) !== signature) {
      const hash = createHash("sha256"), fd = fs.openSync(filename, "r"), buffer = Buffer.alloc(1024 ** 2);
      try { let count; while ((count = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, count)); }
      finally { fs.closeSync(fd); }
      if (`sha256:${hash.digest("hex")}` !== record.digest) throw new Error(`${label} installation differs from its verified official release`);
      appImageOffset(filename);
      if (cache.size >= 32) cache.clear();
      cache.set(filename, signature);
    }
    return { buildId: record.buildId };
  }

  return verifyInstallation;
}
