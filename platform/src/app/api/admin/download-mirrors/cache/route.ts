import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import Artifact from "@/lib/models/Artifact";
import MirrorSource from "@/lib/models/MirrorSource";
import { refreshUploadingVpsArtifacts } from "@/lib/mirrors/cacheManager";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    await dbConnect();
    await refreshUploadingVpsArtifacts();

    const artifacts = await Artifact.find({}).sort({ r2Status: 1, r2PromotionScore: -1 }).lean();
    const sources = await MirrorSource.find({ sourceType: "public" }).lean();

    const sourceMap = new Map<string, typeof sources>();
    for (const src of sources) {
      const list = sourceMap.get(src.artifactId) || [];
      list.push(src);
      sourceMap.set(src.artifactId, list);
    }

    const items = artifacts.map((a) => {
      const artSources = sourceMap.get(a.artifactId) || [];
      const healthyPublic = artSources.some((s) => s.healthStatus === "healthy");
      const degradedPublic = artSources.some((s) => s.healthStatus === "degraded");

      let publicHealth = "Good";
      if (!healthyPublic && degradedPublic) publicHealth = "Poor";
      else if (!healthyPublic && artSources.length > 0) publicHealth = "Offline";
      else if (artSources.length === 0) publicHealth = "None";

      return {
        id: a.artifactId,
        gameSlug: a.gameSlug,
        version: a.version,
        artifactType: a.artifactType,
        filename: a.filename,
        sizeBytes: a.sizeBytes,
        score: a.r2PromotionScore,
        downloads: a.totalDownloads,
        recentDownloads: a.recentDownloads,
        r2Status: a.r2Status,
        r2Protected: a.r2Protected,
        r2Disabled: a.r2Disabled,
        vpsStatus: a.vpsStatus,
        vpsStatusMessage: a.vpsStatusMessage || null,
        lastPromoted: a.r2LastPromoted,
        lastEvicted: a.r2LastEvicted,
        publicHealth,
        sha256: a.sha256,
      };
    });

    return NextResponse.json({ items });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to load cache list";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
