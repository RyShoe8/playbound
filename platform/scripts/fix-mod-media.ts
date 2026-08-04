/**
 * Patch coverImage from seed data onto existing Mongo catalog mods.
 * Runs after seed:mods so production picks up new covers on every deploy.
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

    const result = await CatalogMod.updateOne(
      { slug: seed.slug },
      { $set: { coverImage: seed.coverImage } }
    );

    if (result.matchedCount === 0) continue;
    if (result.modifiedCount > 0) {
      patched++;
      console.log(`OK  ${seed.slug}`);
    }
  }

  console.log(`Patched cover art for ${patched} mod(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("fix:mod-media failed:", err);
  process.exit(1);
});
