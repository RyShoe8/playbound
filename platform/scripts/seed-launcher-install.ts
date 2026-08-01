/**
 * Patch launcherInstall recipes onto existing CatalogGame docs from seed data.
 * Merges structural fields; preserves url/fileName/versionLabel when cron auto-updated.
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
  let missingPaths = 0;
  for (const [slug, recipe] of Object.entries(launcherInstallBySlug)) {
    if (
      (recipe.kind === "github-installer" || recipe.kind === "direct-installer") &&
      !(Array.isArray(recipe.knownExePaths) && recipe.knownExePaths.length > 0)
    ) {
      console.warn(`seed:launcher-install — installer recipe ${slug} is missing knownExePaths`);
      missingPaths++;
    }
    const existing = await CatalogGame.findOne({ slug }).select("launcherInstall").lean();
    const prev = (existing as { launcherInstall?: Record<string, unknown> } | null)?.launcherInstall;
    const preservePinned =
      Boolean(prev?.lastVersionCheckAt) ||
      (prev?.autoUpdatePinned !== false &&
        prev?.versionCheckStatus === "updated" &&
        typeof prev?.url === "string" &&
        prev.url !== recipe.url);

    const merged = {
      ...recipe,
      detectedVersion: prev?.detectedVersion ?? null,
      lastVersionCheckAt: prev?.lastVersionCheckAt ?? null,
      versionCheckStatus: prev?.versionCheckStatus ?? null,
      versionCheckNote: prev?.versionCheckNote ?? null,
      autoUpdatePinned: prev?.autoUpdatePinned ?? true,
      ...(preservePinned
        ? {
            url: (prev?.url as string) || recipe.url,
            fileName: (prev?.fileName as string) || recipe.fileName,
            versionLabel: (prev?.versionLabel as string) || recipe.versionLabel,
          }
        : {}),
    };

    const result = await CatalogGame.updateOne({ slug }, { $set: { launcherInstall: merged } });
    if (result.matchedCount === 0) {
      console.warn(`seed:launcher-install — no catalog doc for ${slug}`);
      continue;
    }
    patched++;
    console.log(`OK  ${slug} (modified=${result.modifiedCount}${preservePinned ? ", preserved pinned URL" : ""})`);
  }

  console.log(`Patched launcherInstall for ${patched} game(s).`);
  if (missingPaths > 0) {
    console.warn(`WARNING: ${missingPaths} installer recipe(s) missing knownExePaths`);
  }
  process.exit(missingPaths > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("seed:launcher-install failed:", err);
  process.exit(1);
});
