import dbConnect from "@/lib/db";
import Artifact from "@/lib/models/Artifact";
import MirrorSource from "@/lib/models/MirrorSource";
import { getMirrorSettings } from "./cacheManager";
import { getR2PresignedDownloadUrl } from "./r2Client";

export interface ResolvedDownloadSource {
  sourceId: string;
  type: "public" | "r2" | "playbound_vps";
  url: string;
  priority: number;
  healthStatus?: string;
}

export interface ResolvedDownloadResponse {
  artifact: {
    id: string;
    gameSlug?: string | null;
    version: string;
    type: string;
    filename: string;
    size: number;
    sha256: string;
  };
  sources: ResolvedDownloadSource[];
}

/**
 * Resolves the 3-tier ordered download sources for an artifact.
 *
 * Ordering:
 * 1. Healthy Public Mirror (priority 100)
 * 2. Cloudflare R2 Hot Cache (priority 90)
 * 3. PlayBound VPS Authoritative Archive (priority 50)
 *
 * If public mirror is degraded (priority 70), R2 becomes preferred.
 * If public mirror is failing/offline (priority 0), it is demoted to last.
 */
export async function resolveDownloadSources(
  artifactIdOrSlug: string
): Promise<ResolvedDownloadResponse | null> {
  await dbConnect();
  const settings = await getMirrorSettings();

  // Find artifact by ID, or fallback by gameSlug / filename
  let artifact = await Artifact.findOne({ artifactId: artifactIdOrSlug });
  if (!artifact) {
    artifact = await Artifact.findOne({ gameSlug: artifactIdOrSlug }).sort({ createdAt: -1 });
  }

  if (!artifact) {
    return null;
  }

  const rawSources = await MirrorSource.find({
    artifactId: artifact.artifactId,
    enabled: true,
  });

  const resolvedSources: ResolvedDownloadSource[] = [];

  // 1. Process Public Mirrors
  for (const src of rawSources.filter((s) => s.sourceType === "public")) {
    let priority = 100;
    if (src.healthStatus === "degraded") priority = 70;
    else if (src.healthStatus === "failing" || src.healthStatus === "offline") priority = 10;

    resolvedSources.push({
      sourceId: src.sourceId,
      type: "public",
      url: src.url,
      priority,
      healthStatus: src.healthStatus,
    });
  }

  // 2. Process Cloudflare R2 Hot Cache
  if (artifact.r2Status === "cached") {
    try {
      const presignedUrl = await getR2PresignedDownloadUrl(artifact.relativePath, 3600);
      resolvedSources.push({
        sourceId: `r2-${artifact.artifactId}`,
        type: "r2",
        url: presignedUrl,
        priority: 90,
        healthStatus: "healthy",
      });
    } catch (err) {
      console.warn(`[Resolution] Failed generating R2 presigned URL for ${artifact.artifactId}:`, err);
    }
  }

  // 3. Process PlayBound VPS Authoritative Archive
  if (artifact.vpsStatus === "verified") {
    const vpsBase = (settings.vpsMirrorBaseUrl || "https://mirror.playbound.club").replace(/\/+$/, "");
    const cleanRel = artifact.relativePath.replace(/^\/+/, "");
    const vpsUrl = `${vpsBase}/${cleanRel}`;

    resolvedSources.push({
      sourceId: `vps-${artifact.artifactId}`,
      type: "playbound_vps",
      url: vpsUrl,
      priority: 50,
      healthStatus: "healthy",
    });
  }

  // Sort sources by priority descending
  resolvedSources.sort((a, b) => b.priority - a.priority);

  return {
    artifact: {
      id: artifact.artifactId,
      gameSlug: artifact.gameSlug,
      version: artifact.version,
      type: artifact.artifactType,
      filename: artifact.filename,
      size: artifact.sizeBytes,
      sha256: artifact.sha256,
    },
    sources: resolvedSources,
  };
}
