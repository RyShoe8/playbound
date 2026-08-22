import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import { probeGameInstall } from "@/lib/catalogVersionProbe";
import { gameProbePatchFields } from "@/lib/applyVersionProbePatch";
import { withAutoHealGame } from "@/lib/healBrokenInstall";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const { slug } = await params;
  await dbConnect();
  const doc = await CatalogGame.findOne({ slug });
  if (!doc?.launcherInstall) {
    return NextResponse.json({ error: "No launcher install recipe" }, { status: 404 });
  }

  const install = doc.launcherInstall.toObject?.() ?? doc.launcherInstall;
  const probed = await probeGameInstall(install);
  const result = await withAutoHealGame(probed, {
    kind: install.kind,
    repo: install.repo,
    url: install.url,
    versionLabel: install.versionLabel,
    website: doc.website,
    enabled: install.enabled,
  });

  doc.launcherInstall.detectedVersion = result.detectedVersion;
  doc.launcherInstall.lastVersionCheckAt = new Date();
  doc.launcherInstall.versionCheckStatus = result.status;
  doc.launcherInstall.versionCheckNote = result.note || null;

  const patchSet = gameProbePatchFields(
    { kind: install.kind, autoUpdatePinned: install.autoUpdatePinned },
    result
  );
  const applied: Record<string, string> = {};
  for (const [key, value] of Object.entries(patchSet)) {
    const field = key.replace(/^launcherInstall\./, "") as
      | "url"
      | "fileName"
      | "versionLabel"
      | "assetPattern"
      | "kind";
    if (typeof value === "string") {
      doc.launcherInstall[field] = value;
      applied[field] = value;
    }
  }

  await doc.save();
  return NextResponse.json({ ok: true, result, applied });
}
