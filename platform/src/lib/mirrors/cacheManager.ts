import dbConnect from "@/lib/db";
import Artifact, { IArtifact } from "@/lib/models/Artifact";
import MirrorSettings, { IMirrorSettings } from "@/lib/models/MirrorSettings";
import MirrorEvent from "@/lib/models/MirrorEvent";
import MirrorSource from "@/lib/models/MirrorSource";
import MirrorAttempt from "@/lib/models/MirrorAttempt";
import MirrorJob from "@/lib/models/MirrorJob";
import CatalogGame from "@/lib/models/CatalogGame";
import Edition from "@/lib/models/Edition";
import CatalogMod from "@/lib/models/CatalogMod";
import { editions as seedEditions } from "@/lib/data/editions";
import { mods as seedMods } from "@/lib/data/mods";
import { launcherInstallBySlug } from "@/lib/data/launcherInstall";
import { ensureArtifact } from "@/lib/mirrors/ensureArtifact";
import type { ArtifactType } from "@/lib/models/Artifact";
import {
  archivedArtifactStatusOnHost,
  archiveArtifactOnHost,
  deleteArchivedArtifactOnHost,
} from "@/lib/gameHost/client";
import {
  checkR2ObjectExists,
  deleteObjectFromR2,
  getR2PresignedDownloadUrl,
  uploadObjectToR2,
  uploadStreamToR2,
} from "./r2Client";
import { calculateArtifactCacheScore, evaluateSourceHealth } from "./scoring";
import { formatDataVolume, formatR2TransferMessage, formatVpsTransferMessage } from "./vpsProgress";


/** Resolves an itch.io game page to its direct pre-signed CDN download URL. */
export async function resolveItchDownloadUrl(pageUrl: string, uploadIdHint?: string | null): Promise<string | null> {
  try {
    const res = await fetch(pageUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const uploadMatches = [...html.matchAll(/data-upload_id=["'](\d+)["']/g)].map((m) => m[1]);
    if (!uploadMatches.length) return null;
    const uploadId = uploadIdHint || uploadMatches[0];
    const csrfMatch =
      html.match(/csrf_token["']?\s*[:=]\s*["']([^"']+)["']/i) ||
      html.match(/name=["']csrf_token["']\s+value=["']([^"']+)["']/i);
    const postRes = await fetch(
      `${pageUrl.replace(/\/+$/, "")}/file/${uploadId}?source=game_download`,
      {
        method: "POST",
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          cookie: res.headers.get("set-cookie") || "",
          "x-requested-with": "XMLHttpRequest",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: csrfMatch ? `csrf_token=${encodeURIComponent(csrfMatch[1])}` : "",
      }
    );
    if (!postRes.ok) return null;
    const json = (await postRes.json()) as { url?: string };
    return json.url || null;
  } catch {
    return null;
  }
}

/**
 * Resolves a SourceForge download or project URL to a direct CDN mirror URL.
 * Bypasses Cloudflare bot challenges by requesting with use_mirror=autoselect
 * and following to the final dl.sourceforge.net CDN mirror.
 */
export async function resolveSourceForgeDownloadUrl(pageOrDownloadUrl: string): Promise<string | null> {
  try {
    let direct = pageOrDownloadUrl.trim();
    const match = direct.match(/sourceforge\.net\/projects\/([^/]+)\/files\/(.+?)(?:\/download)?(?:\?.*)?$/i);
    if (match) {
      const [, project, filePath] = match;
      direct = `https://downloads.sourceforge.net/project/${project}/${filePath}`;
    }
    const parsed = new URL(direct);
    if (!parsed.searchParams.has("use_mirror")) {
      parsed.searchParams.set("use_mirror", "autoselect");
    }
    const res = await fetch(parsed.toString(), {
      headers: { "User-Agent": "curl/8.4.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok && res.url && /dl\.sourceforge\.net/i.test(res.url)) {
      return res.url;
    }
    return res.ok ? res.url : parsed.toString();
  } catch (err) {
    console.warn("[resolveSourceForgeDownloadUrl] Failed resolving:", err);
    return null;
  }
}

/**
 * Some older artifact rows were created before the launcher reported its
 * source URL. The catalog recipe is an explicit, read-only fallback for that
 * exact game, edition, or mod; it does not alter the game, the artifact, or any source record.
 */
export async function catalogArchiveSourceUrl(
  gameSlug: string | null | undefined,
  editionSlug?: string | null | undefined,
  modSlug?: string | null | undefined
): Promise<string | null> {
  const slug = String(gameSlug || "").trim();
  const eSlug = String(editionSlug || "").trim();
  const mSlug = String(modSlug || "").trim();
  if (!slug && !mSlug) return null;

  if (mSlug) {
    const doc = await CatalogMod.findOne({ slug: mSlug }).select("directUrl githubRepo website").lean();
    const seed = seedMods.find((m) => m.slug === mSlug);
    const directUrl = String(doc?.directUrl || seed?.directUrl || "").trim();
    if (/^https:\/\//i.test(directUrl)) return directUrl;
    const repo = String(doc?.githubRepo || seed?.githubRepo || "").trim();
    if (repo) {
      return repo.startsWith("https://") ? repo : `https://github.com/${repo}`;
    }
    const website = String(doc?.website || seed?.website || "").trim();
    if (website && /^https:\/\//i.test(website)) return website;
  }

  if (eSlug) {
    const doc = await Edition.findOne({ gameSlug: slug, slug: eSlug }).select("installConfig").lean();
    const config = (doc?.installConfig || {}) as { url?: string; repo?: string; urlMac?: string; urlLinux?: string };
    const seed = seedEditions.find((e) => e.gameSlug === slug && e.slug === eSlug);
    const seedConfig = seed?.installConfig as { url?: string; repo?: string } | undefined;
    const url = String(config.url || seedConfig?.url || "").trim();
    if (/^https:\/\//i.test(url)) {
      if (/itch\.io/i.test(url)) {
        const direct = await resolveItchDownloadUrl(url);
        if (direct) return direct;
      }
      if (/sourceforge\.net/i.test(url)) {
        const direct = await resolveSourceForgeDownloadUrl(url);
        if (direct) return direct;
      }
      return url;
    }
  }

  const doc = await CatalogGame.findOne({ slug }).select("launcherInstall").lean();
  const stored = doc?.launcherInstall as { kind?: string; url?: string | null; uploadId?: string | null } | undefined;
  const seed = launcherInstallBySlug[slug];
  // A stored itch recipe can outlive its signed CDN URL while the curated
  // seed has already moved the package to a durable PlayBound mirror.
  const useCuratedMirror =
    /^https:\/\//i.test(String(seed?.url || "")) &&
    !/itch\.io/i.test(String(seed?.url || "")) &&
    (!stored?.url || /itch\.io/i.test(String(stored?.url || "")) || stored?.kind === "external");
  const recipe = useCuratedMirror
    ? seed
    : stored?.kind && stored.kind !== "external"
      ? stored
      : seed;
  const url = String(recipe?.url || "").trim();
  if (!/^https:\/\//i.test(url)) return null;

  if (/itch\.io/i.test(url)) {
    const direct = await resolveItchDownloadUrl(url, recipe?.uploadId);
    if (direct) return direct;
  }
  if (/sourceforge\.net/i.test(url)) {
    const direct = await resolveSourceForgeDownloadUrl(url);
    if (direct) return direct;
  }
  return url;
}

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

function detectContentType(filename: string): string {
  if (/\.exe$/i.test(filename)) return "application/vnd.microsoft.portable-executable";
  if (/\.zip$/i.test(filename)) return "application/zip";
  if (/\.dmg$/i.test(filename)) return "application/x-apple-diskimage";
  if (/\.appimage$/i.test(filename)) return "application/x-executable";
  if (/\.jar$/i.test(filename)) return "application/java-archive";
  if (/\.tar\.gz$/i.test(filename)) return "application/gzip";
  return "application/octet-stream";
}

export type PromotionProgressCallback = (progress: {
  stage: "starting" | "verifying_vps" | "uploading_to_r2" | "done" | "error";
  bytesUploaded?: number;
  totalBytes?: number;
  percent?: number;
  message?: string;
}) => void;

/**
 * Ensures an artifact's physical bytes are uploaded from the VPS archive, catalog mirror, or staging to Cloudflare R2.
 */
export async function syncArtifactToR2(
  artifact: IArtifact,
  onProgress?: (bytesUploaded: number, totalBytes: number, percent: number) => void
): Promise<{ success: boolean; message: string }> {
  const cleanRel = artifact.relativePath.replace(/^\/+/, "");

  // Check if already in R2
  const exists = await checkR2ObjectExists(cleanRel);
  if (exists.exists) {
    return { success: true, message: `Artifact ${artifact.filename} already exists in R2.` };
  }

  const settings = await getMirrorSettings();
  const vpsBase = (settings.vpsMirrorBaseUrl || "https://mirror.playbound.club").replace(/\/+$/, "");
  const vpsUrl = `${vpsBase}/${cleanRel}`;

  let editionSlug: string | undefined;
  let modSlug: string | undefined;
  if (artifact.artifactType === "edition") {
    const match = artifact.relativePath?.match(/\/editions\/([^/]+)\//) ||
      artifact.artifactId?.match(/^([^-]+)-edition-([^-]+)/);
    if (match) editionSlug = match[1] || match[2];
  } else if (artifact.artifactType === "mod") {
    const match = artifact.relativePath?.match(/\/mods\/([^/]+)/) ||
      artifact.artifactId?.match(/^([^-]+)-mod-([^-]+)/);
    if (match) modSlug = match[1] || match[2] || artifact.artifactId;
  }

  try {
    let res: Response | null = null;
    try {
      const vpsRes = await fetch(vpsUrl, { signal: AbortSignal.timeout(60000) });
      if (vpsRes.ok) res = vpsRes;
    } catch {
      // Direct VPS path not accessible
    }

    // Fallback 1: check catalog archive source URL (e.g. HoloCure package on VPS mirror)
    if (!res || !res.ok) {
      const catalogUrl = await catalogArchiveSourceUrl(artifact.gameSlug, editionSlug, modSlug);
      if (catalogUrl && /^https?:\/\//i.test(catalogUrl)) {
        try {
          const catRes = await fetch(catalogUrl, { signal: AbortSignal.timeout(60000) });
          if (catRes.ok) {
            res = catRes;
          }
        } catch {
          // Catalog URL fetch failed
        }
      }
    }

    // Fallback 2: try public sources for this artifact
    if (!res || !res.ok) {
      const altSources = await MirrorSource.find({ artifactId: artifact.artifactId, enabled: true })
        .sort({ priority: -1 })
        .lean();
      for (const s of altSources) {
        if (s.url && /^https?:\/\//i.test(s.url)) {
          try {
            let altUrl = s.url;
            if (/itch\.io/i.test(altUrl)) {
              const direct = await resolveItchDownloadUrl(altUrl);
              if (direct) altUrl = direct;
            } else if (/sourceforge\.net/i.test(altUrl)) {
              const direct = await resolveSourceForgeDownloadUrl(altUrl);
              if (direct) altUrl = direct;
            }
            const altRes = await fetch(altUrl, { signal: AbortSignal.timeout(60000) });
            if (altRes.ok) {
              res = altRes;
              break;
            }
          } catch {
            // Source failed
          }
        }
      }
    }

    if (!res || !res.ok || !res.body) {
      const status = res ? res.status : "unreachable";
      return {
        success: false,
        message: `Could not fetch artifact bytes from VPS archive (${vpsUrl}) or public mirrors (status ${status}).`,
      };
    }

    const totalBytes = Number(res.headers.get("content-length")) || artifact.sizeBytes || 0;
    if (totalBytes > 0 && artifact.sizeBytes !== totalBytes) {
      artifact.sizeBytes = totalBytes;
      await artifact.save();
    }

    const contentType = detectContentType(artifact.filename);

    const uploadRes = await uploadStreamToR2(
      cleanRel,
      res.body,
      totalBytes,
      contentType,
      (uploaded, total) => {
        const pct = total > 0 ? Math.min(100, Math.round((uploaded / total) * 1000) / 10) : 0;
        onProgress?.(uploaded, total, pct);
      }
    );

    if (!uploadRes.success) {
      return { success: false, message: uploadRes.error || "Failed uploading artifact to Cloudflare R2." };
    }

    return {
      success: true,
      message: `Uploaded ${(totalBytes / (1024 * 1024)).toFixed(1)} MB to Cloudflare R2 hot cache.`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Error transferring artifact to R2: ${msg}` };
  }
}

/**
 * Manually promotes an artifact to R2 with live streaming progress, bypassing score thresholds but checking VPS verification.
 */
export async function manualPromoteArtifact(
  artifactId: string,
  actor: string,
  onProgress?: PromotionProgressCallback
): Promise<{ success: boolean; queued?: boolean; message: string }> {
  await dbConnect();
  const artifact = await Artifact.findOne({ artifactId });
  if (!artifact) return { success: false, message: "Artifact not found" };

  if (artifact.artifactType === "launcher") {
    const {
      ensureLauncherRelativePath,
      parseWindowsSetupFilename,
      buildSignedWindowsLatestYml,
    } = await import("@/lib/launcherUpdateFeed");
    if (!parseWindowsSetupFilename(artifact.filename || "")) {
      return {
        success: false,
        message:
          "Launcher artifact filename must be PlayBound-Setup-<version>.exe before Promote to R2.",
      };
    }
    const { relativePath, healed } = ensureLauncherRelativePath(
      artifact.artifactId,
      artifact.filename,
      artifact.relativePath
    );
    if (healed) {
      artifact.relativePath = relativePath;
      await artifact.save();
      return {
        success: false,
        message:
          "Launcher archive path was missing the .exe filename. Re-run Upload signed launcher so the VPS stores PlayBound-Setup-<version>.exe, then Promote to R2.",
      };
    }
    if (!artifact.sha512) {
      return {
        success: false,
        message: "Launcher artifact is missing sha512. Re-run Upload signed launcher before Promote to R2.",
      };
    }
    try {
      const { put } = await import("@vercel/blob");
      const yml = buildSignedWindowsLatestYml({
        version: String(artifact.version),
        fileName: artifact.filename,
        sizeBytes: Number(artifact.sizeBytes) || 0,
        sha512: String(artifact.sha512),
        releaseDate: artifact.createdAt || new Date(),
      });
      await put("launcher/latest.yml", yml, {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "text/yaml; charset=utf-8",
      });
    } catch (err) {
      return {
        success: false,
        message:
          err instanceof Error
            ? `Could not refresh latest.yml before R2 promote: ${err.message}`
            : "Could not refresh latest.yml before R2 promote",
      };
    }
  }

  onProgress?.({
    stage: "starting",
    percent: 0,
    message: `Starting promotion for ${artifact.filename}…`,
  });

  artifact.r2Status = "uploading";
  artifact.r2StatusMessage = "Starting R2 upload…";
  await artifact.save();

  if (artifact.vpsStatus !== "verified") {
    // Check if host actually has it verified
    const remote = await archivedArtifactStatusOnHost(artifact.relativePath);
    if (remote?.status === "verified") {
      artifact.vpsStatus = "verified";
      artifact.vpsStatusMessage = null;
      await artifact.save();
    } else {
      let editionSlug: string | undefined;
      let modSlug: string | undefined;
      if (artifact.artifactType === "edition") {
        const match = artifact.relativePath?.match(/\/editions\/([^/]+)\//) ||
          artifact.artifactId?.match(/^([^-]+)-edition-([^-]+)/);
        if (match) editionSlug = match[1] || match[2];
      } else if (artifact.artifactType === "mod") {
        const match = artifact.relativePath?.match(/\/mods\/([^/]+)/) ||
          artifact.artifactId?.match(/^([^-]+)-mod-([^-]+)/);
        if (match) modSlug = match[1] || match[2] || artifact.artifactId;
      }
      const catUrl = await catalogArchiveSourceUrl(artifact.gameSlug, editionSlug, modSlug);
      if (catUrl && /mirror\.playbound\.club/i.test(catUrl)) {
        // The authoritative package is already hosted on the VPS mirror!
        // Start the VPS archive task to link/copy it into the artifact's canonical path,
        // but since the file is already on the VPS, we can proceed to promote it to R2!
        artifact.vpsStatus = "verified";
        artifact.vpsStatusMessage = null;
        await artifact.save();
        void archiveArtifactOnHost({
          url: catUrl,
          relativePath: artifact.relativePath,
          sizeBytes: artifact.sizeBytes,
          sha256: artifact.sha256 || null,
        }).catch(() => {});
      } else {
        artifact.r2Status = "not_cached";
        artifact.r2StatusMessage = "Authoritative VPS copy must be verified before R2 promotion.";
        await artifact.save();
        return { success: false, message: "Authoritative VPS copy must be verified before R2 promotion. Click 'Archive to VPS' first." };
      }
    }
  }

  // Upload bytes to Cloudflare R2 with live progress
  let lastDbUpdate = 0;
  const syncResult = await syncArtifactToR2(artifact, (uploaded, total, pct) => {
    const message = formatR2TransferMessage(uploaded, total);
    onProgress?.({
      stage: "uploading_to_r2",
      bytesUploaded: uploaded,
      totalBytes: total,
      percent: pct,
      message,
    });

    const now = Date.now();
    if (now - lastDbUpdate > 1500) {
      lastDbUpdate = now;
      artifact.r2StatusMessage = message;
      void artifact.save().catch(() => {});
    }
  });

  if (!syncResult.success) {
    artifact.r2Status = "not_cached";
    artifact.r2StatusMessage = syncResult.message;
    await artifact.save();
    onProgress?.({
      stage: "error",
      message: syncResult.message,
    });
    return { success: false, message: syncResult.message };
  }

  artifact.r2Status = "cached";
  artifact.r2StatusMessage = null;
  artifact.r2LastPromoted = new Date();
  artifact.r2Disabled = false;
  await artifact.save();

  let supersededNote = "";
  if (artifact.artifactType === "launcher") {
    const evicted = await evictSupersededLauncherVersionsFromR2(artifact.artifactId, actor);
    if (evicted > 0) {
      supersededNote = ` Evicted ${evicted} older launcher version(s) from R2.`;
    }
  }

  await MirrorEvent.create({
    eventType: "manual_promote",
    actor,
    artifactId: artifact.artifactId,
    details: `${actor} manually promoted ${artifact.filename} to R2 hot cache (${syncResult.message})${supersededNote}`,
  });

  onProgress?.({
    stage: "done",
    percent: 100,
    message: `Promoted ${artifact.filename} to R2 hot cache. ${syncResult.message}${supersededNote}`,
  });

  return {
    success: true,
    message: `Promoted ${artifact.filename} to R2 hot cache. ${syncResult.message}${supersededNote}`,
  };
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

/**
 * Drop older Windows/mac/linux launcher builds from R2 after a newer one is promoted.
 * Keeps Mongo + VPS rows so Clean Old Versions can finish bookkeeping later.
 */
export async function evictSupersededLauncherVersionsFromR2(
  keepArtifactId: string,
  actor: string
): Promise<number> {
  await dbConnect();
  const { launcherPlatformFromArtifactId } = await import("@/lib/mirrors/semver");
  const keep = await Artifact.findOne({ artifactId: keepArtifactId });
  if (!keep) return 0;
  const platform = launcherPlatformFromArtifactId(keep.artifactId);

  const others = await Artifact.find({
    artifactType: "launcher",
    artifactId: { $ne: keepArtifactId },
    r2Status: { $in: ["cached", "uploading", "candidate"] },
  });

  let evicted = 0;
  for (const other of others) {
    if (launcherPlatformFromArtifactId(other.artifactId) !== platform) continue;
    try {
      await deleteObjectFromR2(other.relativePath);
      // Also try legacy key without filename (pre-.exe path shape).
      const legacyKey = `artifacts/${other.artifactId}`;
      if (other.relativePath !== legacyKey) {
        await deleteObjectFromR2(legacyKey).catch(() => ({ success: false }));
      }
      other.r2Status = "not_cached";
      other.r2LastEvicted = new Date();
      other.r2Protected = false;
      other.r2StatusMessage = `Superseded by ${keep.filename}`;
      await other.save();
      evicted += 1;
      await MirrorEvent.create({
        eventType: "manual_evict",
        actor,
        artifactId: other.artifactId,
        details: `${actor} evicted superseded launcher ${other.filename} from R2 (kept ${keep.filename})`,
      });
    } catch (err) {
      console.warn(`[mirrors] Failed evicting superseded launcher ${other.artifactId}:`, err);
    }
  }
  return evicted;
}

/**
 * Copy an eligible artifact to the authoritative VPS archive.
 *
 * R2 is a hot cache, not a prerequisite: an artifact's first durable copy
 * necessarily comes from its approved public source. Requiring R2 here made
 * the old Promote → Archive path impossible because Promote in turn required
 * a VPS copy.
 */
export async function archiveArtifactToVps(
  artifactId: string,
  actor: string,
  preferredSourceUrl?: string | null,
  fallback?: {
    gameSlug?: string | null;
    version?: string | null;
    filename?: string | null;
    sizeBytes?: number | null;
    artifactType?: ArtifactType | null;
  } | null
): Promise<{ success: boolean; message: string }> {
  await dbConnect();
  let artifact = await Artifact.findOne({ artifactId });
  /*
   * Admin pages can briefly show an old cache row after housekeeping removed
   * its operational artifact document. Recreate only that exact bookkeeping
   * row from the card that was clicked. This never queries or writes catalog
   * games, editions, or install recipes.
   */
  if (!artifact && fallback?.gameSlug && fallback?.filename && Number(fallback.sizeBytes) > 0) {
    artifact = await ensureArtifact({
      artifactId,
      gameSlug: fallback.gameSlug,
      version: fallback.version || "unknown",
      filename: fallback.filename,
      sizeBytes: Number(fallback.sizeBytes),
      artifactType: fallback.artifactType || "game",
    });
  }
  if (!artifact) return { success: false, message: "Artifact not found" };

  let sourceUrl: string | null = null;
  let sourceLabel = "original download source";
  if (artifact.r2Status === "cached") {
    const r2 = await checkR2ObjectExists(artifact.relativePath);
    if (r2.exists) {
      sourceUrl = await getR2PresignedDownloadUrl(artifact.relativePath, 60 * 60);
      sourceLabel = "R2 hot cache";
    }
  }
  let editionSlug: string | undefined;
  let modSlug: string | undefined;
  if (artifact.artifactType === "edition") {
    const match = artifact.relativePath?.match(/\/editions\/([^/]+)\//) ||
      artifact.artifactId?.match(/^([^-]+)-edition-([^-]+)/);
    if (match) editionSlug = match[1] || match[2];
  } else if (artifact.artifactType === "mod") {
    const match = artifact.relativePath?.match(/\/mods\/([^/]+)/) ||
      artifact.artifactId?.match(/^([^-]+)-mod-([^-]+)/);
    if (match) modSlug = match[1] || match[2] || artifact.artifactId;
  }

  /*
   * Explicit sourceUrl from the admin Archive action wins first. Catalog URLs
   * often point at the VPS path we are trying to fill (GoldenEye 404) — using
   * them as the pull source loops forever. Prefer the staged Blob / public URL
   * the operator selected.
   */
  const preferred = String(preferredSourceUrl || "").trim();
  if (preferred.startsWith("https://") && !/itch\.io|hwcdn\.net/i.test(preferred)) {
    sourceUrl = preferred;
    sourceLabel = "selected public source";
  }

  /*
   * Prefer a current catalog URL when it names this exact file and nothing
   * else was selected. Operational MirrorSource rows are historical telemetry
   * and may contain expired itch CDN links; HoloCure's recorded source
   * returned 403 even though its curated package URL was current. Exact
   * filename matching prevents substituting a sibling edition or a different
   * package.
   */
  if (!sourceUrl && (artifact.gameSlug || modSlug) && artifact.filename) {
    const catalogUrl = await catalogArchiveSourceUrl(artifact.gameSlug, editionSlug, modSlug);
    if (catalogUrl) {
      try {
        const catalogPath = decodeURIComponent(new URL(catalogUrl).pathname);
        const catalogFilename = catalogPath.split("/").pop() || "";
        const isMatch =
          catalogFilename === artifact.filename ||
          catalogFilename.endsWith(`-${artifact.filename}`) ||
          catalogFilename.toLowerCase().endsWith(artifact.filename.toLowerCase()) ||
          artifact.artifactType === "mod";
        if (isMatch) {
          sourceUrl = catalogUrl;
          sourceLabel = artifact.artifactType === "mod" ? "catalog mod source" : "current catalog download";
        }
      } catch {
        /* Fall through to the explicitly selected/recorded source. */
      }
    }
  }
  // The admin cache row already has this exact URL from its Public sources
  // record. Prefer it when supplied so archiving does not depend on a second
  // lookup of historic telemetry identifiers, unless it is an expiring itch link.
  if (!sourceUrl && preferred.startsWith("https://") && !/itch\.io|hwcdn\.net/i.test(preferred)) {
    sourceUrl = preferred;
    sourceLabel = "selected public source";
  }
  if (!sourceUrl) {
    let source = await MirrorSource.findOne({
      artifactId: artifact.artifactId,
      sourceType: "public",
      url: { $regex: "^https://", $options: "i" },
    }).sort({ priority: 1, createdAt: 1 });

    /*
     * Early launcher telemetry used a shared source id. The source table can
     * therefore hold the right public URL under a historic artifact id while
     * the artifact table has already been corrected to the actual file id.
     * Recover only within the same game and exact filename: no mirror record
     * is written, and a different game's source can never be selected.
     */
    if (!source && artifact.gameSlug && artifact.filename) {
      const siblings = await Artifact.find({
        gameSlug: artifact.gameSlug,
        filename: artifact.filename,
      }).select("artifactId").lean();
      const siblingIds = siblings
        .map((item) => String(item.artifactId || ""))
        .filter(Boolean);
      if (siblingIds.length > 0) {
        source = await MirrorSource.findOne({
          artifactId: { $in: siblingIds },
          sourceType: "public",
          url: { $regex: "^https://", $options: "i" },
        }).sort({ priority: 1, createdAt: 1 });
        if (source) sourceLabel = "recorded public source";
      }
    }
    const candidate = String(source?.url || "").trim();
    if (candidate.startsWith("https://") && !/itch\.io|hwcdn\.net/i.test(candidate)) {
      sourceUrl = candidate;
    } else {
      const catalogUrl = await catalogArchiveSourceUrl(artifact.gameSlug, editionSlug, modSlug);
      if (catalogUrl && !/itch\.io|hwcdn\.net/i.test(catalogUrl)) {
        sourceUrl = catalogUrl;
        sourceLabel = artifact.artifactType === "mod" ? "catalog mod source" : "current catalog download";
      } else if (candidate.startsWith("https://")) {
        sourceUrl = candidate;
      } else if (preferred.startsWith("https://")) {
        sourceUrl = preferred;
      }
    }
    if (!sourceUrl) {
      return { success: false, message: "There is no file available to move: this artifact is not physically in R2 and no direct HTTPS download source was recorded." };
    }
  }

  if (sourceUrl && /itch\.io/i.test(sourceUrl)) {
    const direct = await resolveItchDownloadUrl(sourceUrl);
    if (direct) {
      sourceUrl = direct;
      sourceLabel = "resolved itch.io CDN";
    }
  } else if (sourceUrl && /sourceforge\.net/i.test(sourceUrl)) {
    const direct = await resolveSourceForgeDownloadUrl(sourceUrl);
    if (direct) {
      sourceUrl = direct;
      sourceLabel = "resolved SourceForge CDN";
    }
  }

  if (!artifact.sizeBytes && sourceUrl) {
    try {
      const headRes = await fetch(sourceUrl, { method: "HEAD", signal: AbortSignal.timeout(10000) });
      const cl = Number(headRes.headers.get("content-length"));
      if (cl > 0) {
        artifact.sizeBytes = cl;
        await artifact.save();
      }
    } catch {
      /* proceed */
    }
  }

  if (!artifact.sizeBytes) {
    return { success: false, message: "Artifact size is unknown; verify it before archiving." };
  }

  artifact.vpsStatus = "uploading";
  artifact.vpsStatusMessage = "Transfer queued on the VPS.";
  await artifact.save();

  const result = await archiveArtifactOnHost({
    url: sourceUrl,
    relativePath: artifact.relativePath,
    sizeBytes: artifact.sizeBytes,
    sha256: artifact.sha256 || null,
  });
  if (!result.success) {
    artifact.vpsStatus = "missing";
    artifact.vpsStatusMessage = result.message || "Could not start the VPS archive transfer.";
    await artifact.save();
    return { success: false, message: result.message || "Could not copy artifact to the VPS archive." };
  }

  if (result.queued) {
    await MirrorEvent.create({
      eventType: "archive_to_vps",
      actor,
      artifactId: artifact.artifactId,
      details: `${actor} queued ${artifact.filename} for transfer from ${sourceLabel} to the VPS archive`,
    });
    return { success: true, message: `Transfer to the VPS started from ${sourceLabel} for ${artifact.filename}. This page will mark it On VPS when the copy finishes.` };
  }

  artifact.vpsStatus = "verified";
  artifact.vpsStatusMessage = null;
  await artifact.save();
  await MirrorEvent.create({
    eventType: "archive_to_vps",
    actor,
    artifactId: artifact.artifactId,
    details: `${actor} copied ${artifact.filename} from ${sourceLabel} to the VPS archive`,
  });
  return { success: true, message: `Archived ${artifact.filename} on the VPS.` };
}

/** Refresh only in-progress archive rows from the VPS agent; no catalog data is touched. */
export async function refreshUploadingVpsArtifacts(): Promise<void> {
  await dbConnect();
  const uploading = await Artifact.find({ vpsStatus: "uploading" });
  for (const artifact of uploading) {
    const remote = await archivedArtifactStatusOnHost(artifact.relativePath);
    if (!remote) continue;
    if (remote.status === "uploading") {
      const expected = remote.sizeBytes || artifact.sizeBytes || 0;
      artifact.vpsStatusMessage = formatVpsTransferMessage(remote.bytesReceived, expected);
      await artifact.save();
      continue;
    }
    artifact.vpsStatus = remote.status === "verified" ? "verified" : "missing";
    artifact.vpsStatusMessage =
      remote.status === "verified" ? null : remote.message || "The VPS did not retain the archive transfer.";
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

  /*
   * Always tell the host to forget this path, not only when our own record
   * says "verified" or "uploading". A failed archive attempt leaves the
   * host's in-memory job (and any partial file) behind while our own status
   * reads back as "missing" — skipping the host call in that case orphans a
   * failed job that then blocks every future retry for this artifact, since
   * the host replays a stale failure instead of trying again. The host call
   * is idempotent (deleting a job/file that was never there is a no-op), so
   * there's no cost to making it unconditional.
   */
  const vps = await deleteArchivedArtifactOnHost(artifact.relativePath);
  if (!vps.success && vps.message !== "Game host is not configured") {
    return { success: false, message: vps.message || "Could not remove VPS archive copy." };
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
