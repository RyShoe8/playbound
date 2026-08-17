import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import Artifact from "@/lib/models/Artifact";
import MirrorSource from "@/lib/models/MirrorSource";
import MirrorEvent from "@/lib/models/MirrorEvent";

/**
 * Explicit mirror approval. This deliberately changes only the selected
 * Artifact's two policy booleans and its dedicated admin public-source row.
 * It never writes a CatalogGame or Edition document.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdminSession();
  if (error) return error;
  try {
    const body = await req.json();
    const sourceUrl = String(body?.sourceUrl || "").trim();
    if (body?.confirmRedistribution !== true) {
      return NextResponse.json({ error: "Confirm that this artifact may be mirrored before approving it." }, { status: 400 });
    }
    let source: URL;
    try { source = new URL(sourceUrl); } catch { return NextResponse.json({ error: "Enter a valid direct HTTPS download URL." }, { status: 400 }); }
    if (source.protocol !== "https:") return NextResponse.json({ error: "The download source must use HTTPS." }, { status: 400 });

    await dbConnect();
    const { id } = await params;
    const artifact = await Artifact.findOne({ artifactId: decodeURIComponent(id) });
    if (!artifact) return NextResponse.json({ error: "Artifact not found" }, { status: 404 });

    // These are the only two fields on the artifact that this route writes.
    artifact.mirrorEnabled = true;
    artifact.redistributionAllowed = true;
    await artifact.save();

    const sourceId = `${artifact.artifactId}::admin-approved`;
    await MirrorSource.updateOne(
      { sourceId },
      {
        $set: {
          artifactId: artifact.artifactId,
          sourceType: "public",
          url: source.toString(),
          enabled: true,
          priority: 0,
        },
        $setOnInsert: {
          healthStatus: "unknown",
          successCount: 0,
          failureCount: 0,
          timeoutCount: 0,
          checksumFailureCount: 0,
          averageResponseTime: 0,
          averageDownloadSpeed: 0,
        },
      },
      { upsert: true }
    );
    const actor = session?.user?.name || session?.user?.email || "admin";
    await MirrorEvent.create({
      eventType: "mirror_enabled",
      actor,
      artifactId: artifact.artifactId,
      details: `${actor} approved mirroring from ${source.hostname}`,
    });
    return NextResponse.json({ success: true, message: `Approved ${artifact.filename} for mirroring. You can now Archive to VPS.` });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not approve artifact" }, { status: 500 });
  }
}
