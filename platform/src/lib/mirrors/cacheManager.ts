import dbConnect from "@/lib/db";
import Artifact, { IArtifact } from "@/lib/models/Artifact";
import MirrorSettings, { IMirrorSettings } from "@/lib/models/MirrorSettings";
import MirrorEvent from "@/lib/models/MirrorEvent";
import MirrorSource from "@/lib/models/MirrorSource";
import MirrorAttempt from "@/lib/models/MirrorAttempt";
import MirrorJob from "@/lib/models/MirrorJob";
import {
  archivedArtifactStatusOnHost,
  archiveArtifactOnHost,
  deleteArchivedArtifactOnHost,
} from "@/lib/gameHost/client";
import { deleteObjectFromR2, getR2PresignedDownloadUrl } from "./r2Client";
import { calculateArtifactCacheScore, evaluateSourceHealth } from "./scoring";

/**
 * Loads or initializes the singleton mirror settings document.
 */
export async function getMirrorSettings(): Promise<IMirrorSettings> {
  await dbConnect();
  let settings = await MirrorSettings.findOne({ singletonKey: "default" });
  if (!settings) {
    settings = await MirrorSettings.create({
      singletonKey: "default",
      r2MonthlyBudgetGB: 8.0,
      r2WarningThreshold: 90,
      r2MinFreeBudgetGB: 0.5,
      r2MinRetentionHours: 24,
      autoPromotion: true,
      autoEviction: true,
      maxR2ArtifactSizeGB: 5.0,
      vpsStorageLimitGB: 150.0,
      vpsMirrorBaseUrl: "https://mirror.playbound.club",
      lastScanAt: new Date(),
    });
  }
  return settings;
}

/**
 * Updates mirror configuration settings and creates an audit event.
 */
export async function updateMirrorSettings(
  updates: Partial<IMirrorSettings>,
  actor: string
): Promise<IMirrorSettings> {
  await dbConnect();
  const settings = await getMirrorSettings();
  const prevBudget = settings.r2MonthlyBudgetGB;

  Object.assign(settings, updates, { lastScanAt: new Date() });
  await settings.save();

  if (updates.r2MonthlyBudgetGB !== undefined && updates.r2MonthlyBudgetGB !== prevBudget) {
    await MirrorEvent.create({
      eventType: "budget_changed",
      actor,
      details: `${actor} changed R2 storage budget from ${prevBudget} GB to ${updates.r2MonthlyBudgetGB} GB`,
      meta: { prevBudget, newBudget: updates.r2MonthlyBudgetGB },
    });

    // If budget decreased, immediately trigger rebalance to evict low-score items
    if (updates.r2MonthlyBudgetGB < prevBudget) {
      await rebalanceR2Cache();
    }
  }

  return settings;
}

/**
 * Re-evaluates scores for all artifacts based on latest telemetry and public mirror health.
 */
export async function rescoreAllArtifacts(): Promise<void> {
  await dbConnect();
  const artifacts = await Artifact.find({});

  for (const artifact of artifacts) {
    const sources = await MirrorSource.find({ artifactId: artifact.artifactId, sourceType: "public" });

    // Update source health statuses
    for (const src of sources) {
      const newStatus = evaluateSourceHealth(src);
      if (src.healthStatus !== newStatus) {
        src.healthStatus = newStatus;
        await src.save();
      }
    }

    // Calculate new cache score
    const breakdown = calculateArtifactCacheScore(artifact, sources);
    artifact.r2PromotionScore = breakdown.totalScore;

    // Check if eligible for candidate promotion
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
  }
}

/**
 * Core cache management rebalancing algorithm.
 * Promotes high-score candidates and evicts low-value items to stay within budget.
 */
export async function rebalanceR2Cache(): Promise<{
  promotedCount: number;
  evictedCount: number;
  currentR2Bytes: number;
  budgetBytes: number;
}> {
  await dbConnect();
  const settings = await getMirrorSettings();
  const budgetBytes = settings.r2MonthlyBudgetGB * 1024 * 1024 * 1024;
  const minRetentionMs = settings.r2MinRetentionHours * 60 * 60 * 1000;

  // 1. Rescore all artifacts first
  await rescoreAllArtifacts();

  // 2. Compute current R2 usage
  const cachedArtifacts = await Artifact.find({ r2Status: "cached" }).sort({ r2PromotionScore: 1 });
  let currentR2Bytes = cachedArtifacts.reduce((sum, a) => sum + (a.sizeBytes || 0), 0);

  let evictedCount = 0;
  let promotedCount = 0;

  // 3. If currently exceeding budget (e.g. after budget reduction), evict lowest-score unprotected items
  if (settings.autoEviction && currentR2Bytes > budgetBytes) {
    for (const item of cachedArtifacts) {
      if (currentR2Bytes <= budgetBytes) break;

      // Check protection rules
      const isProtected = item.r2Protected;
      const isWithinRetention = item.r2LastPromoted && Date.now() - new Date(item.r2LastPromoted).getTime() < minRetentionMs;

      if (!isProtected && !isWithinRetention) {
        await deleteObjectFromR2(item.relativePath);
        item.r2Status = "not_cached";
        item.r2LastEvicted = new Date();
        await item.save();

        currentR2Bytes -= item.sizeBytes || 0;
        evictedCount++;

        await MirrorEvent.create({
          eventType: "manual_evict",
          actor: "system_rebalance",
          artifactId: item.artifactId,
          details: `Evicted ${item.filename} (${(item.sizeBytes / (1024 * 1024)).toFixed(1)} MB, score ${item.r2PromotionScore}) to respect ${settings.r2MonthlyBudgetGB} GB budget`,
        });
      }
    }
  }

  // 4. Process candidates for promotion if autoPromotion is enabled
  if (settings.autoPromotion) {
    const candidates = await Artifact.find({
      r2Status: "candidate",
      r2Disabled: false,
      mirrorEnabled: true,
      redistributionAllowed: true,
      vpsStatus: "verified",
    }).sort({ r2PromotionScore: -1 });

    for (const candidate of candidates) {
      const candidateBytes = candidate.sizeBytes || 0;
      if (candidateBytes === 0) continue;

      // If fits directly in remaining budget
      if (currentR2Bytes + candidateBytes <= budgetBytes) {
        candidate.r2Status = "cached";
        candidate.r2LastPromoted = new Date();
        await candidate.save();

        currentR2Bytes += candidateBytes;
        promotedCount++;

        await MirrorEvent.create({
          eventType: "manual_promote",
          actor: "system_rebalance",
          artifactId: candidate.artifactId,
          details: `Promoted ${candidate.filename} (${(candidateBytes / (1024 * 1024)).toFixed(1)} MB, score ${candidate.r2PromotionScore}) to R2 hot cache`,
        });
        continue;
      }

      // Check if we should evict lower-score items to make room
      const evictableCandidates = cachedArtifacts.filter((item) => {
        const isProtected = item.r2Protected;
        const isWithinRetention = item.r2LastPromoted && Date.now() - new Date(item.r2LastPromoted).getTime() < minRetentionMs;
        return !isProtected && !isWithinRetention && item.r2PromotionScore < candidate.r2PromotionScore - 15;
      });

      let potentialFreedBytes = 0;
      const itemsToEvict: IArtifact[] = [];

      for (const evictItem of evictableCandidates) {
        potentialFreedBytes += evictItem.sizeBytes || 0;
        itemsToEvict.push(evictItem);
        if (currentR2Bytes - potentialFreedBytes + candidateBytes <= budgetBytes) {
          break;
        }
      }

      // If evicting these lower-value items makes enough room, execute swap
      if (currentR2Bytes - potentialFreedBytes + candidateBytes <= budgetBytes && itemsToEvict.length > 0) {
        for (const evictItem of itemsToEvict) {
          await deleteObjectFromR2(evictItem.relativePath);
          evictItem.r2Status = "not_cached";
          evictItem.r2LastEvicted = new Date();
          await evictItem.save();

          currentR2Bytes -= evictItem.sizeBytes || 0;
          evictedCount++;
        }

        candidate.r2Status = "cached";
        candidate.r2LastPromoted = new Date();
        await candidate.save();

        currentR2Bytes += candidateBytes;
        promotedCount++;

        await MirrorEvent.create({
          eventType: "manual_promote",
          actor: "system_rebalance",
          artifactId: candidate.artifactId,
          details: `Swapped lower-score items for higher-value candidate ${candidate.filename} (Score ${candidate.r2PromotionScore})`,
        });
      }
    }
  }

  return {
    promotedCount,
    evictedCount,
    currentR2Bytes,
    budgetBytes,
  };
}

/**
 * Manually promotes an artifact to R2, bypassing score thresholds but checking VPS verification.
 */
export async function manualPromoteArtifact(artifactId: string, actor: string): Promise<{ success: boolean; message: string }> {
  await dbConnect();
  const artifact = await Artifact.findOne({ artifactId });
  if (!artifact) return { success: false, message: "Artifact not found" };

  if (artifact.vpsStatus !== "verified") {
    return { success: false, message: "Authoritative VPS copy must be verified before R2 promotion." };
  }

  artifact.r2Status = "cached";
  artifact.r2LastPromoted = new Date();
  artifact.r2Disabled = false;
  await artifact.save();

  await MirrorEvent.create({
    eventType: "manual_promote",
    actor,
    artifactId: artifact.artifactId,
    details: `${actor} manually promoted ${artifact.filename} to R2 hot cache`,
  });

  return { success: true, message: `Promoted ${artifact.filename} to R2 hot cache.` };
}

/**
 * Manually evicts an artifact from R2. VPS authoritative archive is always preserved.
 */
export async function manualEvictArtifact(artifactId: string, actor: string): Promise<{ success: boolean; message: string }> {
  await dbConnect();
  const artifact = await Artifact.findOne({ artifactId });
  if (!artifact) return { success: false, message: "Artifact not found" };

  await deleteObjectFromR2(artifact.relativePath);

  artifact.r2Status = "not_cached";
  artifact.r2LastEvicted = new Date();
  artifact.r2Protected = false;
  await artifact.save();

  await MirrorEvent.create({
    eventType: "manual_evict",
    actor,
    artifactId: artifact.artifactId,
    details: `${actor} manually evicted ${artifact.filename} from R2 hot cache (authoritative VPS archive preserved)`,
  });

  return { success: true, message: `Evicted ${artifact.filename} from R2 hot cache.` };
}

/** Copy an eligible R2 cache object to the authoritative VPS archive. */
export async function archiveArtifactToVps(artifactId: string, actor: string): Promise<{ success: boolean; message: string }> {
  await dbConnect();
  const artifact = await Artifact.findOne({ artifactId });
  if (!artifact) return { success: false, message: "Artifact not found" };
  if (!artifact.redistributionAllowed || !artifact.mirrorEnabled) {
    return { success: false, message: "This artifact is not approved for PlayBound mirroring." };
  }
  if (artifact.r2Status !== "cached") {
    return { success: false, message: "Archive copies must come from an R2 hot-cache object." };
  }
  if (!artifact.sizeBytes) return { success: false, message: "Artifact size is unknown; verify it before archiving." };

  artifact.vpsStatus = "uploading";
  await artifact.save();

  const result = await archiveArtifactOnHost({
    url: await getR2PresignedDownloadUrl(artifact.relativePath, 60 * 60),
    relativePath: artifact.relativePath,
    sizeBytes: artifact.sizeBytes,
    sha256: artifact.sha256 || null,
  });
  if (!result.success) {
    artifact.vpsStatus = "missing";
    await artifact.save();
    return { success: false, message: result.message || "Could not copy artifact to the VPS archive." };
  }

  if (result.queued) {
    await MirrorEvent.create({
      eventType: "archive_to_vps",
      actor,
      artifactId: artifact.artifactId,
      details: `${actor} queued ${artifact.filename} for transfer from R2 hot cache to the VPS archive`,
    });
    return { success: true, message: `Transfer to the VPS started for ${artifact.filename}. This page will mark it On VPS when the copy finishes.` };
  }

  artifact.vpsStatus = "verified";
  await artifact.save();
  await MirrorEvent.create({
    eventType: "archive_to_vps",
    actor,
    artifactId: artifact.artifactId,
    details: `${actor} copied ${artifact.filename} from R2 hot cache to the VPS archive`,
  });
  return { success: true, message: `Archived ${artifact.filename} on the VPS.` };
}

/** Refresh only in-progress archive rows from the VPS agent; no catalog data is touched. */
export async function refreshUploadingVpsArtifacts(): Promise<void> {
  await dbConnect();
  const uploading = await Artifact.find({ vpsStatus: "uploading" });
  for (const artifact of uploading) {
    const remote = await archivedArtifactStatusOnHost(artifact.relativePath);
    if (!remote || remote.status === "uploading") continue;
    artifact.vpsStatus = remote.status === "verified" ? "verified" : "missing";
    await artifact.save();
  }
}

/**
 * Removes an artifact and its mirror bookkeeping. Catalog games are never
 * queried or changed here. The caller must explicitly confirm this action.
 */
export async function deleteArtifactCompletely(artifactId: string, actor: string): Promise<{ success: boolean; message: string }> {
  await dbConnect();
  const artifact = await Artifact.findOne({ artifactId });
  if (!artifact) return { success: false, message: "Artifact not found" };

  if (artifact.vpsStatus === "verified" || artifact.vpsStatus === "uploading") {
    const vps = await deleteArchivedArtifactOnHost(artifact.relativePath);
    if (!vps.success) return { success: false, message: vps.message || "Could not remove VPS archive copy." };
  }
  const r2 = await deleteObjectFromR2(artifact.relativePath);
  if (!r2.success) return { success: false, message: "Could not remove R2 cache copy." };

  await Promise.all([
    MirrorSource.deleteMany({ artifactId }),
    MirrorAttempt.deleteMany({ artifactId }),
    MirrorJob.deleteMany({ artifactId }),
    Artifact.deleteOne({ artifactId }),
  ]);
  await MirrorEvent.create({
    eventType: "artifact_deleted",
    actor,
    artifactId,
    details: `${actor} deleted artifact ${artifact.filename} and its R2/VPS copies`,
  });
  return { success: true, message: `Deleted ${artifact.filename} and its mirror records.` };
}

/**
 * Protects or unprotects an artifact from automatic eviction.
 */
export async function toggleProtectArtifact(
  artifactId: string,
  isProtected: boolean,
  actor: string
): Promise<{ success: boolean; message: string }> {
  await dbConnect();
  const artifact = await Artifact.findOne({ artifactId });
  if (!artifact) return { success: false, message: "Artifact not found" };

  artifact.r2Protected = isProtected;
  await artifact.save();

  await MirrorEvent.create({
    eventType: isProtected ? "protect" : "unprotect",
    actor,
    artifactId: artifact.artifactId,
    details: `${actor} ${isProtected ? "protected" : "unprotected"} ${artifact.filename} from automatic eviction`,
  });

  return { success: true, message: `${artifact.filename} is now ${isProtected ? "protected" : "unprotected"}.` };
}
