/**
 * Insert seed games that do not exist yet. Never update, never delete.
 *
 * The counterpart to seed-missing-mods.ts, and the safe half of what
 * `POST /api/admin/games/sync` does. That route `$set`s a whole payload over a
 * named slug — title, description, media, launcherInstall, published state —
 * which is right when a human means "reset this game to seed" and catastrophic
 * as a background job. The database is the source of truth (AGENTS.md); seed is
 * potentially stale against it, so the only always-safe write is creating a row
 * that is absent.
 *
 *   - scoped to explicit slugs, never the whole catalog
 *   - inserts only; an existing game is left exactly as it is
 *   - no deletes, ever
 *   - created as draft, so a person decides when it goes live
 *   - idempotent, so a second run is a no-op
 *
 * Usage:
 *   npx tsx scripts/seed-missing-games.ts --slugs opentyrian
 *   npx tsx scripts/seed-missing-games.ts --slugs a,b --dry-run
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const slugsArg = argValue("--slugs");

  if (!slugsArg) {
    console.error("seed:missing-games needs --slugs <slug[,slug]>. Refusing to run unscoped.");
    process.exit(1);
  }
  const slugs = slugsArg
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Preview deploys carry production credentials; see seed-missing-mods.ts.
  if (process.env.VERCEL && process.env.VERCEL_ENV !== "production") {
    console.log(`seed:missing-games skipped — VERCEL_ENV is ${process.env.VERCEL_ENV}.`);
    process.exit(0);
  }
  if (!process.env.MONGODB_URI) {
    console.log("seed:missing-games skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const CatalogGame = (await import("../src/lib/models/CatalogGame")).default;
  const { games } = await import("../src/lib/data/games");

  await dbConnect();

  const wanted = games.filter((g) => slugs.includes(g.slug));
  const unknown = slugs.filter((s) => !wanted.some((g) => g.slug === s));
  if (unknown.length) {
    console.warn(`seed:missing-games — not in seed, skipping: ${unknown.join(", ")}`);
  }
  if (wanted.length === 0) {
    console.log("seed:missing-games — nothing to do.");
    process.exit(0);
  }

  const existing = new Set(
    (
      await CatalogGame.find({ slug: { $in: wanted.map((g) => g.slug) } })
        .select("slug")
        .lean<{ slug: string }[]>()
    ).map((g) => g.slug)
  );

  let created = 0;
  let skipped = 0;

  for (const seed of wanted) {
    if (existing.has(seed.slug)) {
      skipped += 1;
      continue;
    }
    if (dryRun) {
      console.log(`  would create ${seed.slug} (${seed.title})`);
      created += 1;
      continue;
    }
    try {
      /*
       * The seed object as-is, plus draft state. Deliberately not a curated
       * subset: a game absent from the catalog has nothing to preserve, and
       * hand-picking fields here would silently drop whatever seed gains next.
       */
      await CatalogGame.create({ ...seed, published: false, status: "draft" });
      created += 1;
      console.log(`  created ${seed.slug}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/duplicate key/i.test(message)) {
        skipped += 1;
        continue;
      }
      console.error(`  failed ${seed.slug}: ${message}`);
    }
  }

  console.log(
    `seed:missing-games — ${dryRun ? "would create" : "created"} ${created}, left ${skipped} existing untouched.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("seed:missing-games error:", err?.message || err);
  process.exit(0);
});
