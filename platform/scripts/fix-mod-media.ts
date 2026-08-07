/**
 * Backfill coverImage from seed data onto existing Mongo catalog mods whose
 * cover is still empty.
 *
 * Backfill-only, not overwrite — see fix-game-media.ts for why. This used to
 * $set unconditionally on every deploy, silently reverting any cover an
 * admin uploaded through the admin panel back to the seed's static image.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  if (!process.env.MONGODB_URI) {
    console.warn("fix:mod-media skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const CatalogMod = (await import("../src/lib/models/CatalogMod")).default;
  const { mods } = await import("../src/lib/data/mods");

  await dbConnect();

  let patched = 0;
  for (const seed of mods) {
    if (!seed.coverImage) continue;

    const existing = await CatalogMod.findOne({ slug: seed.slug })
      .select("coverImage")
      .lean<{ coverImage?: string | null }>();
    if (!existing || existing.coverImage) continue;

    await CatalogMod.updateOne({ slug: seed.slug }, { $set: { coverImage: seed.coverImage } });
    patched++;
    console.log(`OK  ${seed.slug}`);
  }

  console.log(`Backfilled cover art for ${patched} mod(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("fix:mod-media failed:", err);
  process.exit(1);
});
