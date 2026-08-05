/**
 * Materialise the generated Official edition for games that have none.
 *
 * ── You almost certainly do not need to run this ──────────────────────────
 *
 * Backwards compatibility does not depend on it. A game with no stored
 * editions already resolves a *virtual* Official edition at read time
 * (src/lib/editions.ts → deriveVirtualEdition), so every game page, API
 * response and launcher entry already behaves as though it has one — without
 * writing anything.
 *
 * Materialising has a visible side effect: the game page hides the Editions
 * section while a game's only edition is the generated one, so writing real
 * rows makes a one-item "Available editions" block appear on every game.
 *
 * Run it only when you want those rows to exist as editable records, e.g.
 * before hand-editing the Official edition of many games at once.
 *
 * Usage:
 *   npx tsx scripts/migrate-editions.ts            # dry run, writes nothing
 *   npx tsx scripts/migrate-editions.ts --apply    # actually write
 *   npx tsx scripts/migrate-editions.ts --apply --slug openra
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const slugIdx = args.indexOf("--slug");
  const onlySlug = slugIdx !== -1 ? args[slugIdx + 1] : null;

  if (!process.env.MONGODB_URI) {
    console.warn("migrate:editions skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const EditionModel = (await import("../src/lib/models/Edition")).default;
  const CatalogGame = (await import("../src/lib/models/CatalogGame")).default;
  const { listAllGames } = await import("../src/lib/catalog");
  const { deriveVirtualEdition } = await import("../src/lib/editions");

  await dbConnect();

  const games = await listAllGames();
  const targets = onlySlug ? games.filter((g) => g.slug === onlySlug) : games;
  if (targets.length === 0) {
    console.error(onlySlug ? `No game with slug "${onlySlug}".` : "No games found.");
    process.exit(1);
  }

  console.log(
    apply
      ? `Materialising Official editions for ${targets.length} game(s)…`
      : `DRY RUN — inspecting ${targets.length} game(s). Pass --apply to write.`
  );

  let created = 0;
  let skipped = 0;

  for (const game of targets) {
    const existing = await EditionModel.countDocuments({ gameSlug: game.slug });
    if (existing > 0) {
      skipped++;
      continue;
    }

    const virtual = deriveVirtualEdition(game);
    console.log(
      `  ${apply ? "CREATE" : "would create"}  ${game.slug} → "${virtual.name}" (${virtual.installMethod})`
    );

    if (apply) {
      const gameDoc = await CatalogGame.findOne({ slug: game.slug }).select("_id").lean();
      await EditionModel.create({
        gameId: (gameDoc as { _id?: unknown } | null)?._id ?? null,
        gameSlug: virtual.gameSlug,
        slug: virtual.slug,
        name: virtual.name,
        shortDescription: virtual.shortDescription,
        description: virtual.description,
        type: virtual.type,
        status: virtual.status,
        visibility: virtual.visibility,
        sortOrder: 0,
        isDefault: true,
        branding: virtual.branding,
        links: virtual.links,
        installMethod: virtual.installMethod,
        installConfig: virtual.installConfig,
        requirements: virtual.requirements ?? null,
        features: virtual.features,
        tags: virtual.tags,
        languages: virtual.languages,
        faq: virtual.faq,
        verified: virtual.verified,
        verificationLevel: virtual.verificationLevel,
      });
    }
    created++;
  }

  console.log(
    apply
      ? `Done. Created ${created} edition(s); ${skipped} game(s) already had some.`
      : `Dry run complete. Would create ${created}; ${skipped} already have editions.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("migrate:editions failed:", err);
  process.exit(1);
});
