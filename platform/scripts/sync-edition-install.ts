/**
 * Push the install recipe from the seed onto NAMED editions only.
 *
 * The launcher reads install recipes from MongoDB, not from src/lib/data —
 * editing the seed changes nothing on its own. This is the narrow way to get a
 * corrected recipe live without seed-editions.ts, which loops every edition and
 * also flips parent games to published.
 *
 * Deliberately narrow, matching the rule for game sync in AGENTS.md:
 *   - You must name each edition explicitly. There is no "all" mode.
 *   - Only installConfig.playbound_installer is written. Names, descriptions,
 *     media, ordering, status and visibility are never touched.
 *   - Refuses to create editions. If a slug pair is not already in the DB it is
 *     reported and skipped, so a typo cannot invent a row.
 *
 * Usage (from platform/, with a real MONGODB_URI):
 *   npx tsx scripts/sync-edition-install.ts tes-arena/opentesarena
 *   npx tsx scripts/sync-edition-install.ts --dry-run holocure/playbound
 *
 * --dry-run prints the before/after recipe and writes nothing.
 */

import "dotenv/config";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Edition from "@/lib/models/Edition";
import { editions as seedEditions } from "@/lib/data/editions";

type Target = { gameSlug: string; slug: string };

function parseArgs(argv: string[]): { targets: Target[]; dryRun: boolean } {
  const dryRun = argv.includes("--dry-run");
  const targets: Target[] = [];
  for (const raw of argv.filter((a) => !a.startsWith("--"))) {
    const [gameSlug, slug] = raw.split("/");
    if (!gameSlug || !slug) {
      throw new Error(`Expected <gameSlug>/<editionSlug>, got "${raw}"`);
    }
    targets.push({ gameSlug, slug });
  }
  return { targets, dryRun };
}

async function main() {
  const { targets, dryRun } = parseArgs(process.argv.slice(2));
  if (targets.length === 0) {
    console.error("Name at least one edition, e.g. tes-arena/opentesarena");
    process.exitCode = 1;
    return;
  }

  await dbConnect();

  let updated = 0;
  let skipped = 0;

  for (const { gameSlug, slug } of targets) {
    const seed = seedEditions.find((e) => e.gameSlug === gameSlug && e.slug === slug);
    if (!seed) {
      console.error(`SKIP ${gameSlug}/${slug} — not in the seed file`);
      skipped++;
      continue;
    }

    const recipe = seed.installConfig?.playbound_installer;
    if (!recipe) {
      console.error(`SKIP ${gameSlug}/${slug} — seed has no playbound_installer recipe`);
      skipped++;
      continue;
    }

    const doc = await Edition.findOne({ gameSlug, slug });
    if (!doc) {
      console.error(`SKIP ${gameSlug}/${slug} — no such edition in the database`);
      skipped++;
      continue;
    }

    const before = doc.installConfig?.playbound_installer ?? null;
    console.log(`\n${gameSlug}/${slug}`);
    console.log("  before:", JSON.stringify(before));
    console.log("  after: ", JSON.stringify(recipe));

    if (dryRun) continue;

    // Dotted path so the rest of installConfig (steam, epic, browser…) survives.
    await Edition.updateOne(
      { _id: doc._id },
      { $set: { "installConfig.playbound_installer": recipe } }
    );
    updated++;
  }

  console.log(
    `\n${dryRun ? "Dry run — nothing written." : `Updated ${updated} edition(s).`}` +
      (skipped ? ` Skipped ${skipped}.` : "")
  );
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => undefined);
  process.exitCode = 1;
});
