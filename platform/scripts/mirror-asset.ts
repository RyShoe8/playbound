/**
 * Mirror a third-party download into PlayBound's own blob storage.
 *
 * For freely-licensed content whose host will not serve automated clients.
 * The FlightGear Blacklist add-on is the case that prompted this: GitLab
 * answers 406 to every non-browser request — confirmed against plain Node and
 * Electron's own fetch, which is what the launcher downloads with — so a
 * one-click install is impossible while pointing at the original URL.
 *
 * Only use this where the licence permits redistribution. Record where each
 * mirrored file came from in the recipe that consumes it.
 *
 * Usage:
 *   npx tsx scripts/mirror-asset.ts <local-file> <blob-path>
 */
import { readFileSync } from "fs";
import { basename } from "path";
import { loadEnvConfig } from "@next/env";
import { put } from "@vercel/blob";

loadEnvConfig(process.cwd());

async function main() {
  const [source, destination] = process.argv.slice(2);
  if (!source || !destination) {
    console.error("Usage: npx tsx scripts/mirror-asset.ts <local-file> <blob-path>");
    process.exit(1);
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("BLOB_READ_WRITE_TOKEN is not set. Pull it with: npx vercel env pull");
    process.exit(1);
  }

  const bytes = readFileSync(source);
  console.log(`Mirroring ${basename(source)} (${(bytes.length / 1024).toFixed(1)} KB) → ${destination}`);

  const blob = await put(destination, bytes, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  console.log(`\nMirrored: ${blob.url}`);
}

main().catch((err) => {
  console.error("mirror-asset failed:", err);
  process.exit(1);
});
