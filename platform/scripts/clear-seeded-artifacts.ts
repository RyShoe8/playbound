/**
 * Remove the demo rows the old mirror seeder inserted.
 *
 * `ensureSeedArtifacts()` used to run on every admin page load and, when the
 * Artifact collection was empty, insert five hardcoded artifacts with invented
 * figures — 842 downloads for HoloCure, 620 for Warzone 2100, and so on. Those
 * numbers were indistinguishable from real ones in the admin table, so the
 * whole column was unreadable.
 *
 * The seeder is gone. This clears what it already wrote, so the table starts
 * empty and fills from real downloads.
 *
 * Scoped to exactly the five seeded ids and their sources. It will not touch
 * an artifact registered by a real download, even one for the same game — a
 * real HoloCure row would carry its own version in the id.
 *
 *   npx tsx scripts/clear-seeded-artifacts.ts          # report only
 *   npx tsx scripts/clear-seeded-artifacts.ts --apply  # delete
 */

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

/** Exactly the ids INITIAL_ARTIFACTS defined — nothing pattern-matched. */
const SEEDED_ARTIFACT_IDS = [
  "holocure-0.7.1",
  "openra-2026.03",
  "warzone2100-4.5.1",
  "flightgear-2020.3.18",
  "endless-sky-0.10.4",
];

async function main() {
  const apply = process.argv.includes("--apply");

  const [{ default: dbConnect }, { default: Artifact }, { default: MirrorSource }, mongoose] =
    await Promise.all([
      import("../src/lib/db"),
      import("../src/lib/models/Artifact"),
      import("../src/lib/models/MirrorSource"),
      import("mongoose"),
    ]);

  await dbConnect();

  const artifacts = await Artifact.find({ artifactId: { $in: SEEDED_ARTIFACT_IDS } })
    .select("artifactId totalDownloads recentDownloads")
    .lean();

  if (artifacts.length === 0) {
    console.log("No seeded artifacts found — nothing to clear.");
    await mongoose.default.disconnect();
    return;
  }

  console.log(`Found ${artifacts.length} seeded artifact(s):`);
  for (const a of artifacts) {
    console.log(`  ${a.artifactId}  totalDownloads=${a.totalDownloads} recent=${a.recentDownloads}`);
  }

  const sources = await MirrorSource.countDocuments({
    artifactId: { $in: SEEDED_ARTIFACT_IDS },
  });
  console.log(`and ${sources} mirror source(s) attached to them.`);

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to delete.");
    await mongoose.default.disconnect();
    return;
  }

  const delArtifacts = await Artifact.deleteMany({
    artifactId: { $in: SEEDED_ARTIFACT_IDS },
  });
  const delSources = await MirrorSource.deleteMany({
    artifactId: { $in: SEEDED_ARTIFACT_IDS },
  });

  console.log(
    `\nDeleted ${delArtifacts.deletedCount} artifact(s) and ${delSources.deletedCount} source(s).`
  );
  console.log("The table will refill from real downloads.");

  await mongoose.default.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
