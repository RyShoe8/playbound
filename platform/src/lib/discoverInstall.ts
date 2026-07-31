import type { LauncherInstall } from "@/lib/launcherInstall";
import { defaultLauncherInstallForWebsite } from "@/lib/launcherInstall";
import { assertPublicHttpUrl } from "@/lib/pageMeta";

const FETCH_HEADERS = {
  "user-agent": "PlayBoundAdmin/1.0 (+https://playbound-five.vercel.app)",
  accept: "text/html,application/xhtml+xml",
};

const DOWNLOAD_PATHS = ["/download", "/en/download", "/downloads", "/en/downloads"];

/** Multi-part data packs / non-installer archives to ignore. */
const SKIP_EXT = /\.(b\d{2}|cab|pak|bin|part\d+|dmg|pkg|appimage|deb|rpm|torrent)(\?|#|$)/i;

function absoluteUrl(base: string, maybeRelative: string): string | null {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return null;
  }
}

function downloadCandidateUrls(website: string): string[] {
  const urls = new Set<string>([website]);
  try {
    const base = new URL(website);
    for (const path of DOWNLOAD_PATHS) {
      urls.add(new URL(path, `${base.origin}/`).toString());
    }
  } catch {
    /* ignore bad website */
  }
  return [...urls];
}

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    // Operator-supplied origin — keep it off internal addresses.
    const safe = assertPublicHttpUrl(url);
    const res = await fetch(safe.toString(), {
      headers: FETCH_HEADERS,
      next: { revalidate: 0 },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!/html|text\/plain|xml/i.test(contentType) && contentType) {
      // Still try — some CDNs omit content-type
    }
    const html = await res.text();
    return { html, finalUrl: res.url || url };
  } catch {
    return null;
  }
}

function extractHrefs(html: string, baseUrl: string): string[] {
  const hrefs: string[] = [];
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const abs = absoluteUrl(baseUrl, m[1].trim());
    if (abs) hrefs.push(abs);
  }
  // Also catch bare content CDN links in scripts / text
  const bare = html.matchAll(/https?:\/\/[^\s"'<>]+\.(?:exe|msi)(?:\?[^\s"'<>]*)?/gi);
  for (const hit of bare) {
    hrefs.push(hit[0]);
  }
  return [...new Set(hrefs)];
}

function fileNameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const name = path.split("/").filter(Boolean).pop() || "installer";
    return decodeURIComponent(name);
  } catch {
    return "installer";
  }
}

/** Higher score = better installer candidate. */
function scoreInstallerUrl(url: string): number {
  const lower = url.toLowerCase();
  if (SKIP_EXT.test(lower)) return -1;
  if (!/\.(exe|msi)(\?|#|$)/i.test(lower)) return -1;

  let score = 10;
  const name = fileNameFromUrl(url).toLowerCase();

  if (name.endsWith(".msi")) score += 25;
  if (/setup|installer|install|launcher|client/i.test(name)) score += 30;
  if (/^warframe\.msi$/i.test(name) || /^warframe\.exe$/i.test(name)) score += 40;

  // Prefer short launcher names over giant dated builds
  if (name.length <= 24) score += 10;
  if (/\d{4}\.\d{2}\.\d{2}/.test(name) && /\.b\d{2}/i.test(name)) score -= 50;
  if (/^\d+$/.test(name.replace(/\.(exe|msi)$/i, ""))) score -= 20;

  // Prefer official-looking hosts over random CDNs slightly less than content CDNs for games
  if (/content\.|cdn\.|download\.|dl\./i.test(lower)) score += 5;
  if (/steamcdn|steampowered/i.test(lower)) score -= 5;

  return score;
}

export type DiscoverInstallSource = "direct" | "steam" | "website";

export type DiscoverInstallResult = {
  recipe: LauncherInstall;
  source: DiscoverInstallSource;
};

export async function findDirectInstaller(website: string): Promise<LauncherInstall | null> {
  if (!website?.trim()) return null;

  const pages = downloadCandidateUrls(website.trim());
  const candidates: { url: string; score: number }[] = [];

  for (const page of pages) {
    const fetched = await fetchHtml(page);
    if (!fetched) continue;
    for (const href of extractHrefs(fetched.html, fetched.finalUrl)) {
      const score = scoreInstallerUrl(href);
      if (score > 0) candidates.push({ url: href, score });
    }
  }

  // Known public installer hosts when the marketing site is JS-heavy.
  try {
    const host = new URL(website).hostname.replace(/^www\./, "");
    if (/warframe\.com$/i.test(host)) {
      for (const probe of [
        "https://content.warframe.com/dl/Warframe.msi",
        "http://content.warframe.com/dl/Warframe.msi",
      ]) {
        const score = scoreInstallerUrl(probe);
        if (score > 0) candidates.push({ url: probe, score: score + 15 });
      }
    }
  } catch {
    /* ignore */
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0]!;
  const fileName = fileNameFromUrl(best.url);

  return {
    enabled: true,
    kind: "direct-installer",
    url: best.url,
    fileName,
    note: "Auto-discovered installer download",
  };
}

export function steamInstallRecipe(steamAppId: string): LauncherInstall {
  return {
    enabled: true,
    kind: "external",
    url: `steam://install/${steamAppId}`,
    note: "Opens Steam to install this game",
  };
}

/** Resolve the best launcher recipe: direct installer → Steam → website. */
export async function discoverLauncherInstall(input: {
  website: string;
  steamAppId?: string | null;
}): Promise<DiscoverInstallResult> {
  const direct = await findDirectInstaller(input.website);
  if (direct) {
    return { recipe: direct, source: "direct" };
  }

  const steamId = input.steamAppId?.trim();
  if (steamId && /^\d+$/.test(steamId)) {
    return { recipe: steamInstallRecipe(steamId), source: "steam" };
  }

  return {
    recipe: defaultLauncherInstallForWebsite(input.website || "https://example.com"),
    source: "website",
  };
}
