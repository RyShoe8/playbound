/**
 * Remove historical launcher builds from Blob while keeping the exact files
 * referenced by current public/admin updater feeds, their blockmaps, and
 * stable download aliases. Dry-run by default; use --apply to delete.
 *
 * This never touches images or game packages. Run after confirming the current
 * feeds and downloads work; old versions are not needed by electron-updater.
 */

import { createRequire } from "node:module";
import { list, del } from "@vercel/blob";

const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const APPLY = process.argv.includes("--apply");
const FEEDS = ["latest.yml", "latest-mac.yml", "latest-linux.yml", "admin.yml", "admin-mac.yml", "admin-linux.yml"];
const ALIASES = [
  "PlayBound-Launcher-Setup.exe",
  "PlayBound-Launcher-Setup.dmg",
  "PlayBound-Launcher-Setup.AppImage",
  "PlayBound-Launcher-Setup-Admin.exe",
  "PlayBound-Launcher-Setup-Admin.dmg",
  "PlayBound-Launcher-Setup-Admin.AppImage",
];

async function allLauncherBlobs() {
  const result = [];
  let cursor;
  do {
    const page = await list({ prefix: "launcher/", limit: 1000, cursor, token: TOKEN });
    result.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return result;
}

async function main() {
  if (!TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN is required");
  const blobs = await allLauncherBlobs();
  const byName = new Map(blobs.map((blob) => [blob.pathname.slice("launcher/".length), blob]));
  const keep = new Set([...FEEDS, ...ALIASES]);

  for (const feed of FEEDS) {
    const blob = byName.get(feed);
    if (!blob) throw new Error(`Active updater feed is missing: ${feed}`);
    const response = await fetch(blob.url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Could not read ${feed}: HTTP ${response.status}`);
    const text = await response.text();
    const version = text.match(/^version:\s*([0-9]+\.[0-9]+\.[0-9]+)/m)?.[1];
    const named = text.match(/^path:\s*(\S+)/m)?.[1];
    if (!version || !named || !/^PlayBound-(?:Setup|macOS|Linux)-[\w.]+\.(?:exe|dmg|AppImage)$/.test(named)) {
      throw new Error(`Unexpected updater feed format in ${feed}`);
    }
    // Windows public `latest.yml` can name a signed installer served from
    // R2/VPS via /api/launcher/download, so its Blob object may be absent.
    if (byName.has(named)) keep.add(named);
    if (byName.has(`${named}.blockmap`)) keep.add(`${named}.blockmap`);
    console.log(`KEEP ${feed} -> ${named} (${version})`);
  }

  for (const alias of ALIASES) {
    if (!byName.has(alias)) throw new Error(`Stable download alias is missing: ${alias}`);
  }

  const remove = blobs.filter((blob) => !keep.has(blob.pathname.slice("launcher/".length)));
  const bytes = remove.reduce((sum, blob) => sum + blob.size, 0);
  console.log(`${APPLY ? "APPLY" : "DRY RUN"}: keep ${keep.size}, remove ${remove.length} historical launcher objects (${(bytes / 1e9).toFixed(2)} GB)`);
  if (!APPLY) return;

  let deleted = 0;
  for (let i = 0; i < remove.length; i += 50) {
    const batch = remove.slice(i, i + 50);
    await del(batch.map((blob) => blob.url), { token: TOKEN });
    deleted += batch.length;
    console.log(`Deleted ${deleted}/${remove.length}`);
  }
  const remaining = await allLauncherBlobs();
  const unexpected = remaining.filter((blob) => !keep.has(blob.pathname.slice("launcher/".length)));
  if (unexpected.length) throw new Error(`${unexpected.length} old launcher objects still appear in Blob listing`);
  console.log(`Verified: ${remaining.length} protected launcher objects remain`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
