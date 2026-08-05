/**
 * Drop the superseded { gameSlug, userId } unique index on reviews.
 *
 * Reviews gained an optional `editionSlug`, and the unique constraint moved to
 * { gameSlug, editionSlug, userId } so a user can review both the Official and
 * a community edition of the same game.
 *
 * Mongo never drops a superseded index on its own. Until this runs, the old
 * index is still enforced and the second review on a different edition is
 * rejected with a duplicate-key error.
 *
 * This runs automatically on every deploy — `npm run build` invokes
 * migrate:review-index:apply before the seed scripts — so no manual step is
 * needed in normal operation. It is idempotent: once the old index is gone it
 * finds nothing to do and exits immediately.
 *
 * Usage:
 *   npx tsx scripts/migrate-review-index.ts                       # dry run
 *   npx tsx scripts/migrate-review-index.ts --apply               # apply, fail loudly
 *   npx tsx scripts/migrate-review-index.ts --apply --soft-fail   # what the build runs
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

  /**
   * In the deploy pipeline this runs with --soft-fail so a transient database
   * blip cannot block a release. The site is fully functional without the
   * migration — only the second review on a different edition is refused, and
   * the API says so explicitly — whereas a failed build takes the whole
   * deploy down. The migration is idempotent, so the next deploy retries it.
   *
   * Run by hand without the flag and it exits non-zero, so a human running it
   * deliberately still sees the failure.
   */
  if (process.argv.includes("--soft-fail")) {
    console.error(
      "migrate:review-index: continuing anyway (--soft-fail). Per-edition reviews " +
        "stay disabled until this succeeds; it will retry on the next deploy."
    );
    process.exit(0);
  }
  process.exit(1);
});
