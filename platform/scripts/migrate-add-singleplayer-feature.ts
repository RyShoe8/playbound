/**
 * Add "Singleplayer" to features for every published game confirmed playable
 * alone, and normalize/dedupe any wording variant of that tag across the
 * whole catalog.
 *
 * The first version of this script only recognized the exact string
 * "Singleplayer" (optionally "...Campaign(s)") as "already tagged". Some
 * live records instead used off-convention wording — e.g. Mega Man Unlimited
 * had "Single-player" (hyphenated) — that the guard didn't catch, so the
 * script added a second, redundant "Singleplayer" entry next to it. This
 * version matches any spelling of the tag (hyphenated, spaced, or with a
 * "Campaign(s)" suffix, any case) and collapses every game down to exactly
 * one canonical entry, which also fixes any such duplicate already written.
 * The canonical spelling is "Singleplayer" — it's the one entry from
 * src/lib/gamePayload.ts's FEATURES list (the admin UI's own vocabulary),
 * everything else is informal wording that predates or bypassed it.
 *
 * Runs across every game in the catalog (not just the confirmed list below),
 * since a duplicate or off-convention entry could in principle exist on any
 * game; the dedupe/normalize step is a no-op wherever it doesn't apply.
 *
 * Games confirmed individually playable alone (not a genre/tag heuristic) —
 * these are the only ones that get a *new* Singleplayer tag added; every
 * other game is left untouched unless it needs deduping:
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
 * Deliberately does not touch draft/unpublished games for the *addition*
 * step — this repo has no read access to their current stored state without
 * guessing, and they carry zero live user impact until published, at which
 * point features should get the same review as everything else before going
 * live. The dedupe/normalize step does apply to drafts, since collapsing an
 * accidental duplicate is safe regardless of publish state.
 *
 * Idempotent: once every game has at most one, canonically-spelled entry,
 * a second run finds nothing to do.
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

/** Matches "Singleplayer", "Single-player", "Single Player", each with an
 * optional "Campaign(s)" suffix, any case — every wording variant seen in
 * the seed files or live data. */
const SINGLEPLAYER_VARIANT = /^single[\s-]?player(\s+campaigns?)?$/i;
const CANONICAL = "Singleplayer";

function arraysEqual(a: string[], b: string[]) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Collapses every variant to one canonical entry in place of the first
 * match, appending one if the game is confirmed singleplayer and had none. */
function reconcile(slug: string, features: string[]): string[] | null {
  let replaced = false;
  const next: string[] = [];
  for (const f of features) {
    if (SINGLEPLAYER_VARIANT.test(f)) {
      if (!replaced) {
        next.push(CANONICAL);
        replaced = true;
      }
      // else: duplicate variant, drop it
    } else {
      next.push(f);
    }
  }
  if (!replaced && CONFIRMED_SLUGS.includes(slug)) {
    next.push(CANONICAL);
  }
  return arraysEqual(next, features) ? null : next;
}

async function main() {
  const apply = process.argv.includes("--apply");

  if (!process.env.MONGODB_URI) {
    console.warn("migrate:add-singleplayer-feature skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const CatalogGame = (await import("../src/lib/models/CatalogGame")).default;

  await dbConnect();

  const docs = await CatalogGame.find({})
    .select("slug features")
    .lean<{ slug: string; features?: string[] }[]>();

  const found = new Set(docs.map((d) => d.slug));
  const missing = CONFIRMED_SLUGS.filter((s) => !found.has(s));
  if (missing.length) {
    console.warn(`Confirmed slug(s) not found in catalog (skipped): ${missing.join(", ")}`);
  }

  let updated = 0;
  const plan: string[] = [];

  for (const doc of docs) {
    const features = doc.features ?? [];
    const next = reconcile(doc.slug, features);
    if (!next) continue;

    plan.push(`${apply ? "OK" : "WOULD SET"}  ${doc.slug}  [${features.join(", ")}] -> [${next.join(", ")}]`);
    if (apply) {
      await CatalogGame.updateOne({ slug: doc.slug }, { $set: { features: next } });
      updated++;
    }
  }

  console.log(
    apply
      ? "migrate:add-singleplayer-feature —"
      : "migrate:add-singleplayer-feature — DRY RUN (pass --apply to write):"
  );
  for (const line of plan) console.log(`  ${line}`);

  console.log(apply ? `\nUpdated ${updated} game(s).` : `\nWould update ${plan.length} game(s).`);

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
