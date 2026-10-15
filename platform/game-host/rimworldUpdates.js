import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const RIMWORLD_BUILD = Object.freeze(JSON.parse(fs.readFileSync(new URL("./rimworldBuild.json", import.meta.url), "utf8")));
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const cached = new Map();
export function verifyRimworldInstallation(root, { profile = RIMWORLD_BUILD, command = execFileSync } = {}) {
  const folder = fs.lstatSync(root);
  if (!folder.isDirectory() || folder.isSymbolicLink() || fs.realpathSync(root) !== path.resolve(root)) throw new Error("RimWorld installation requires a real directory");
  const allowed = new Set(["RTServer", "RTServer-playbound-staging", "UPSTREAM-LICENSE"]);
  if (fs.readdirSync(root).some(name => !allowed.has(name))) throw new Error("RimWorld custom installation files require review; saved data belongs outside the binary installation");
  for (const name of fs.readdirSync(root)) {
    const file = path.join(root, name), stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.mode & 0o7022) throw new Error("RimWorld installation has unsafe files");
    if (name === "UPSTREAM-LICENSE" ? stat.size > 64 * 1024 : ![profile.binary.bytes, profile.legacyBinary.bytes].includes(stat.size)) throw new Error("RimWorld file size differs from reviewed build");
    const identity = JSON.stringify([stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs, stat.mode, profile]);
    if (cached.get(file) === identity && command === execFileSync) continue;
    const bytes = fs.readFileSync(file);
    if (name === "UPSTREAM-LICENSE") {
      if (digest(Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"))) !== profile.licenseSha256) throw new Error("RimWorld upstream license differs from reviewed source");
    } else {
      const hash = digest(bytes);
      if (![profile.binary, profile.legacyBinary].some(value => value.bytes === bytes.length && value.sha256 === hash) || bytes.length < 20 || bytes.readUInt32BE(0) !== 0x7f454c46 || bytes[4] !== 2 || bytes[5] !== 1 || bytes.readUInt16LE(18) !== 62) throw new Error("RimWorld binary differs from the reviewed patched build");
      fs.accessSync(file, fs.constants.X_OK);
    }
    if (cached.size >= 32) cached.clear(); cached.set(file, identity);
  }
  const binary = path.join(root, "RTServer");
  fs.accessSync(binary, fs.constants.X_OK); fs.accessSync(path.join(root, "UPSTREAM-LICENSE"));
  const dependencies = command("/usr/bin/ldd", [binary], { timeout: 10000, maxBuffer: 32768, env: { PATH: "/usr/bin:/bin", LANG: "C" }, stdio: ["ignore", "pipe", "pipe"] }).toString();
  if (!dependencies.trim() || /not found|not a dynamic executable|statically linked/i.test(dependencies)) throw new Error("RimWorld host dependencies are unavailable");
  return { buildId: profile.version };
}

export async function stageRimworldRelease(stage, { run, verify = verifyRimworldInstallation } = {}) {
  if (!/^\.pb-update-rimworld-together-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(path.basename(stage))) throw new Error("RimWorld source build requires a reviewed worker directory");
  verify(stage);
  const fresh = `${stage}-source`;
  try {
    await run("/usr/bin/python3", [fileURLToPath(new URL("./rimworldSourceBuild.py", import.meta.url)), fresh], { timeout: 15 * 60_000, maxOutput: 32768, root: path.dirname(stage) });
    const publish = path.join(fresh, "publish");
    // The source builder checks its exact output before any current bytes move.
    verify(publish);
    fs.renameSync(path.join(publish, "RTServer"), path.join(stage, "RTServer"));
    // Retain the already-reviewed license, including its original line endings.
    return verify(stage);
  } finally { if (fs.existsSync(fresh)) fs.rmSync(fresh, { recursive: true }); }
}
