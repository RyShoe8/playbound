import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import Artifact from "@/lib/models/Artifact";
import MirrorSource from "@/lib/models/MirrorSource";
import { filterCurrentArtifacts } from "@/lib/mirrors/currentArtifacts";

export async function POST() {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    await dbConnect();

    const allArtifacts = await Artifact.find({}).lean();
    const currentArtifacts = await filterCurrentArtifacts(allArtifacts);
    const currentArtifactIds = new Set(currentArtifacts.map((a) => a.artifactId));

    const obsoleteArtifactIds = allArtifacts
      .map((a) => a.artifactId)
      .filter((id) => !currentArtifactIds.has(id));

    if (!obsoleteArtifactIds.length) {
      return NextResponse.json({
        ok: true,
        message: "No obsolete or old versions found — all files are current.",
        artifactsDeleted: 0,
        sourcesDeleted: 0,
      });
    }

    const artResult = await Artifact.deleteMany({
      artifactId: { $in: obsoleteArtifactIds },
    });
    const srcResult = await MirrorSource.deleteMany({
      artifactId: { $in: obsoleteArtifactIds },
    });

    return NextResponse.json({
      ok: true,
      message: `Cleaned up ${artResult.deletedCount || 0} old/superseded artifact(s) and ${srcResult.deletedCount || 0} source record(s).`,
      artifactsDeleted: artResult.deletedCount || 0,
      sourcesDeleted: srcResult.deletedCount || 0,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
