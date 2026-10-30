/**
 * Create missing indexes by hand (the hourly cron api/cron/ensure-indexes does the same).
 * Never drops an index. See src/lib/ensureIndexes.ts.
 *
 * Usage:
 *   npx tsx scripts/ensure-indexes.ts           # dry run: what is missing
 *   npx tsx scripts/ensure-indexes.ts --apply   # create what is missing
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const apply = process.argv.includes("--apply");
  if (!process.env.MONGODB_URI) {
    console.warn("db:ensure-indexes skipped: MONGODB_URI is not set.");
    return;
  }
  const dbConnect = (await import("../src/lib/db")).default;
  const mongoose = await dbConnect();
  await import("../src/lib/models/allModels");
  const { ensureIndexes } = await import("../src/lib/ensureIndexes");
  const result = await ensureIndexes(Object.values(mongoose.models), { apply, budgetMs: 10 * 60_000 });
  if (!apply && result.missing) console.info("Dry run: run again with --apply to create them.");
  await mongoose.disconnect();
  if (result.failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
