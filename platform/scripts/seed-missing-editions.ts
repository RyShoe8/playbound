/**
 * Insert seed editions that do not exist yet. Never update, never delete.
 *
 * Replaces seed-editions.ts, which looped the whole catalog and — the part that
 * made it genuinely dangerous — flipped parent games to published as a side
 * effect. Adding an edition should never publish a game.
 *
 *   - scoped to explicit game slugs, never the whole catalog
 *   - inserts only; an existing edition is left exactly as it is
 *   - NEVER writes to CatalogGame, not even to publish it
 *   - no deletes, ever
 *   - idempotent, so a second run is a no-op
 *
 * `POST /api/admin/editions/materialize` does the same job for one game from
 * the admin UI; this is the scriptable form for a deploy or a shell.
 *
 * Usage:
 *   npx tsx scripts/seed-missing-editions.ts --games holocure
 *   npx tsx scripts/seed-missing-editions.ts --games a,b --dry-run
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

  if (!gamesArg) {
    console.error("seed:missing-editions needs --games <slug[,slug]>. Refusing to run unscoped.");
    process.exit(1);
  }
  const gameSlugs = gamesArg
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Preview deploys carry production credentials; see seed-missing-mods.ts.
  if (process.env.VERCEL && process.env.VERCEL_ENV !== "production") {
    console.log(`seed:missing-editions skipped — VERCEL_ENV is ${process.env.VERCEL_ENV}.`);
    process.exit(0);
  }
  if (!process.env.MONGODB_URI) {
    console.log("seed:missing-editions skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const CatalogGame = (await import("../src/lib/models/CatalogGame")).default;
  const EditionModel = (await import("../src/lib/models/Edition")).default;
  const { editions } = await import("../src/lib/data/editions");

  await dbConnect();

  const wanted = editions.filter((e) => gameSlugs.includes(e.gameSlug));
  if (wanted.length === 0) {
    console.log(`seed:missing-editions — no seed editions for ${gameSlugs.join(", ")}.`);
    process.exit(0);
  }

  /*
   * An edition needs its parent's _id, so the game has to exist. Read-only —
   * this script never writes to CatalogGame, which is the specific behaviour
   * that made the old one unsafe.
   */
  const parents = new Map(
    (
      await CatalogGame.find({ slug: { $in: gameSlugs } })
        .select("_id slug")
        .lean<{ _id: unknown; slug: string }[]>()
    ).map((g) => [g.slug, g._id])
  );

  const missingParents = gameSlugs.filter((s) => !parents.has(s));
  if (missingParents.length) {
    console.warn(`seed:missing-editions — no such game(s), skipping: ${missingParents.join(", ")}`);
  }

  let created = 0;
  let skipped = 0;

  for (const seed of wanted) {
    const gameId = parents.get(seed.gameSlug);
    if (!gameId) continue;

    const exists = await EditionModel.exists({
      gameSlug: seed.gameSlug,
      slug: seed.slug,
    });
    if (exists) {
      skipped += 1;
      continue;
    }
    if (dryRun) {
      console.log(`  would create ${seed.gameSlug}/${seed.slug} (${seed.name})`);
      created += 1;
      continue;
    }
    try {
      await EditionModel.create({ ...seed, gameId });
      created += 1;
      console.log(`  created ${seed.gameSlug}/${seed.slug}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/duplicate key/i.test(message)) {
        skipped += 1;
        continue;
      }
      console.error(`  failed ${seed.gameSlug}/${seed.slug}: ${message}`);
    }
  }

  console.log(
    `seed:missing-editions — ${dryRun ? "would create" : "created"} ${created}, left ${skipped} existing untouched.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("seed:missing-editions error:", err?.message || err);
  process.exit(0);
});
