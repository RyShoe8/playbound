import dbConnect from "@/lib/db";
import MirrorAttempt, { MirrorAttemptResult } from "@/lib/models/MirrorAttempt";
import MirrorSource from "@/lib/models/MirrorSource";
import Artifact, { type ArtifactType } from "@/lib/models/Artifact";
import { evaluateSourceHealth, calculateArtifactCacheScore } from "./scoring";
import { ensureArtifact, ensurePublicSource } from "./ensureArtifact";

export interface DownloadTelemetryPayload {
  artifactId: string;
  sourceId: string;
  sourceType: "public" | "r2" | "playbound_vps";
  /**
   * Enough to register the artifact the first time it is seen. Optional
   * because older launchers do not send them — those still record an attempt,
   * they just create a sparser row.
   */
  gameSlug?: string | null;
  version?: string | null;
  filename?: string | null;
  sourceUrl?: string | null;
  artifactType?: ArtifactType;
  attemptedAt?: string | number | Date;
  completedAt?: string | number | Date;
  result: MirrorAttemptResult;
  httpStatus?: number | null;
  failureType?: string | null;
  bytesDownloaded?: number;
  downloadDuration?: number; // ms
  downloadSpeed?: number; // bytes/sec
  checksumValid?: boolean | null;
}

export async function recordDownloadTelemetry(
  payload: DownloadTelemetryPayload
): Promise<{ success: boolean; scoreUpdated?: number }> {
  await dbConnect();

  const attemptedDate = payload.attemptedAt ? new Date(payload.attemptedAt) : new Date();
  const completedDate = payload.completedAt ? new Date(payload.completedAt) : new Date();
  const bytes = payload.bytesDownloaded || 0;
  const duration = payload.downloadDuration || 1;
  const speed = payload.downloadSpeed || (duration > 0 ? Math.round((bytes / duration) * 1000) : 0);

  // 1. Record Attempt
  await MirrorAttempt.create({
    artifactId: payload.artifactId,
    sourceId: payload.sourceId,
    sourceType: payload.sourceType,
    attemptedAt: attemptedDate,
    completedAt: completedDate,
    result: payload.result,
    httpStatus: payload.httpStatus ?? null,
    failureType: payload.failureType ?? null,
    bytesDownloaded: bytes,
    downloadDuration: duration,
    downloadSpeed: speed,
    checksumValid: payload.checksumValid ?? null,
  });

  const isSuccess = payload.result === "success";
  const isTimeout = payload.result === "timeout" || payload.result === "stalled";
  const isChecksumFailure = payload.result === "checksum_failure" || payload.checksumValid === false;

  /*
   * Register on first sight. Without this, a download of anything outside the
   * old seed list looked its artifact up, missed, and dropped the count —
   * which is why the admin table only ever showed the seeded handful.
   */
  await ensureArtifact({
    artifactId: payload.artifactId,
    gameSlug: payload.gameSlug,
    version: payload.version,
    filename: payload.filename,
    sizeBytes: bytes || null,
    artifactType: payload.artifactType,
  });
  if (payload.sourceType === "public") {
    await ensurePublicSource({
      artifactId: payload.artifactId,
      sourceId: payload.sourceId,
      url: payload.sourceUrl,
    });
  }

  // 2. Update MirrorSource if it exists
  const source = await MirrorSource.findOne({ sourceId: payload.sourceId });
  if (source) {
    if (isSuccess) {
      source.successCount += 1;
      source.lastSuccess = completedDate;
      if (speed > 0) {
        source.averageDownloadSpeed = Math.round(
          source.averageDownloadSpeed > 0 ? (source.averageDownloadSpeed + speed) / 2 : speed
        );
      }
    } else {
      source.failureCount += 1;
      source.lastFailure = completedDate;
      if (isTimeout) source.timeoutCount += 1;
      if (isChecksumFailure) source.checksumFailureCount += 1;
    }
    source.lastChecked = completedDate;
    source.healthStatus = evaluateSourceHealth(source);
    await source.save();
  }

  // 3. Update Artifact Stats
  const artifact = await Artifact.findOne({ artifactId: payload.artifactId });
  if (artifact) {
    if (isSuccess) {
      artifact.totalDownloads += 1;
      artifact.recentDownloads += 1;
      if (payload.sourceType === "public") {
        artifact.publicSuccessCount += 1;
        artifact.lastPublicSuccess = completedDate;
      }
      if (speed > 0) {
        artifact.averageDownloadSpeed = Math.round(
          artifact.averageDownloadSpeed > 0 ? (artifact.averageDownloadSpeed + speed) / 2 : speed
        );
      }
    } else {
      if (payload.sourceType === "public") {
        artifact.publicFailureCount += 1;
        artifact.lastPublicFailure = completedDate;
      }
    }

    // Rescore artifact
    const sources = await MirrorSource.find({ artifactId: artifact.artifactId, sourceType: "public" });
    const breakdown = calculateArtifactCacheScore(artifact, sources);
    artifact.r2PromotionScore = breakdown.totalScore;

    if (
      artifact.r2Status === "not_cached" &&
      artifact.r2PromotionScore >= 40 &&
      !artifact.r2Disabled &&
      artifact.mirrorEnabled &&
      artifact.redistributionAllowed
    ) {
      artifact.r2Status = "candidate";
    }

    await artifact.save();

    return { success: true, scoreUpdated: artifact.r2PromotionScore };
  }

  return { success: true };
}
