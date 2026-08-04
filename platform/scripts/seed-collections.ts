/**
 * Upsert the curated seed collections into MongoDB.
 *
 * Insert-only per slug: an existing collection is left alone so admin edits
 * (reordering, added games, renamed titles) survive every redeploy.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  if (!process.env.MONGODB_URI) {
    console.warn("seed:collections skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const CatalogCollection = (await import("../src/lib/models/CatalogCollection")).default;
  const { collections } = await import("../src/lib/data/collections");

  await dbConnect();

  let created = 0;
  let skipped = 0;

  for (const [i, c] of collections.entries()) {
    const existing = await CatalogCollection.findOne({ slug: c.slug }).lean();
    if (existing) {
      skipped++;
      continue;
    }
    await CatalogCollection.create({
      slug: c.slug,
      title: c.title,
      description: c.description,
      gameSlugs: c.gameSlugs,
      published: true,
      // Preserve the hand-tuned order the static file shipped in.
      sortOrder: i,
    });
    created++;
  }

  console.log(
    `seed:collections — created ${created}, left ${skipped} existing untouched.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("seed:collections failed:", err);
  process.exit(1);
});
