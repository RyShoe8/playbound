import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import CatalogMod from "@/lib/models/CatalogMod";
import { probeModInstall } from "@/lib/catalogVersionProbe";
import { modProbePatchFields } from "@/lib/applyVersionProbePatch";
import { withAutoHealMod } from "@/lib/healBrokenInstall";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const { slug } = await params;
  await dbConnect();
  const doc = await CatalogMod.findOne({ slug });
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const probed = await probeModInstall({
    downloadKind: doc.downloadKind,
    githubRepo: doc.githubRepo,
    assetPattern: doc.assetPattern,
    directUrl: doc.directUrl,
    detectedVersion: doc.detectedVersion,
    autoUpdatePinned: doc.autoUpdatePinned,
  });
  const result = await withAutoHealMod(probed, {
    downloadKind: doc.downloadKind,
    githubRepo: doc.githubRepo,
    directUrl: doc.directUrl,
  });

  doc.detectedVersion = result.detectedVersion;
  doc.lastVersionCheckAt = new Date();
  doc.versionCheckStatus = result.status;
  doc.versionCheckNote = result.note || null;

  const applied = modProbePatchFields(
    { downloadKind: doc.downloadKind, autoUpdatePinned: doc.autoUpdatePinned },
    result
  );
  if (applied.directUrl) doc.directUrl = applied.directUrl;
  if (applied.assetPattern) doc.assetPattern = applied.assetPattern;

  await doc.save();
  return NextResponse.json({ ok: true, result, applied });
}
