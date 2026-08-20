/**
 * Upload a game artifact to Vercel Blob so the launcher can fetch it directly.
 *
 * Exists because scraped upstreams break. HoloCure's itch.io flow is an
 * undocumented page-scrape plus a signed-URL POST, and when itch started
 * returning 403 on the final download every install failed with no recourse —
 * there was no second source to fall back to.
 *
 * Usage (from platform/):
 *   npx vercel env pull .env.local --environment=production
 *   npm run upload:artifact -- <file> --path games/holocure/HoloCure.zip
 *
 * Prints the public URL and the sha256, both of which belong in the edition's
 * install recipe: the URL as `url`, the digest as `sha256` so the launcher can
 * reject a truncated or tampered download rather than extracting it.
 */
import { readFileSync, statSync } from "fs";
import { createHash } from "crypto";
import { basename, resolve } from "path";
import { loadEnvConfig } from "@next/env";
import { put } from "@vercel/blob";

loadEnvConfig(process.cwd());

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath || filePath.startsWith("--")) {
    console.error("Usage: npm run upload:artifact -- <file> --path <blob/path>");
    process.exit(1);
  }

  const abs = resolve(filePath);
  const stat = statSync(abs);
  const pathname = arg("--path") || `games/${basename(abs)}`;

  const bytes = readFileSync(abs);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  console.log(`Uploading ${basename(abs)} (${(stat.size / 1048576).toFixed(1)} MB)`);
  console.log(`  sha256 ${sha256}`);
  console.log(`  → ${pathname}`);

  const res = await put(pathname, bytes, {
    access: "public",
    contentType: "application/zip",
    // The path is the identity — re-uploading a fixed build must replace it
    // rather than minting a new URL that the catalog does not know about.
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  console.log("\nUploaded.");
  console.log(`  url:    ${res.url}`);
  console.log(`  sha256: ${sha256}`);
  console.log(`  sizeMB: ${Math.round(stat.size / 1048576)}`);
}

main().catch((err) => {
  console.error("Upload failed:", err?.message || err);
  process.exit(1);
});
