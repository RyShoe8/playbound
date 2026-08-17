import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import Artifact from "@/lib/models/Artifact";
import MirrorSource from "@/lib/models/MirrorSource";
import MirrorAttempt from "@/lib/models/MirrorAttempt";
import MirrorEvent from "@/lib/models/MirrorEvent";
import { calculateArtifactCacheScore } from "@/lib/mirrors/scoring";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    await dbConnect();
    const { id } = await params;

    const artifact = await Artifact.findOne({ artifactId: id }).lean();
    if (!artifact) {
      return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
    }

    const sources = await MirrorSource.find({ artifactId: id }).lean();
    const recentAttempts = await MirrorAttempt.find({ artifactId: id })
      .sort({ attemptedAt: -1 })
      .limit(20)
      .lean();

    const recentEvents = await MirrorEvent.find({ artifactId: id })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const publicSources = sources.filter((s) => s.sourceType === "public");
    const scoreBreakdown = calculateArtifactCacheScore(artifact, publicSources);

    return NextResponse.json({
      artifact,
      sources,
      scoreBreakdown,
      recentAttempts,
      recentEvents,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to load artifact details";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
