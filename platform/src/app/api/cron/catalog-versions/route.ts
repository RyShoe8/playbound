import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import CatalogMod from "@/lib/models/CatalogMod";
import { probeGameInstall, probeModInstall } from "@/lib/catalogVersionProbe";
import { gameProbePatchFields, modProbePatchFields } from "@/lib/applyVersionProbePatch";
import { withAutoHealGame, withAutoHealMod } from "@/lib/healBrokenInstall";
import { cronAuthorized } from "@/lib/cronAuth";

export const maxDuration = 60;

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}

function tally(
  summary: { updated: number; ok: number; broken: number; skipped: number },
  status: string,
  patched: boolean
) {
  if (status === "updated") {
    if (patched) summary.updated++;
    else summary.ok++;
  } else if (status === "ok") summary.ok++;
  else if (status === "broken") summary.broken++;
  else if (status === "skipped") summary.skipped++;
}

async function run(req: Request) {
  if (!cronAuthorized(req)) {
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
    .select("slug website launcherInstall")
    .lean();

  for (const g of games) {
    const row = g as {
      slug: string;
      website?: string;
      launcherInstall?: Record<string, unknown>;
    };
    const install = row.launcherInstall;
    if (!install) continue;
    summary.games.checked++;

    const probed = await probeGameInstall({
      kind: install.kind as string,
      repo: (install.repo as string) || null,
      assetPattern: (install.assetPattern as string) || null,
      url: (install.url as string) || null,
      versionLabel: (install.versionLabel as string) || null,
      autoUpdatePinned: install.autoUpdatePinned !== false,
    });
    const result = await withAutoHealGame(probed, {
      kind: install.kind as string,
      repo: (install.repo as string) || null,
      url: (install.url as string) || null,
      versionLabel: (install.versionLabel as string) || null,
      website: row.website || null,
      enabled: install.enabled !== false,
    });

    const set: Record<string, unknown> = {
      "launcherInstall.detectedVersion": result.detectedVersion,
      "launcherInstall.lastVersionCheckAt": new Date(),
      "launcherInstall.versionCheckStatus": result.status,
      "launcherInstall.versionCheckNote": result.note || null,
      ...gameProbePatchFields(
        {
          kind: install.kind as string,
          autoUpdatePinned: install.autoUpdatePinned !== false,
        },
        result
      ),
    };

    const patched = Object.keys(set).some(
      (k) =>
        k === "launcherInstall.url" ||
        k === "launcherInstall.fileName" ||
        k === "launcherInstall.versionLabel" ||
        k === "launcherInstall.assetPattern"
    );
    tally(summary.games, result.status, patched);

    await CatalogGame.updateOne({ slug: row.slug }, { $set: set });
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
    const probed = await probeModInstall(mod);
    const result = await withAutoHealMod(probed, mod);

    const patch = modProbePatchFields(mod, result);
    const set: Record<string, unknown> = {
      detectedVersion: result.detectedVersion,
      lastVersionCheckAt: new Date(),
      versionCheckStatus: result.status,
      versionCheckNote: result.note || null,
      ...patch,
    };

    tally(summary.mods, result.status, Object.keys(patch).length > 0);

    await CatalogMod.updateOne({ slug: mod.slug }, { $set: set });
  }

  return NextResponse.json({ ok: true, summary, at: new Date().toISOString() });
}
