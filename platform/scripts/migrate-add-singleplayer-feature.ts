/**
 * Add "Singleplayer" to features for every published game confirmed playable
 * alone, where the feature list doesn't already say so in some form.
 *
 * Verified per game (not a genre/tag heuristic) against the catalog as
 * published on playbound.club at the time this was written — 28 games, every
 * one confirmed to support solo play:
 *
 *   - 0ad, freeciv, openciv3, openra, warzone-2100, zero-k, beyond-all-reason,
 *     battle-for-wesnoth: skirmish/campaign vs AI
 *   - endless-sky, naev, mega-man-unlimited, shattered-pixel-dungeon,
 *     supertux, mindustry, tinywind-pixel-pirate-sailing-game: singleplayer
 *     by design, multiplayer (if any) is secondary
 *   - flightgear, luanti, openttd, veloren: solo sandbox play is a core mode
 *   - hedgewars, next-gen-chess, supertuxkart, asphalt-legends: vs-AI /
 *     challenge modes alongside multiplayer
 *   - xonotic: ships with bots for offline play
 *   - unvanquished: bot support confirmed via `\bot` console command and the
 *     escape-menu "add bot" option — no GUI for it, but genuinely playable
 *     solo (github.com/Unvanquished/Unvanquished/issues/1758)
 *   - everquest, villagers-and-heroes, warframe: MMO/live-service, but each
 *     supports genuine solo play — EverQuest and Villagers & Heroes can be
 *     soloed like any MMO, and Warframe has an official Solo matchmaking
 *     setting. Existing catalog convention already mixes "Singleplayer" with
 *     "Multiplayer" on the same game (see src/lib/data/games.ts), so this
 *     matches how the tag is used elsewhere rather than treating it as
 *     mutually exclusive with multiplayer support.
 *
 * Deliberately does not touch draft/unpublished games — this repo has no
 * read access to their current stored state without guessing, and they carry
 * zero live user impact until published, at which point features should get
 * the same review as everything else before going live.
 *
 * Idempotent: matches "already has it" against any existing "Singleplayer"-
 * flavoured entry (including "Singleplayer Campaign(s)", matching the two
 * spellings already in use in src/lib/data/games.ts), so a second run finds
 * nothing to do.
 *
 * Usage:
 *   npx tsx scripts/migrate-add-singleplayer-feature.ts                       # dry run
 *   npx tsx scripts/migrate-add-singleplayer-feature.ts --apply
 *   npx tsx scripts/migrate-add-singleplayer-feature.ts --apply --soft-fail   # what the build runs
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const CONFIRMED_SLUGS = [
  "0ad",
  "asphalt-legends",
  "beyond-all-reason",
  "endless-sky",
  "everquest",
  "flightgear",
  "freeciv",
  "hedgewars",
  "luanti",
  "mega-man-unlimited",
  "mindustry",
  "naev",
  "next-gen-chess",
  "openciv3",
  "openra",
  "openttd",
  "shattered-pixel-dungeon",
  "supertux",
  "supertuxkart",
  "battle-for-wesnoth",
  "tinywind-pixel-pirate-sailing-game",
  "unvanquished",
  "veloren",
  "villagers-and-heroes",
  "warframe",
  "warzone-2100",
  "xonotic",
  "zero-k",
];

/** Any of these already covers the claim; do not add a second variant. */
const ALREADY_COVERED = /^singleplayer(\s+campaigns?)?$/i;

async function main() {
  const apply = process.argv.includes("--apply");

  if (!process.env.MONGODB_URI) {
    console.warn("migrate:add-singleplayer-feature skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const CatalogGame = (await import("../src/lib/models/CatalogGame")).default;

  await dbConnect();

  const docs = await CatalogGame.find({ slug: { $in: CONFIRMED_SLUGS } })
    .select("slug features")
    .lean<{ slug: string; features?: string[] }[]>();

  const found = new Set(docs.map((d) => d.slug));
  const missing = CONFIRMED_SLUGS.filter((s) => !found.has(s));
  if (missing.length) {
    console.warn(`Not found in catalog (skipped): ${missing.join(", ")}`);
  }

  let updated = 0;
  const plan: string[] = [];

  for (const doc of docs) {
    const features = doc.features ?? [];
    const alreadyHas = features.some((f) => ALREADY_COVERED.test(f));
    if (alreadyHas) {
      plan.push(`SKIP  ${doc.slug}  (already has: ${features.find((f) => ALREADY_COVERED.test(f))})`);
      continue;
    }

    plan.push(`${apply ? "OK" : "WOULD ADD"}  ${doc.slug}`);
    if (apply) {
      await CatalogGame.updateOne({ slug: doc.slug }, { $addToSet: { features: "Singleplayer" } });
      updated++;
    }
  }

  console.log(
    apply
      ? "migrate:add-singleplayer-feature —"
      : "migrate:add-singleplayer-feature — DRY RUN (pass --apply to write):"
  );
  for (const line of plan) console.log(`  ${line}`);

  console.log(
    apply
      ? `\nUpdated ${updated} game(s).`
      : `\nWould update ${plan.filter((l) => l.startsWith("  WOULD ADD")).length} game(s).`
  );

  process.exit(0);
}

main().catch((err) => {
  console.error("migrate:add-singleplayer-feature failed:", err);
  if (process.argv.includes("--soft-fail")) {
    console.error("migrate:add-singleplayer-feature: continuing anyway (--soft-fail).");
    process.exit(0);
  }
  process.exit(1);
});
