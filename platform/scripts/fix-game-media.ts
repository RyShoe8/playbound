/**
 * Backfill cover/screenshots/videos, store URLs, and steamAppId from seed data
 * onto existing Mongo catalog docs whose fields are still empty.
 *
 * Backfill-only, not overwrite: each field is only $set when the live
 * document doesn't already have a value for it. This used to $set
 * unconditionally on every deploy, which meant a cover an admin uploaded
 * through the admin panel got silently reverted to the seed's static
 * coverImage on the next push — confirmed happening to flightgear and
 * others. Once a field has any value (admin-set or previously backfilled
 * from seed), this script leaves it alone for good.
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
    const hasSteam = Boolean(seed.steamAppId);
    if (!hasMedia && !hasStores && !hasSteam) continue;

    const existing = await CatalogGame.findOne({ slug: seed.slug })
      .select("coverImage screenshots videos androidStoreUrl iosStoreUrl steamAppId")
      .lean<{
        coverImage?: string | null;
        screenshots?: string[];
        videos?: string[];
        androidStoreUrl?: string | null;
        iosStoreUrl?: string | null;
        steamAppId?: string | null;
      }>();
    if (!existing) continue;

    const set: Record<string, unknown> = {};
    if (seed.coverImage && !existing.coverImage) set.coverImage = seed.coverImage;
    if (screenshots.length && !(existing.screenshots?.length)) set.screenshots = screenshots;
    if (videos.length && !(existing.videos?.length)) set.videos = videos;
    if (seed.androidStoreUrl && !existing.androidStoreUrl) set.androidStoreUrl = seed.androidStoreUrl;
    if (seed.iosStoreUrl && !existing.iosStoreUrl) set.iosStoreUrl = seed.iosStoreUrl;
    if (seed.steamAppId && !existing.steamAppId) set.steamAppId = seed.steamAppId;

    if (Object.keys(set).length === 0) continue;

    await CatalogGame.updateOne({ slug: seed.slug }, { $set: set });
    patched++;
    console.log(`OK  ${seed.slug} (${Object.keys(set).join(", ")})`);
  }

  console.log(`Backfilled empty media/store/steam fields for ${patched} game(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("fix:game-media failed:", err);
  process.exit(1);
});
