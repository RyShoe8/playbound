import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { appImageOffset } from "./openraUpdates.js";
import { readRelease, downloadAsset } from "./githubReleaseAssets.js";

const BINARY = "OpenHV.Server";
const MARKER = ".pb-openhv-release.json";
// Official GitHub release digest, independently matched to the VPS installation.
const LEGACY = { buildId: "20250725", size: 144714232, digest: "sha256:01b1bf1cf86500f61d833e22055a035e56d07b3ddbc83b91446d684b35921aa3" };
const cache = new Map();
function regular(root, name) {
  const filename = path.join(root, name), stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error("OpenHV requires regular, unshared installation files");
  return { filename, stat };
}
function metadata(root) {
  if (!fs.existsSync(path.join(root, MARKER))) return LEGACY;
  const { filename, stat } = regular(root, MARKER);
  if (stat.size > 4096) throw new Error("OpenHV release record is too large");
  const value = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (value.version !== 1 || !/^\d{8}$/.test(value.buildId) || !/^sha256:[a-f0-9]{64}$/.test(value.digest)
    || !Number.isSafeInteger(value.size) || value.size < 1 || value.size > 256 * 1024 ** 2) throw new Error("OpenHV release record is invalid");
  return value;
}
export function verifyOpenHVInstallation(root) {
  const directory = fs.lstatSync(root);
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error("OpenHV installation must be a real directory");
  if (fs.readdirSync(root).some((name) => ![BINARY, MARKER].includes(name))) throw new Error("OpenHV custom installation files require review before updating");
  const record = metadata(root), { filename, stat } = regular(root, BINARY);
  fs.accessSync(filename, fs.constants.X_OK);
  if (stat.size !== record.size) throw new Error("OpenHV installed size differs from its official release");
  const signature = JSON.stringify([stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs, stat.mode, record.digest]);
  if (cache.get(filename) !== signature) {
    const hash = createHash("sha256"), fd = fs.openSync(filename, "r"), buffer = Buffer.alloc(1024 ** 2);
    try { let count; while ((count = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, count)); }
    finally { fs.closeSync(fd); }
    if (`sha256:${hash.digest("hex")}` !== record.digest) throw new Error("OpenHV installation differs from its verified official release");
    appImageOffset(filename);
    if (cache.size >= 32) cache.clear();
    cache.set(filename, signature);
  }
  return { buildId: record.buildId };
}

// Preserve the existing AppImage launch format. No downloaded program is run
// during preparation: unsquashfs reads only two bounded metadata files.
export async function stageOpenHVRelease(stage, { run, request = fetch, diskCheck = () => {} }) {
  if (!/^\.pb-update-openhv-[a-f0-9-]{36}$/.test(path.basename(stage))) throw new Error("OpenHV updates require an isolated worker staging directory");
  verifyOpenHVInstallation(stage);
  const signal = AbortSignal.timeout(5 * 60_000);
  const release = await readRelease("OpenHV/OpenHV", { request, signal, label: "OpenHV" });
  if (release.draft !== false || release.prerelease !== false || !/^\d{8}$/.test(release.tag_name)) throw new Error("OpenHV requires an official stable release");
  const name = `OpenHV-${release.tag_name}-x86_64.AppImage`;
  const assets = release.assets?.filter((asset) => asset.name === name);
  if (assets?.length !== 1 || assets[0].browser_download_url !== `https://github.com/OpenHV/OpenHV/releases/download/${release.tag_name}/${name}`) throw new Error("OpenHV release asset is missing or unofficial");
  const asset = assets[0], temporary = path.join(stage, ".pb-openhv-download");
  await downloadAsset(asset, temporary, { request, signal, diskCheck, label: "OpenHV" });
  const offset = String(appImageOffset(temporary));
  const read = (file, maxOutput) => run("/usr/bin/unsquashfs", ["-cat", "-o", offset, temporary, `usr/lib/openhv/${file}`], { root: stage, timeout: 30_000, maxOutput });
  const engine = (await read("VERSION", 128)).trim();
  const mod = await read("mods/hv/mod.yaml", 256 * 1024);
  if (!/^release-\d{8}$/.test(engine) || !new RegExp(`^\\s+Version: ${release.tag_name}\\r?$`, "m").test(mod)) throw new Error("OpenHV embedded game version differs from its release");
  diskCheck();
  fs.chmodSync(temporary, 0o755);
  fs.renameSync(temporary, path.join(stage, BINARY));
  fs.writeFileSync(path.join(stage, MARKER), JSON.stringify({ version: 1, buildId: release.tag_name, digest: asset.digest, size: asset.size }), { mode: 0o600 });
  return verifyOpenHVInstallation(stage);
}
