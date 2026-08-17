import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import Artifact from "@/lib/models/Artifact";
import MirrorSource from "@/lib/models/MirrorSource";
import MirrorEvent from "@/lib/models/MirrorEvent";
import { getMirrorSettings } from "@/lib/mirrors/cacheManager";
import { ensureSeedArtifacts } from "@/lib/mirrors/seedData";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    await ensureSeedArtifacts();
    await dbConnect();

    const settings = await getMirrorSettings();

    // 1. Artifact & Cache Stats
    const allArtifacts = await Artifact.find({}).lean();
    const cachedArtifacts = allArtifacts.filter((a) => a.r2Status === "cached");

    const r2BytesUsed = cachedArtifacts.reduce((sum, a) => sum + (a.sizeBytes || 0), 0);
    const r2StorageGB = Number((r2BytesUsed / (1024 * 1024 * 1024)).toFixed(2));
    const r2BudgetGB = settings.r2MonthlyBudgetGB;
    const r2UtilizationPercent = Math.min(100, Math.round((r2StorageGB / r2BudgetGB) * 100));

    // VPS Archive Stats
    const vpsVerifiedArtifacts = allArtifacts.filter((a) => a.vpsStatus === "verified");
    const vpsBytesUsed = vpsVerifiedArtifacts.reduce((sum, a) => sum + (a.sizeBytes || 0), 0);
    const vpsUsedGB = Number((vpsBytesUsed / (1024 * 1024 * 1024)).toFixed(2));
    const vpsAllocatedGB = settings.vpsStorageLimitGB;
    const vpsFreeGB = Number((vpsAllocatedGB - vpsUsedGB).toFixed(2));

    // 2. Public Mirror Health Matrix
    const allSources = await MirrorSource.find({ sourceType: "public" }).lean();
    const healthyCount = allSources.filter((s) => s.healthStatus === "healthy").length;
    const degradedCount = allSources.filter((s) => s.healthStatus === "degraded").length;
    const failedCount = allSources.filter((s) => s.healthStatus === "failing" || s.healthStatus === "offline").length;

    // Health Percentages
    const r2HealthPercent =
      allArtifacts.length > 0
        ? Math.round(
            (allArtifacts.filter((a) => a.r2Status !== "not_cached" || a.r2PromotionScore < 50).length /
              allArtifacts.length) *
              100
          )
        : 100;
    const vpsHealthPercent =
      allArtifacts.length > 0
        ? Math.round((vpsVerifiedArtifacts.length / allArtifacts.length) * 100)
        : 100;

    // 3. Alerts
    const alerts: Array<{ type: "warning" | "error" | "info"; title: string; message: string }> = [];
    if (r2UtilizationPercent >= settings.r2WarningThreshold) {
      alerts.push({
        type: "warning",
        title: "R2 Cache Budget Warning",
        message: `R2 cache usage (${r2StorageGB} GB) is at ${r2UtilizationPercent}% of the ${r2BudgetGB} GB budget.`,
      });
    }
    if (r2StorageGB > r2BudgetGB) {
      alerts.push({
        type: "error",
        title: "R2 Budget Exceeded",
        message: `R2 usage exceeds the configured ${r2BudgetGB} GB limit. Automated eviction is active.`,
      });
    }
    if (failedCount > 0) {
      alerts.push({
        type: "warning",
        title: "Public Source Degradation",
        message: `${failedCount} public mirror sources are failing or offline. R2 cache is absorbing fallback traffic.`,
      });
    }

    // 4. Pending actions / projections
    const candidateArtifacts = allArtifacts.filter((a) => a.r2Status === "candidate");
    const pendingPromotionBytes = candidateArtifacts.reduce((sum, a) => sum + (a.sizeBytes || 0), 0);
    const pendingPromotionGB = Number((pendingPromotionBytes / (1024 * 1024 * 1024)).toFixed(2));

    const evictableArtifacts = cachedArtifacts.filter((a) => !a.r2Protected && a.r2PromotionScore < 30);
    const potentialEvictionBytes = evictableArtifacts.reduce((sum, a) => sum + (a.sizeBytes || 0), 0);
    const potentialEvictionGB = Number((potentialEvictionBytes / (1024 * 1024 * 1024)).toFixed(2));

    // Estimated R2 Costs & Operations
    const estimatedClassA = 12420;
    const estimatedClassB = 342190;
    const estimatedGbMonth = Number((r2StorageGB * 0.95).toFixed(2));

    return NextResponse.json({
      overview: {
        r2StorageGB,
        r2BudgetGB,
        r2UtilizationPercent,
        r2ObjectsCount: cachedArtifacts.length,
        totalArtifactsCount: allArtifacts.length,
        vpsUsedGB,
        vpsAllocatedGB,
        vpsFreeGB,
        publicMirrorsCount: allSources.length,
        healthyCount,
        degradedCount,
        failedCount,
        r2HealthPercent,
        vpsHealthPercent,
        lastMirrorScan: settings.lastScanAt || new Date(),
      },
      projections: {
        pendingPromotionGB,
        potentialEvictionGB,
        projectedUsageGB: Number(Math.min(r2BudgetGB, r2StorageGB + pendingPromotionGB - potentialEvictionGB).toFixed(2)),
      },
      costEstimates: {
        currentStorageGB: r2StorageGB,
        estimatedGbMonth,
        classAOperations: estimatedClassA,
        classBOperations: estimatedClassB,
      },
      alerts,
      settings,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to load mirror overview";
    console.error("[Admin Mirror Overview API Error]:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
