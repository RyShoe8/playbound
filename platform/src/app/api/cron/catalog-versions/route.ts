import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import CatalogMod from "@/lib/models/CatalogMod";
import EditionModel from "@/lib/models/Edition";
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
    editions: { checked: 0, updated: 0, ok: 0, broken: 0, skipped: 0 },
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
      // Without this the probe only ever sees the engine, and an overlay that
      // has outgrown it stays invisible until a player hits the failure.
      overlayUrl: (install.overlayUrl as string) || null,
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
        k === "launcherInstall.assetPattern" ||
        k === "launcherInstall.kind"
    );
    tally(summary.games, result.status, patched);

    await CatalogGame.updateOne({ slug: row.slug }, { $set: set });
  }

  /*
   * Editions carry their own install recipes and several are the only way a
   * game installs at all, but nothing probed them: an edition whose upstream
   * asset moved, or whose ContentDB overlay outgrew its pinned engine, stayed
   * silently "fine" until a player hit the failure. TripleA's Windows edition
   * had a pattern that matched nothing and VoxeLibre's overlay was never
   * compared against its engine, and neither showed up anywhere in admin.
   *
   * Read-only with respect to curation: only the four versionCheck* fields are
   * written, by dotted path. Auto-heal is deliberately not applied here —
   * rewriting an edition's recipe is a bigger promise than reporting on it,
   * and the game pass has that machinery precisely because it was designed
   * for it.
   */
  const editions = await EditionModel.find({
    status: "active",
    visibility: { $ne: "hidden" },
    installMethod: "playbound_installer",
  })
    .select("gameSlug slug installConfig")
    .lean();

  for (const e of editions) {
    const edition = e as {
      gameSlug: string;
      slug: string;
      installConfig?: { playbound_installer?: Record<string, unknown> } | null;
    };
    const install = edition.installConfig?.playbound_installer;
    if (!install) continue;
    summary.editions.checked++;

    const probed = await probeGameInstall({
      kind: (install.kind as string) || null,
      repo: (install.repo as string) || null,
      assetPattern: (install.assetPattern as string) || null,
      url: (install.url as string) || null,
      versionLabel: (install.versionLabel as string) || null,
      // Editions have no autoUpdatePinned field; nothing here rewrites a
      // recipe, so the flag that gates auto-healing is irrelevant either way.
      overlayUrl: (install.overlayUrl as string) || null,
    });

    tally(summary.editions, probed.status, false);

    await EditionModel.updateOne(
      { gameSlug: edition.gameSlug, slug: edition.slug },
      {
        $set: {
          detectedVersion: probed.detectedVersion,
          lastVersionCheckAt: new Date(),
          versionCheckStatus: probed.status,
          versionCheckNote: probed.note || null,
        },
      }
    );
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
