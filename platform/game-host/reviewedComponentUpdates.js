import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { httpsGetStream } from "./downloadStream.js";

export const REVIEWED_COMPONENTS = Object.freeze(JSON.parse(fs.readFileSync(new URL("./reviewedComponentProfiles.json", import.meta.url), "utf8")));
const HOSTS = new Set(["github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com", "rvgl.org", "files.bf1942.online"]);
const digest = (data) => createHash("sha256").update(data).digest("hex");
export function validInstallationComponent(value) {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(value);
}

// Deliberately single-version engines: new engine/data/script combinations need
// review. Component swaps never roll saved worlds, profiles or Lua back in time.
export function verifyReviewedComponent(root, key, { profile = REVIEWED_COMPONENTS[key] } = {}) {
  if (!profile || !validInstallationComponent(profile.component)) throw new Error("Reviewed component profile is invalid");
  if (!fs.lstatSync(root).isDirectory() || fs.realpathSync(root) !== path.resolve(root)) throw new Error("Reviewed component requires a real directory");
  const filename = path.join(root, profile.component), info = fs.lstatSync(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size !== profile.bytes || (process.platform === "linux" && info.mode & 0o7022)) throw new Error("Reviewed component binary differs from the reviewed package");
  fs.accessSync(filename, fs.constants.X_OK);
  const data = fs.readFileSync(filename);
  if (digest(data) !== profile.sha256 || data.length < 20 || data.readUInt32BE(0) !== 0x7f454c46 || data[4] !== profile.elfClass || data[5] !== 1 || data.readUInt16LE(18) !== (profile.elfClass === 1 ? 3 : 62)) throw new Error("Reviewed component checksum or architecture mismatch");
  if (key === "battlefield-1942-anthology" && path.basename(root) === key) {
    const alias = path.join(root, "bf1942_lnxded");
    if (!fs.lstatSync(alias).isSymbolicLink() || fs.readlinkSync(alias) !== profile.component) throw new Error("Reviewed component Battlefield launch alias requires review");
  }
  return { buildId: profile.version };
}

function trustedURL(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !HOSTS.has(url.hostname) || url.port || url.username || url.password) throw new Error("Reviewed component redirect is untrusted");
  return url.href;
}

export async function stageReviewedComponent(stage, key, { run, request = httpsGetStream, diskCheck = () => {}, verify = verifyReviewedComponent, profile = REVIEWED_COMPONENTS[key] } = {}) {
  if (!profile || !new RegExp(`^\\.pb-update-${key}-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$`).test(path.basename(stage))) throw new Error("Reviewed component requires an isolated worker directory");
  verify(stage, key);
  const archive = path.join(stage, ".reviewed-download"), fresh = path.join(stage, ".reviewed-engine");
  let response;
  try {
    const signal = AbortSignal.timeout(10 * 60_000);
    let url = profile.url;
    for (let redirects = 0; redirects <= 4; redirects++) {
      response = await request(trustedURL(url), { signal, followRedirects: false, headers: { "User-Agent": "Mozilla/5.0" } });
      if (![301, 302, 303, 307, 308].includes(response.statusCode)) break;
      const next = response.headers?.location; response.stream?.destroy();
      if (!next || redirects === 4) throw new Error("Reviewed component redirect limit exceeded");
      url = trustedURL(new URL(next, url).href);
    }
    if (response.statusCode !== 200 || !response.stream) throw new Error("Reviewed component download failed");
    const fd = fs.openSync(archive, "wx", 0o600), hash = createHash("sha256"); let size = 0;
    try {
      for await (const chunk of response.stream) {
        size += chunk.length;
        if (size > profile.archiveBytes) throw new Error("Reviewed component archive exceeds its size limit");
        diskCheck(); hash.update(chunk);
        let offset = 0;
        while (offset < chunk.length) {
          const written = fs.writeSync(fd, chunk, offset, chunk.length - offset);
          if (!written) throw new Error("Reviewed component download write failed");
          offset += written;
        }
      }
      if (size !== profile.archiveBytes || hash.digest("hex") !== profile.archiveSha256) throw new Error("Reviewed component archive SHA-256 mismatch");
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    await run("/usr/bin/python3", [fileURLToPath(new URL("./reviewedComponentArchive.py", import.meta.url)), key, archive, fresh], { timeout: 120_000, maxOutput: 4096 });
    // Validate before replacing even the staging copy.
    const extracted = fs.readFileSync(fresh);
    if (extracted.length !== profile.bytes || digest(extracted) !== profile.sha256) throw new Error("Reviewed component extraction differs from its profile");
    fs.renameSync(fresh, path.join(stage, profile.component));
    return verify(stage, key);
  } finally {
    response?.stream?.destroy();
    for (const file of [archive, fresh]) if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}
