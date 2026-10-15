import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { readRelease, downloadAsset } from "./githubReleaseAssets.js";

const MARKER = ".pb-openra-manifest.json";
const PACKAGES = [["ra", "Red-Alert"], ["cnc", "Tiberian-Dawn"], ["d2k", "Dune-2000"]];
// Historical GitHub assets have no API digest. Downloaded from the official
// release and checked against each upstream .zsync SHA-1 on 2026-10-14.
const PINS = {
  "release-20250330": {
    ra: "3cb71c7428188c8526dd8916993fc16fa17ba5f28a35968a8267f3db9f2186fe",
    cnc: "b3d202d1bf701be5989c41c256d19bd2b1788694df01e343ade865cf1190706b",
    d2k: "7585986bf0cd488debaec3fadf853c1901003eff945dbad5de95b0b6bd781a67",
  },
};
const WRAPPER = '#!/usr/bin/env bash\ncd "$(dirname "$0")"\nexec ./OpenRA.Server "$@"\n';
function regular(root, name) {
  const filename = path.join(root, name), stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || fs.realpathSync(filename) !== path.join(fs.realpathSync(root), name)) throw new Error("OpenRA requires regular files inside its installation");
  return filename;
}
export function verifyOpenRAInstallation(root) {
  const versionFile = regular(root, "VERSION");
  if (fs.statSync(versionFile).size > 64) throw new Error("OpenRA version is invalid");
  const buildId = fs.readFileSync(versionFile, "utf8").trim();
  if (!/^release-\d{8}$/.test(buildId)) throw new Error("OpenRA stable release version is required");
  for (const file of ["OpenRA.Server", "OpenRA.Server.dll", "OpenRA.Game.dll", "libhostfxr.so", "libcoreclr.so"]) regular(root, file);
  fs.accessSync(path.join(root, "OpenRA.Server"), fs.constants.X_OK);
  for (const [mod] of PACKAGES) {
    const file = regular(root, `mods/${mod}/mod.yaml`);
    if (fs.statSync(file).size > 256 * 1024 || !new RegExp(`^\\s+Version: ${buildId}\\r?$`, "m").test(fs.readFileSync(file, "utf8"))) throw new Error("OpenRA official mod versions must match the engine");
  }
  return { buildId };
}

function inventory(root) {
  if (!fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink()) throw new Error("OpenRA installation root must be a real directory");
  const files = Object.create(null);let count = 0, size = 0;
  const walk = (directory, prefix = "") => {
    for (const name of fs.readdirSync(directory)) {
      const relative = prefix + name;
      if (relative === MARKER) continue;
      if (++count > 100_000) throw new Error("OpenRA installation has too many files");
      const filename = path.join(directory, name), stat = fs.lstatSync(filename);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && (!stat.isFile() || stat.nlink !== 1))) throw new Error("OpenRA custom links or special files require review");
      if (stat.isDirectory()) walk(filename, `${relative}/`);
      else {
        size += stat.size;
        if (size > 2 * 1024 ** 3 || stat.size > 512 * 1024 ** 2) throw new Error("OpenRA installation exceeds safe size limits");
        files[relative] = createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
      }
    }
  };
  walk(root);return files;
}
function sameFiles(left, right) {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].every((name) => left[name] === right[name]);
}
function baseline(root) {
  if (!fs.existsSync(path.join(root, MARKER))) throw new Error("OpenRA requires a reviewed installation baseline before updating");
  const filename = regular(root, MARKER);
  if (fs.statSync(filename).size > 16 * 1024 ** 2) throw new Error("OpenRA baseline is too large");
  const value = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (value.version !== 1 || !value.files || typeof value.files !== "object" || Array.isArray(value.files)) throw new Error("OpenRA baseline is invalid");
  return value.files;
}
function writeBaseline(root, files) {
  const temporary = path.join(root, MARKER + ".tmp");
  fs.writeFileSync(temporary, JSON.stringify({ version: 1, files }), { flag: "wx", mode: 0o600 });
  fs.renameSync(temporary, path.join(root, MARKER));
}

export function appImageOffset(filename) {
  const stat = fs.statSync(filename), fd = fs.openSync(filename, "r");
  try {
    const head = Buffer.alloc(Math.min(stat.size, 8 * 1024 ** 2));fs.readSync(fd, head, 0, head.length, 0);
    if (head.length < 96 || head.readUInt32BE(0) !== 0x7f454c46 || head[4] !== 2 || head[5] !== 1 || head.readUInt16LE(18) !== 62) throw new Error("OpenRA AppImage must be Linux x86_64");
    for (let offset = head.indexOf("hsqs"); offset >= 0; offset = head.indexOf("hsqs", offset + 4)) {
      if (offset + 96 > head.length) break;
      const block = head.readUInt32LE(offset + 12), bytes = head.readBigUInt64LE(offset + 40);
      if (head.readUInt16LE(offset + 28) === 4 && block >= 4096 && block <= 1024 ** 2 && (block & (block - 1)) === 0
        && bytes >= 96 && bytes <= BigInt(stat.size - offset)) return offset;
    }
    throw new Error("OpenRA AppImage has no supported bounded SquashFS filesystem");
  } finally { fs.closeSync(fd); }
}

export function validateArchiveListing(text) {
  let files = 0, size = 0;
  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    const match = /^([dl-][rwxStTs-]{9})\s+\d+\/\d+\s+(\d+)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+(squashfs-root(?:\/.*)?)$/.exec(line);
    if (!match) throw new Error("OpenRA archive listing is invalid");
    const name = match[1][0] === "l" ? match[3].split(" -> ", 1)[0] : match[3];
    if (/[\x00-\x1f\\]/.test(name) || name.split("/").some((part) => part === ".." || part === "." || !part)) throw new Error("OpenRA archive path is unsafe");
    const parent = ["squashfs-root", "squashfs-root/usr", "squashfs-root/usr/lib"].includes(name);
    const selected = name === "squashfs-root/usr/lib/openra" || name.startsWith("squashfs-root/usr/lib/openra/");
    if (parent && !match[1].startsWith("d")) throw new Error("OpenRA archive parent must be a directory");
    if (!selected) continue;
    if (/[sStT]/.test(match[1])) throw new Error("OpenRA archive has unsupported special permissions");
    if (match[1][0] !== "d" && match[1][0] !== "-") throw new Error("OpenRA server archive contains links");
    if (++files > 100_000 || (size += Number(match[2])) > 2 * 1024 ** 3) throw new Error("OpenRA archive exceeds extraction limits");
  }
  if (!files) throw new Error("OpenRA archive has no server files");
}

// Builds only in a new operator/worker workspace. AppImage code is never run.
export async function buildOpenRARelease(work, { run, request = fetch, diskCheck = () => {}, createLegacyReference = false }) {
  fs.mkdirSync(work, { mode: 0o700 });
  const signal = AbortSignal.timeout(10 * 60_000);
  const release = await readRelease("OpenRA/OpenRA", { request, signal, label: "OpenRA" });
  if (release.draft !== false || release.prerelease !== false || !/^release-\d{8}$/.test(release.tag_name)) throw new Error("OpenRA release is not a stable official build");
  const output = path.join(work, "installation");
  const roots = {};
  for (const [mod, title] of PACKAGES) {
    const name = `OpenRA-${title}-x86_64.AppImage`;
    const assets = release.assets?.filter((asset) => asset.name === name);
    if (assets?.length !== 1) throw new Error("OpenRA requires all three official game packages");
    const asset = { ...assets[0] };
    if (asset.browser_download_url !== `https://github.com/OpenRA/OpenRA/releases/download/${release.tag_name}/${name}`) throw new Error("OpenRA asset URL is not official");
    const pin = PINS[release.tag_name]?.[mod];
    if (pin && asset.digest && asset.digest !== `sha256:${pin}`) throw new Error("OpenRA release digest conflicts with its reviewed pin");
    asset.digest ||= pin ? `sha256:${pin}` : null;
    const image = path.join(work, name);
    await downloadAsset(asset, image, { request, signal, diskCheck, label: "OpenRA" });
    const offset = String(appImageOffset(image));
    const listing = await run("/usr/bin/unsquashfs", ["-lln", "-o", offset, image], { root: work, timeout: 60_000, maxOutput: 8 * 1024 ** 2 });
    validateArchiveListing(listing);
    diskCheck();
    const extracted = path.join(work, mod);
    await run("/usr/bin/unsquashfs", ["-no-progress", "-no-xattrs", "-strict-errors", "-processors", "1", "-data-queue", "16", "-frag-queue", "16", "-d", extracted, "-o", offset, image, "usr/lib/openra"], { root: work, timeout: 120_000 });
    const source = path.join(extracted, "usr/lib/openra");inventory(source);
    if (fs.readFileSync(path.join(source, "VERSION"), "utf8").trim() !== release.tag_name) throw new Error("OpenRA extracted version differs from its release");
    roots[mod] = source;
  }
  // Upstream builds each package separately. D2K alone includes the additional
  // D2k assembly; use its complete engine rather than a partial RA engine.
  for (const source of Object.values(roots)) {
    if (!fs.readFileSync(path.join(source, "OpenRA.Server.runtimeconfig.json")).equals(fs.readFileSync(path.join(roots.d2k, "OpenRA.Server.runtimeconfig.json")))) throw new Error("OpenRA packages require different runtimes");
  }
  const combine = (destination, baseMod) => {
    diskCheck();fs.cpSync(roots[baseMod], destination, { recursive: true });
    for (const [mod] of PACKAGES.filter(([mod]) => mod !== baseMod)) {
      diskCheck();
      for (const folder of [mod, `${mod}-content`]) fs.cpSync(path.join(roots[mod], "mods", folder), path.join(destination, "mods", folder), { recursive: true, errorOnExist: true, force: false });
    }
    fs.writeFileSync(path.join(destination, "run-server"), WRAPPER, { mode: 0o755 });
  };
  combine(output, "d2k");regular(output, "OpenRA.Mods.D2k.dll");
  // Only used by the operator's one-time, hash-checked legacy adoption. This
  // reproduces install.sh's old layout without relaxing the custom-file check.
  if (createLegacyReference) combine(path.join(work, "legacy-reference"), "ra");
  verifyOpenRAInstallation(output);writeBaseline(output, inventory(output));
  return output;
}

// Operator bootstrap: metadata only, and only for an exact reviewed installation.
export function seedOpenRABaseline(current, reference) {
  verifyOpenRAInstallation(current);verifyOpenRAInstallation(reference);
  const files = inventory(current);
  if (!sameFiles(files, inventory(reference))) throw new Error("OpenRA legacy installation differs from official packages; review required");
  if (fs.existsSync(path.join(current, MARKER))) { if (!sameFiles(files, baseline(current))) throw new Error("OpenRA baseline differs from installed files");return; }
  writeBaseline(current, files);
}

export function validateOpenRABaseline(root) {
  if (!sameFiles(inventory(root), baseline(root))) throw new Error("OpenRA installation contains custom changes; review required");
}

export async function stageOpenRARelease(stage, options) {
  if (!/^\.pb-update-openra-[a-f0-9-]{36}$/.test(path.basename(stage))) throw new Error("OpenRA updates require an isolated worker staging directory");
  validateOpenRABaseline(stage);
  const work = path.join(stage, ".pb-openra-work");
  const fresh = await buildOpenRARelease(work, options);
  // Only the temporary copy is cleared; the active installation and complete
  // rollback copy are handled by the existing coordinated worker.
  for (const name of fs.readdirSync(stage).filter((name) => name !== ".pb-openra-work")) fs.rmSync(path.join(stage, name), { recursive: true, force: false });
  for (const name of fs.readdirSync(fresh)) fs.renameSync(path.join(fresh, name), path.join(stage, name));
  fs.rmSync(work, { recursive: true });
  return verifyOpenRAInstallation(stage);
}
