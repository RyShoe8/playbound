import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Artwork committed to public/ bypasses the upload pipeline.
 *
 * Everything uploaded through admin goes through `compressImageBuffer` and
 * comes out WebP, but a file dropped straight into `public/` never touches it.
 * That is how a 1 MB JPEG ended up shipping as an edition hero image — five
 * times the size of the next largest asset — while the compression engine sat
 * there working perfectly on everything else.
 *
 * This walks the tree rather than checking a list, so a new hand-placed asset
 * is caught rather than needing someone to remember this file exists.
 */

const ROOT = "public/games";
const IMAGE = /\.(jpe?g|png|gif|bmp|tiff?)$/i;

/** Generous: the point is to catch an uncompressed original, not to nag. */
const MAX_BYTES = 400 * 1024;

/**
 * Kept only until the catalog stops pointing at them.
 *
 * The WebP beside this JPEG is 80% smaller and the seed already uses it, but
 * the live edition's `branding.heroImage` still names the .jpg — and EditionCard
 * treats a dead URL as a satisfied first branch, so it renders an empty card
 * rather than falling through to the logo. Deleting the file before the
 * database is updated would blank the edition.
 *
 * Remove the file and this entry once the HoloCure PlayBound edition's hero
 * image is repointed at playbound.webp in admin.
 */
const PENDING_REMOVAL = ["playbound.jpg"];

function isPendingRemoval(file: string): boolean {
  return PENDING_REMOVAL.some((name) => file.endsWith(name));
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

describe("images committed to public/games", () => {
  const files = walk(ROOT);

  it("finds the asset tree", () => {
    // A rename that empties this would make every check below vacuous.
    expect(files.length).toBeGreaterThan(0);
  });

  it("has no oversized image", () => {
    const heavy = files
      .filter((f) => /\.(jpe?g|png|gif|webp|avif)$/i.test(f))
      .map((f) => ({ f, size: statSync(f).size }))
      .filter(({ f, size }) => size > MAX_BYTES && !isPendingRemoval(f))
      .map(({ f, size }) => `${f} (${Math.round(size / 1024)} KB)`);

    expect(
      heavy,
      "Run these through compressImageBuffer — an upload would have been WebP'd automatically"
    ).toEqual([]);
  });

  it("prefers WebP over source formats", () => {
    /*
     * Not a hard rule about quality — a JPEG here means the file skipped the
     * pipeline, which is the actual thing worth knowing.
     */
    const unprocessed = files.filter((f) => IMAGE.test(f) && !isPendingRemoval(f));
    expect(unprocessed, "Committed straight to public/ instead of uploaded").toEqual([]);
  });
});
