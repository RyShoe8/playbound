import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import MirrorSource from "@/lib/models/MirrorSource";
import Artifact from "@/lib/models/Artifact";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    await dbConnect();

    const sources = await MirrorSource.find({}).sort({ healthStatus: 1, failureCount: -1 }).lean();
    const artifacts = await Artifact.find({}).select("artifactId gameSlug filename r2Status").lean();
    const artMap = new Map(artifacts.map((a) => [a.artifactId, a]));

    const items = sources.map((s) => {
      const art = artMap.get(s.artifactId);
      const totalAttempts = s.successCount + s.failureCount;
      const successRate = totalAttempts > 0 ? Math.round((s.successCount / totalAttempts) * 100) : 100;

      return {
        sourceId: s.sourceId,
        artifactId: s.artifactId,
        gameSlug: art?.gameSlug ?? null,
        filename: art?.filename ?? s.artifactId,
        sourceType: s.sourceType,
        url: s.url,
        healthStatus: s.healthStatus,
        enabled: s.enabled,
        priority: s.priority,
        successCount: s.successCount,
        failureCount: s.failureCount,
        timeoutCount: s.timeoutCount,
        checksumFailureCount: s.checksumFailureCount,
        successRate,
        averageDownloadSpeed: s.averageDownloadSpeed,
        lastSuccess: s.lastSuccess,
        lastFailure: s.lastFailure,
        r2Cached: art?.r2Status === "cached",
      };
    });

    return NextResponse.json({ sources: items });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to load sources list";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
