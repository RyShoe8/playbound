import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import Artifact from "@/lib/models/Artifact";
import MirrorSource from "@/lib/models/MirrorSource";
import {
  catalogArchiveSourceUrl,
  evictSupersededLauncherVersionsFromR2,
  refreshUploadingVpsArtifacts,
} from "@/lib/mirrors/cacheManager";
import { filterCurrentArtifacts } from "@/lib/mirrors/currentArtifacts";
import { launcherPlatformFromArtifactId, pickLatestLauncherArtifact } from "@/lib/mirrors/semver";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    await dbConnect();
    await refreshUploadingVpsArtifacts();

    const rawArtifacts = await Artifact.find({}).sort({ r2Status: 1, r2PromotionScore: -1 });
    /*
     * Free R2 space occupied by superseded launcher builds whenever an admin
     * opens this page — only when a newer launcher is already verified/cached.
     */
    const launchers = rawArtifacts.filter(
      (a) =>
        a.artifactType === "launcher" || String(a.artifactId).startsWith("playbound-launcher-")
    );
    const byPlatform = new Map<string, typeof launchers>();
    for (const art of launchers) {
      const platform = launcherPlatformFromArtifactId(art.artifactId);
      const list = byPlatform.get(platform) || [];
      list.push(art);
      byPlatform.set(platform, list);
    }
    for (const [, list] of byPlatform) {
      const latest = pickLatestLauncherArtifact(list);
      if (latest && (latest.r2Status === "cached" || latest.vpsStatus === "verified")) {
        await evictSupersededLauncherVersionsFromR2(latest.artifactId, "system").catch((err) => {
          console.warn("[download-mirrors/cache] superseded launcher R2 cleanup failed:", err);
        });
      }
    }

    const refreshed = await Artifact.find({}).sort({ r2Status: 1, r2PromotionScore: -1 }).lean();
    const artifacts = await filterCurrentArtifacts(refreshed);
    const sources = await MirrorSource.find({ sourceType: "public" }).lean();

    const sourceMap = new Map<string, typeof sources>();
    for (const src of sources) {
      const list = sourceMap.get(src.artifactId) || [];
      list.push(src);
      sourceMap.set(src.artifactId, list);
    }

    const items = await Promise.all(artifacts.map(async (a) => {
      const artSources = sourceMap.get(a.artifactId) || [];
      const archiveSource = [...artSources]
        .filter((source) => /^https:\/\//i.test(String(source.url || "")))
        .sort((a, b) => a.priority - b.priority || a.createdAt.getTime() - b.createdAt.getTime())[0];
      let editionSlug: string | undefined;
      let modSlug: string | undefined;
      if (a.artifactType === "edition") {
        const match = (a as { relativePath?: string }).relativePath?.match(/\/editions\/([^/]+)\//) ||
          a.artifactId?.match(/^([^-]+)-edition-([^-]+)/);
        if (match) editionSlug = match[1] || match[2];
      } else if (a.artifactType === "mod") {
        const match = (a as { relativePath?: string }).relativePath?.match(/\/mods\/([^/]+)/) ||
          a.artifactId?.match(/^([^-]+)-mod-([^-]+)/);
        if (match) modSlug = match[1] || match[2] || a.artifactId;
      }
      const archiveSourceUrl = archiveSource?.url || await catalogArchiveSourceUrl(a.gameSlug, editionSlug, modSlug);
      const healthyPublic = artSources.some((s) => s.healthStatus === "healthy");
      const degradedPublic = artSources.some((s) => s.healthStatus === "degraded");

      let publicHealth = "Good";
      if (!healthyPublic && degradedPublic) publicHealth = "Poor";
      else if (!healthyPublic && artSources.length > 0) publicHealth = "Offline";
      else if (artSources.length === 0) publicHealth = "None";

      const vpsPctMatch = a.vpsStatusMessage?.match(/\((\d+(?:\.\d+)?)%\)/);
      const vpsTransferPercent = vpsPctMatch ? parseFloat(vpsPctMatch[1]) : a.vpsStatus === "verified" ? 100 : a.vpsStatus === "uploading" ? 0 : null;
      const r2Msg = (a as { r2StatusMessage?: string | null }).r2StatusMessage || null;
      const r2PctMatch = r2Msg?.match(/\((\d+(?:\.\d+)?)%\)/);
      const r2TransferPercent = r2PctMatch ? parseFloat(r2PctMatch[1]) : a.r2Status === "cached" ? 100 : a.r2Status === "uploading" ? 0 : null;

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
        r2StatusMessage: r2Msg,
        r2TransferPercent,
        r2Protected: a.r2Protected,
        r2Disabled: a.r2Disabled,
        vpsStatus: a.vpsStatus,
        vpsStatusMessage: a.vpsStatusMessage || null,
        vpsTransferPercent,
        lastPromoted: a.r2LastPromoted,
        lastEvicted: a.r2LastEvicted,
        publicHealth,
        sha256: a.sha256,
        archiveSourceUrl,
      };
    }));

    return NextResponse.json({ items });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to load cache list";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
