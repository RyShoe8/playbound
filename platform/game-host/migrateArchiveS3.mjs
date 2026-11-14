/**
 * Copy one game package directly from the VPS archive into private Ceph S3.
 * The Vercel control plane signs short-lived multipart URLs. No S3 credential
 * is stored on the VPS, and this script never removes the source file.
 *
 * Usage on VPS (with GAME_HOST_SECRET in the environment):
 *   node migrateArchiveS3.mjs games/example/version/package.zip
 */
import { createReadStream, realpathSync, statSync } from "node:fs";
import { open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, sep } from "node:path";

const root = realpathSync(process.env.MIRROR_ARCHIVE_DIR || "/opt/playbound-host/archive");
const site = (process.env.PLAYBOUND_SITE_URL || "https://playbound.club").replace(/\/+$/, "");
const secret = process.env.GAME_HOST_SECRET;
const key = process.argv[2];
const partBytes = 64 * 1024 * 1024;
if (!secret || !key || process.argv.length !== 3 ||
    (!key.startsWith("games/") && !key.startsWith("launcher-packages/")) ||
    key.split("/").some((part) => !part || part === "." || part === "..") || key.includes("\\")) {
  console.error("Usage: GAME_HOST_SECRET=... node migrateArchiveS3.mjs <games/... or launcher-packages/...>");
  process.exit(2);
}
const file = realpathSync(resolve(root, key));
if (!file.startsWith(root + sep)) throw new Error("Source path escapes archive root");
const stat = statSync(file);
if (!stat.isFile() || stat.size <= 0) throw new Error("Source is not a nonempty regular file");

async function action(body) {
  const response = await fetch(`${site}/api/internal/archive-transfer`, {
    method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ key, ...body }), signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Transfer control ${body.action} failed: HTTP ${response.status} ${result.error || ""}`);
  return result;
}

async function hashStream(stream) {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of stream) {
    hash.update(chunk);
    size += chunk.length;
  }
  return { sha256: hash.digest("hex"), sizeBytes: size };
}

async function hashDestination(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(2 * 60 * 60 * 1000) });
  if (!response.ok || !response.body) throw new Error(`Signed S3 GET failed: HTTP ${response.status}`);
  return hashStream(response.body);
}

async function migrate() {
  console.log(`Hashing source: ${key} (${stat.size} bytes)`);
  const source = await hashStream(createReadStream(file));
  if (source.sizeBytes !== stat.size) throw new Error("Source changed while hashing");
  const existing = await action({ action: "get" });
  if (existing.exists) {
    const destination = await hashDestination(existing.url);
    if (destination.sha256 !== source.sha256 || destination.sizeBytes !== source.sizeBytes) {
      throw new Error("Existing S3 object differs from VPS source; refusing overwrite");
    }
    console.log("Matching S3 object already exists; no upload needed");
  } else {
    const { uploadId } = await action({ action: "start" });
    if (!uploadId) throw new Error("Missing multipart upload ID");
    const parts = [];
    let complete = false;
    const handle = await open(file, "r");
    try {
      for (let offset = 0, number = 1; offset < source.sizeBytes; offset += partBytes, number++) {
        const length = Math.min(partBytes, source.sizeBytes - offset);
        const buffer = Buffer.allocUnsafe(length);
        let filled = 0;
        while (filled < length) {
          const read = await handle.read(buffer, filled, length - filled, offset + filled);
          if (read.bytesRead === 0) throw new Error("Source shortened during upload");
          filled += read.bytesRead;
        }
        const signed = await action({ action: "part", uploadId, partNumber: number });
        const response = await fetch(signed.url, {
          method: "PUT", body: buffer, headers: { "content-length": String(length) },
          signal: AbortSignal.timeout(10 * 60 * 1000),
        });
        const etag = response.headers.get("etag");
        if (!response.ok || !etag) throw new Error(`S3 part ${number} failed: HTTP ${response.status}`);
        parts.push({ partNumber: number, etag });
        console.log(`${Math.min(100, Math.round(((offset + length) / source.sizeBytes) * 100))}% uploaded`);
      }
      await action({ action: "complete", uploadId, parts });
      complete = true;
    } finally {
      await handle.close();
      if (!complete) await action({ action: "abort", uploadId }).catch(() => {});
    }
    const destination = await action({ action: "get" });
    if (!destination.exists) throw new Error("Completed S3 object is missing");
    const verified = await hashDestination(destination.url);
    if (verified.sha256 !== source.sha256 || verified.sizeBytes !== source.sizeBytes) {
      throw new Error("S3 bytes differ from VPS source; source retained for recovery");
    }
  }
  const marked = await action({ action: "mark", sha256: source.sha256, sizeBytes: source.sizeBytes });
  console.log(JSON.stringify({ key, sizeBytes: source.sizeBytes, sha256: source.sha256,
    s3Verified: true, artifactMarked: Boolean(marked.artifactMarked), vpsSourceRetained: true }));
}

migrate().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
