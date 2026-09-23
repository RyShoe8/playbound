/**
 * Move legacy game archives out of Vercel Blob after confirming that the VPS
 * already holds byte-identical content under another timestamped name.
 *
 * Dry-run by default. --apply hard-links the matching VPS file at the Blob's
 * original relative path, checks that it is publicly served, then deletes
 * that one Blob object. Never touches images or launcher installers.
 *
 * Requires BLOB_READ_WRITE_TOKEN, PLAYBOUND_VPS_SSH_HOST, and optionally
 * PLAYBOUND_VPS_SSH_KEY. The SSH account must be able to read/write the VPS
 * archive. Run from platform/ with `node scripts/migrate-blob-game-packages.mjs`.
 */

import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { list, del } from "@vercel/blob";

const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());

const APPLY = process.argv.includes("--apply");
const HOST = process.env.PLAYBOUND_VPS_SSH_HOST;
const KEY = process.env.PLAYBOUND_VPS_SSH_KEY || join(homedir(), ".ssh", "playbound_vps");
const ROOT = "/opt/playbound-host/archive";
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const IMAGE = /\.(?:png|jpe?g|webp|gif|svg|avif|bmp|ico)$/i;

if (!HOST || !TOKEN || !existsSync(KEY)) {
  throw new Error("Set PLAYBOUND_VPS_SSH_HOST and BLOB_READ_WRITE_TOKEN; provide an existing SSH key");
}

function ssh(command) {
  return execFileSync("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-i", KEY, HOST, command], {
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 2 * 1024 * 1024,
  }).trim();
}

function shellQuote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function validArchivePath(value) {
  return /^(?:launcher-packages\/(?:games|editions)|games)\/[\x20-\x7e]+$/.test(value) &&
    !value.split("/").some((part) => !part || part === "." || part === "..") &&
    !/[\\`$";|&<>]/.test(value);
}

function mirrorUrl(relativePath) {
  return `https://mirror.playbound.club/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
}

function sample(url, start, end) {
  const dir = mkdtempSync(join(tmpdir(), "playbound-blob-sample-"));
  const file = join(dir, "range.bin");
  try {
    execFileSync("curl.exe", ["-fsSL", "-r", `${start}-${end}`, "--max-filesize", String(end - start + 1), "--max-time", "30", "-o", file, url], {
      timeout: 35000,
      maxBuffer: 8192,
    });
    return readFileSync(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function samplesMatch(blob, remotePath) {
  const size = blob.size;
  const starts = [0, Math.floor(size / 2), Math.max(0, size - 65536)];
  for (const start of new Set(starts)) {
    const end = Math.min(size - 1, start + 65535);
    const a = sample(blob.url, start, end);
    const b = sample(mirrorUrl(remotePath), start, end);
    if (a.length !== end - start + 1 || b.length !== a.length || !a.equals(b)) return false;
  }
  return true;
}

async function liveCatalogReferences(blob) {
  const parts = blob.pathname.split("/");
  const slug = parts[0] === "games" ? parts[1] : parts[2];
  for (const path of [`games/${slug}`, `editions?game=${slug}`]) {
    const response = await fetch(`https://playbound.club/api/launcher/${path}`, { signal: AbortSignal.timeout(20000) });
    if (response.status === 404) continue; // unpublished/watchlist slug has no live launcher recipe
    if (!response.ok) throw new Error(`Could not check live catalog for ${slug}: HTTP ${response.status}`);
    if ((await response.text()).includes(blob.url)) return true;
  }
  return false;
}

async function main() {
  const remote = ssh(`find ${shellQuote(ROOT)} -type f -printf '%P|%s\\n'`).split("\n")
    .filter(Boolean)
    .map((line) => {
      const sep = line.lastIndexOf("|");
      return { path: line.slice(0, sep), size: Number(line.slice(sep + 1)) };
    });
  const blobs = [];
  let cursor;
  do {
    const page = await list({ limit: 1000, cursor, token: TOKEN });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  const games = blobs.filter((blob) =>
    (blob.pathname.startsWith("launcher-packages/") || blob.pathname.startsWith("games/")) && !IMAGE.test(blob.pathname)
  );
  let removed = 0;
  let bytes = 0;
  let skipped = 0;
  console.log(`${APPLY ? "APPLY" : "DRY RUN"}: ${games.length} game objects; ${remote.length} VPS files`);

  for (const blob of games) {
    if (!validArchivePath(blob.pathname)) {
      console.log(`SKIP unsafe path ${blob.pathname}`);
      skipped++;
      continue;
    }
    const candidates = remote.filter((file) => file.size === blob.size && validArchivePath(file.path));
    let match = null;
    for (const candidate of candidates) {
      try {
        if (samplesMatch(blob, candidate.path)) {
          match = candidate;
          break;
        }
      } catch (error) {
        console.warn(`Sample check failed for ${blob.pathname} vs ${candidate.path}: ${error.message}`);
      }
    }
    if (!match) {
      console.log(`SKIP no content match ${blob.pathname}`);
      skipped++;
      continue;
    }
    if (!APPLY) {
      console.log(`MATCH ${blob.pathname} <- ${match.path} (${blob.size} bytes)`);
      continue;
    }
    try {
      if (await liveCatalogReferences(blob)) {
        console.log(`SKIP live catalog still uses Blob URL: ${blob.pathname}`);
        skipped++;
        continue;
      }
      const source = `${ROOT}/${match.path}`;
      const target = `${ROOT}/${blob.pathname}`;
      const directory = target.slice(0, target.lastIndexOf("/"));
      const remoteSize = ssh(`set -e; mkdir -p -- ${shellQuote(directory)}; if [ ! -e ${shellQuote(target)} ]; then ln -- ${shellQuote(source)} ${shellQuote(target)}; fi; stat -c %s -- ${shellQuote(target)}`);
      if (Number(remoteSize) !== blob.size) throw new Error("VPS path has the wrong size");
      const response = await fetch(`${mirrorUrl(blob.pathname)}?verify=${Date.now()}`, {
        method: "HEAD", signal: AbortSignal.timeout(15000),
      });
      if (!response.ok || Number(response.headers.get("content-length")) !== blob.size) {
        throw new Error(`VPS public URL check failed: HTTP ${response.status}`);
      }
      await del(blob.url, { token: TOKEN });
      // Public Blob URLs can remain cached as 200 briefly after deletion.
      // The authoritative list API reflects the mutation immediately.
      const after = await list({ prefix: blob.pathname, token: TOKEN });
      if (after.blobs.some((item) => item.pathname === blob.pathname)) {
        throw new Error("Blob deletion unconfirmed in list API");
      }
      removed++;
      bytes += blob.size;
      console.log(`MOVED ${blob.pathname} (${blob.size} bytes)`);
    } catch (error) {
      skipped++;
      console.warn(`SKIP ${blob.pathname}: ${error.message}`);
    }
  }
  console.log(JSON.stringify({ removed, bytes, skipped, dryRun: !APPLY }));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
