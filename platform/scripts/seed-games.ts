/**
 * Upsert the static seed catalog into MongoDB when empty.
 * Runs after `next build` on Vercel so the first deploy seeds production.
 * Subsequent builds skip once any CatalogGame docs exist (won't overwrite CMS edits).
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  if (!process.env.MONGODB_URI) {
    console.warn("seed:games skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const CatalogGame = (await import("../src/lib/models/CatalogGame")).default;
  const { games } = await import("../src/lib/data/games");
  const { developersBySlug } = await import("../src/lib/data/developers");

  await dbConnect();

  const existing = await CatalogGame.countDocuments();
  if (existing > 0) {
    console.log(`seed:games skipped — catalog already has ${existing} game(s).`);
    process.exit(0);
  }

  let upserted = 0;
  for (const g of games) {
    const developerName = developersBySlug.get(g.developerSlug)?.name ?? null;
    await CatalogGame.findOneAndUpdate(
      { slug: g.slug },
      {
        $set: {
          ...g,
          githubRepo: g.githubRepo ?? null,
          coverImage: g.coverImage ?? null,
          screenshots: g.screenshots ?? [],
          developerName,
          published: true,
        },
      },
      { upsert: true, new: true }
    );
    upserted++;
    console.log(`OK  ${g.slug}`);
  }

  console.log(`Seeded ${upserted} games into MongoDB.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("seed:games failed:", err);
  process.exit(1);
});
