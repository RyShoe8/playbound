import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import MirrorAttempt from "@/lib/models/MirrorAttempt";
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

    // Older launchers reused `direct-catalog` for every fallback download.
    // That sourceId is globally unique, so only the first game received a
    // source row even though the artifact inventory correctly contains each
    // downloaded game. Preserve those historic downloads in this admin view
    // instead of pretending they did not happen; no game or artifact data is
    // written during this reconciliation.
    const representedArtifactIds = new Set(sources.map((source) => source.artifactId));
    const legacyArtifactIds = artifacts
      .filter((artifact) => !representedArtifactIds.has(artifact.artifactId))
      .map((artifact) => artifact.artifactId);
    const legacyAttempts = legacyArtifactIds.length
      ? await MirrorAttempt.aggregate<{
          _id: string;
          successCount: number;
          failureCount: number;
          lastSuccess: Date | null;
          lastFailure: Date | null;
          averageDownloadSpeed: number;
        }>([
          { $match: { artifactId: { $in: legacyArtifactIds }, sourceType: "public" } },
          {
            $group: {
              _id: "$artifactId",
              successCount: { $sum: { $cond: [{ $eq: ["$result", "success"] }, 1, 0] } },
              failureCount: { $sum: { $cond: [{ $eq: ["$result", "success"] }, 0, 1] } },
              lastSuccess: { $max: { $cond: [{ $eq: ["$result", "success"] }, "$completedAt", null] } },
              lastFailure: { $max: { $cond: [{ $ne: ["$result", "success"] }, "$completedAt", null] } },
              averageDownloadSpeed: { $avg: "$downloadSpeed" },
            },
          },
        ])
      : [];
    const legacyAttemptMap = new Map(legacyAttempts.map((attempt) => [attempt._id, attempt]));

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

    const legacyItems = artifacts.flatMap((artifact) => {
      if (representedArtifactIds.has(artifact.artifactId)) return [];
      const attempts = legacyAttemptMap.get(artifact.artifactId);
      if (!attempts) return [];
      const totalAttempts = attempts.successCount + attempts.failureCount;
      return [{
        sourceId: `legacy-public::${artifact.artifactId}`,
        artifactId: artifact.artifactId,
        gameSlug: artifact.gameSlug ?? null,
        filename: artifact.filename ?? artifact.artifactId,
        sourceType: "public",
        url: "Legacy public URL was not recorded",
        healthStatus: "unknown",
        enabled: false,
        priority: 0,
        successCount: attempts.successCount,
        failureCount: attempts.failureCount,
        timeoutCount: 0,
        checksumFailureCount: 0,
        successRate: totalAttempts > 0 ? Math.round((attempts.successCount / totalAttempts) * 100) : 100,
        averageDownloadSpeed: Math.round(attempts.averageDownloadSpeed || 0),
        lastSuccess: attempts.lastSuccess,
        lastFailure: attempts.lastFailure,
        r2Cached: artifact.r2Status === "cached",
      }];
    });

    return NextResponse.json({ sources: [...items, ...legacyItems] });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to load sources list";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
