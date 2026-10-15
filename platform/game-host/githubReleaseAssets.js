import fs from "node:fs";
import { createHash } from "node:crypto";

const HOSTS = new Set(["github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"]);
export async function readRelease(repository, { request = fetch, signal, label }) {
  if (!["Anuken/Mindustry", "OpenRA/OpenRA"].includes(repository)) throw new Error("Unsupported release source");
  const response = await request(`https://api.github.com/repos/${repository}/releases/latest`, {
    redirect: "error", signal, headers: { "User-Agent": "PlayBound-game-host", Accept: "application/vnd.github+json" },
  });
  if (!response.ok || !response.body) throw new Error(`${label} release request failed`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error(`${label} release response exceeds its size limit`);
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}

function trustedURL(value, label) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !HOSTS.has(url.hostname) || url.username || url.password || url.port) throw new Error(`${label} release redirect is not trusted`);
  return url.href;
}

// Callers choose a fixed official repository/asset and validate release metadata.
// This helper never accepts HTTP input or forwards credentials to artifact hosts.
export async function downloadAsset(asset, destination, { request = fetch, signal, diskCheck = () => {}, label, limit = 256 * 1024 ** 2 }) {
  if (!/^sha256:[a-f0-9]{64}$/.test(asset.digest || "") || !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > limit) throw new Error(`${label} asset has no trusted digest or size`);
  let url = asset.browser_download_url, response;
  for (let redirects = 0; redirects <= 4; redirects++) {
    response = await request(trustedURL(url, label), { redirect: "manual", signal, headers: { "User-Agent": "PlayBound-game-host" } });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const next = response.headers.get("location"); await response.body?.cancel();
    if (!next || redirects === 4) throw new Error(`${label} release redirect limit exceeded`);
    url = trustedURL(new URL(next, url).href, label);
  }
  if (!response.ok || !response.body) throw new Error(`${label} server download failed`);
  const hash = createHash("sha256"); let size = 0;
  const file = fs.openSync(destination, "wx", 0o644);
  try {
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > asset.size || size > limit) throw new Error(`${label} download exceeds its declared size`);
      diskCheck(); hash.update(chunk);
      let offset = 0;
      while (offset < chunk.length) {
        const written = fs.writeSync(file, chunk, offset, chunk.length - offset);
        if (!written) throw new Error(`${label} download write failed`);
        offset += written;
      }
    }
    if (size !== asset.size || `sha256:${hash.digest("hex")}` !== asset.digest) throw new Error(`${label} server download failed its SHA-256 check`);
    fs.fsyncSync(file);
  } finally { fs.closeSync(file); }
}
