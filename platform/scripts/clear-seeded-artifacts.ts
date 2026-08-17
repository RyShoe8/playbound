/**
 * Remove the demo rows the old mirror seeder inserted.
 *
 * There is a button for this on /admin/download-mirrors under Budget & Rules,
 * which is the easier path and needs no local environment. This script exists
 * for anyone who does have one.
 *
 *   npx tsx scripts/clear-seeded-artifacts.ts          # report only
 *   npx tsx scripts/clear-seeded-artifacts.ts --apply  # delete
 *
 * The ids and the deletion both come from lib/mirrors/seededArtifacts.ts, so
 * this and the admin button cannot drift apart.
 */

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const apply = process.argv.includes("--apply");

  const [{ default: dbConnect }, seeded, mongoose] = await Promise.all([
    import("../src/lib/db"),
    import("../src/lib/mirrors/seededArtifacts"),
    import("mongoose"),
  ]);

  await dbConnect();

  const report = await seeded.findSeededArtifacts();

  if (report.artifacts.length === 0) {
    console.log("No demo artifacts found — nothing to clear.");
    await mongoose.default.disconnect();
    return;
  }

  console.log(`Found ${report.artifacts.length} demo artifact(s):`);
  for (const a of report.artifacts) {
    console.log(`  ${a.artifactId}  totalDownloads=${a.totalDownloads} recent=${a.recentDownloads}`);
  }
  console.log(`and ${report.sourceCount} mirror source(s) attached to them.`);

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to delete.");
    await mongoose.default.disconnect();
    return;
  }

  const result = await seeded.clearSeededArtifacts();
  console.log(
    `\nDeleted ${result.artifactsDeleted} artifact(s) and ${result.sourcesDeleted} source(s).`
  );
  console.log("The table will refill from real downloads.");

  await mongoose.default.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
