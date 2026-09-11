/**
 * Insert-only catalog wave — runs on deploy (`npm run build` → insert:catalog-wave).
 *
 * Contract:
 *   - explicit allowlists only (never the whole seed catalog)
 *   - insert-only: existing rows are left exactly as they are
 *   - never deletes, never $sets, never publishes a parent game
 *   - new games are created as draft / unpublished
 *
 * Allowlists live in `insert-catalog-wave.allowlist.ts`. If a key is not listed,
 * this script will not create it.
 */
import { loadEnvConfig } from "@next/env";
import {
  NEW_EDITION_KEYS,
  NEW_GAME_SLUGS,
  NEW_MOD_SLUGS,
} from "./insert-catalog-wave.allowlist";

loadEnvConfig(process.cwd());

async function main() {
  if (!process.env.MONGODB_URI) {
    console.warn("insert-catalog-wave skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const allowedEditions = new Set(NEW_EDITION_KEYS);
  const allowedMods = new Set(NEW_MOD_SLUGS);

  if (NEW_GAME_SLUGS.length === 0 && allowedEditions.size === 0 && allowedMods.size === 0) {
    console.log("insert-catalog-wave: allowlists empty — nothing to do.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const Edition = (await import("../src/lib/models/Edition")).default;
  const CatalogGame = (await import("../src/lib/models/CatalogGame")).default;
  const CatalogMod = (await import("../src/lib/models/CatalogMod")).default;
  const { games } = await import("../src/lib/data/games");
  const { editions } = await import("../src/lib/data/editions");
  const { mods } = await import("../src/lib/data/mods");
  const { developersBySlug } = await import("../src/lib/data/developers");
  const { defaultArtFor } = await import("../src/lib/gamePayload");
  const { ensureDerivedModFields } = await import("../src/lib/enrich");

  await dbConnect();

  let gamesCreated = 0;
  let gamesSkipped = 0;
  for (const slug of NEW_GAME_SLUGS) {
    const seed = games.find((g) => g.slug === slug);
    if (!seed) {
      console.warn(`insert-catalog-wave — game ${slug} not in seed, skipping`);
      gamesSkipped++;
      continue;
    }
    const existing = await CatalogGame.findOne({ slug }).select("_id").lean();
    if (existing) {
      gamesSkipped++;
      continue;
    }
    await CatalogGame.create({ ...seed, published: false, status: "draft" });
    console.log(`add game ${slug} (draft)`);
    gamesCreated++;
  }

  const parentSlugs = [
    ...new Set([
      ...NEW_GAME_SLUGS,
      ...NEW_EDITION_KEYS.map((k) => k.split("/")[0]!).filter(Boolean),
    ]),
  ];
  const parents = await CatalogGame.find({ slug: { $in: parentSlugs } })
    .select("_id slug title")
    .lean();
  const gameBySlug = new Map(parents.map((g) => [String(g.slug), g]));

  let editionsCreated = 0;
  let editionsSkipped = 0;
  for (const seed of editions) {
    const key = `${seed.gameSlug}/${seed.slug}`;
    if (!allowedEditions.has(key)) continue;

    const existing = await Edition.findOne({ gameSlug: seed.gameSlug, slug: seed.slug })
      .select("_id")
      .lean();
    if (existing) {
      editionsSkipped++;
      continue;
    }
    const game = gameBySlug.get(seed.gameSlug);
    if (!game) {
      console.warn(`insert-catalog-wave — no parent game for ${key}, skipping`);
      editionsSkipped++;
      continue;
    }
    await Edition.create({
      ...seed,
      isDefault: seed.isDefault === true,
      gameId: game._id,
    });
    console.log(`add edition ${key}`);
    editionsCreated++;
  }

  const baseTitles = new Map(parents.map((g) => [String(g.slug), String(g.title)]));

  let modsCreated = 0;
  let modsSkipped = 0;
  for (const seed of mods) {
    if (!allowedMods.has(seed.slug)) continue;

    const existing = await CatalogMod.findOne({ slug: seed.slug }).select("_id").lean();
    if (existing) {
      modsSkipped++;
      continue;
    }
    const baseSlug =
      seed.baseGameSlug === "keeperfx" ? "dungeon-keeper-gold" : seed.baseGameSlug;
    const baseTitle =
      baseTitles.get(seed.baseGameSlug) || baseTitles.get(baseSlug) || seed.baseGameSlug;
    const m = ensureDerivedModFields(seed, baseTitle);
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
      published: m.published !== false,
      status: m.published !== false ? "published" : "draft",
      managedBy: m.managedBy || "admin",
      longDescription: m.longDescription ?? null,
      whatItChanges: m.whatItChanges ?? null,
      compatibility: m.compatibility ?? null,
      installSteps: m.installSteps ?? [],
      faq: m.faq ?? [],
    });
    console.log(`add mod ${m.slug}`);
    modsCreated++;
  }

  console.log(
    `insert-catalog-wave: games +${gamesCreated}/skip ${gamesSkipped}, ` +
      `editions +${editionsCreated}/skip ${editionsSkipped}, ` +
      `mods +${modsCreated}/skip ${modsSkipped}`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("insert-catalog-wave failed:", err);
  process.exit(1);
});
