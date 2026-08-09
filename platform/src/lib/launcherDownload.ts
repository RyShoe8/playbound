/**
 * Public URLs for PlayBound Launcher installers on Vercel Blob.
 * Set NEXT_PUBLIC_LAUNCHER_*_DOWNLOAD_URL after running scripts/upload-launcher.ts.
 */

export type LauncherOs = "windows" | "macos" | "linux";

const BLOB_BASE = "https://mt8u2b96lweefbpb.public.blob.vercel-storage.com/launcher";

export function getLauncherDownloadUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_LAUNCHER_DOWNLOAD_URL?.trim();
  return url || null;
}

export function getMacLauncherDownloadUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_LAUNCHER_MAC_DOWNLOAD_URL?.trim();
  return url || null;
}

export function getLinuxLauncherDownloadUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_LAUNCHER_LINUX_DOWNLOAD_URL?.trim();
  return url || `${BLOB_BASE}/PlayBound-Launcher-Setup.AppImage`;
}

/**
 * Unsigned admin-channel Windows Setup (from `npm run dist:dev` + upload:launcher).
 * Stable Blob alias overwritten on each unsigned upload.
 */
const DEFAULT_ADMIN_LAUNCHER_DOWNLOAD_URL = `${BLOB_BASE}/PlayBound-Launcher-Setup-Admin.exe`;

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

export const LINUX_LAUNCHER_DOWNLOAD_URL =
  typeof process !== "undefined" ? getLinuxLauncherDownloadUrl() : `${BLOB_BASE}/PlayBound-Launcher-Setup.AppImage`;

export const ADMIN_LAUNCHER_DOWNLOAD_URL =
  typeof process !== "undefined" ? getAdminLauncherDownloadUrl() : DEFAULT_ADMIN_LAUNCHER_DOWNLOAD_URL;

export function launcherOsLabel(os: LauncherOs): string {
  if (os === "macos") return "macOS";
  if (os === "linux") return "Linux";
  return "Windows";
}

/** Prefer the OS-specific Blob alias; never hand a Windows .exe to Mac/Linux users. */
export function launcherDownloadUrlForOs(os: LauncherOs): string | null {
  if (os === "macos") return MAC_LAUNCHER_DOWNLOAD_URL || null;
  if (os === "linux") return LINUX_LAUNCHER_DOWNLOAD_URL || null;
  return LAUNCHER_DOWNLOAD_URL || null;
}
