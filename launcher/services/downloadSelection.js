"use strict";

/**
 * Which file a fixed-URL download fetches, and what it is called on disk.
 *
 * Pure functions of the catalog entry and the platform, lifted out of
 * resolveDownload (services/main/core.js) so the rules can be tested by
 * calling them rather than by cutting their source out of a file.
 */
const path = require("path");

/**
 * The URL for this platform: urlMac / urlLinux override the Windows `url`.
 *
 * Apple ship two architectures and several projects build for both, so one
 * urlMac hands half of Mac users a slice they cannot run. 0 A.D. is the case:
 * macos-aarch64.dmg and macos-x86_64.dmg, and an Intel Mac given the first gets
 * nothing. urlMac stays the default — Apple Silicon, which is every Mac sold
 * since 2020 — and urlMacX64 is the Intel override. A recipe with only urlMac
 * keeps working exactly as before.
 */
function selectDownloadUrl(entry, platform = process.platform, arch = process.arch) {
  if (platform === "darwin" && entry.urlMac) {
    return arch !== "arm64" && entry.urlMacX64 ? entry.urlMacX64 : entry.urlMac;
  }
  if (platform === "linux" && entry.urlLinux) return entry.urlLinux;
  return entry.url;
}

/** Refuse a Windows-only installer on a Mac rather than download something that cannot run. */
function assertInstallableOnPlatform(entry, effectiveUrl, platform = process.platform) {
  if (
    platform === "darwin" &&
    (entry.kind === "direct-installer" || entry.kind === "direct-exe") &&
    !entry.urlMac &&
    /\.(exe|msi)$/i.test(String(effectiveUrl || entry.fileName || ""))
  ) {
    throw new Error(
      "This game only ships a Windows installer in the catalog. On Mac, use Locate to select the .app if you already installed it."
    );
  }
}

/**
 * The on-disk name for a download.
 *
 * `fileName` describes the Windows build, so a per-platform override must not
 * be allowed to keep it — the extension decides how the download is installed,
 * and 7KAA's Linux .tar.gz saved as 7kaa-install-win32.exe gets openPath'd as
 * an installer instead of extracted.
 *
 * The basename alone is not enough to catch it: SourceForge serves
 * .../7kaa-2.15.7-linux-x86-64.tar.gz/download, so the basename is "download"
 * and the real name is the segment before it. Scan from the end so that
 * trailing-segment shape resolves to the file rather than to some earlier
 * archive-looking directory.
 */
function downloadFileName(entry, effectiveUrl) {
  const overridden = effectiveUrl !== entry.url;
  let name = entry.fileName;
  try {
    const urlFileName = path.basename(new URL(effectiveUrl).pathname);
    if (overridden || !name || name === "download" || !name.includes(".")) {
      if (urlFileName && urlFileName !== "download" && urlFileName.includes(".")) {
        name = urlFileName;
      }
    }
  } catch {}
  if ((overridden && name === entry.fileName) || !name || name === "download" || !name.includes(".")) {
    try {
      const parts = new URL(effectiveUrl).pathname.split("/").filter(Boolean).reverse();
      const fromPath = parts.find((p) =>
        /\.(exe|zip|7z|rar|msi|dmg|pkg|jar|tar\.gz|tar\.xz|tgz|appimage|bin)$/i.test(decodeURIComponent(p))
      );
      name = (fromPath && decodeURIComponent(fromPath)) || entry.fileName || `${entry.slug}.bin`;
    } catch {
      name = entry.fileName || `${entry.slug}.bin`;
    }
  }
  return name;
}

module.exports = { selectDownloadUrl, assertInstallableOnPlatform, downloadFileName };
