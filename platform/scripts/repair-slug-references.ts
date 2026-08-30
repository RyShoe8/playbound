/**
 * Repoint rows left behind by an earlier game rename.
 *
 * A game slug is a foreign key by value. Renaming the catalog document updates
 * one row; anything that still holds the old slug keeps pointing at a name
 * nothing answers to. The rename cascade handles this now, but it did not
 * always cover every collection — gear recommendations in particular were
 * missed, which is how the admin hardware section came to report "game not
 * found" for a game that plainly exists.
 *
 * This repairs those rows for a named game, using the old slugs the rename
 * already recorded in `previousSlugs`. It reuses cascadeGameSlugRename rather
 * than reimplementing the update, so a collection can never be repaired here
 * in a way that differs from how a live rename does it.
 *
 * Usage (from platform/):
 *   npx tsx scripts/repair-slug-references.ts --games metal-slug-awakening
 *   npx tsx scripts/repair-slug-references.ts --games a,b --apply
 *
 * Reports what it would move and changes nothing unless --apply is passed.
 * Refuses to run without --games: this writes to curated production data, and
 * an unscoped run is never what anybody meant.
 */

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

function describe(report: Record<string, number>): string {
  const entries = Object.entries(report);
  if (entries.length === 0) return "nothing to move";
  return entries.map(([k, n]) => `${k}: ${n}`).join(", ");
}

async function main() {
  const apply = process.argv.includes("--apply");
  const gamesArg = argValue("--games");

  if (!gamesArg) {
    console.error(
      "repair:slug-references needs --games <slug[,slug]>. Refusing to run unscoped."
    );
    process.exit(1);
  }

  const slugs = gamesArg
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (slugs.length === 0) {
    console.error("No usable slugs in --games.");
    process.exit(1);
  }

  const [{ default: dbConnect }, { default: CatalogGame }, rename, mongoose] = await Promise.all([
    import("../src/lib/db"),
    import("../src/lib/models/CatalogGame"),
    import("../src/lib/renameGameSlug"),
    import("mongoose"),
  ]);

  await dbConnect();

  let movedAnything = false;

  for (const slug of slugs) {
    const game = (await CatalogGame.findOne({ slug }).select("slug previousSlugs").lean()) as
      | { slug: string; previousSlugs?: string[] }
      | null;

    if (!game) {
      console.error(`  ${slug}: no catalog game with that slug — skipping.`);
      continue;
    }

    const previous = (game.previousSlugs || []).filter((p) => p && p !== game.slug);
    if (previous.length === 0) {
      console.log(`  ${slug}: no previous slugs recorded — nothing to repair.`);
      continue;
    }

    for (const old of previous) {
      // Preview first, always: the counts are what makes --apply a decision
      // rather than a leap.
      const preview = await rename.previewGameSlugRename(old, game.slug);
      const summary = describe(preview);
      if (Object.keys(preview).length === 0) {
        console.log(`  ${slug}: "${old}" -> "${game.slug}" — ${summary}`);
        continue;
      }

      movedAnything = true;
      if (!apply) {
        console.log(`  ${slug}: "${old}" -> "${game.slug}" — WOULD MOVE ${summary}`);
        continue;
      }

      const report = await rename.cascadeGameSlugRename(old, game.slug);
      console.log(`  ${slug}: "${old}" -> "${game.slug}" — moved ${describe(report)}`);
    }
  }

  if (!apply && movedAnything) {
    console.log("\nDry run. Re-run with --apply to write these changes.");
  }

  await mongoose.default.disconnect();
}

main().catch((err) => {
  console.error("repair:slug-references failed:", err);
  process.exit(1);
});
