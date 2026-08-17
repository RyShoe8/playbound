import Artifact, { type ArtifactType } from "@/lib/models/Artifact";
import MirrorSource from "@/lib/models/MirrorSource";

/**
 * Find an artifact, or register it the first time something downloads it.
 *
 * The mirror tables used to be populated by a fixed seed list, so only the
 * handful of artifacts in that list ever appeared and every other download
 * reported telemetry against an id with no row behind it — the increment was
 * looked up, missed, and silently dropped. Registering on first sight means
 * the table fills itself from real traffic instead.
 *
 * Deliberately minimal: a row created here records what the download actually
 * told us and nothing more. Size and checksum arrive from the client, so they
 * describe one observed download rather than an authoritative manifest — the
 * VPS archive stays `missing` until something verifies it.
 */
export async function ensureArtifact(input: {
  artifactId: string;
  gameSlug?: string | null;
  version?: string | null;
  filename?: string | null;
  sizeBytes?: number | null;
  sha256?: string | null;
  artifactType?: ArtifactType;
}) {
  const artifactId = String(input.artifactId || "").trim();
  if (!artifactId) return null;

  const existing = await Artifact.findOne({ artifactId });
  if (existing) {
    // Fill in anything we did not know before without overwriting curation.
    let touched = false;
    if (!existing.sizeBytes && input.sizeBytes) {
      existing.sizeBytes = input.sizeBytes;
      touched = true;
    }
    if (!existing.sha256 && input.sha256) {
      existing.sha256 = input.sha256;
      touched = true;
    }
    if (touched) await existing.save();
    return existing;
  }

  return Artifact.create({
    artifactId,
    gameSlug: input.gameSlug || null,
    version: input.version || "unknown",
    artifactType: input.artifactType || "game",
    filename: input.filename || artifactId,
    relativePath: input.gameSlug
      ? `games/${input.gameSlug}/${input.version || "unknown"}/${input.filename || artifactId}`
      : `artifacts/${artifactId}`,
    sizeBytes: input.sizeBytes || 0,
    sha256: input.sha256 || "",
    licenseStatus: "unknown",
    // Nothing is mirrored until someone decides it should be — this row is a
    // record that the download happened, not a promise that we host it.
    mirrorEnabled: false,
    redistributionAllowed: false,
    vpsStatus: "missing",
    r2Status: "not_cached",
    r2PromotionScore: 0,
    r2Protected: false,
    r2Disabled: false,
    totalDownloads: 0,
    recentDownloads: 0,
    averageDownloadSpeed: 0,
    publicSuccessCount: 0,
    publicFailureCount: 0,
  });
}

/**
 * Register the upstream URL a download came from as a public source, so the
 * health columns have something to describe. Idempotent on sourceId.
 */
export async function ensurePublicSource(input: {
  artifactId: string;
  sourceId: string;
  url?: string | null;
}) {
  const sourceId = String(input.sourceId || "").trim();
  if (!sourceId || !input.url) return null;

  const existing = await MirrorSource.findOne({ sourceId });
  if (existing) return existing;

  return MirrorSource.create({
    sourceId,
    artifactId: input.artifactId,
    sourceType: "public",
    url: input.url,
    enabled: true,
    priority: 100,
    healthStatus: "unknown",
    successCount: 0,
    failureCount: 0,
    timeoutCount: 0,
    checksumFailureCount: 0,
    averageResponseTime: 0,
    averageDownloadSpeed: 0,
  });
}
