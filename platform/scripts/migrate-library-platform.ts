/**
 * Make library entries platform-aware.
 *
 * Two steps:
 *   1. Backfill `platform: "desktop"` and `source: "launcher"` on entries that
 *      predate those fields. Every one of them was written by the launcher,
 *      which only runs on desktop, so that is their true platform rather than
 *      a guess.
 *   2. Drop the superseded { userId, gameSlug } unique index. It allowed one
 *      entry per game per user, which cannot represent "installed on my phone
 *      but not my desktop" — the replacement adds platform to the key.
 *
 * Mongo never drops a superseded index on its own, and until it goes the old
 * constraint rejects the second platform for a game.
 *
 * Runs automatically on deploy (see the build script). Idempotent: once the
 * backfill is done and the old index is gone, it finds nothing to do.
 *
 * Usage:
 *   npx tsx scripts/migrate-library-platform.ts                       # dry run
 *   npx tsx scripts/migrate-library-platform.ts --apply
 *   npx tsx scripts/migrate-library-platform.ts --apply --soft-fail   # what the build runs
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

/** The index this migration removes, identified by shape rather than name. */
function isLegacyLibraryIndex(key: Record<string, unknown>): boolean {
  const fields = Object.keys(key);
  return fields.length === 2 && fields.includes("userId") && fields.includes("gameSlug");
}

async function main() {
  const apply = process.argv.includes("--apply");

  if (!process.env.MONGODB_URI) {
    console.warn("migrate:library-platform skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const LibraryEntry = (await import("../src/lib/models/LibraryEntry")).default;

  await dbConnect();
  const collection = LibraryEntry.collection;

  // ── 1. Backfill ────────────────────────────────────────────────────────
  const missingPlatform = await collection.countDocuments({
    $or: [{ platform: { $exists: false } }, { platform: null }],
  });
  if (missingPlatform === 0) {
    console.log("Backfill: nothing to do — every entry already has a platform.");
  } else if (!apply) {
    console.log(
      `Backfill: DRY RUN — would set platform:"desktop" on ${missingPlatform} entry(ies).`
    );
  } else {
    const res = await collection.updateMany(
      { $or: [{ platform: { $exists: false } }, { platform: null }] },
      { $set: { platform: "desktop", source: "launcher" } }
    );
    console.log(`Backfill: set platform on ${res.modifiedCount} entry(ies).`);
  }

  // ── 2. Index swap ──────────────────────────────────────────────────────
  const indexes = (await collection.indexes()) as { name?: string; key: Record<string, unknown> }[];
  console.log(`\nFound ${indexes.length} index(es) on "${collection.collectionName}":`);
  for (const idx of indexes) {
    console.log(`  ${idx.name ?? "(unnamed)"}  ${JSON.stringify(idx.key)}`);
  }

  const legacy = indexes.filter((idx) => idx.name && isLegacyLibraryIndex(idx.key));
  if (legacy.length === 0) {
    console.log("\nIndex: nothing to do — the legacy { userId, gameSlug } index is gone.");
  } else {
    for (const idx of legacy) {
      if (!apply) {
        console.log(`\nIndex: DRY RUN — would drop "${idx.name}". Pass --apply to do it.`);
        continue;
      }
      await collection.dropIndex(idx.name!);
      console.log(`\nIndex: dropped "${idx.name}".`);
    }
  }

  if (apply) {
    // Recreate from the schema so the replacement exists before the app relies
    // on it, rather than waiting for Mongoose autoIndex.
    await LibraryEntry.syncIndexes();
    console.log("Re-synced indexes from the schema.");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("migrate:library-platform failed:", err);

  /**
   * The deploy runs this with --soft-fail so a transient database problem
   * cannot block a release. Without the migration the site still works — the
   * library is simply not yet platform-aware — whereas a failed build takes
   * everything down. Idempotent, so the next deploy retries.
   */
  if (process.argv.includes("--soft-fail")) {
    console.error(
      "migrate:library-platform: continuing anyway (--soft-fail). It will retry on the next deploy."
    );
    process.exit(0);
  }
  process.exit(1);
});
