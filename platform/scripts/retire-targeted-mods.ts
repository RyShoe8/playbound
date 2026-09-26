/**
 * Targeted retirement script for non-program entries that were never mods
 * (web strategy guides, Discord bots/RPC bridges, Aim Lab scenarios,
 * generic engine/emulator runners, and text config profiles).
 *
 * SAFETY GUARANTEES:
 * - Scoped strictly to the explicit list of TARGET_SLUGS.
 * - Touches ONLY the `CatalogMod` collection via `deleteMany({ slug: { $in: TARGET_SLUGS } })`.
 * - Absolutely NEVER touches CatalogGame, Edition, Review, or any other collection.
 * - Defaults to --dry-run unless --apply is explicitly specified.
 *
 * Usage:
 *   npx tsx scripts/retire-targeted-mods.ts           # Dry-run inspection
 *   npx tsx scripts/retire-targeted-mods.ts --apply   # Laser-targeted removal
 */

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

export const TARGET_SLUGS: readonly string[] = [
  // VALORANT (20 entries: Discord bots, web lineup tools, Aim Lab drills, API companions)
  "valorant-clove-meddle-decay",
  "valorant-discord-rich-presence",
  "valorant-valoplant-strategy",
  "valorant-valocrosshair-database",
  "valorant-recon-bolt-companion",
  "valorant-lineup-trainer-sova",
  "valorant-viper-poison-lineups",
  "valorant-brimstone-orbital-molly",
  "valorant-killjoy-lockdown-setups",
  "valorant-fade-haunt-trajectories",
  "valorant-cypher-camera-one-ways",
  "valorant-gekko-dizzy-mosh-pit",
  "valorant-omen-dark-cover-one-ways",
  "valorant-astra-astral-form-guide",
  "valorant-kayo-zero-point-suppression",
  "valorant-deadlock-gravnet-sonic-sensor",
  "valorant-vyse-arc-rose-shear-setups",
  "valorant-jett-updraft-blade-storm",
  "valorant-raze-blast-pack-satchel-drills",
  "valorant-iso-kill-contract-aim-lab",

  // HoloCure (1 entry: external Discord RPC bridge)
  "holocure-rich-presence",

  // Genshin Impact (2 entries: web artifact calculator & Monte Carlo rotation CLI)
  "genshin-optimizer",
  "genshin-combat-sim",

  // League of Legends (2 entries: text .cfg file & Aim Lab scenario link)
  "lol-performance-config",
  "lol-skillshot-trainer",

  // Quake Champions (3 entries: Steam Community text guide links)
  "qc-competitive-config",
  "qc-crosshair-hud-pack",
  "qc-aim-training-routines",

  // Strikers Club (3 entries: camera preset & practice advice pointing to oddshot homepage)
  "strikers-pro-camera-preset",
  "strikers-training-drills",
  "strikers-controller-curve-config",

  // Gradius Remake (3 entries: generic GLSL shader link, gamepad preset & base game audio pointer)
  "gradius-arcade-scanlines",
  "gradius-arcade-stick-config",
  "gradius-arranged-soundtrack",

  // Mr. Boom (1 entry: party gamepad config pointing to base game repo)
  "mrboom-8player-controller-preset",

  // TES: Arena (1 entry: generic DOSBox emulator runner, not an Arena mod)
  "tes-arena-dosbox",

  // Microsoft Allegiance (3 entries: homepages for base game & bundled server binary)
  "allegiance-high-res-textures",
  "allegiance-hud-customizer",
  "allegiance-acss-server-suite",

  // Brawlhalla (2 entries: generic GameBanana category landing links)
  "brawlhalla-tournament-stages",
  "brawlhalla-clear-hud",

  // Naev (4 entries: documentation example plugin & 1-line script test toggles)
  "naev-sea-of-mayonnaise",
  "naev-no-pirates",
  "naev-yes-pirates",
  "naev-trans-logo",
] as const;

async function main() {
  const isApply = process.argv.includes("--apply");
  const isDryRun = !isApply || process.argv.includes("--dry-run");

  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Run from platform/ with proper env configuration.");
    process.exit(1);
  }

  const mongoose = (await import("mongoose")).default;
  const dbConnect = (await import("../src/lib/db")).default;
  const CatalogMod = (await import("../src/lib/models/CatalogMod")).default;

  console.log(`[retire-targeted-mods] Connecting to database...`);
  await dbConnect();

  console.log(`[retire-targeted-mods] Checking ${TARGET_SLUGS.length} explicit target slugs...`);
  const matchingDocs = await CatalogMod.find({ slug: { $in: TARGET_SLUGS } })
    .select("slug title baseGameSlug status")
    .lean();

  console.log(`[retire-targeted-mods] Found ${matchingDocs.length} matching mods in CatalogMod:`);
  for (const doc of matchingDocs) {
    console.log(`  - [${doc.baseGameSlug}] ${doc.slug} ("${doc.title}", status: ${doc.status})`);
  }

  const matchingSlugs = new Set(matchingDocs.map((d) => d.slug));
  const notFoundSlugs = TARGET_SLUGS.filter((s) => !matchingSlugs.has(s));
  if (notFoundSlugs.length > 0) {
    console.log(`[retire-targeted-mods] ${notFoundSlugs.length} target slug(s) already absent from DB:`);
    for (const slug of notFoundSlugs) {
      console.log(`    ${slug}`);
    }
  }

  if (isDryRun) {
    console.log("\n=======================================================");
    console.log("DRY-RUN MODE: No database changes were made.");
    console.log(`To permanently delete these ${matchingDocs.length} mods, run:`);
    console.log("  npx tsx scripts/retire-targeted-mods.ts --apply");
    console.log("=======================================================\n");
    await mongoose.disconnect();
    return;
  }

  console.log("\n=======================================================");
  console.log(`APPLY MODE: Permanently deleting ${matchingDocs.length} targeted mods...`);
  console.log("=======================================================");

  const deleteResult = await CatalogMod.deleteMany({ slug: { $in: TARGET_SLUGS } });
  console.log(`[retire-targeted-mods] Successfully deleted ${deleteResult.deletedCount} mods from CatalogMod.`);

  // Verify post-deletion state
  const remainingCount = await CatalogMod.countDocuments({ slug: { $in: TARGET_SLUGS } });
  if (remainingCount === 0) {
    console.log(`[retire-targeted-mods] Verification SUCCESS: 0 targeted slugs remain in CatalogMod.`);
  } else {
    console.error(`[retire-targeted-mods] Verification WARNING: ${remainingCount} slugs still remain!`);
  }

  await mongoose.disconnect();
  console.log("[retire-targeted-mods] Complete.");
}

if (process.argv[1]?.includes("retire-targeted-mods")) {
  main().catch((err) => {
    console.error("[retire-targeted-mods] Unexpected error:", err);
    process.exit(1);
  });
}
