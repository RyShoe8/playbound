/**
 * Public URL for the Windows PlayBound Launcher Setup.exe (Vercel Blob).
 * Set NEXT_PUBLIC_LAUNCHER_DOWNLOAD_URL after running scripts/upload-launcher.ts.
 */
export function getLauncherDownloadUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_LAUNCHER_DOWNLOAD_URL?.trim();
  return url || null;
}

/**
 * Public URL for the macOS PlayBound Launcher Setup.dmg (Vercel Blob).
 */
export function getMacLauncherDownloadUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_LAUNCHER_MAC_DOWNLOAD_URL?.trim();
  return url || null;
}

/**
 * Unsigned admin-channel Windows Setup (from `npm run dist:dev` + upload:launcher).
 * Stable Blob alias overwritten on each unsigned upload.
 */
const DEFAULT_ADMIN_LAUNCHER_DOWNLOAD_URL =
  "https://mt8u2b96lweefbpb.public.blob.vercel-storage.com/launcher/PlayBound-Launcher-Setup-Admin.exe";

export function getAdminLauncherDownloadUrl(): string {
  return (
    process.env.NEXT_PUBLIC_LAUNCHER_ADMIN_DOWNLOAD_URL?.trim() ||
    DEFAULT_ADMIN_LAUNCHER_DOWNLOAD_URL
  );
}

/** Client-safe: same env is inlined by Next for NEXT_PUBLIC_* vars. */
export const LAUNCHER_DOWNLOAD_URL =
  typeof process !== "undefined" ? process.env.NEXT_PUBLIC_LAUNCHER_DOWNLOAD_URL?.trim() || null : null;

export const MAC_LAUNCHER_DOWNLOAD_URL =
  typeof process !== "undefined" ? process.env.NEXT_PUBLIC_LAUNCHER_MAC_DOWNLOAD_URL?.trim() || null : null;

export const ADMIN_LAUNCHER_DOWNLOAD_URL =
  typeof process !== "undefined" ? getAdminLauncherDownloadUrl() : DEFAULT_ADMIN_LAUNCHER_DOWNLOAD_URL;
