import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import CatalogMod from "@/lib/models/CatalogMod";
import { probeModInstall } from "@/lib/catalogVersionProbe";

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

  const result = await probeModInstall({
    downloadKind: doc.downloadKind,
    githubRepo: doc.githubRepo,
    assetPattern: doc.assetPattern,
    directUrl: doc.directUrl,
    detectedVersion: doc.detectedVersion,
    autoUpdatePinned: doc.autoUpdatePinned,
  });

  doc.detectedVersion = result.detectedVersion;
  doc.lastVersionCheckAt = new Date();
  doc.versionCheckStatus = result.status;
  doc.versionCheckNote = result.note || null;

  const applied: Record<string, string> = {};
  if (
    result.status === "updated" &&
    doc.autoUpdatePinned !== false &&
    result.patch?.directUrl &&
    doc.downloadKind === "direct-zip"
  ) {
    doc.directUrl = result.patch.directUrl;
    applied.directUrl = result.patch.directUrl;
  }

  await doc.save();
  return NextResponse.json({ ok: true, result, applied });
}
