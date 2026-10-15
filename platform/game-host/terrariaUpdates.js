import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Reviewed against the official package and installed Linux files on 2026-10-15.
// The publisher supplies no separate checksum. A new version needs a new pin,
// matching recipe paths, and client/world compatibility review before deployment.
const RELEASE = JSON.parse(fs.readFileSync(new URL("./terraria1458.json", import.meta.url), "utf8"));
const DOWNLOAD_URL = "https://terraria.org/api/download/pc-dedicated-server/terraria-server-1458.zip";
const cache = new Map();
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

function linuxRoot(root) {
  let current = root;
  for (const segment of ["", RELEASE.directory, "Linux"]) {
    if (segment) current = path.join(current, segment);
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Terraria Linux package requires real directories");
  }
  return current;
}
export function verifyTerrariaInstallation(root, { command = execFileSync, expected = RELEASE.files } = {}) {
  const directory = linuxRoot(root), files = new Map();
  function walk(folder, relative = "", depth = 0) {
    if (depth > 3) throw new Error("Terraria custom package folders require review");
    for (const name of fs.readdirSync(folder)) {
      const filename = path.join(folder, name), key = relative ? `${relative}/${name}` : name, stat = fs.lstatSync(filename);
      if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory()) || (stat.mode & 0o7000) || (stat.isFile() && stat.nlink !== 1)) throw new Error("Terraria links and special files require review");
      if (stat.isDirectory()) {
        if (key !== "lib64") throw new Error("Terraria custom package folders require review");
        walk(filename, key, depth + 1);
      } else {
        if (!Object.hasOwn(expected, key) || stat.size !== expected[key].size) throw new Error("Terraria custom, modified or missing package files require review");
        files.set(key, { filename, stat });
      }
    }
  }
  walk(directory);
  if (files.size !== Object.keys(expected).length) throw new Error("Terraria Linux package is incomplete");
  const identity = JSON.stringify([...files].sort(([a], [b]) => a.localeCompare(b)).map(([key, { stat }]) => [key, stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs, stat.mode]));
  if (!(command === execFileSync && expected === RELEASE.files && cache.get(directory) === identity)) {
    for (const [key, { filename }] of files) {
      if (sha256(fs.readFileSync(filename)) !== expected[key].sha256) throw new Error("Terraria Linux files differ from the reviewed official package");
    }
  }
  const binary = path.join(directory, "TerrariaServer.bin.x86_64"), header = fs.readFileSync(binary).subarray(0, 20);
  if (header.length < 20 || header.readUInt32BE(0) !== 0x7f454c46 || header[4] !== 2 || header[5] !== 1 || header.readUInt16LE(18) !== 62) throw new Error("Terraria requires an x86_64 Linux server executable");
  fs.accessSync(binary, fs.constants.X_OK);
  const dependencies = command("/usr/bin/ldd", [binary], { timeout: 15000, maxBuffer: 32768, env: { PATH: "/usr/bin:/bin", LANG: "C", LD_LIBRARY_PATH: path.join(directory, "lib64") }, stdio: ["ignore", "pipe", "pipe"] }).toString();
  if (!dependencies.trim() || /not found|not a dynamic executable|statically linked/i.test(dependencies)) throw new Error("Terraria native runtime dependencies are unavailable");
  if (command === execFileSync && expected === RELEASE.files) { if (cache.size >= 32) cache.clear(); cache.set(directory, identity); }
  return { buildId: RELEASE.version };
}

export async function stageTerrariaRelease(stage, { run, request = fetch, diskCheck = () => {}, verify = verifyTerrariaInstallation }) {
  if (!/^\.pb-update-terraria-[a-f0-9-]{36}$/.test(path.basename(stage))) throw new Error("Terraria updates require an isolated worker directory");
  verify(stage);
  const work = path.join(stage, ".pb-terraria-download"); fs.mkdirSync(work, { mode: 0o700 });
  const archive = path.join(work, "official.zip"), fresh = path.join(work, "Linux");
  try {
    const response = await request(DOWNLOAD_URL, { redirect: "error", signal: AbortSignal.timeout(3 * 60_000), headers: { "User-Agent": "PlayBound-game-host" } });
    if (!response.ok || !response.body) throw new Error("Terraria official server download failed");
    const file = fs.openSync(archive, "wx", 0o600), hash = createHash("sha256"); let size = 0;
    try {
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > RELEASE.archiveBytes) throw new Error("Terraria package exceeds its reviewed size");
        diskCheck(); hash.update(chunk);
        let offset = 0;
        while (offset < chunk.length) { const written = fs.writeSync(file, chunk, offset, chunk.length - offset); if (!written) throw new Error("Terraria download write failed"); offset += written; }
      }
      if (size !== RELEASE.archiveBytes || hash.digest("hex") !== RELEASE.archiveSha256) throw new Error("Terraria package differs from its reviewed official SHA-256");
      fs.fsyncSync(file);
    } finally { fs.closeSync(file); }
    await run("/usr/bin/python3", [fileURLToPath(new URL("./terrariaArchive.py", import.meta.url)), archive, fresh], { timeout: 90000, maxOutput: 8192 });
    const candidate = path.join(work, "candidate"); fs.mkdirSync(path.join(candidate, RELEASE.directory), { recursive: true });
    fs.renameSync(fresh, path.join(candidate, RELEASE.directory, "Linux"));
    verify(candidate); diskCheck();
    fs.rmSync(linuxRoot(stage), { recursive: true });
    fs.renameSync(linuxRoot(candidate), path.join(stage, RELEASE.directory, "Linux"));
    return verify(stage);
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}
