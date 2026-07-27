/**
 * Patch coverImage + screenshots for games whose seed art was wrong.
 * Runs after seed:games so production Mongo picks up media fixes even when
 * the catalog already exists (seed:games skips in that case).
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const MEDIA_FIX_SLUGS = ["beyond-all-reason", "hedgewars", "luanti"] as const;

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
  for (const slug of MEDIA_FIX_SLUGS) {
    const seed = games.find((g) => g.slug === slug);
    if (!seed) {
      console.warn(`fix:game-media — seed missing for ${slug}`);
      continue;
    }

    const result = await CatalogGame.updateOne(
      { slug },
      {
        $set: {
          coverImage: seed.coverImage ?? null,
          screenshots: seed.screenshots ?? [],
        },
      }
    );

    if (result.matchedCount === 0) {
      console.warn(`fix:game-media — no catalog doc for ${slug}`);
      continue;
    }

    patched++;
    console.log(`OK  ${slug} (modified=${result.modifiedCount})`);
  }

  console.log(`Patched media for ${patched} game(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("fix:game-media failed:", err);
  process.exit(1);
});
