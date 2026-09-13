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
import { createReadStream, statSync } from "fs";
import { basename } from "path";
import { Transform } from "stream";
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

  const { size } = statSync(source);
  console.log(`Mirroring ${basename(source)} (${(size / 1024 / 1024).toFixed(1)} MB) → ${destination}`);

  let uploaded = 0;
  let lastLog = Date.now();
  const startTime = Date.now();

  const tracker = new Transform({
    transform(chunk, _encoding, callback) {
      uploaded += chunk.length;
      const now = Date.now();
      if (now - lastLog >= 1500 || uploaded === size) {
        lastLog = now;
        const pct = ((uploaded / size) * 100).toFixed(1);
        const mb = (uploaded / 1024 / 1024).toFixed(1);
        const totalMb = (size / 1024 / 1024).toFixed(1);
        const elapsedSec = (now - startTime) / 1000;
        const speedMb = elapsedSec > 0 ? (uploaded / 1024 / 1024 / elapsedSec).toFixed(1) : "0.0";
        process.stdout.write(`\rUploading: ${pct}% (${mb} / ${totalMb} MB) · ${speedMb} MB/s...   `);
      }
      callback(null, chunk);
    },
  });

  /*
   * Streamed, not readFileSync'd. Node's readFileSync refuses anything over
   * 2 GiB outright (ERR_FS_FILE_TOO_LARGE) — the GoldenEye: Source installer
   * that prompted this is 2.02 GiB. A stream never holds the whole file in
   * memory at once, which also makes this safe for assets bigger than the
   * box's free RAM, not just bigger than 2 GiB.
   *
   * multipart is forced on rather than left to size-based inference: a
   * Readable has no .length the way a Buffer does, so there is nothing to
   * infer from, and multipart is the correct mode for every file worth using
   * this script on.
   */
  const blob = await put(destination, createReadStream(source).pipe(tracker), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    multipart: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  process.stdout.write("\n");
  console.log(`\nMirrored: ${blob.url}`);
}

main().catch((err) => {
  console.error("mirror-asset failed:", err);
  process.exit(1);
});
