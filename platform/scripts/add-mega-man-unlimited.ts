/**
 * Add Mega Man Unlimited (and its Xbox controller config mod) to the catalog.
 *
 * A one-off, not part of the build. `seed:games` deliberately skips entirely
 * once the catalog has any games in it, so adding an entry to the static seed
 * file would never reach an existing database — this writes directly instead.
 *
 * Idempotent: every write is an upsert keyed on slug, so re-running it updates
 * rather than duplicating, and it will not clobber unrelated records.
 *
 * Usage:
 *   npx tsx scripts/add-mega-man-unlimited.ts            # dry run
 *   npx tsx scripts/add-mega-man-unlimited.ts --apply
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

/** Measured from the real downloads rather than estimated. */
const GAME_ZIP = "https://megaphilx.com/Game/MegaManUnlimitedV131.zip";
const GAME_ZIP_BYTES = 102_332_607;
const CONFIG_URL = "https://megaphilx.com/Game/Savegames/options.xopts";
const SITE = "https://megaphilx.com/index.php/home/games/mega-man-unlimited/";

const DEVELOPER = {
  slug: "megaphilx",
  name: "MegaPhilX",
  tagline: "A decade-long labour of love for classic Mega Man.",
  about:
    "The team behind Mega Man Unlimited: Philippe Poulin on design and art, Jean-Simon Brochu and Gabriel Leblanc on development, and Kevin Phetsomphou on music. Built over several years as a fan project in the style of the NES-era games.",
  founded: 2010,
  location: "Canada",
  website: "https://megaphilx.com",
  artHue: 205,
  published: true,
};

const GAME = {
  slug: "mega-man-unlimited",
  title: "Mega Man Unlimited",
  tagline: "A fan-made Mega Man in the spirit of the NES originals.",
  description:
    "A free fan-made action platformer built in the style of the classic NES Mega Man games, with eight original Robot Masters, hand-drawn pixel art and an original chiptune soundtrack. Designed to be genuinely difficult in the way the originals were, rather than nostalgic decoration.",
  developerSlug: DEVELOPER.slug,
  developerName: DEVELOPER.name,
  genres: ["Platformer", "Action"],
  tags: ["fan-game", "retro", "precision-platformer", "single-player"],
  aliases: ["MMU", "Megaman Unlimited"],
  license: "Freeware (fan game)",
  releaseYear: 2013,
  sizeMB: Math.round(GAME_ZIP_BYTES / (1024 * 1024)),
  platforms: ["Windows"],
  features: ["Single-player"],
  launchMethods: ["desktop"],
  browserPlayable: false,
  steamDeck: false,
  website: SITE,
  art: { from: "#0c4a6e", to: "#38bdf8", icon: "Gamepad2" },
  systemRequirements: {
    min: "Windows 7 or later. No dedicated graphics required.",
    recommended: "Windows 10 or later.",
  },
  launcherInstall: {
    enabled: true,
    kind: "direct-zip",
    url: GAME_ZIP,
    fileName: "MegaManUnlimitedV131.zip",
    versionLabel: "1.3.1",
    // The archive's internal layout has not been inspected, so the executable
    // is found by scanning after extraction rather than by a hardcoded path.
    exeHint: null,
  },
  // Left as a draft so it can be reviewed in the admin before going public —
  // in particular the quality-bar verdict, which is an editorial call.
  status: "draft",
  published: false,
  managedBy: "admin",
};

const MOD = {
  slug: "mmu-xbox-controller-config",
  title: "Xbox Controller Config",
  tagline: "Drop-in controller mapping for Mega Man Unlimited.",
  description:
    "Replaces the game's options file with one already mapped for an Xbox controller, so the pad works without configuring it by hand. PlayBound backs up the original file first and restores it if you uninstall this.",
  baseGameSlug: GAME.slug,
  developerSlug: DEVELOPER.slug,
  license: "Freeware (fan game)",
  releaseYear: 2013,
  sizeMB: 0,
  website: SITE,
  downloadKind: "direct-zip",
  directUrl: CONFIG_URL,
  /**
   * Empty means the game's root folder. The default is "mods", which would
   * file the config where the game never looks for it — this replaces a file
   * the game ships, so it has to land in the root.
   */
  installRelativePath: "",
  art: { from: "#134e4a", to: "#2dd4bf", icon: "Gamepad2" },
  status: "draft",
  published: false,
  managedBy: "admin",
};

async function main() {
  const apply = process.argv.includes("--apply");

  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set — point it at the target database and retry.");
    process.exit(1);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const CatalogGame = (await import("../src/lib/models/CatalogGame")).default;
  const CatalogMod = (await import("../src/lib/models/CatalogMod")).default;
  const Developer = (await import("../src/lib/models/Developer")).default;

  await dbConnect();

  const plan: string[] = [];
  const existingDev = await Developer.findOne({ slug: DEVELOPER.slug }).lean();
  const existingGame = await CatalogGame.findOne({ slug: GAME.slug }).lean();
  const existingMod = await CatalogMod.findOne({ slug: MOD.slug }).lean();

  plan.push(`${existingDev ? "update" : "create"} developer  ${DEVELOPER.slug}`);
  plan.push(`${existingGame ? "update" : "create"} game       ${GAME.slug}  (${GAME.sizeMB} MB)`);
  plan.push(`${existingMod ? "update" : "create"} mod        ${MOD.slug}`);

  console.log(apply ? "Applying:" : "DRY RUN — would apply (pass --apply to write):");
  for (const line of plan) console.log(`  ${line}`);

  if (!apply) {
    process.exit(0);
  }

  await Developer.findOneAndUpdate(
    { slug: DEVELOPER.slug },
    { $set: DEVELOPER },
    { upsert: true, new: true }
  );
  await CatalogGame.findOneAndUpdate({ slug: GAME.slug }, { $set: GAME }, { upsert: true, new: true });
  await CatalogMod.findOneAndUpdate({ slug: MOD.slug }, { $set: MOD }, { upsert: true, new: true });

  console.log("\nDone. Both are drafts — publish them from the admin once reviewed.");
  console.log(`  Game:  /admin/games/${GAME.slug}/edit`);
  console.log(`  Mod:   /admin/mods/${MOD.slug}/edit`);
  process.exit(0);
}

main().catch((err) => {
  console.error("add-mega-man-unlimited failed:", err);
  process.exit(1);
});
