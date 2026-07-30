import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import { probeGameInstall } from "@/lib/catalogVersionProbe";

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
  const result = await probeGameInstall(install);

  doc.launcherInstall.detectedVersion = result.detectedVersion;
  doc.launcherInstall.lastVersionCheckAt = new Date();
  doc.launcherInstall.versionCheckStatus = result.status;
  doc.launcherInstall.versionCheckNote = result.note || null;

  const applied: Record<string, string> = {};
  if (
    result.status === "updated" &&
    install.autoUpdatePinned !== false &&
    result.patch &&
    String(install.kind || "").startsWith("direct")
  ) {
    if (result.patch.url) {
      doc.launcherInstall.url = result.patch.url;
      applied.url = result.patch.url;
    }
    if (result.patch.fileName) {
      doc.launcherInstall.fileName = result.patch.fileName;
      applied.fileName = result.patch.fileName;
    }
    if (result.patch.versionLabel) {
      doc.launcherInstall.versionLabel = result.patch.versionLabel;
      applied.versionLabel = result.patch.versionLabel;
    }
  }

  await doc.save();
  return NextResponse.json({ ok: true, result, applied });
}
