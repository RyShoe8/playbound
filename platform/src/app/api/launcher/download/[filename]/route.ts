import { NextResponse } from "next/server";
import { windowsLauncherDownloadResponse } from "@/lib/launcherDownloadResolve";
import { parseWindowsSetupFilename } from "@/lib/launcherUpdateFeed";
import { DEFAULT_WINDOWS_LAUNCHER_DOWNLOAD_URL } from "@/lib/launcherDownload";

/**
 * Named installer URL for electron-updater.
 *
 * `/api/launcher/download` alone caches as a file named `download` (no .exe).
 * Feeds must point here: `/api/launcher/download/PlayBound-Setup-<version>.exe`.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename: raw } = await params;
    const filename = decodeURIComponent(raw || "");
    if (!parseWindowsSetupFilename(filename)) {
      return NextResponse.json(
        { error: "Expected PlayBound-Setup-<version>.exe" },
        { status: 400 }
      );
    }
    return await windowsLauncherDownloadResponse({ requestedFileName: filename });
  } catch (error: unknown) {
    console.error("[Launcher Download Filename Error]:", error);
    return NextResponse.redirect(DEFAULT_WINDOWS_LAUNCHER_DOWNLOAD_URL, 307);
  }
}
