/**
 * Drop the superseded { gameSlug, userId } unique index on reviews.
 *
 * Reviews gained an optional `editionSlug`, and the unique constraint moved to
 * { gameSlug, editionSlug, userId } so a user can review both the Official and
 * a community edition of the same game.
 *
 * Mongo never drops a superseded index on its own. Until this runs, the old
 * index is still enforced and the second review will be rejected with a
 * duplicate-key error — so this must run once against each environment.
 *
 * Safe to re-run: it does nothing if the old index is already gone.
 *
 * Usage:
 *   npx tsx scripts/migrate-review-index.ts           # dry run
 *   npx tsx scripts/migrate-review-index.ts --apply
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

/** The index this migration removes, by its shape rather than its name. */
function isLegacyReviewIndex(key: Record<string, unknown>): boolean {
  const fields = Object.keys(key);
  return fields.length === 2 && fields.includes("gameSlug") && fields.includes("userId");
}

async function main() {
  const apply = process.argv.includes("--apply");

  if (!process.env.MONGODB_URI) {
    console.warn("migrate:review-index skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const Review = (await import("../src/lib/models/Review")).default;

  await dbConnect();
  const collection = Review.collection;

  const indexes = (await collection.indexes()) as { name?: string; key: Record<string, unknown> }[];
  console.log(`Found ${indexes.length} index(es) on "${collection.collectionName}":`);
  for (const idx of indexes) {
    console.log(`  ${idx.name ?? "(unnamed)"}  ${JSON.stringify(idx.key)}`);
  }

  const legacy = indexes.filter((idx) => idx.name && isLegacyReviewIndex(idx.key));
  if (legacy.length === 0) {
    console.log("\nNothing to do — the legacy { gameSlug, userId } index is not present.");
    process.exit(0);
  }

  for (const idx of legacy) {
    if (!apply) {
      console.log(`\nDRY RUN — would drop "${idx.name}". Pass --apply to do it.`);
      continue;
    }
    await collection.dropIndex(idx.name!);
    console.log(`\nDropped "${idx.name}".`);
  }

  if (apply) {
    // Recreating from the schema guarantees the replacement exists before the
    // app starts relying on it, rather than waiting for Mongoose autoIndex.
    await Review.syncIndexes();
    console.log("Re-synced indexes from the schema.");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("migrate:review-index failed:", err);
  process.exit(1);
});
