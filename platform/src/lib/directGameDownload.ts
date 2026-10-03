import type { LauncherInstall } from "@/lib/launcherInstall";
import type { LauncherOs } from "@/lib/launcherDownload";

const FILE_KINDS = new Set<LauncherInstall["kind"]>([
  "direct-zip", "direct-7z", "direct-installer", "direct-exe",
  "github-zip", "github-installer", "github-jar", "openttd-zip",
]);

function safeHttpsUrl(value: string | null | undefined): string | null {
  try {
    const url = new URL(value || "");
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function configuredGameFileUrl(install: LauncherInstall | undefined, os: LauncherOs): string | null {
  if (!install?.enabled || !FILE_KINDS.has(install.kind)) return null;
  // Browsers cannot reliably distinguish Intel from Apple Silicon Macs.
  if (os === "macos" && install.urlMacX64 && install.urlMacX64 !== install.urlMac) return null;
  if (os === "macos") return safeHttpsUrl(install.urlMac);
  if (os === "linux") return safeHttpsUrl(install.urlLinux);
  return safeHttpsUrl(install.url);
}

export async function directGameDownload(
  install: LauncherInstall | undefined,
  os: LauncherOs,
  website: string
): Promise<{ url: string; direct: boolean }> {
  const configured = configuredGameFileUrl(install, os);
  if (configured) return { url: configured, direct: true };

  // A browser-level OS check cannot distinguish Intel from Apple Silicon.
  if (os === "macos" && install?.urlMacX64 && install.urlMacX64 !== install.urlMac) {
    return { url: safeHttpsUrl(website) || "", direct: false };
  }

  if (install?.enabled && install.repo && /^[-\w.]+\/[-\w.]+$/.test(install.repo) &&
      ["github-zip", "github-installer", "github-jar"].includes(install.kind)) {
    const patternText = os === "macos" ? install.assetPatternMac : os === "linux" ? install.assetPatternLinux : install.assetPattern;
    if (patternText && patternText.length < 200) {
      try {
        const pattern = new RegExp(patternText, "i");
        const response = await fetch(`https://api.github.com/repos/${install.repo}/releases/latest`, {
          headers: { accept: "application/vnd.github+json", "user-agent": "playbound-direct-game-download" },
          next: { revalidate: 300 },
          signal: AbortSignal.timeout(5000),
        });
        if (response.ok) {
          const release = await response.json() as { assets?: { name?: string; browser_download_url?: string }[] };
          const asset = release.assets?.find((candidate) => pattern.test(candidate.name || ""));
          const url = safeHttpsUrl(asset?.browser_download_url);
          if (url && new URL(url).hostname === "github.com") return { url, direct: true };
        }
      } catch {
        // A missing release, invalid pattern, or rate limit leaves the official page available.
      }
    }
  }

  return { url: safeHttpsUrl(website) || "", direct: false };
}
