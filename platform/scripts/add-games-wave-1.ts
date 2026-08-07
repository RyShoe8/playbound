/**
 * Catalog additions — wave 1.
 *
 * `seed:games` skips entirely once the catalog holds anything, so a static
 * seed entry would never reach an existing database. This writes directly.
 *
 * INSERT-ONLY. An existing slug is left completely alone, so it is safe to run
 * on every deploy: an upsert would rewrite these records from the constants
 * below and silently revert anything edited in the admin.
 *
 * Games are created as drafts. Mods are published, per the brief.
 *
 * Every field here is taken from the game's own page. Release years, sizes and
 * platforms are not guessed — a wrong size or year on a public catalog is
 * worse than a missing entry, so anything unverified is left out rather than
 * invented.
 *
 * Usage:
 *   npx tsx scripts/add-games-wave-1.ts                       # dry run
 *   npx tsx scripts/add-games-wave-1.ts --apply
 *   npx tsx scripts/add-games-wave-1.ts --apply --soft-fail   # the build
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

type DeveloperSeed = {
  slug: string;
  name: string;
  tagline: string;
  about: string;
  founded: number;
  location: string;
  website: string;
  artHue: number;
  published: boolean;
};

const DEVELOPERS: DeveloperSeed[] = [
  {
    slug: "kay-yu",
    name: "Kay Yu",
    tagline: "Solo developer behind HoloCure.",
    about:
      "Independent developer and animator who built HoloCure, a free fan-made action roguelite, in GameMaker. Continues to ship substantial content updates for it.",
    founded: 2022,
    location: "Worldwide",
    website: "https://kay-yu.itch.io",
    artHue: 320,
    published: true,
  },
];

const GAMES = [
  {
    slug: "holocure",
    title: "HoloCure",
    tagline: "A free fan-made horde survival roguelite.",
    description:
      "A free action roguelite in the horde-survival mould: pick a character, survive escalating waves, and stack upgrades into builds that trivialise what nearly killed you ten minutes earlier. Made in GameMaker by a solo developer, with no monetisation of any kind and a genuinely generous amount of content for something given away.",
    developerSlug: "kay-yu",
    developerName: "Kay Yu",
    // Both genres exist since the genre set was extended for live-service and
    // action titles.
    genres: ["Action", "Roguelike"],
    tags: ["Horde Survival", "Pixel Art", "Single Player", "Fan Game"],
    aliases: ["Holo Cure"],
    license: "Freeware (fan game)",
    releaseYear: 2022,
    // 225 MB as stated on the download page.
    sizeMB: 225,
    platforms: ["Windows"],
    features: ["Single-player"],
    launchMethods: ["install"],
    browserPlayable: false,
    steamDeck: false,
    website: "https://kay-yu.itch.io/holocure",
    art: { from: "#1e1b4b", to: "#f472b6", icon: "Swords" },
    systemRequirements: {
      min: "Windows 7 or later. No dedicated graphics required.",
      recommended: "Windows 10 or later.",
    },
    /**
     * External rather than direct-zip on purpose.
     *
     * The download is a plain zip, which the launcher could install, but itch
     * generates its download URLs per session — there is no stable link to
     * fetch. Pointing a direct-zip recipe at the page would produce a recipe
     * that breaks on first use, so the launcher opens the page instead.
     */
    launcherInstall: {
      enabled: true,
      kind: "external",
      url: "https://kay-yu.itch.io/holocure",
      note: "Downloaded from itch.io — extract the zip anywhere and run the executable.",
    },
    status: "draft",
    published: false,
    managedBy: "admin",
  },
];

/** No verified mods for this wave. Inventing them would be worse than none. */
const MODS: Record<string, unknown>[] = [];

async function main() {
  const apply = process.argv.includes("--apply");

  if (!process.env.MONGODB_URI) {
    console.warn("add:games-wave-1 skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const CatalogGame = (await import("../src/lib/models/CatalogGame")).default;
  const CatalogMod = (await import("../src/lib/models/CatalogMod")).default;
  const Developer = (await import("../src/lib/models/Developer")).default;

  await dbConnect();

  let created = 0;
  const plan: string[] = [];

  for (const dev of DEVELOPERS) {
    const exists = await Developer.findOne({ slug: dev.slug }).lean();
    plan.push(`${exists ? "SKIP (exists)" : "create"} developer  ${dev.slug}`);
    if (!exists && apply) {
      await Developer.create(dev);
      created++;
    }
  }

  for (const game of GAMES) {
    const exists = await CatalogGame.findOne({ slug: game.slug }).lean();
    plan.push(`${exists ? "SKIP (exists)" : "create"} game       ${game.slug} (${game.sizeMB} MB)`);
    if (!exists && apply) {
      await CatalogGame.create(game);
      created++;
    }
  }

  for (const mod of MODS) {
    const slug = String(mod.slug);
    const exists = await CatalogMod.findOne({ slug }).lean();
    plan.push(`${exists ? "SKIP (exists)" : "create"} mod        ${slug}`);
    if (!exists && apply) {
      await CatalogMod.create(mod);
      created++;
    }
  }

  console.log(apply ? "add:games-wave-1 —" : "add:games-wave-1 — DRY RUN (pass --apply to write):");
  for (const line of plan) console.log(`  ${line}`);

  if (apply) {
    console.log(
      created === 0
        ? "  Nothing to do — everything already exists."
        : `\nCreated ${created} record(s). Games are drafts — publish from the admin once reviewed.`
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("add:games-wave-1 failed:", err);

  // The deploy passes --soft-fail so a database blip cannot block a release
  // over a catalog addition. Insert-only, so the next deploy simply retries.
  if (process.argv.includes("--soft-fail")) {
    console.error("add:games-wave-1: continuing anyway (--soft-fail).");
    process.exit(0);
  }
  process.exit(1);
});
