/**
 * Patch download fields on NAMED catalog mods only.
 *
 * The launcher reads install recipes from MongoDB. Editing seed files does
 * nothing on its own. This is the narrow way to fix Combined Arms, VoxeLibre,
 * and DREAM without touching the whole catalog.
 *
 *   - You must name each slug. There is no "all" mode.
 *   - Only downloadKind, assetPattern, directUrl, githubRepo, and website
 *     are written. Titles, copy, and media are never touched.
 *   - Refuses to create mods. Missing slugs are reported and skipped.
 *
 * Usage (from platform/, with a real MONGODB_URI):
 *   npx tsx scripts/patch-named-mods.ts openra-combined-arms luanti-voxelibre dfu-dream
 *   npx tsx scripts/patch-named-mods.ts --dry-run dfu-dream
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function parseArgs(argv: string[]): { slugs: string[]; dryRun: boolean } {
  const dryRun = argv.includes("--dry-run");
  const slugs = argv.filter((a) => !a.startsWith("--"));
  return { slugs, dryRun };
}

async function main() {
  const { slugs, dryRun } = parseArgs(process.argv.slice(2));
  if (slugs.length === 0) {
    console.error("Name at least one mod slug, e.g. dfu-dream");
    console.error("Usage: npx tsx scripts/patch-named-mods.ts [--dry-run] <slug>…");
    process.exitCode = 1;
    return;
  }

  if (!process.env.MONGODB_URI) {
    console.error(
      "MONGODB_URI is not set. Run this from platform/ with the production value " +
        "available (.env.local, or `vercel env pull`)."
    );
    process.exitCode = 1;
    return;
  }

  const mongoose = (await import("mongoose")).default;
  const dbConnect = (await import("../src/lib/db")).default;
  const CatalogMod = (await import("../src/lib/models/CatalogMod")).default;
  const { mods } = await import("../src/lib/data/mods");

  await dbConnect();

  let updated = 0;
  let skipped = 0;

  for (const slug of slugs) {
    const seed = mods.find((m) => m.slug === slug);
    if (!seed) {
      console.error(`SKIP ${slug} — not in the seed file`);
      skipped++;
      continue;
    }

    const patch = {
      website: seed.website,
      githubRepo: seed.githubRepo ?? null,
      downloadKind: seed.downloadKind,
      assetPattern: seed.assetPattern ?? null,
      directUrl: seed.directUrl ?? null,
    };

    const doc = await CatalogMod.findOne({ slug }).select("_id website githubRepo downloadKind assetPattern directUrl").lean();
    if (!doc) {
      console.error(`SKIP ${slug} — no such mod in the database`);
      skipped++;
      continue;
    }

    console.log(`\n${slug}`);
    console.log("  before:", JSON.stringify({
      website: doc.website,
      githubRepo: doc.githubRepo,
      downloadKind: doc.downloadKind,
      assetPattern: doc.assetPattern,
      directUrl: doc.directUrl,
    }));
    console.log("  after: ", JSON.stringify(patch));

    if (dryRun) continue;

    await CatalogMod.updateOne({ _id: doc._id }, { $set: patch });
    updated++;
  }

  console.log(
    `\n${dryRun ? "Dry run — nothing written." : `Updated ${updated} mod(s).`}` +
      (skipped ? ` Skipped ${skipped}.` : "")
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
