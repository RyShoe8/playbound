import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { downloadAsset } from "./githubReleaseAssets.js";

export const REVIEWED_JAVA = Object.freeze(JSON.parse(fs.readFileSync(new URL("./reviewedJavaProfiles.json", import.meta.url), "utf8")));
const helper = fileURLToPath(new URL("./reviewedJavaArchive.py", import.meta.url));
const cache = new Map();
const fingerprint = stat => [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs, stat.mode].join(":");
export function verifyReviewedJava(root, key, { profile = REVIEWED_JAVA[key], command = execFileSync } = {}) {
  if (!profile || !fs.lstatSync(root).isDirectory() || fs.realpathSync(root) !== path.resolve(root)) throw new Error("Reviewed Java installation requires a real directory");
  const filename = path.join(root, profile.jar), stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 128 * 1024 ** 2
    || (process.platform === "linux" && stat.mode & 0o7022) || fs.realpathSync(filename) !== filename) throw new Error("Reviewed Java installation requires an isolated JAR");
  if (profile.component === "bin" && fs.readdirSync(path.join(root, "bin")).join() !== "game-headless.jar") throw new Error("TripleA bin contains unreviewed files");
  const cacheKey = command === execFileSync ? [key, filename, fingerprint(stat), fingerprint(fs.statSync(profile.java)), fingerprint(fs.statSync(helper)), fingerprint(fs.statSync("/usr/bin/python3"))].join("|") : null;
  if (cacheKey && cache.has(cacheKey)) return { ...cache.get(cacheKey) };
  const sha = createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
  const version = profile.versions.find(row => row.sha256 === sha && row.bytes === stat.size);
  if (!version) throw new Error("Java server differs from the reviewed release");
  const options = { timeout: 30_000, maxBuffer: 16_384, stdio: ["ignore", "pipe", "pipe"] };
  const required = JSON.parse(command("/usr/bin/python3", [helper, "inspect", filename, profile.mainClass], options)).java;
  const installed = Number(command(profile.java, ["--version"], options).toString().match(/^(?:openjdk|java) (\d+)/m)?.[1]);
  if (!Number.isInteger(required) || required < 8 || !installed || installed < required) throw new Error("Java server requires a compatible installed Java runtime");
  const result = { buildId: version.buildId };
  if (cacheKey) { if (cache.size >= 64) cache.delete(cache.keys().next().value); cache.set(cacheKey, result); }
  return result;
}

export async function stageReviewedJava(stage, key, { request = fetch, run, diskCheck = () => {}, verify = verifyReviewedJava, profile = REVIEWED_JAVA[key] } = {}) {
  if (!profile || !new RegExp(`^\\.pb-update-${key}-[a-f0-9-]{36}$`).test(path.basename(stage))) throw new Error("Java update requires an isolated worker directory");
  verify(stage, key);
  const version = profile.versions.find(row => row.buildId === profile.latest);
  const archive = path.join(stage, ".java-download"), jar = path.join(stage, ".java-fresh.jar");
  try {
    await downloadAsset({ browser_download_url: version.url, size: version.archiveBytes, digest: `sha256:${version.archiveSha256}` }, archive, { request, signal: AbortSignal.timeout(10 * 60_000), diskCheck, label: "Reviewed Java server", limit: 128 * 1024 ** 2 });
    if (key === "ysoccer") fs.renameSync(archive, jar);
    else await run("/usr/bin/python3", [helper, "extract", key, archive, jar], { timeout: 90_000, maxOutput: 4096 });
    const data = fs.readFileSync(jar);
    if (data.length !== version.bytes || createHash("sha256").update(data).digest("hex") !== version.sha256) throw new Error("Java server extracted checksum mismatch");
    fs.renameSync(jar, path.join(stage, profile.jar));
    return verify(stage, key);
  } finally { for (const filename of [archive, jar]) if (fs.existsSync(filename)) fs.unlinkSync(filename); }
}
