import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { downloadAsset } from "./githubReleaseAssets.js";

export const OPENMOHAA_RELEASE = JSON.parse(fs.readFileSync(new URL("./openmohaaRelease.json", import.meta.url), "utf8"));
const cache = new Map();
const fingerprint = (s) => [s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs, s.mode].join(":");
export function verifyOpenMohaaInstallation(root, { profile = OPENMOHAA_RELEASE, command = execFileSync } = {}) {
  if (!fs.lstatSync(root).isDirectory() || fs.realpathSync(root) !== path.resolve(root)) throw new Error("OpenMoHAA requires a real installation directory");
  if (fs.existsSync(path.join(root, "run-server"))) throw new Error("OpenMoHAA custom launchers require review");
  const entries = Object.entries(profile.files).map(([name, expected]) => {
    if (!/^[a-zA-Z0-9_.-]+$/.test(name)) throw new Error("OpenMoHAA managed filename is invalid");
    const filename = path.join(root, name), info = fs.lstatSync(filename);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size !== expected.bytes) throw new Error("OpenMoHAA package differs from reviewed binaries");
    if (name === "omohaaded") fs.accessSync(filename, fs.constants.X_OK);
    return { filename, info, expected };
  });
  const key = root + entries.map((row) => fingerprint(row.info)).join("|")
    + (process.platform === "linux" ? fingerprint(fs.statSync("/etc/ld.so.cache")) : "fixture");
  if (profile === OPENMOHAA_RELEASE && command === execFileSync && cache.has(key)) return { ...cache.get(key) };
  for (const { filename, expected } of entries) {
    const data = fs.readFileSync(filename);
    if (createHash("sha256").update(data).digest("hex") !== expected.sha256) throw new Error("OpenMoHAA package differs from reviewed binaries");
    if (data.subarray(0, 4).toString("hex") !== "7f454c46" || data[4] !== 2 || data.readUInt16LE(18) !== 62) throw new Error("OpenMoHAA requires x86-64 ELF binaries");
  }
  for (const name of ["omohaaded", "game.so"]) {
    const output = command("/usr/bin/ldd", [path.join(root, name)], { timeout: 15_000, maxBuffer: 65536,
      env: { PATH: "/usr/bin:/bin", LANG: "C", LD_LIBRARY_PATH: root }, stdio: ["ignore", "pipe", "pipe"] }).toString();
    if (/not found/.test(output)) throw new Error("OpenMoHAA host libraries are missing");
  }
  const result = { buildId: profile.version };
  if (profile === OPENMOHAA_RELEASE && command === execFileSync) { if (cache.size > 32) cache.clear(); cache.set(key, result); }
  return result;
}

export async function stageOpenMohaaRelease(stage, { run, request = fetch, diskCheck = () => {}, verify = verifyOpenMohaaInstallation } = {}) {
  if (!/^\.pb-update-openmohaa-[a-f0-9-]{36}$/.test(path.basename(stage))) throw new Error("OpenMoHAA requires an isolated worker directory");
  verify(stage);
  const archive = path.join(stage, ".pb-openmohaa-download"), fresh = path.join(stage, ".pb-openmohaa-new");
  try {
    await downloadAsset({ browser_download_url: OPENMOHAA_RELEASE.url, digest: `sha256:${OPENMOHAA_RELEASE.archiveSha256}`, size: OPENMOHAA_RELEASE.archiveBytes }, archive,
      { request, signal: AbortSignal.timeout(5 * 60_000), diskCheck, label: "OpenMoHAA", limit: 32 * 1024 ** 2 });
    await run("/usr/bin/python3", [fileURLToPath(new URL("./openmohaaArchive.py", import.meta.url)), archive, fresh], { timeout: 60_000, maxOutput: 4096 });
    verify(fresh);
    // Retail main/mainta/maintt assets and per-runtime homes are outside this
    // exact publisher engine/library manifest; the module and engine move together.
    for (const name of Object.keys(OPENMOHAA_RELEASE.files)) fs.renameSync(path.join(fresh, name), path.join(stage, name));
    return verify(stage);
  } finally {
    if (fs.existsSync(archive)) fs.unlinkSync(archive);
    if (fs.existsSync(fresh)) fs.rmSync(fresh, { recursive: true });
  }
}
