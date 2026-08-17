import { IMirrorSource, SourceHealthStatus } from "@/lib/models/MirrorSource";
import { IArtifact } from "@/lib/models/Artifact";

export interface ScoreBreakdown {
  reliabilityProblem: number;
  demandScore: number;
  recentDemandScore: number;
  failureFrequencyScore: number;
  speedPenalty: number;
  sizePenalty: number;
  inactivityPenalty: number;
  totalScore: number;
}

/**
 * Evaluates the health of a specific mirror source based on telemetry stats.
 */
export function evaluateSourceHealth(source: {
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  checksumFailureCount: number;
  lastFailure?: Date | null;
  lastSuccess?: Date | null;
}): SourceHealthStatus {
  const total = source.successCount + source.failureCount;
  if (total === 0) return "unknown";

  const failureRate = source.failureCount / total;
  const checksumFailures = source.checksumFailureCount || 0;

  // Critical checksum failures or complete failure
  if (checksumFailures >= 2 || (total >= 3 && failureRate >= 0.8)) {
    return "failing";
  }

  // Degraded if failure rate is between 20% and 80% or multiple timeouts
  if ((total >= 5 && failureRate >= 0.2) || source.timeoutCount >= 3) {
    return "degraded";
  }

  // Check if offline (no success in 30 days and recent failure)
  if (source.lastFailure && (!source.lastSuccess || Date.now() - new Date(source.lastSuccess).getTime() > 30 * 86400000)) {
    if (source.failureCount >= 3) {
      return "offline";
    }
  }

  return "healthy";
}

/**
 * Calculates the R2 Cache Value / Promotion Score for an artifact.
 *
 * Cache Value =
 *     reliability_problem
 *   + demand
 *   + recent_demand
 *   + source_failure_frequency
 *   + source_speed_penalty
 *   - size_penalty
 *   - inactivity_penalty
 */
export function calculateArtifactCacheScore(
  artifact: {
    sizeBytes: number;
    totalDownloads: number;
    recentDownloads: number;
    averageDownloadSpeed: number; // bytes/sec
    lastPublicSuccess?: Date | null;
    lastPublicFailure?: Date | null;
    publicSuccessCount: number;
    publicFailureCount: number;
  },
  publicSources: Array<{
    healthStatus: SourceHealthStatus;
    averageDownloadSpeed: number;
    failureCount: number;
    successCount: number;
  }> = []
): ScoreBreakdown {
  const totalPublicAttempts = artifact.publicSuccessCount + artifact.publicFailureCount;
  const failureRatio = totalPublicAttempts > 0 ? artifact.publicFailureCount / totalPublicAttempts : 0;

  // 1. Reliability Problem (+0 to +40)
  let reliabilityProblem = 0;
  const hasFailingSource = publicSources.some((s) => s.healthStatus === "failing" || s.healthStatus === "offline");
  const hasDegradedSource = publicSources.some((s) => s.healthStatus === "degraded");

  if (hasFailingSource || failureRatio >= 0.5) {
    reliabilityProblem = 35;
  } else if (hasDegradedSource || failureRatio >= 0.2) {
    reliabilityProblem = 20;
  } else if (failureRatio > 0.05) {
    reliabilityProblem = 10;
  }

  // 2. Demand (+0 to +25)
  const demandScore = Math.min(25, Math.round(Math.log10(Math.max(1, artifact.totalDownloads + 1)) * 8));

  // 3. Recent Demand (+0 to +30)
  const recentDemandScore = Math.min(30, Math.round(artifact.recentDownloads * 2.5));

  // 4. Source Failure Frequency (+0 to +20)
  const failureFrequencyScore = Math.min(20, Math.round(artifact.publicFailureCount * 3));

  // 5. Source Speed Penalty (+0 to +15)
  // If public mirror speed is sluggish (< 1 MB/s), penalize public source (reward R2 caching)
  let speedPenalty = 0;
  const avgSpeedMBs = (artifact.averageDownloadSpeed || 0) / (1024 * 1024);
  if (avgSpeedMBs > 0 && avgSpeedMBs < 1.0) {
    speedPenalty = 15;
  } else if (avgSpeedMBs > 0 && avgSpeedMBs < 3.0) {
    speedPenalty = 8;
  }

  // 6. Size Penalty (-0 to -25)
  // Large files (> 2 GB) take up significant cache budget
  const sizeGB = artifact.sizeBytes / (1024 * 1024 * 1024);
  let sizePenalty = 0;
  if (sizeGB > 5.0) {
    sizePenalty = 25;
  } else if (sizeGB > 2.0) {
    sizePenalty = 15;
  } else if (sizeGB > 1.0) {
    sizePenalty = 5;
  }

  // 7. Inactivity Penalty (-0 to -30)
  let inactivityPenalty = 0;
  const lastActivity = artifact.lastPublicSuccess || artifact.lastPublicFailure;
  if (lastActivity) {
    const daysSinceActivity = (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceActivity > 30) {
      inactivityPenalty = 25;
    } else if (daysSinceActivity > 14) {
      inactivityPenalty = 10;
    }
  } else if (artifact.totalDownloads === 0) {
    inactivityPenalty = 15;
  }

  const rawTotal =
    reliabilityProblem +
    demandScore +
    recentDemandScore +
    failureFrequencyScore +
    speedPenalty -
    sizePenalty -
    inactivityPenalty;

  const totalScore = Math.max(0, Math.min(100, Math.round(rawTotal)));

  return {
    reliabilityProblem,
    demandScore,
    recentDemandScore,
    failureFrequencyScore,
    speedPenalty,
    sizePenalty,
    inactivityPenalty,
    totalScore,
  };
}
