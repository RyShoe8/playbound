/**
 * Upsert seed weekly issues into Mongo when the collection is empty.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  if (!process.env.MONGODB_URI) {
    console.warn("seed:weekly skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const WeeklyIssue = (await import("../src/lib/models/WeeklyIssue")).default;
  const { weeklyIssuesSeed, issueSlug } = await import("../src/lib/data/weekly");

  await dbConnect();

  const existing = await WeeklyIssue.countDocuments();
  if (existing > 0) {
    console.log(`seed:weekly skipped — already has ${existing} issue(s).`);
    process.exit(0);
  }

  let upserted = 0;
  for (const seed of weeklyIssuesSeed) {
    const slug = issueSlug(seed);
    await WeeklyIssue.findOneAndUpdate(
      { slug },
      {
        $set: {
          slug,
          year: seed.year,
          week: seed.week,
          gameSlug: seed.gameSlug,
          publishedAt: seed.publishedAt,
          published: seed.published !== false,
        },
      },
      { upsert: true, new: true }
    );
    upserted++;
    console.log(`OK  ${slug}`);
  }

  console.log(`Seeded ${upserted} weekly issue(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("seed:weekly failed:", err);
  process.exit(1);
});
