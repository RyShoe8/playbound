/**
 * Public URLs for PlayBound Launcher installers on Vercel Blob.
 * Set NEXT_PUBLIC_LAUNCHER_*_DOWNLOAD_URL after running scripts/upload-launcher.ts.
 *
 * Mac/Linux use Blob alias defaults when env is unset so deep-link miss →
 * auto-download always has an OS-correct installer URL.
 */

export type LauncherOs = "windows" | "macos" | "linux";

const BLOB_BASE = "https://mt8u2b96lweefbpb.public.blob.vercel-storage.com/launcher";

export const DEFAULT_WINDOWS_LAUNCHER_DOWNLOAD_URL = `${BLOB_BASE}/PlayBound-Launcher-Setup.exe`;
export const DEFAULT_MAC_LAUNCHER_DOWNLOAD_URL = `${BLOB_BASE}/PlayBound-Launcher-Setup.dmg`;
export const DEFAULT_LINUX_LAUNCHER_DOWNLOAD_URL = `${BLOB_BASE}/PlayBound-Launcher-Setup.AppImage`;
const DEFAULT_ADMIN_LAUNCHER_DOWNLOAD_URL = `${BLOB_BASE}/PlayBound-Launcher-Setup-Admin.exe`;

/** Server-safe UA parser (also used by client detectLauncherOs). */
export function detectLauncherOsFromUa(ua: string | null | undefined): LauncherOs {
  const raw = ua || "";
  if (/Mac OS X|Macintosh/i.test(raw)) return "macos";
  // Android UA also contains "Linux" — never treat phones as desktop Linux.
  if (/Linux/i.test(raw) && !/Android/i.test(raw)) return "linux";
  return "windows";
}

export function getLauncherDownloadUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_LAUNCHER_DOWNLOAD_URL?.trim();
  return url || DEFAULT_WINDOWS_LAUNCHER_DOWNLOAD_URL;
}

export function getMacLauncherDownloadUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_LAUNCHER_MAC_DOWNLOAD_URL?.trim();
  return url || DEFAULT_MAC_LAUNCHER_DOWNLOAD_URL;
}

export function getLinuxLauncherDownloadUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_LAUNCHER_LINUX_DOWNLOAD_URL?.trim();
  return url || DEFAULT_LINUX_LAUNCHER_DOWNLOAD_URL;
}

/**
 * Unsigned admin-channel Windows Setup (from `npm run dist:dev` + upload:launcher).
 * Stable Blob alias overwritten on each unsigned upload.
 */
export function getAdminLauncherDownloadUrl(): string {
  return (
    process.env.NEXT_PUBLIC_LAUNCHER_ADMIN_DOWNLOAD_URL?.trim() ||
    DEFAULT_ADMIN_LAUNCHER_DOWNLOAD_URL
  );
}

/**
 * Client-safe constants. NEXT_PUBLIC_* must be literal property accesses so
 * Next can inline them at build time; then fall back to Blob aliases.
 */
export const LAUNCHER_DOWNLOAD_URL =
  (typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_LAUNCHER_DOWNLOAD_URL?.trim()
    : undefined) || DEFAULT_WINDOWS_LAUNCHER_DOWNLOAD_URL;

export const MAC_LAUNCHER_DOWNLOAD_URL =
  (typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_LAUNCHER_MAC_DOWNLOAD_URL?.trim()
    : undefined) || DEFAULT_MAC_LAUNCHER_DOWNLOAD_URL;

export const LINUX_LAUNCHER_DOWNLOAD_URL =
  (typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_LAUNCHER_LINUX_DOWNLOAD_URL?.trim()
    : undefined) || DEFAULT_LINUX_LAUNCHER_DOWNLOAD_URL;

export const ADMIN_LAUNCHER_DOWNLOAD_URL =
  typeof process !== "undefined" ? getAdminLauncherDownloadUrl() : DEFAULT_ADMIN_LAUNCHER_DOWNLOAD_URL;

export function launcherOsLabel(os: LauncherOs): string {
  if (os === "macos") return "macOS";
  if (os === "linux") return "Linux";
  return "Windows";
}

/** Prefer the OS-specific Blob alias; never hand a Windows .exe to Mac/Linux users. */
export function launcherDownloadUrlForOs(os: LauncherOs): string {
  if (os === "macos") return MAC_LAUNCHER_DOWNLOAD_URL;
  if (os === "linux") return LINUX_LAUNCHER_DOWNLOAD_URL;
  return LAUNCHER_DOWNLOAD_URL;
}
