/**
 * Upsert the seed developers into MongoDB.
 *
 * Insert-only per slug: an existing developer is left alone so admin edits
 * (renamed teams, rewritten bios, changed hues) survive every redeploy.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  if (!process.env.MONGODB_URI) {
    console.warn("seed:developers skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const Developer = (await import("../src/lib/models/Developer")).default;
  const { developers } = await import("../src/lib/data/developers");

  await dbConnect();

  let created = 0;
  let skipped = 0;

  for (const d of developers) {
    const existing = await Developer.findOne({ slug: d.slug }).lean();
    if (existing) {
      skipped++;
      continue;
    }
    await Developer.create({
      slug: d.slug,
      name: d.name,
      tagline: d.tagline,
      about: d.about,
      founded: d.founded,
      location: d.location,
      website: d.website,
      artHue: d.artHue,
      published: true,
    });
    created++;
    console.log(`OK  ${d.slug}`);
  }

  console.log(`Seeded ${created} developer(s), left ${skipped} existing untouched.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("seed:developers failed:", err);
  process.exit(1);
});
