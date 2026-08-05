/**
 * Re-encode owned static media under public/games and public/mods to WebP,
 * and rewrite matching paths in seed data files.
 *
 * Usage: npm run compress:static-media
 */
import fs from "fs";
import path from "path";
import { compressImageBuffer } from "../src/lib/compressImage";

const PUBLIC_ROOTS = [
  path.join(process.cwd(), "public", "games"),
  path.join(process.cwd(), "public", "mods"),
];

const SEED_FILES = [
  path.join(process.cwd(), "src", "lib", "data", "games.ts"),
  path.join(process.cwd(), "src", "lib", "data", "mods.ts"),
];

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function walkImages(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkImages(full, out);
    else if (IMAGE_EXT.has(path.extname(name).toLowerCase())) out.push(full);
  }
  return out;
}

function publicUrlPath(absFile: string): string {
  const rel = path.relative(path.join(process.cwd(), "public"), absFile).split(path.sep).join("/");
  return `/${rel}`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  const files = PUBLIC_ROOTS.flatMap((root) => walkImages(root));
  if (files.length === 0) {
    console.log("No images found under public/games or public/mods.");
    process.exit(0);
  }

  let converted = 0;
  let skipped = 0;
  let beforeTotal = 0;
  let afterTotal = 0;
  /** old public URL path → new public URL path */
  const rewrites = new Map<string, string>();

  for (const file of files) {
    const before = fs.statSync(file).size;
    beforeTotal += before;
    const input = fs.readFileSync(file);
    const oldUrl = publicUrlPath(file);
    const dir = path.dirname(file);
    const base = path.basename(file, path.extname(file));
    const outPath = path.join(dir, `${base}.webp`);

    try {
      const { buffer } = await compressImageBuffer(input);
      // Skip rewrite if already webp and not meaningfully smaller (optional re-encode still ok).
      fs.writeFileSync(outPath, buffer);
      afterTotal += buffer.length;

      const newUrl = publicUrlPath(outPath);
      if (oldUrl !== newUrl) {
        rewrites.set(oldUrl, newUrl);
        if (fs.existsSync(file) && path.resolve(file) !== path.resolve(outPath)) {
          fs.unlinkSync(file);
        }
      } else {
        // Same path (already .webp) — rewritten in place.
        rewrites.set(oldUrl, newUrl);
      }

      converted += 1;
      console.log(
        `OK  ${oldUrl} → ${newUrl}  ${formatBytes(before)} → ${formatBytes(buffer.length)}`
      );
    } catch (err) {
      skipped += 1;
      afterTotal += before;
      console.warn(`SKIP ${oldUrl}:`, err instanceof Error ? err.message : err);
    }
  }

  // Map cover.jpg/png paths to cover.webp whenever the webp sibling exists.
  for (const root of PUBLIC_ROOTS) {
    if (!fs.existsSync(root)) continue;
    const webps = walkImages(root).filter((f) => f.toLowerCase().endsWith(".webp"));
    for (const webp of webps) {
      const webpUrl = publicUrlPath(webp);
      const baseNoExt = webpUrl.replace(/\.webp$/i, "");
      for (const ext of [".jpg", ".jpeg", ".png", ".JPG", ".JPEG", ".PNG"]) {
        rewrites.set(`${baseNoExt}${ext}`, webpUrl);
      }
      rewrites.set(webpUrl, webpUrl);
    }
  }

  let seedEdits = 0;
  for (const seedPath of SEED_FILES) {
    if (!fs.existsSync(seedPath)) continue;
    let text = fs.readFileSync(seedPath, "utf8");
    const original = text;
    for (const [from, to] of rewrites) {
      if (from === to) continue;
      if (text.includes(from)) {
        text = text.split(from).join(to);
      }
    }
    // Catch remaining local cover paths that still use jpg/png under /games or /mods.
    text = text.replace(
      /(\/(?:games|mods)\/[a-z0-9_./-]+\/[a-z0-9_.-]+)\.(?:jpe?g|png)/gi,
      (full, base: string) => {
        const candidate = `${base}.webp`;
        const abs = path.join(process.cwd(), "public", candidate.replace(/^\//, ""));
        if (fs.existsSync(abs)) {
          seedEdits += 1;
          return candidate;
        }
        return full;
      }
    );
    if (text !== original) {
      fs.writeFileSync(seedPath, text);
      console.log(`Updated seeds: ${path.relative(process.cwd(), seedPath)}`);
    }
  }

  console.log(
    `\nDone — converted ${converted}, skipped ${skipped}, seed path replacements ~${seedEdits}.`
  );
  console.log(
    `Total size ${formatBytes(beforeTotal)} → ${formatBytes(afterTotal)} (${
      beforeTotal > 0 ? Math.round((1 - afterTotal / beforeTotal) * 100) : 0
    }% smaller).`
  );
}

main().catch((err) => {
  console.error("compress:static-media failed:", err);
  process.exit(1);
});
