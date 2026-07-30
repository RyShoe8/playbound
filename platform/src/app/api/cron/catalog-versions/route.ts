import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import CatalogMod from "@/lib/models/CatalogMod";
import { probeGameInstall, probeModInstall } from "@/lib/catalogVersionProbe";

export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}

async function run(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();

  const summary = {
    games: { checked: 0, updated: 0, ok: 0, broken: 0, skipped: 0 },
    mods: { checked: 0, updated: 0, ok: 0, broken: 0, skipped: 0 },
  };

  const games = await CatalogGame.find({
    published: true,
    "launcherInstall.enabled": true,
  })
    .select("slug launcherInstall")
    .lean();

  for (const g of games) {
    const install = (g as { launcherInstall?: Record<string, unknown> }).launcherInstall;
    if (!install) continue;
    summary.games.checked++;
    const result = await probeGameInstall({
      kind: install.kind as string,
      repo: (install.repo as string) || null,
      assetPattern: (install.assetPattern as string) || null,
      url: (install.url as string) || null,
      versionLabel: (install.versionLabel as string) || null,
      autoUpdatePinned: install.autoUpdatePinned !== false,
    });

    const set: Record<string, unknown> = {
      "launcherInstall.detectedVersion": result.detectedVersion,
      "launcherInstall.lastVersionCheckAt": new Date(),
      "launcherInstall.versionCheckStatus": result.status,
      "launcherInstall.versionCheckNote": result.note || null,
    };

    if (
      result.status === "updated" &&
      install.autoUpdatePinned !== false &&
      result.patch &&
      String(install.kind || "").startsWith("direct")
    ) {
      if (result.patch.url) set["launcherInstall.url"] = result.patch.url;
      if (result.patch.fileName) set["launcherInstall.fileName"] = result.patch.fileName;
      if (result.patch.versionLabel) set["launcherInstall.versionLabel"] = result.patch.versionLabel;
      summary.games.updated++;
    } else if (result.status === "ok") summary.games.ok++;
    else if (result.status === "broken") summary.games.broken++;
    else if (result.status === "skipped") summary.games.skipped++;
    else if (result.status === "updated") summary.games.ok++;

    await CatalogGame.updateOne({ slug: (g as { slug: string }).slug }, { $set: set });
  }

  const mods = await CatalogMod.find({ published: true })
    .select(
      "slug downloadKind githubRepo assetPattern directUrl detectedVersion autoUpdatePinned"
    )
    .lean();

  for (const m of mods) {
    summary.mods.checked++;
    const mod = m as {
      slug: string;
      downloadKind?: string;
      githubRepo?: string;
      assetPattern?: string;
      directUrl?: string;
      detectedVersion?: string;
      autoUpdatePinned?: boolean;
    };
    const result = await probeModInstall(mod);

    const set: Record<string, unknown> = {
      detectedVersion: result.detectedVersion,
      lastVersionCheckAt: new Date(),
      versionCheckStatus: result.status,
      versionCheckNote: result.note || null,
    };

    if (
      result.status === "updated" &&
      mod.autoUpdatePinned !== false &&
      result.patch?.directUrl &&
      mod.downloadKind === "direct-zip"
    ) {
      set.directUrl = result.patch.directUrl;
      summary.mods.updated++;
    } else if (result.status === "ok") summary.mods.ok++;
    else if (result.status === "broken") summary.mods.broken++;
    else if (result.status === "skipped") summary.mods.skipped++;
    else if (result.status === "updated") summary.mods.ok++;

    await CatalogMod.updateOne({ slug: mod.slug }, { $set: set });
  }

  return NextResponse.json({ ok: true, summary, at: new Date().toISOString() });
}
