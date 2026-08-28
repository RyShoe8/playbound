/**
 * Targeted one-time update script:
 * Sets ONLY `launcherInstall.urlMac` and `launcherInstall.urlLinux` (and edition installConfig)
 * for the 10 verified Category C multiplatform games in MongoDB.
 *
 * Usage:
 *   npx tsx scripts/push-platform-urls.ts --dry-run
 *   npx tsx scripts/push-platform-urls.ts
 */

import path from "path";
import fs from "fs";
import dotenv from "dotenv";

const envLocal = path.join(process.cwd(), ".env.local");
const envProd = path.join(process.cwd(), ".env.production.local");

if (fs.existsSync(envLocal)) {
  dotenv.config({ path: envLocal, override: true });
} else if (fs.existsSync(envProd)) {
  dotenv.config({ path: envProd, override: true });
}

import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import Edition from "@/lib/models/Edition";

interface PlatformUrlUpdate {
  slug: string;
  title: string;
  urlMac?: string;
  urlLinux?: string;
  editions?: {
    slug: string;
    urlMac?: string;
    urlLinux?: string;
  }[];
}

const UPDATES: PlatformUrlUpdate[] = [
  {
    slug: "srb2",
    title: "Sonic Robo Blast 2",
    urlMac: "https://github.com/STJr/SRB2/releases/download/SRB2_release_2.2.13/SRB2-2.2.13-macOS-Installer.dmg",
  },
  {
    slug: "battle-for-wesnoth",
    title: "The Battle for Wesnoth",
    urlMac: "https://downloads.sourceforge.net/project/wesnoth/wesnoth-1.18/wesnoth-1.18.7/Wesnoth_1.18.7.dmg",
    urlLinux: "https://downloads.sourceforge.net/project/wesnoth/wesnoth-1.18/wesnoth-1.18.7/wesnoth-1.18.7.tar.bz2",
  },
  {
    slug: "veloren",
    title: "Veloren (Airshipper)",
    urlMac: "https://gitlab.com/veloren/airshipper/-/releases/v0.17.0/downloads/binaries/macos-client-x86_64.zip",
    urlLinux: "https://gitlab.com/veloren/airshipper/-/releases/v0.17.0/downloads/binaries/linux-client-x86_64.zip",
  },
  {
    slug: "flightgear",
    title: "FlightGear",
    urlMac: "https://download.flightgear.org/release-2024.1/flightgear-2024.1.6-macos-universal.dmg",
    urlLinux: "https://download.flightgear.org/release-2024.1/flightgear-2024.1.6-linux-amd64.AppImage",
  },
  {
    slug: "bzflag",
    title: "BZFlag",
    urlMac: "https://download.bzflag.org/bzflag/macos/2.4.30/BZFlag-2.4.30-macOS.zip",
  },
  {
    slug: "hedgewars",
    title: "Hedgewars",
    urlMac: "https://www.hedgewars.org/download/releases/Hedgewars-1.0.0.dmg",
  },
  {
    slug: "dune-legacy",
    title: "Dune Legacy",
    urlMac: "https://downloads.sourceforge.net/project/dunelegacy/dunelegacy/0.98.0aplpha/DuneLegacy-0.99.5-macOS.dmg",
    urlLinux: "https://downloads.sourceforge.net/project/dunelegacy/dunelegacy/0.98.0aplpha/DuneLegacy-0.99.3-Linux-x64.tar.gz",
    editions: [
      {
        slug: "modern-engine",
        urlMac: "https://downloads.sourceforge.net/project/dunelegacy/dunelegacy/0.98.0aplpha/DuneLegacy-0.99.5-macOS.dmg",
        urlLinux: "https://downloads.sourceforge.net/project/dunelegacy/dunelegacy/0.98.0aplpha/DuneLegacy-0.99.3-Linux-x64.tar.gz",
      },
    ],
  },
  {
    slug: "ur-quan-masters",
    title: "The Ur-Quan Masters",
    urlMac: "https://downloads.sourceforge.net/project/sc2/UQM/0.8/uqm-0.8-macos.dmg",
    editions: [
      {
        slug: "uqm-playbound-edition",
        urlMac: "https://downloads.sourceforge.net/project/sc2/UQM/0.8/uqm-0.8-macos.dmg",
      },
      {
        slug: "uqm-classic",
        urlMac: "https://downloads.sourceforge.net/project/sc2/UQM/0.8/uqm-0.8-macos.dmg",
      },
    ],
  },
  {
    slug: "re-volt-rvgl",
    title: "Re-Volt (RVGL)",
    urlMac: "https://distribute.re-volt.io/releases/rvgl_full_macos_original.dmg",
    urlLinux: "https://distribute.re-volt.io/releases/rvgl_full_linux_original.zip",
    editions: [
      {
        slug: "rvgl-original",
        urlMac: "https://distribute.re-volt.io/releases/rvgl_full_macos_original.dmg",
        urlLinux: "https://distribute.re-volt.io/releases/rvgl_full_linux_original.zip",
      },
    ],
  },
  {
    slug: "freeciv",
    title: "Freeciv",
    urlMac: "https://files.freeciv.org/packages/macos/freeciv-3.1.0-beta1-MacOS.tar.gz",
  },
];

async function main() {
  const isDryRun = process.argv.includes("--dry-run");

  console.log(`[push-platform-urls] Starting ${isDryRun ? "DRY RUN" : "LIVE PUSH"}...`);
  await dbConnect();

  let gamesUpdated = 0;
  let editionsUpdated = 0;

  for (const item of UPDATES) {
    const existingGame = await CatalogGame.findOne({ slug: item.slug }).lean();
    if (!existingGame) {
      console.warn(`[push-platform-urls] Game not found in DB: ${item.slug} — skipping`);
      continue;
    }

    const setFields: Record<string, string> = {};
    if (item.urlMac) setFields["launcherInstall.urlMac"] = item.urlMac;
    if (item.urlLinux) setFields["launcherInstall.urlLinux"] = item.urlLinux;

    console.log(`\n[CatalogGame] ${item.slug} ("${item.title}")`);
    console.log(`  Existing launcherInstall:`, {
      url: (existingGame as any).launcherInstall?.url,
      urlMac: (existingGame as any).launcherInstall?.urlMac,
      urlLinux: (existingGame as any).launcherInstall?.urlLinux,
    });
    console.log(`  $set operation:`, setFields);

    if (!isDryRun) {
      const res = await CatalogGame.updateOne({ slug: item.slug }, { $set: setFields });
      console.log(`  Result: matched ${res.matchedCount}, modified ${res.modifiedCount}`);
      if (res.modifiedCount > 0) gamesUpdated++;
    }

    if (item.editions && item.editions.length > 0) {
      for (const ed of item.editions) {
        const existingEd = await Edition.findOne({ gameSlug: item.slug, slug: ed.slug }).lean();
        if (!existingEd) {
          console.warn(`  [Edition] Not found: ${item.slug}/${ed.slug}`);
          continue;
        }

        const edSetFields: Record<string, string> = {};
        if (ed.urlMac) edSetFields["installConfig.playbound_installer.urlMac"] = ed.urlMac;
        if (ed.urlLinux) edSetFields["installConfig.playbound_installer.urlLinux"] = ed.urlLinux;

        console.log(`  [Edition] ${item.slug}/${ed.slug}`);
        console.log(`    $set operation:`, edSetFields);

        if (!isDryRun) {
          const edRes = await Edition.updateOne(
            { gameSlug: item.slug, slug: ed.slug },
            { $set: edSetFields }
          );
          console.log(`    Result: matched ${edRes.matchedCount}, modified ${edRes.modifiedCount}`);
          if (edRes.modifiedCount > 0) editionsUpdated++;
        }
      }
    }
  }

  console.log(`\n[push-platform-urls] Done!`);
  if (isDryRun) {
    console.log(`Dry run complete. No database changes were made.`);
  } else {
    console.log(`Updated ${gamesUpdated} CatalogGame documents and ${editionsUpdated} Edition documents.`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[push-platform-urls] Fatal error:", err);
  process.exit(1);
});
