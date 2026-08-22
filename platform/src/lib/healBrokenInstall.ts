/**
 * Auto-heal broken install recipes after a version probe fails.
 * Used by the daily cron and admin Check now / Re-check.
 */

import { findDirectInstaller } from "@/lib/discoverInstall";
import {
  probeDirectUrl,
  type ProbeResult,
} from "@/lib/catalogVersionProbe";

const SKIP_EXT = /\.(b\d{2}|cab|pak|bin|part\d+|dmg|pkg|appimage|deb|rpm|torrent)(\?|#|$)/i;

function ghHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "playbound-catalog-heal",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

/** Higher score = better Windows installer/archive candidate. */
export function scoreGithubReleaseAsset(name: string): number {
  const lower = name.toLowerCase();
  if (SKIP_EXT.test(lower)) return -1;
  if (!/\.(exe|msi|zip|jar)$/i.test(lower)) return -1;
  if (/mac|darwin|osx|linux|appimage|\.dmg|\.deb|\.rpm|android|ios/i.test(lower)) return -1;

  let score = 10;
  if (/win64|win-x64|x64|x86_64|amd64|windows-64/i.test(lower)) score += 35;
  else if (/windows|win32|win\b/i.test(lower)) score += 20;
  if (/\.msi$/i.test(lower)) score += 28;
  else if (/\.exe$/i.test(lower)) score += 25;
  else if (/\.jar$/i.test(lower)) score += 22;
  else if (/\.zip$/i.test(lower)) score += 15;
  if (/setup|installer|install|launcher|client/i.test(lower)) score += 20;
  if (/source|src\.|symbols|debug|pdb/i.test(lower)) score -= 40;
  return score;
}

/** Looser pattern so the next release still matches after a heal. */
function saferAssetPattern(name: string): string {
  const ext = name.match(/\.(exe|msi|zip|jar)$/i)?.[1]?.toLowerCase();
  if (!ext) return "\\.(exe|msi|zip|jar)$";
  if (/win64|x64|x86_64|amd64/i.test(name)) {
    return `(win64|x64|amd64|x86_64).*\\.${ext}$`;
  }
  if (/windows|win32|\bwin\b/i.test(name)) {
    return `win.*\\.${ext}$`;
  }
  return `\\.${ext}$`;
}

async function fetchLatestReleaseAssets(repo: string): Promise<{
  tag: string;
  assets: { name: string; browser_download_url: string }[];
} | null> {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: ghHeaders(),
    next: { revalidate: 0 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub releases ${res.status} for ${repo}`);
  const data = (await res.json()) as {
    tag_name?: string;
    assets?: { name: string; browser_download_url: string }[];
  };
  return {
    tag: String(data.tag_name || ""),
    assets: Array.isArray(data.assets) ? data.assets : [],
  };
}

async function healFromGithubRepo(
  repo: string,
  preferZip: boolean
): Promise<ProbeResult | null> {
  try {
    const release = await fetchLatestReleaseAssets(repo);
    if (release?.tag) {
      const ranked = release.assets
        .map((a) => ({ ...a, score: scoreGithubReleaseAsset(a.name) }))
        .filter((a) => a.score > 0)
        .sort((a, b) => {
          if (preferZip) {
            const az = /\.zip$/i.test(a.name) ? 1 : 0;
            const bz = /\.zip$/i.test(b.name) ? 1 : 0;
            if (az !== bz) return bz - az;
          }
          return b.score - a.score;
        });

      const best = ranked[0];
      if (best) {
        const reach = await probeDirectUrl(best.browser_download_url, release.tag);
        if (reach.status !== "broken") {
          return {
            status: "updated",
            detectedVersion: release.tag,
            note: `auto-healed: GitHub asset ${best.name}`,
            patch: {
              url: best.browser_download_url,
              fileName: best.name,
              versionLabel: release.tag,
              directUrl: best.browser_download_url,
              assetPattern: saferAssetPattern(best.name),
            },
          };
        }
      }

      // Empty or unscorable assets — same zipball fallback as probeGithubZip.
      const zipball = `https://github.com/${repo}/archive/refs/tags/${encodeURIComponent(release.tag)}.zip`;
      const zipReach = await probeDirectUrl(zipball, release.tag);
      if (zipReach.status !== "broken") {
        return {
          status: "updated",
          detectedVersion: release.tag,
          note: `auto-healed: release zipball ${release.tag}`,
          patch: {
            url: zipball,
            fileName: `${repo.split("/").pop() || "mod"}-${release.tag}.zip`,
            versionLabel: release.tag,
            directUrl: zipball,
          },
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function healFromWebsite(website: string): Promise<ProbeResult | null> {
  try {
    const discovered = await findDirectInstaller(website);
    if (!discovered?.url) return null;

    const reach = await probeDirectUrl(discovered.url, discovered.versionLabel || null);
    if (reach.status === "broken") return null;

    return {
      status: "updated",
      detectedVersion: discovered.versionLabel || "fixed",
      note: `auto-healed: discovered from website (${discovered.fileName || "installer"})`,
      patch: {
        url: discovered.url,
        fileName: discovered.fileName || undefined,
        versionLabel: discovered.versionLabel || undefined,
        directUrl: discovered.url,
      },
    };
  } catch {
    return null;
  }
}

const RETIRED_MRBOOM_HOST = /mrboom\.mumble\.info/i;
const MRBOOM_RETROARCH_URL =
  "https://buildbot.libretro.com/stable/1.19.1/windows/x86_64/RetroArch.7z";

async function healRetiredMrBoomHost(): Promise<ProbeResult | null> {
  const reach = await probeDirectUrl(MRBOOM_RETROARCH_URL, "1.19.1");
  if (reach.status === "broken") return null;
  return {
    status: "updated",
    detectedVersion: "1.19.1",
    note: "auto-healed: standalone host retired (HTTP 421); switched to RetroArch buildbot",
    patch: {
      kind: "direct-7z",
      url: MRBOOM_RETROARCH_URL,
      fileName: "RetroArch.7z",
      versionLabel: "1.19.1",
      directUrl: MRBOOM_RETROARCH_URL,
    },
  };
}

export async function healBrokenGameInstall(opts: {
  kind?: string | null;
  repo?: string | null;
  url?: string | null;
  versionLabel?: string | null;
  website?: string | null;
  enabled?: boolean | null;
}): Promise<ProbeResult | null> {
  const kind = opts.kind || "";
  if (opts.enabled === false) return null;
  if (!kind || kind === "external") return null;

  if (opts.url && RETIRED_MRBOOM_HOST.test(opts.url)) {
    const fromRetired = await healRetiredMrBoomHost();
    if (fromRetired) return fromRetired;
  }

  const preferZip = kind.includes("zip") || kind === "github-jar";
  const repo = opts.repo?.trim() || null;
  if (repo) {
    const fromGh = await healFromGithubRepo(repo, preferZip);
    if (fromGh) return fromGh;
  }

  const website = opts.website?.trim() || null;
  if (website && kind.startsWith("direct")) {
    const fromWeb = await healFromWebsite(website);
    if (fromWeb) return fromWeb;
  }

  return null;
}

export async function healBrokenModInstall(opts: {
  downloadKind?: string | null;
  githubRepo?: string | null;
  directUrl?: string | null;
}): Promise<ProbeResult | null> {
  const kind = opts.downloadKind || "";
  if (!kind || kind === "external") return null;

  const repo = opts.githubRepo?.trim() || null;
  if (repo) {
    return healFromGithubRepo(repo, true);
  }

  return null;
}

/** Probe result with optional auto-heal when broken. */
export async function withAutoHealGame(
  probe: ProbeResult,
  install: {
    kind?: string | null;
    repo?: string | null;
    url?: string | null;
    versionLabel?: string | null;
    website?: string | null;
    enabled?: boolean | null;
  }
): Promise<ProbeResult> {
  if (probe.status !== "broken") return probe;
  const healed = await healBrokenGameInstall(install);
  return healed || probe;
}

export async function withAutoHealMod(
  probe: ProbeResult,
  mod: {
    downloadKind?: string | null;
    githubRepo?: string | null;
    directUrl?: string | null;
  }
): Promise<ProbeResult> {
  if (probe.status !== "broken") return probe;
  const healed = await healBrokenModInstall(mod);
  return healed || probe;
}
