import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Artifact from "@/lib/models/Artifact";
import MirrorAttempt from "@/lib/models/MirrorAttempt";
import { getMirrorSettings } from "@/lib/mirrors/cacheManager";
import { getR2PresignedDownloadUrl, checkR2ObjectExists } from "@/lib/mirrors/r2Client";
import {
  DEFAULT_WINDOWS_LAUNCHER_DOWNLOAD_URL,
  getLauncherDownloadUrl,
  getAdminLauncherDownloadUrl,
  getMacLauncherDownloadUrl,
  getLinuxLauncherDownloadUrl,
  type LauncherOs,
} from "@/lib/launcherDownload";
import {
  assertWindowsSetupFilename,
  launcherUpdateDownloadUrl,
  parseWindowsSetupFilename,
} from "@/lib/launcherUpdateFeed";

type LauncherArtifact = {
  artifactId: string;
  filename: string;
  relativePath: string;
  sizeBytes?: number | null;
  r2Status?: string | null;
  vpsStatus?: string | null;
};

async function findLatestWindowsLauncherArtifact(): Promise<LauncherArtifact | null> {
  await dbConnect();
  const artifact = await Artifact.findOne({
    artifactType: "launcher",
    $or: [
      { artifactId: /^playbound-launcher-windows-/ },
      { filename: /^PlayBound-Setup-.*\.exe$/i },
    ],
  }).sort({ createdAt: -1 });
  return artifact;
}

/**
 * Resolve where the signed Windows installer should redirect.
 * Prefer R2 → VPS → Blob. Always require a real .exe filename for launcher rows.
 */
export async function resolveWindowsLauncherDownloadTarget(options?: {
  /** When set (from /download/PlayBound-Setup-x.y.z.exe), prefer that version. */
  requestedFileName?: string | null;
}): Promise<{
  targetUrl: string;
  sourceType: "r2" | "playbound_vps" | "public";
  artifact: LauncherArtifact | null;
  fileName: string | null;
}> {
  const requested = options?.requestedFileName
    ? parseWindowsSetupFilename(options.requestedFileName)
      ? assertWindowsSetupFilename(options.requestedFileName).fileName
      : null
    : null;

  await dbConnect();
  const settings = await getMirrorSettings();

  let artifact: LauncherArtifact | null = null;
  if (requested) {
    artifact = await Artifact.findOne({
      artifactType: "launcher",
      filename: requested,
    });
  }
  if (!artifact) {
    artifact = await findLatestWindowsLauncherArtifact();
  }

  let targetUrl: string | null = null;
  let sourceType: "r2" | "playbound_vps" | "public" = "public";
  const fileName =
    (artifact?.filename && parseWindowsSetupFilename(artifact.filename)
      ? artifact.filename
      : null) ||
    requested;

  if (artifact && artifact.r2Status === "cached" && fileName) {
    try {
      const check = await checkR2ObjectExists(artifact.relativePath);
      if (check.exists) {
        targetUrl = await getR2PresignedDownloadUrl(artifact.relativePath, 3600, fileName);
        sourceType = "r2";
      } else {
        console.warn(
          `[Launcher Download] ${fileName} marked cached but not found in R2. Falling back to VPS.`
        );
      }
    } catch (err) {
      console.warn("[Launcher Download] Failed checking or generating R2 presigned URL:", err);
    }
  }

  if (!targetUrl && artifact && artifact.vpsStatus === "verified" && fileName) {
    const vpsBase = (settings.vpsMirrorBaseUrl || "https://mirror.playbound.club").replace(
      /\/+$/,
      ""
    );
    const cleanRel = String(artifact.relativePath || "").replace(/^\/+/, "");
    // Prefer a path that already ends with the .exe; never hand out the bare artifact id.
    const withExe = cleanRel.toLowerCase().endsWith(".exe")
      ? cleanRel
      : `${cleanRel.replace(/\/+$/, "")}/${fileName}`.replace(/\/{2,}/g, "/");
    targetUrl = `${vpsBase}/${withExe}`;
    sourceType = "playbound_vps";
  }

  if (!targetUrl) {
    targetUrl = getLauncherDownloadUrl() || DEFAULT_WINDOWS_LAUNCHER_DOWNLOAD_URL;
    sourceType = "public";
  }

  return { targetUrl, sourceType, artifact, fileName };
}

export async function windowsLauncherDownloadResponse(options?: {
  requestedFileName?: string | null;
  /** When true and no filename was requested, 307 to the named /download/<exe> URL first. */
  redirectBareToNamed?: boolean;
}): Promise<NextResponse> {
  const resolved = await resolveWindowsLauncherDownloadTarget({
    requestedFileName: options?.requestedFileName,
  });

  if (
    options?.redirectBareToNamed &&
    !options.requestedFileName &&
    resolved.fileName &&
    parseWindowsSetupFilename(resolved.fileName)
  ) {
    return NextResponse.redirect(launcherUpdateDownloadUrl(resolved.fileName), 307);
  }

  if (resolved.artifact) {
    void MirrorAttempt.create({
      artifactId: resolved.artifact.artifactId,
      sourceId: `${resolved.sourceType}-${resolved.artifact.artifactId}`,
      sourceType: resolved.sourceType,
      attemptedAt: new Date(),
      completedAt: new Date(),
      result: "success",
      bytesDownloaded: resolved.artifact.sizeBytes || 0,
      downloadDuration: 0,
      downloadSpeed: 0,
    }).catch((err) => {
      console.warn("[Launcher Download Telemetry Error]:", err);
    });
  }

  const response = NextResponse.redirect(resolved.targetUrl, 307);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  if (resolved.fileName) {
    response.headers.set(
      "Content-Disposition",
      `attachment; filename="${resolved.fileName.replace(/["\\\r\n]/g, "")}"`
    );
  }
  return response;
}

export async function launcherDownloadResponseForRequest(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const os = (searchParams.get("os")?.toLowerCase() || "windows") as LauncherOs;
    const channel = searchParams.get("channel")?.toLowerCase() || "prod";

    if (channel === "admin") {
      return NextResponse.redirect(getAdminLauncherDownloadUrl(), 307);
    }
    if (os === "macos") {
      return NextResponse.redirect(getMacLauncherDownloadUrl() || "", 307);
    }
    if (os === "linux") {
      return NextResponse.redirect(getLinuxLauncherDownloadUrl() || "", 307);
    }

    return await windowsLauncherDownloadResponse({ redirectBareToNamed: true });
  } catch (error: unknown) {
    console.error("[Launcher Download Error]:", error);
    return NextResponse.redirect(DEFAULT_WINDOWS_LAUNCHER_DOWNLOAD_URL, 307);
  }
}
