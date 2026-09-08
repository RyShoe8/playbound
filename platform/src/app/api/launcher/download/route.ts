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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const os = (searchParams.get("os")?.toLowerCase() || "windows") as LauncherOs;
    const channel = searchParams.get("channel")?.toLowerCase() || "prod";

    // Unsigned / admin builds remain untouched on Vercel Blob
    if (channel === "admin") {
      const adminUrl = getAdminLauncherDownloadUrl();
      return NextResponse.redirect(adminUrl, 307);
    }

    // Mac & Linux direct aliases
    if (os === "macos") {
      const macUrl = getMacLauncherDownloadUrl() || "";
      return NextResponse.redirect(macUrl, 307);
    }
    if (os === "linux") {
      const linuxUrl = getLinuxLauncherDownloadUrl() || "";
      return NextResponse.redirect(linuxUrl, 307);
    }

    // Windows signed launcher: R2 (Primary) -> VPS (Secondary) -> Blob (Tertiary fallback)
    await dbConnect();
    const settings = await getMirrorSettings();

    // Look for the latest signed Windows launcher artifact
    const artifact = await Artifact.findOne({
      artifactType: "launcher",
      $or: [
        { artifactId: /^playbound-launcher-windows-/ },
        { filename: /^PlayBound-Setup-.*\.exe$/i },
      ],
    }).sort({ createdAt: -1 });

    let targetUrl: string | null = null;
    let sourceType: "r2" | "playbound_vps" | "public" = "public";

    // Tier 1: Cloudflare R2 Hot Cache
    if (artifact && artifact.r2Status === "cached") {
      try {
        const check = await checkR2ObjectExists(artifact.relativePath);
        if (check.exists) {
          targetUrl = await getR2PresignedDownloadUrl(
            artifact.relativePath,
            3600,
            artifact.filename
          );
          sourceType = "r2";
        } else {
          console.warn(`[Launcher Download] ${artifact.filename} marked cached but not found in R2. Falling back to VPS.`);
        }
      } catch (err) {
        console.warn("[Launcher Download] Failed checking or generating R2 presigned URL:", err);
      }
    }

    // Tier 2: PlayBound VPS Authoritative Archive
    if (!targetUrl && artifact && artifact.vpsStatus === "verified") {
      const vpsBase = (settings.vpsMirrorBaseUrl || "https://mirror.playbound.club").replace(/\/+$/, "");
      const cleanRel = artifact.relativePath.replace(/^\/+/, "");
      targetUrl = `${vpsBase}/${cleanRel}`;
      sourceType = "playbound_vps";
    }

    // Tier 3: Vercel Blob Public Fallback
    if (!targetUrl) {
      targetUrl = getLauncherDownloadUrl() || DEFAULT_WINDOWS_LAUNCHER_DOWNLOAD_URL;
      sourceType = "public";
    }

    // Asynchronously record delivery telemetry so mirror bandwidth metrics stay accurate
    if (artifact) {
      void MirrorAttempt.create({
        artifactId: artifact.artifactId,
        sourceId: `${sourceType}-${artifact.artifactId}`,
        sourceType,
        attemptedAt: new Date(),
        completedAt: new Date(),
        result: "success",
        bytesDownloaded: artifact.sizeBytes || 0,
        downloadDuration: 0,
        downloadSpeed: 0,
      }).catch((err) => {
        console.warn("[Launcher Download Telemetry Error]:", err);
      });
    }

    const response = NextResponse.redirect(targetUrl, 307);
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return response;
  } catch (error: unknown) {
    console.error("[Launcher Download Error]:", error);
    // Ultimate resilience: never fail a user download
    return NextResponse.redirect(DEFAULT_WINDOWS_LAUNCHER_DOWNLOAD_URL, 307);
  }
}
