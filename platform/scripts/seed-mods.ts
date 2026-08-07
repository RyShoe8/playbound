/**
 * Upsert curated seed mods into MongoDB.
 * Unlike seed:games, always upserts seed slugs so new mods ship without wiping admin-created mods.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  if (!process.env.MONGODB_URI) {
    console.warn("seed:mods skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const CatalogGame = (await import("../src/lib/models/CatalogGame")).default;
  const CatalogMod = (await import("../src/lib/models/CatalogMod")).default;
  const { mods } = await import("../src/lib/data/mods");
  const { developersBySlug } = await import("../src/lib/data/developers");
  const { defaultArtFor } = await import("../src/lib/gamePayload");
  // Same derivation the admin importer and save routes apply.
  const { ensureDerivedModFields } = await import("../src/lib/enrich");

  await dbConnect();

  const gameCount = await CatalogGame.countDocuments();
  if (gameCount === 0) {
    console.warn("seed:mods skipped — seed games first (CatalogGame is empty).");
    process.exit(0);
  }

  // Base game titles, so generated install steps say "OpenRA" not "openra".
  const baseTitles = new Map<string, string>(
    (
      await CatalogGame.find({}).select("slug title").lean<{ slug: string; title: string }[]>()
    ).map((g) => [g.slug, g.title])
  );

  let upserted = 0;
  for (const seed of mods) {
    const m = ensureDerivedModFields(seed, baseTitles.get(seed.baseGameSlug));
    const developerName = developersBySlug.get(m.developerSlug)?.name ?? null;
    const art = m.art ?? defaultArtFor([], m.slug);
    const existing = await CatalogMod.findOne({ slug: m.slug })
      .select("directUrl detectedVersion lastVersionCheckAt versionCheckStatus autoUpdatePinned")
      .lean();
    const prev = existing as {
      directUrl?: string;
      detectedVersion?: string;
      lastVersionCheckAt?: Date;
      versionCheckStatus?: string;
      autoUpdatePinned?: boolean;
    } | null;
    const preserveDirect =
      Boolean(prev?.lastVersionCheckAt) &&
      prev?.autoUpdatePinned !== false &&
      typeof prev?.directUrl === "string" &&
      prev.directUrl.length > 0 &&
      m.downloadKind === "direct-zip";

    await CatalogMod.findOneAndUpdate(
      { slug: m.slug },
      {
        $set: {
          slug: m.slug,
          title: m.title,
          tagline: m.tagline,
          description: m.description,
          baseGameSlug: m.baseGameSlug,
          developerSlug: m.developerSlug,
          developerName,
          license: m.license,
          releaseYear: m.releaseYear,
          sizeMB: m.sizeMB,
          website: m.website,
          githubRepo: m.githubRepo ?? null,
          downloadKind: m.downloadKind,
          assetPattern: m.assetPattern ?? null,
          directUrl: preserveDirect ? prev!.directUrl : m.directUrl ?? null,
          installRelativePath: m.installRelativePath || "mods",
          art,
          coverImage: m.coverImage ?? null,
          screenshots: m.screenshots ?? [],
          videos: m.videos ?? [],
          published: m.published,
          status: m.published ? "published" : "draft",
          managedBy: m.managedBy,
          longDescription: m.longDescription ?? null,
          whatItChanges: m.whatItChanges ?? null,
          compatibility: m.compatibility ?? null,
          installSteps: m.installSteps ?? [],
          faq: m.faq ?? [],
          ...(prev?.detectedVersion
            ? {
                detectedVersion: prev.detectedVersion,
                lastVersionCheckAt: prev.lastVersionCheckAt,
                versionCheckStatus: prev.versionCheckStatus,
                autoUpdatePinned: prev.autoUpdatePinned ?? true,
              }
            : {}),
        },
      },
      { upsert: true, new: true }
    );
    upserted++;
    console.log(`OK  ${m.slug} (${m.baseGameSlug})`);
  }

  console.log(`Seeded/updated ${upserted} mods into MongoDB.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("seed:mods failed:", err);
  process.exit(1);
});
