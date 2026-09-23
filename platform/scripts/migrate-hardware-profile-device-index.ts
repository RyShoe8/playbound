/**
 * Widen UserHardwareProfile's unique index from `{userId}` alone to
 * `{userId, deviceId}`, for PlayBound Remote — a hardware profile is now per
 * physical PC, not per account, since Remote needs to compare a game against
 * "this laptop" vs "Ryan's gaming PC" separately.
 *
 * Mongo never drops a superseded index on its own — same situation as
 * migrate-review-index.ts, which this mirrors exactly. Until this runs, the
 * old `userId`-alone unique index is still enforced, so a second device's
 * profile upload for the same account fails with a duplicate-key error
 * instead of creating a second row.
 *
 * Existing documents have no `deviceId` — the schema default
 * (`PRIMARY_DEVICE_ID`, "primary") covers them going forward, but does not
 * retroactively rewrite what's already stored. This migration also backfills
 * `deviceId: "primary"` onto any existing document missing it, so the new
 * compound index has a real value to be unique against immediately rather
 * than colliding multiple `null`s together.
 *
 * Usage:
 *   npx tsx scripts/migrate-hardware-profile-device-index.ts                       # dry run
 *   npx tsx scripts/migrate-hardware-profile-device-index.ts --apply               # apply, fail loudly
 *   npx tsx scripts/migrate-hardware-profile-device-index.ts --apply --soft-fail   # safe in a deploy chain
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function isLegacyUserOnlyIndex(key: Record<string, unknown>): boolean {
  const fields = Object.keys(key);
  return fields.length === 1 && fields[0] === "userId";
}

async function main() {
  const apply = process.argv.includes("--apply");

  if (!process.env.MONGODB_URI) {
    console.warn("migrate:hardware-profile-device-index skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const { default: UserHardwareProfile, PRIMARY_DEVICE_ID } = await import(
    "../src/lib/models/UserHardwareProfile"
  );

  await dbConnect();
  const collection = UserHardwareProfile.collection;

  const backfillCount = await collection.countDocuments({
    $or: [{ deviceId: { $exists: false } }, { deviceId: null }],
  });
  console.log(`${backfillCount} document(s) missing deviceId.`);
  if (backfillCount > 0) {
    if (!apply) {
      console.log(`DRY RUN — would backfill deviceId: "${PRIMARY_DEVICE_ID}" on ${backfillCount} document(s).`);
    } else {
      const result = await collection.updateMany(
        { $or: [{ deviceId: { $exists: false } }, { deviceId: null }] },
        { $set: { deviceId: PRIMARY_DEVICE_ID } }
      );
      console.log(`Backfilled deviceId on ${result.modifiedCount} document(s).`);
    }
  }

  const indexes = (await collection.indexes()) as { name?: string; key: Record<string, unknown> }[];
  console.log(`Found ${indexes.length} index(es) on "${collection.collectionName}":`);
  for (const idx of indexes) {
    console.log(`  ${idx.name ?? "(unnamed)"}  ${JSON.stringify(idx.key)}`);
  }

  const legacy = indexes.filter((idx) => idx.name && isLegacyUserOnlyIndex(idx.key));
  if (legacy.length === 0) {
    console.log("\nNothing to do — the legacy { userId } index is not present.");
  } else {
    for (const idx of legacy) {
      if (!apply) {
        console.log(`\nDRY RUN — would drop "${idx.name}". Pass --apply to do it.`);
      } else {
        await collection.dropIndex(idx.name!);
        console.log(`\nDropped "${idx.name}".`);
      }
    }
  }

  if (apply) {
    // Recreating from the schema guarantees {userId, deviceId} exists before
    // the app starts relying on it, rather than waiting for autoIndex.
    await UserHardwareProfile.syncIndexes();
    console.log("Re-synced indexes from the schema.");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("migrate:hardware-profile-device-index failed:", err);
  if (process.argv.includes("--soft-fail")) {
    console.error(
      "migrate:hardware-profile-device-index: continuing anyway (--soft-fail). " +
        "Per-device hardware profiles stay off (one profile per account, last write " +
        "wins) until this succeeds; it will retry on the next deploy."
    );
    process.exit(0);
  }
  process.exit(1);
});
