import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { appImageOffset } from "./openraUpdates.js";
import { readRelease, downloadAsset } from "./githubReleaseAssets.js";

// Profiles are fixed in trusted source modules, never supplied by HTTP callers.
export function createOpenRaAppImageUpdater(profile) {
  const { label, key, binary: BINARY, marker: MARKER, legacy: LEGACY } = profile;
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
      || !Number.isSafeInteger(value.size) || value.size < 1 || value.size > 256 * 1024 ** 2) throw new Error(`${label} release record is invalid`);
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

  // Preserve the existing AppImage launch format. No downloaded program is run
  // during preparation: unsquashfs reads only two bounded metadata files.
  async function stageRelease(stage, { run, request = fetch, diskCheck = () => {} }) {
    if (!new RegExp(`^\\.pb-update-${key}-[a-f0-9-]{36}$`).test(path.basename(stage))) throw new Error(`${label} updates require an isolated worker staging directory`);
    verifyInstallation(stage);
    const signal = AbortSignal.timeout(5 * 60_000);
    const release = await readRelease(profile.repository, { request, signal, label });
    if (release.draft !== false || release.prerelease !== false || !profile.tag.test(release.tag_name)) throw new Error(`${label} requires an official stable release`);
    const name = `${profile.assetPrefix}-${release.tag_name}-x86_64.AppImage`;
    const assets = release.assets?.filter((asset) => asset.name === name);
    if (assets?.length !== 1 || assets[0].browser_download_url !== `https://github.com/${profile.repository}/releases/download/${release.tag_name}/${name}`) throw new Error(`${label} release asset is missing or unofficial`);
    const asset = assets[0], temporary = path.join(stage, `.pb-${key}-download`);
    await downloadAsset(asset, temporary, { request, signal, diskCheck, label });
    const offset = String(appImageOffset(temporary));
    const read = (file, maxOutput) => run("/usr/bin/unsquashfs", ["-cat", "-o", offset, temporary, `${profile.archiveRoot}/${file}`], { root: stage, timeout: 30_000, maxOutput });
    const engine = (await read("VERSION", 128)).trim();
    const mod = await read(`mods/${profile.mod}/mod.yaml`, 256 * 1024);
    if (!profile.engine.test(engine) || !new RegExp(`^\\s+Version: ${release.tag_name}\\r?$`, "m").test(mod)) throw new Error(`${label} embedded game version differs from its release`);
    diskCheck();
    fs.chmodSync(temporary, 0o755);
    fs.renameSync(temporary, path.join(stage, BINARY));
    fs.writeFileSync(path.join(stage, MARKER), JSON.stringify({ version: 1, buildId: release.tag_name, digest: asset.digest, size: asset.size }), { mode: 0o600 });
    return verifyInstallation(stage);
  }

  return { verifyInstallation, stageRelease };
}
