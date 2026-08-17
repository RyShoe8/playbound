import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import Artifact from "@/lib/models/Artifact";
import MirrorSource from "@/lib/models/MirrorSource";
import MirrorAttempt from "@/lib/models/MirrorAttempt";
import MirrorEvent from "@/lib/models/MirrorEvent";
import { calculateArtifactCacheScore } from "@/lib/mirrors/scoring";
import { deleteArtifactCompletely } from "@/lib/mirrors/cacheManager";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    await dbConnect();
    const { id } = await params;
    const artifact = await Artifact.findOne({ artifactId: id }).lean();
    if (!artifact) return NextResponse.json({ error: "Artifact not found" }, { status: 404 });

    const sources = await MirrorSource.find({ artifactId: id }).lean();
    const recentAttempts = await MirrorAttempt.find({ artifactId: id })
      .sort({ attemptedAt: -1 })
      .limit(20)
      .lean();
    const recentEvents = await MirrorEvent.find({ artifactId: id })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    const publicSources = sources.filter((source) => source.sourceType === "public");

    return NextResponse.json({
      artifact,
      sources,
      scoreBreakdown: calculateArtifactCacheScore(artifact, publicSources),
      recentAttempts,
      recentEvents,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to load artifact details";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdminSession();
  if (error) return error;
  try {
    const { id } = await params;
    const actor = session?.user?.name || session?.user?.email || "admin";
    const result = await deleteArtifactCompletely(decodeURIComponent(id), actor);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Delete failed" }, { status: 500 });
  }
}
