import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import EditionModel from "@/lib/models/Edition";
import { requireAdminSession } from "@/lib/requireAdmin";

/**
 * Exact three-record operation. It only alters the named editions' install
 * method and installer subkeys; CatalogGame and all other edition fields are
 * never read for mutation or written here.
 */
const RECIPES = [
  {
    id: "6a759c2c23c4ef83f297c04f", slug: "infinity", name: "SWG Infinity",
    recipe: {
      kind: "direct-installer", url: "https://updater.swginfinity.com/api/v2/launcher/download",
      fileName: "Infinity-Launcher-Setup.exe", versionLabel: "current", exeHint: "Infinity Launcher",
      knownExePaths: ["%PROGRAMFILES(X86)%\\Infinity Launcher\\Infinity Launcher.exe", "%PROGRAMFILES%\\Infinity Launcher\\Infinity Launcher.exe"],
      note: "Downloads the official Infinity Launcher. Sign in there and let it download the game client.",
    },
  },
  {
    id: "6a759c2c23c4ef83f297c050", slug: "legends", name: "SWG Legends",
    recipe: {
      kind: "direct-installer", url: "https://swglegends.com/SWGLegendsSetup.exe",
      fileName: "SWGLegendsSetup.exe", versionLabel: "current", exeHint: "SWGLegendsLauncher|SwgClient_r",
      knownExePaths: ["%PROGRAMFILES(X86)%\\SWG Legends\\SWGLegendsLauncher.exe", "%PROGRAMFILES%\\SWG Legends\\SWGLegendsLauncher.exe", "%PROGRAMFILES%\\StarWarsGalaxiesLegends\\SWGLegendsLauncher.exe"],
      note: "Downloads the official SWG Legends launcher. Sign in there and use Update to download the client.",
    },
  },
  {
    id: "6a759c2c23c4ef83f297c052", slug: "restoration", name: "SWG Restoration",
    recipe: {
      kind: "direct-installer", url: "https://patch.swgr.org/patch/launcher/SWG%20Restoration%20Install.exe",
      fileName: "SWG-Restoration-Install.exe", versionLabel: "current", exeHint: "SWG Restoration",
      knownExePaths: ["%PROGRAMFILES%\\SWG Restoration\\SWG Restoration.exe", "%PROGRAMFILES(X86)%\\SWG Restoration\\SWG Restoration.exe", "%SYSTEMDRIVE%\\SWG Restoration\\SWG Restoration.exe"],
      note: "Downloads the official SWG Restoration installer. Sign in to the official launcher and let it patch the client.",
    },
  },
] as const;

export async function POST(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    await dbConnect();
    const rows = await EditionModel.find({
      _id: { $in: RECIPES.map((item) => item.id) },
      gameSlug: "star-wars-galaxies",
      slug: { $in: RECIPES.map((item) => item.slug) },
    }).select("_id slug installMethod").lean();
    const byId = new Map(rows.map((row) => [String(row._id), row]));
    const review = RECIPES.map((item) => {
      const row = byId.get(item.id);
      return {
        edition: item.name, slug: item.slug,
        found: Boolean(row && row.slug === item.slug),
        currentInstallMethod: row?.installMethod || null,
        changes: ["installMethod", "installConfig.playbound_installer", "installConfig.external_installer (removed)"],
      };
    });
    if (review.some((item) => !item.found)) {
      return NextResponse.json({ error: "The expected three SWG database editions were not found exactly; no records were changed.", review }, { status: 409 });
    }
    if (body?.confirm !== true) return NextResponse.json({ review });

    await EditionModel.bulkWrite(RECIPES.map((item) => ({
      updateOne: {
        filter: { _id: item.id, gameSlug: "star-wars-galaxies", slug: item.slug },
        update: {
          $set: { installMethod: "playbound_installer", "installConfig.playbound_installer": item.recipe },
          $unset: { "installConfig.external_installer": 1 },
        },
      },
    })));
    return NextResponse.json({ updated: review.map((item) => item.edition) });
  } catch (err) {
    console.error("POST /api/admin/editions/wire-swg-one-click failed:", err);
    return NextResponse.json({ error: "Could not prepare the SWG one-click recipes." }, { status: 500 });
  }
}
