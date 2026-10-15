import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const NATIVE_PACKAGE_PROFILES = Object.freeze(JSON.parse(fs.readFileSync(new URL("./nativePackageProfiles.json", import.meta.url), "utf8")));
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const cache = new Map();
export function verifyNativePackageInstallation(root, game, { requireRoot = true, command = execFileSync, profile = NATIVE_PACKAGE_PROFILES[game] } = {}) {
  if (!profile) throw new Error("Unsupported reviewed native package");
  const folder = fs.lstatSync(root);
  if (!folder.isDirectory() || folder.isSymbolicLink() || fs.realpathSync(root) !== path.resolve(root)) throw new Error("Native package requires a real isolated directory");
  if (profile.component && profile.component !== profile.binary) throw new Error("Native package component must match its reviewed executable");
  // A single-file target leaves configuration/data in the existing parent.
  // Whole-directory targets still reject custom installation content.
  if (!profile.component && fs.readdirSync(root).some(name => name !== profile.binary)) throw new Error("Native package custom files require review");
  const binary = path.join(root, profile.binary), stat = fs.lstatSync(binary);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size !== profile.binaryBytes || stat.mode & 0o7022 || (requireRoot && stat.uid !== 0)) throw new Error("Native package requires a reviewed root-owned executable");
  const identity = JSON.stringify([stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs, stat.mode, stat.uid, profile.binarySha256]);
  if (cache.get(binary) !== identity || command !== execFileSync) {
    const bytes = fs.readFileSync(binary);
    if (digest(bytes) !== profile.binarySha256 || bytes.length < 20 || bytes.readUInt32BE(0) !== 0x7f454c46 || bytes[4] !== 2 || bytes[5] !== 1 || bytes.readUInt16LE(18) !== 62) throw new Error("Native package differs from its reviewed x86_64 build");
    if (cache.size >= 32) cache.clear(); cache.set(binary, identity);
  }
  fs.accessSync(binary, fs.constants.X_OK);
  const dependencies = command("/usr/bin/ldd", [binary], { timeout: 10000, maxBuffer: 32768, env: { PATH: "/usr/bin:/bin", LANG: "C" }, stdio: ["ignore", "pipe", "pipe"] }).toString();
  if (!dependencies.trim() || /not found|not a dynamic executable|statically linked/i.test(dependencies)) throw new Error("Native package host dependencies are unavailable");
  return { buildId: profile.version };
}

/** Only reviewed distro packages. Does not invoke apt, dpkg installation,
 * maintainer scripts, service changes, or a caller-selected URL. */
export async function prepareNativePackage(root, game, { run, request = fetch, diskCheck = () => {}, verify = verifyNativePackageInstallation } = {}) {
  const profile = NATIVE_PACKAGE_PROFILES[game];
  if (!profile) throw new Error("Unsupported reviewed native package");
  if (fs.existsSync(root)) throw new Error("Native package destination already exists");
  fs.mkdirSync(root, { mode: 0o700 });
  const archive = path.join(root, ".reviewed.deb");
  try {
    const response = await request(profile.url, { redirect: "error", signal: AbortSignal.timeout(120000), headers: { "User-Agent": "PlayBound-game-host" } });
    if (!response.ok || !response.body) throw new Error("Native package official download failed");
    const file = fs.openSync(archive, "wx", 0o600), hash = createHash("sha256"); let size = 0;
    try {
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > profile.archiveBytes) throw new Error("Native package exceeds its reviewed size");
        diskCheck(); hash.update(chunk);
        let offset = 0;
        while (offset < chunk.length) { const written = fs.writeSync(file, chunk, offset, chunk.length - offset); if (!written) throw new Error("Native package download write failed"); offset += written; }
      }
      if (size !== profile.archiveBytes || hash.digest("hex") !== profile.archiveSha256) throw new Error("Native package failed its reviewed SHA-256 check");
      fs.fsyncSync(file);
    } finally { fs.closeSync(file); }
    await run("/usr/bin/python3", [fileURLToPath(new URL("./packageNativeArchive.py", import.meta.url)), game, archive, path.join(root, profile.binary)], { timeout: 90000, maxOutput: 4096 });
    fs.unlinkSync(archive);
    return verify(root, game, { requireRoot: false });
  } catch (error) { if (fs.existsSync(archive)) fs.unlinkSync(archive); throw error; }
}

export async function stageNativePackageRelease(stage, game, { run, ...options }) {
  const match = path.basename(stage).match(new RegExp(`^\\.pb-update-${game}-([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$`));
  if (!NATIVE_PACKAGE_PROFILES[game] || !match) throw new Error("Native package updates require a reviewed worker directory");
  verifyNativePackageInstallation(stage, game, { requireRoot: false });
  const fresh = `${stage}-native`;
  try {
    await prepareNativePackage(fresh, game, { run, ...options });
    fs.renameSync(path.join(fresh, NATIVE_PACKAGE_PROFILES[game].binary), path.join(stage, NATIVE_PACKAGE_PROFILES[game].binary));
    await run("/usr/bin/sudo", ["-n", "/usr/local/libexec/playbound-package-native/promote-package-native.py", game, match[1]], { timeout: 15000, maxOutput: 4096 });
    return verifyNativePackageInstallation(stage, game);
  } finally { if (fs.existsSync(fresh)) fs.rmSync(fresh, { recursive: true }); }
}
