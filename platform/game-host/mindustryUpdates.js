import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const API = "https://api.github.com/repos/Anuken/Mindustry/releases/latest";
const LIMIT = 256 * 1024 ** 2;
const HEADERS = { "User-Agent": "PlayBound-game-host", Accept: "application/vnd.github+json" };
const ASSET_HOSTS = new Set(["github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"]);
const validationCache = new Map();
const fingerprint = (stat) => [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs, stat.mode].join(":");

export function verifyMindustryInstallation(directory, { command = execFileSync } = {}) {
  const jar = path.join(directory, "server-release.jar");
  const stat = fs.lstatSync(jar);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size < 1 || stat.size > LIMIT
    || fs.realpathSync(jar) !== path.join(fs.realpathSync(directory), "server-release.jar")) throw new Error("Mindustry requires an isolated, regular server-release.jar");
  // Existing wrappers can launch a different JAR or modify shared files.
  if (fs.existsSync(path.join(directory, "run-server")) || fs.existsSync(path.join(directory, "Mindustry.jar"))) {
    throw new Error("Mindustry custom launchers require operator review before updates");
  }
  // Snapshot polling must not repeatedly start Java and scan a 20MB ZIP.
  // Renames, writes, permission changes and dependency replacements invalidate it.
  const cacheKey = command === execFileSync ? [jar, fingerprint(stat),
    fingerprint(fs.statSync("/usr/bin/java")), fingerprint(fs.statSync("/usr/bin/unzip"))].join("|") : null;
  if (cacheKey && validationCache.has(cacheKey)) return { ...validationCache.get(cacheKey) };
  const options = { timeout: 30_000, maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] };
  command("/usr/bin/unzip", ["-tqq", jar], options);
  const properties = command("/usr/bin/unzip", ["-p", jar, "version.properties"], options).toString();
  const build = properties.match(/^build=(\d+(?:\.\d+)*)\r?$/m)?.[1];
  const manifest = command("/usr/bin/unzip", ["-p", jar, "META-INF/MANIFEST.MF"], options).toString();
  if (!build || !/^Main-Class: mindustry\.server\.ServerLauncher\r?$/m.test(manifest)) throw new Error("Mindustry dedicated server metadata is invalid");
  const main = command("/usr/bin/unzip", ["-p", jar, "mindustry/server/ServerLauncher.class"], options);
  if (main.length < 8 || main.readUInt32BE(0) !== 0xcafebabe) throw new Error("Mindustry server entry point is invalid");
  const requiredJava = main.readUInt16BE(6) - 44;
  // java -version writes to stderr; capture both without running the new JAR.
  const java = command("/usr/bin/java", ["--version"], options).toString();
  const installedJava = Number(java.match(/^(?:openjdk|java) (\d+)/m)?.[1]);
  if (requiredJava < 8 || !installedJava || installedJava < requiredJava) throw new Error("Mindustry requires a newer installed Java runtime");
  const result = { buildId: build };
  if (cacheKey) {
    if (validationCache.size >= 64) validationCache.delete(validationCache.keys().next().value);
    validationCache.set(cacheKey, result);
  }
  return { ...result };
}

function safeAssetURL(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !ASSET_HOSTS.has(url.hostname) || url.username || url.password || url.port) throw new Error("Mindustry release redirect is not trusted");
  return url.href;
}

// Network/time/size limits apply to metadata and streaming bodies, not just headers.
async function boundedBody(response, maximum) {
  if (!response.ok || !response.body) throw new Error("Mindustry release request failed");
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maximum) throw new Error("Mindustry release response exceeds its size limit");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function stageMindustryRelease(directory, { request = fetch, verify = verifyMindustryInstallation, diskCheck = () => {} } = {}) {
  const signal = AbortSignal.timeout(5 * 60_000);
  const metadata = await request(API, { redirect: "error", signal, headers: HEADERS });
  const release = JSON.parse((await boundedBody(metadata, 1024 * 1024)).toString());
  if (release.draft !== false || release.prerelease !== false || !/^v\d+(?:\.\d+)*$/.test(release.tag_name)) throw new Error("Mindustry release is not a stable official build");
  const assets = release.assets?.filter((asset) => asset.name === "server-release.jar");
  const asset = assets?.length === 1 ? assets[0] : null;
  const expectedURL = `https://github.com/Anuken/Mindustry/releases/download/${release.tag_name}/server-release.jar`;
  if (!asset || asset.browser_download_url !== expectedURL || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || "")
    || !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > LIMIT) throw new Error("Mindustry release lacks a trusted server asset and SHA-256 digest");
  let url = expectedURL;
  let response;
  for (let redirects = 0; redirects <= 4; redirects++) {
    response = await request(safeAssetURL(url), { redirect: "manual", signal, headers: { "User-Agent": HEADERS["User-Agent"] } });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const next = response.headers.get("location");
    await response.body?.cancel();
    if (!next || redirects === 4) throw new Error("Mindustry release redirect limit exceeded");
    url = safeAssetURL(new URL(next, url).href);
  }
  if (!response.ok || !response.body) throw new Error("Mindustry server download failed");
  const destination = path.join(directory, "server-release.jar");
  const temporary = path.join(directory, ".server-release.jar.download");
  const hash = createHash("sha256");
  let size = 0;
  const file = fs.openSync(temporary, "wx", 0o644);
  try {
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > asset.size || size > LIMIT) throw new Error("Mindustry download exceeds its declared size");
      diskCheck();
      hash.update(chunk);
      let offset = 0;
      while (offset < chunk.length) offset += fs.writeSync(file, chunk, offset, chunk.length - offset);
    }
    if (size !== asset.size || `sha256:${hash.digest("hex")}` !== asset.digest) throw new Error("Mindustry server download failed its SHA-256 check");
    fs.fsyncSync(file);
  } finally { fs.closeSync(file); }
  // This directory is staging, never the active installation. CRC/entry-point
  // and dependency checks must still succeed before the worker can activate it.
  fs.renameSync(temporary, destination);
  const verified = verify(directory);
  if (`v${verified.buildId}` !== release.tag_name) throw new Error("Mindustry JAR version does not match the official release");
  return verified;
}
