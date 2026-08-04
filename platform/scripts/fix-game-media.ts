/**
 * Patch cover/screenshots/videos and mobile store URLs from seed data onto
 * existing Mongo catalog docs. Runs after seed:games so production picks up
 * new fields even when the catalog already exists.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  if (!process.env.MONGODB_URI) {
    console.warn("fix:game-media skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const CatalogGame = (await import("../src/lib/models/CatalogGame")).default;
  const { games } = await import("../src/lib/data/games");

  await dbConnect();

  let patched = 0;
  for (const seed of games) {
    const screenshots = seed.screenshots ?? [];
    const videos = seed.videos ?? [];
    const hasMedia = Boolean(seed.coverImage || screenshots.length || videos.length);
    const hasStores = Boolean(seed.androidStoreUrl || seed.iosStoreUrl);
    if (!hasMedia && !hasStores) continue;

    const result = await CatalogGame.updateOne(
      { slug: seed.slug },
      {
        $set: {
          ...(seed.coverImage ? { coverImage: seed.coverImage } : {}),
          ...(screenshots.length ? { screenshots } : {}),
          ...(videos.length ? { videos } : {}),
          ...(seed.androidStoreUrl ? { androidStoreUrl: seed.androidStoreUrl } : {}),
          ...(seed.iosStoreUrl ? { iosStoreUrl: seed.iosStoreUrl } : {}),
        },
      }
    );

    if (result.matchedCount === 0) continue;
    if (result.modifiedCount > 0) {
      patched++;
      console.log(`OK  ${seed.slug}`);
    }
  }

  console.log(`Patched media/store URLs for ${patched} game(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("fix:game-media failed:", err);
  process.exit(1);
});
