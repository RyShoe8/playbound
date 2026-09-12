/**
 * Signed Windows launcher update feed helpers.
 *
 * electron-updater names the cached installer from the *URL pathname*, not the
 * YAML `path:` field, whenever the URL does not already end in `.exe`
 * (see electron-updater AppUpdater.getCacheUpdateFileName). A feed that points
 * at `/api/launcher/download` therefore lands on disk as a file literally named
 * `download` — Windows then asks what to open it with. Every public feed URL
 * must end with `PlayBound-Setup-<version>.exe`.
 */

export const WINDOWS_SETUP_FILENAME_RE = /^PlayBound-Setup-(\d+\.\d+\.\d+)\.exe$/i;

export const LAUNCHER_DOWNLOAD_API_BASE = "https://playbound.club/api/launcher/download";

export function parseWindowsSetupFilename(fileName: string): { version: string } | null {
  const match = WINDOWS_SETUP_FILENAME_RE.exec(String(fileName || "").trim());
  if (!match) return null;
  return { version: match[1] };
}

export function assertWindowsSetupFilename(fileName: string): { fileName: string; version: string } {
  const parsed = parseWindowsSetupFilename(fileName);
  if (!parsed) {
    throw new Error("Expected PlayBound-Setup-<version>.exe");
  }
  return { fileName: String(fileName).trim(), version: parsed.version };
}

/** Absolute update URL whose pathname ends with the .exe (required by electron-updater). */
export function launcherUpdateDownloadUrl(fileName: string): string {
  const { fileName: safe } = assertWindowsSetupFilename(fileName);
  return `${LAUNCHER_DOWNLOAD_API_BASE}/${encodeURIComponent(safe)}`;
}

/**
 * Refuse any update-file URL that would download into an extensionless cache name.
 * Accepts absolute https URLs or bare filenames.
 */
export function assertUpdateFileUrlEndsWithExe(url: string): void {
  const raw = String(url || "").trim();
  if (!raw) throw new Error("Update file URL is empty");

  let pathname: string;
  if (/^https?:\/\//i.test(raw)) {
    pathname = new URL(raw).pathname;
  } else {
    pathname = raw.startsWith("/") ? raw : `/${raw}`;
  }
  const base = pathname.split("/").pop() || "";
  if (!/\.exe$/i.test(base)) {
    throw new Error(
      `Update file URL must end with .exe (electron-updater caches by URL basename). Got: ${raw}`
    );
  }
}

export function launcherArtifactRelativePath(artifactId: string, fileName: string): string {
  const { fileName: safe } = assertWindowsSetupFilename(fileName);
  const id = String(artifactId || "").trim();
  if (!id) throw new Error("artifactId is required");
  return `artifacts/${id}/${safe}`;
}

/** Heal legacy keys that stopped at artifacts/<id> with no .exe. */
export function ensureLauncherRelativePath(
  artifactId: string,
  fileName: string,
  currentRelativePath?: string | null
): { relativePath: string; healed: boolean } {
  const want = launcherArtifactRelativePath(artifactId, fileName);
  const current = String(currentRelativePath || "").replace(/^\/+/, "");
  return { relativePath: want, healed: current !== want };
}

export function buildSignedWindowsLatestYml(input: {
  version: string;
  fileName: string;
  sizeBytes: number;
  sha512: string;
  releaseDate?: string | Date;
}): string {
  const { fileName } = assertWindowsSetupFilename(input.fileName);
  if (input.version !== assertWindowsSetupFilename(fileName).version) {
    throw new Error(`Version ${input.version} does not match filename ${fileName}`);
  }
  const sha512 = String(input.sha512 || "").trim();
  if (!sha512) throw new Error("sha512 is required to publish latest.yml");
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new Error("sizeBytes must be a positive number");
  }

  const downloadUrl = launcherUpdateDownloadUrl(fileName);
  assertUpdateFileUrlEndsWithExe(downloadUrl);

  const releaseDate =
    input.releaseDate instanceof Date
      ? input.releaseDate.toISOString()
      : String(input.releaseDate || new Date().toISOString());

  return `version: ${input.version}
files:
  - url: ${downloadUrl}
    sha512: ${sha512}
    size: ${input.sizeBytes}
path: ${fileName}
sha512: ${sha512}
releaseDate: '${releaseDate}'
`;
}
