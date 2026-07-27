/**
 * Public URL for the Windows PlayBound Launcher Setup.exe (Vercel Blob).
 * Set NEXT_PUBLIC_LAUNCHER_DOWNLOAD_URL after running scripts/upload-launcher.ts.
 */
export function getLauncherDownloadUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_LAUNCHER_DOWNLOAD_URL?.trim();
  return url || null;
}

/** Client-safe: same env is inlined by Next for NEXT_PUBLIC_* vars. */
export const LAUNCHER_DOWNLOAD_URL =
  typeof process !== "undefined" ? process.env.NEXT_PUBLIC_LAUNCHER_DOWNLOAD_URL?.trim() || null : null;
