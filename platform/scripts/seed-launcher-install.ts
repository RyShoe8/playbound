/**
 * Patch launcherInstall recipes onto existing CatalogGame docs from seed data.
 * Runs after seed:games so production Mongo picks up recipes even when catalog exists.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  if (!process.env.MONGODB_URI) {
    console.warn("seed:launcher-install skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const CatalogGame = (await import("../src/lib/models/CatalogGame")).default;
  const { launcherInstallBySlug } = await import("../src/lib/data/launcherInstall");

  await dbConnect();

  let patched = 0;
  for (const [slug, recipe] of Object.entries(launcherInstallBySlug)) {
    const result = await CatalogGame.updateOne(
      { slug },
      { $set: { launcherInstall: recipe } }
    );
    if (result.matchedCount === 0) {
      console.warn(`seed:launcher-install — no catalog doc for ${slug}`);
      continue;
    }
    patched++;
    console.log(`OK  ${slug} (modified=${result.modifiedCount})`);
  }

  console.log(`Patched launcherInstall for ${patched} game(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("seed:launcher-install failed:", err);
  process.exit(1);
});
