/**
 * Upsert curated seed mods into MongoDB.
 * Unlike seed:games, always upserts seed slugs so new mods ship without wiping admin-created mods.
 * Existing CMS media and title/tagline/description/longDescription are never overwritten
 * when already set — seed only fills empty gaps.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function pickText(
  prev: string | null | undefined,
  seed: string | null | undefined
): string | null {
  const p = typeof prev === "string" ? prev.trim() : "";
  if (p) return prev as string;
  const s = typeof seed === "string" ? seed.trim() : "";
  return s ? (seed as string) : null;
}

function pickList(
  prev: string[] | null | undefined,
  seed: string[] | null | undefined
): string[] {
  if (Array.isArray(prev) && prev.length > 0) return prev;
  return Array.isArray(seed) && seed.length > 0 ? seed : [];
}

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

  // OpenArena was briefly miscategorized under TES Arena — drop those seed rows.
  const mistakenOpenArenaUnderTes = [
    "tes-arena-openarena",
    "tes-arena-oa-maps",
    "tes-arena-oa-moddb",
    "tes-arena-oa-wiki",
    "tes-arena-oa-source",
    "tes-arena-textures-oa",
    "tes-arena-bots",
    "tes-arena-ioq3",
    "tes-arena-ctf",
  ];
  const removedMistaken = await CatalogMod.deleteMany({
    slug: { $in: mistakenOpenArenaUnderTes },
  });
  if (removedMistaken.deletedCount) {
    console.log(`Removed ${removedMistaken.deletedCount} mistaken OpenArena-under-TES mod seed(s).`);
  }

  // Entries that were never mods — wikis, FAQs, forums, Discord invites,
  // storefront pages and repo meta-pages. Dropping them from the seed files is
  // not enough on its own because this script only ever upserts.
  const { retiredModSlugs } = await import("../src/lib/data/retiredMods");
  const removedRetired = await CatalogMod.deleteMany({ slug: { $in: retiredModSlugs } });
  if (removedRetired.deletedCount) {
    console.log(`Removed ${removedRetired.deletedCount} retired non-mod entr(ies).`);
  }

  for (const seed of mods) {
    const m = ensureDerivedModFields(seed, baseTitles.get(seed.baseGameSlug));
    const developerName = developersBySlug.get(m.developerSlug)?.name ?? null;
    const art = m.art ?? defaultArtFor([], m.slug);
    const existing = await CatalogMod.findOne({ slug: m.slug })
      .select(
        "directUrl detectedVersion lastVersionCheckAt versionCheckStatus autoUpdatePinned title tagline description longDescription coverImage screenshots videos"
      )
      .lean();
    const prev = existing as {
      directUrl?: string;
      detectedVersion?: string;
      lastVersionCheckAt?: Date;
      versionCheckStatus?: string;
      autoUpdatePinned?: boolean;
      title?: string;
      tagline?: string;
      description?: string;
      longDescription?: string | null;
      coverImage?: string | null;
      screenshots?: string[] | null;
      videos?: string[] | null;
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
          title: pickText(prev?.title, m.title) ?? m.title,
          tagline: pickText(prev?.tagline, m.tagline) ?? m.tagline,
          description: pickText(prev?.description, m.description) ?? m.description,
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
          installRelativePath: m.installRelativePath ?? "mods",
          platforms: m.platforms ?? [],
          art,
          coverImage: pickText(prev?.coverImage, m.coverImage),
          screenshots: pickList(prev?.screenshots, m.screenshots),
          videos: pickList(prev?.videos, m.videos),
          published: m.published,
          status: m.published ? "published" : "draft",
          managedBy: m.managedBy,
          longDescription: pickText(prev?.longDescription, m.longDescription),
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
