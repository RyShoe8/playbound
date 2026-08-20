/**
 * Insert-only catalog wave. Creates missing edition and mod rows from the
 * August 2026 seed files. Never $sets an existing document, never deletes,
 * never publishes parent games.
 *
 * Use this instead of seed:editions, which loops the whole catalog. (seed:mods
 * was removed for the same reason.)
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const NEW_EDITION_KEYS = [
  "freedoom/ashes-2063",
  "freedoom/pirate-doom",
  "openttd/jgrpp",
  "wolfenstein-enemy-territory/truecombat-elite",
  "daggerfall/playbound-remastered",
  "openra/official",
  "openra/combined-arms",
  "luanti/official",
  "luanti/voxelibre",
];

async function main() {
  if (!process.env.MONGODB_URI) {
    console.warn("insert-catalog-wave skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const Edition = (await import("../src/lib/models/Edition")).default;
  const CatalogGame = (await import("../src/lib/models/CatalogGame")).default;
  const CatalogMod = (await import("../src/lib/models/CatalogMod")).default;
  const { editions } = await import("../src/lib/data/editions");
  const { catalogWaveAug2026Mods } = await import("../src/lib/data/catalogWaveAug2026Mods");
  const { developersBySlug } = await import("../src/lib/data/developers");
  const { defaultArtFor } = await import("../src/lib/gamePayload");
  const { ensureDerivedModFields } = await import("../src/lib/enrich");

  await dbConnect();

  const wantedEditions = editions.filter((s) =>
    NEW_EDITION_KEYS.includes(`${s.gameSlug}/${s.slug}`)
  );
  const gameSlugs = [...new Set(wantedEditions.map((s) => s.gameSlug))];
  const games = await CatalogGame.find({ slug: { $in: gameSlugs } })
    .select("_id slug title")
    .lean();
  const gameBySlug = new Map(games.map((g) => [String(g.slug), g]));

  let editionsCreated = 0;
  let editionsSkipped = 0;
  for (const seed of wantedEditions) {
    const key = `${seed.gameSlug}/${seed.slug}`;
    const existing = await Edition.findOne({ gameSlug: seed.gameSlug, slug: seed.slug })
      .select("_id")
      .lean();
    if (existing) {
      console.log(`skip edition ${key} (already stored)`);
      editionsSkipped++;
      continue;
    }
    const game = gameBySlug.get(seed.gameSlug);
    if (!game) {
      console.log(`skip edition ${key} (no parent game)`);
      editionsSkipped++;
      continue;
    }
    await Edition.create({
      ...seed,
      isDefault: seed.isDefault === true,
      gameId: game._id,
    });
    console.log(`add  edition ${key}`);
    editionsCreated++;
  }

  const baseTitles = new Map(
    (
      await CatalogGame.find({
        slug: { $in: [...new Set(catalogWaveAug2026Mods.map((m) => m.baseGameSlug))] },
      })
        .select("slug title")
        .lean<{ slug: string; title: string }[]>()
    ).map((g) => [g.slug, g.title])
  );

  let modsCreated = 0;
  let modsSkipped = 0;
  for (const seed of catalogWaveAug2026Mods) {
    const existing = await CatalogMod.findOne({ slug: seed.slug }).select("_id").lean();
    if (existing) {
      console.log(`skip mod ${seed.slug} (already stored)`);
      modsSkipped++;
      continue;
    }
    const m = ensureDerivedModFields(seed, baseTitles.get(seed.baseGameSlug));
    await CatalogMod.create({
      slug: m.slug,
      title: m.title,
      tagline: m.tagline,
      description: m.description,
      baseGameSlug: m.baseGameSlug,
      developerSlug: m.developerSlug,
      developerName: developersBySlug.get(m.developerSlug)?.name ?? null,
      license: m.license,
      releaseYear: m.releaseYear,
      sizeMB: m.sizeMB,
      website: m.website,
      githubRepo: m.githubRepo ?? null,
      downloadKind: m.downloadKind,
      assetPattern: m.assetPattern ?? null,
      directUrl: m.directUrl ?? null,
      installRelativePath: m.installRelativePath ?? "mods",
      art: m.art ?? defaultArtFor([], m.slug),
      coverImage: m.coverImage ?? null,
      screenshots: m.screenshots ?? [],
      published: m.published,
      status: m.published ? "published" : "draft",
      managedBy: m.managedBy,
      longDescription: m.longDescription ?? null,
      whatItChanges: m.whatItChanges ?? null,
      compatibility: m.compatibility ?? null,
      installSteps: m.installSteps ?? [],
      faq: m.faq ?? [],
    });
    console.log(`add  mod ${m.slug}`);
    modsCreated++;
  }

  console.log(
    `insert-catalog-wave: editions +${editionsCreated}/skip ${editionsSkipped}, mods +${modsCreated}/skip ${modsSkipped}`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("insert-catalog-wave failed:", err);
  process.exit(1);
});
