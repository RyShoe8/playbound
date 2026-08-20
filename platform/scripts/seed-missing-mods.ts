/**
 * Insert seed mods that do not exist yet. Never update, never delete.
 *
 * Written to be safe on every deploy, which `seed-mods.ts` is not: that script
 * calls deleteMany twice and upserts every mod in the catalog, so running it on
 * a build would rewrite curated content on every push. The database is the
 * source of truth (see AGENTS.md) and seed is potentially stale relative to it,
 * so the only write that is always safe is creating a row that is absent.
 *
 * Consequently:
 *   - scoped to explicit game slugs, never the whole seed
 *   - inserts only; an existing mod is left exactly as it is
 *   - no deletes, ever
 *   - idempotent, so the second and every later run is a no-op
 *
 * Usage:
 *   npx tsx scripts/seed-missing-mods.ts --games wolfenstein-enemy-territory
 *   npx tsx scripts/seed-missing-mods.ts --games a,b --dry-run
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const gamesArg = argValue("--games");

  /*
   * A slug list is required. Defaulting to "everything" is how a scoped tool
   * quietly becomes the unscoped one it was written to replace.
   */
  if (!gamesArg) {
    console.error("seed:missing-mods needs --games <slug[,slug]>. Refusing to run unscoped.");
    process.exit(1);
  }
  const gameSlugs = gamesArg
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  /*
   * On Vercel, production deploys only.
   *
   * Preview builds carry the same environment variables as production, so a
   * branch deploy would otherwise write into the live catalog. The check lives
   * here rather than in the npm script because a shell guard of the form
   * `node -e "...process.exit(0)" && seed` runs the seed on success — exactly
   * backwards — and that mistake is invisible until a preview writes.
   *
   * Only applies under Vercel, so running this by hand still works.
   */
  if (process.env.VERCEL && process.env.VERCEL_ENV !== "production") {
    console.log(`seed:missing-mods skipped — VERCEL_ENV is ${process.env.VERCEL_ENV}.`);
    process.exit(0);
  }

  if (!process.env.MONGODB_URI) {
    // Absent on preview builds and local checkouts; not an error.
    console.log("seed:missing-mods skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const CatalogGame = (await import("../src/lib/models/CatalogGame")).default;
  const CatalogMod = (await import("../src/lib/models/CatalogMod")).default;
  const { mods } = await import("../src/lib/data/mods");
  const { developersBySlug } = await import("../src/lib/data/developers");
  const { defaultArtFor } = await import("../src/lib/gamePayload");
  const { ensureDerivedModFields } = await import("../src/lib/enrich");

  await dbConnect();

  const wanted = mods.filter((m) => gameSlugs.includes(m.baseGameSlug));
  if (wanted.length === 0) {
    console.log(`seed:missing-mods — no seed mods for ${gameSlugs.join(", ")}. Nothing to do.`);
    process.exit(0);
  }

  /*
   * Only for games that actually exist. Creating mods whose parent is absent
   * would leave orphans that never render and are awkward to find later.
   */
  const presentGames = new Set(
    (
      await CatalogGame.find({ slug: { $in: gameSlugs } })
        .select("slug title")
        .lean<{ slug: string; title: string }[]>()
    ).map((g) => g.slug)
  );
  const baseTitles = new Map(
    (
      await CatalogGame.find({ slug: { $in: gameSlugs } })
        .select("slug title")
        .lean<{ slug: string; title: string }[]>()
    ).map((g) => [g.slug, g.title])
  );

  const missingGames = gameSlugs.filter((s) => !presentGames.has(s));
  if (missingGames.length) {
    console.warn(`seed:missing-mods — no such game(s), skipping: ${missingGames.join(", ")}`);
  }

  const existing = new Set(
    (
      await CatalogMod.find({ slug: { $in: wanted.map((m) => m.slug) } })
        .select("slug")
        .lean<{ slug: string }[]>()
    ).map((m) => m.slug)
  );

  let created = 0;
  let skipped = 0;

  for (const seed of wanted) {
    if (!presentGames.has(seed.baseGameSlug)) continue;
    if (existing.has(seed.slug)) {
      skipped += 1;
      continue;
    }

    const m = ensureDerivedModFields(seed, baseTitles.get(seed.baseGameSlug));
    if (dryRun) {
      console.log(`  would create ${m.slug} (${m.title})`);
      created += 1;
      continue;
    }

    /*
     * insertOne, not an upsert. An upsert with a $set would still rewrite a row
     * that appeared between the read above and this write; insert fails
     * instead, which is the outcome we want — this script never edits a mod it
     * did not create.
     */
    try {
      await CatalogMod.create({
        slug: m.slug,
        title: m.title,
        tagline: m.tagline,
        description: m.description,
        baseGameSlug: m.baseGameSlug,
        developerSlug: m.developerSlug,
        developerName: developersBySlug.get(m.developerSlug)?.name ?? null,
        license: m.license,
        art: m.art ?? defaultArtFor([], m.slug),
        downloadKind: m.downloadKind,
        githubRepo: m.githubRepo ?? null,
        directUrl: m.directUrl ?? null,
        website: m.website ?? null,
        assetPattern: m.assetPattern ?? null,
        installRelativePath: m.installRelativePath,
        sizeMB: m.sizeMB ?? null,
        releaseYear: m.releaseYear,
        managedBy: m.managedBy,
        /*
         * Draft, not published. These are being created by a script with no
         * human having looked at them; a person decides when they go live.
         */
        published: false,
        status: "draft",
      });
      created += 1;
      console.log(`  created ${m.slug}`);
    } catch (err) {
      // A duplicate key here means someone else created it — exactly the case
      // this script should decline, so it is not an error.
      const message = err instanceof Error ? err.message : String(err);
      if (/duplicate key/i.test(message)) {
        skipped += 1;
        continue;
      }
      console.error(`  failed ${m.slug}: ${message}`);
    }
  }

  console.log(
    `seed:missing-mods — ${dryRun ? "would create" : "created"} ${created}, left ${skipped} existing untouched.`
  );
  process.exit(0);
}

main().catch((err) => {
  // Never fail a deploy over seeding. A missing mod is recoverable; a build
  // that will not ship is not.
  console.error("seed:missing-mods error:", err?.message || err);
  process.exit(0);
});
