import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readRelease, downloadAsset } from "./githubReleaseAssets.js";

const MARKER = ".pb-native-release.json";
const FILES = {
  linux_64_client: { size: 2090832, sha256: "f8209caa52644069f056421fd2488be5ab018293773f138651c7602ba68cb228" },
  linux_64_server: { size: 721928, sha256: "f5c0cb3f4ebb459c4fa0a266879d048808984daaba7a3085c427198e6db593e5" },
};
// Downloaded from the fixed official release URL and matched byte-for-byte to
// the installed native files on 2026-10-14. GitHub supplies no historical digest.
const RELEASE = {
  tag: "v1.3.0.2", name: "AssaultCube_v1.3.0.2_LockdownEdition_RC1.tar.bz2", size: 52071427,
  digest: "sha256:9b3118e7929253f0114fa06cad8310faab646d177b4660406011152f34086b55",
};
const cache = new Map();
function component(root) {
  const directory = path.join(root, "bin_unix"), stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("AssaultCube native binaries require a real directory");
  if (fs.readdirSync(directory).some((name) => !Object.hasOwn(FILES, name) && name !== MARKER)) throw new Error("AssaultCube custom native files require review");
  return directory;
}
function regular(directory, name) {
  const filename = path.join(directory, name), stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o7000)) throw new Error("AssaultCube requires regular native files without special permissions");
  return { filename, stat };
}
export function verifyAssaultCubeInstallation(root) {
  if (!fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink()) throw new Error("AssaultCube installation must be a real directory");
  const directory = component(root), marker = path.join(directory, MARKER);
  let record = { buildId: RELEASE.tag.slice(1), files: FILES };
  if (fs.existsSync(marker)) {
    if (regular(directory, MARKER).stat.size > 4096) throw new Error("AssaultCube native record is too large");
    record = JSON.parse(fs.readFileSync(marker, "utf8"));
    if (record.version !== 1 || !/^\d+\.\d+\.\d+\.\d+$/.test(record.buildId) || !record.files || Object.keys(record.files).sort().join() !== Object.keys(FILES).sort().join()) throw new Error("AssaultCube native record is invalid");
  }
  for (const name of Object.keys(FILES)) {
    const { filename, stat } = regular(directory, name), expected = record.files[name];
    if (!Number.isSafeInteger(expected?.size) || expected.size < 64 || expected.size > 16 * 1024 ** 2 || !/^[a-f0-9]{64}$/.test(expected.sha256 || "") || stat.size !== expected.size) throw new Error("AssaultCube native size or digest record is invalid");
    fs.accessSync(filename, fs.constants.X_OK);
    const identity = JSON.stringify([stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs, stat.mode, expected.sha256]);
    if (cache.get(filename) === identity) continue;
    const data = fs.readFileSync(filename);
    if (data.readUInt32BE(0) !== 0x7f454c46 || data[4] !== 2 || data[5] !== 1 || data.readUInt16LE(18) !== 62 || createHash("sha256").update(data).digest("hex") !== expected.sha256) throw new Error("AssaultCube native binary differs from its reviewed x86_64 build");
    if (cache.size >= 32) cache.clear(); cache.set(filename, identity);
  }
  return { buildId: record.buildId };
}

export async function stageAssaultCubeRelease(stage, { run, request = fetch, diskCheck = () => {} }) {
  if (!/^\.pb-update-assaultcube-[a-f0-9-]{36}$/.test(path.basename(stage))) throw new Error("AssaultCube updates require an isolated worker directory");
  verifyAssaultCubeInstallation(stage);
  const signal = AbortSignal.timeout(5 * 60_000), release = await readRelease("assaultcube/AC", { request, signal, label: "AssaultCube" });
  if (release.draft !== false || release.prerelease !== false || release.tag_name !== RELEASE.tag) throw new Error("AssaultCube release requires native-binary and protocol compatibility review");
  const matches = release.assets?.filter((asset) => asset.name === RELEASE.name);
  if (matches?.length !== 1 || matches[0].size !== RELEASE.size || matches[0].browser_download_url !== `https://github.com/assaultcube/AC/releases/download/${RELEASE.tag}/${RELEASE.name}` || (matches[0].digest && matches[0].digest !== RELEASE.digest)) throw new Error("AssaultCube package differs from its reviewed official release");
  const work = path.join(stage, ".pb-assaultcube-work"); fs.mkdirSync(work, { mode: 0o700 });
  const archive = path.join(work, "release.tar.bz2"), fresh = path.join(work, "native");
  await downloadAsset({ ...matches[0], digest: RELEASE.digest }, archive, { request, signal, diskCheck, label: "AssaultCube" });
  await run("/usr/bin/python3", [fileURLToPath(new URL("./nativeArchive.py", import.meta.url)), archive, fresh], { root: stage, timeout: 90_000, maxOutput: 4096 });
  // Verify exact reviewed bytes before replacing even the temporary component.
  const candidate = path.join(work, "candidate"); fs.mkdirSync(candidate); fs.renameSync(fresh, path.join(candidate, "bin_unix"));
  verifyAssaultCubeInstallation(candidate); diskCheck();
  fs.writeFileSync(path.join(candidate, "bin_unix", MARKER), JSON.stringify({ version: 1, buildId: RELEASE.tag.slice(1), files: FILES }), { mode: 0o600 });
  fs.rmSync(path.join(stage, "bin_unix"), { recursive: true });
  fs.renameSync(path.join(candidate, "bin_unix"), path.join(stage, "bin_unix"));
  fs.rmSync(work, { recursive: true });
  return verifyAssaultCubeInstallation(stage);
}
