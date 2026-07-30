/**
 * Probe remote sources for catalog game/mod install versions.
 * Used by the daily cron and admin "Check now".
 */

export type VersionCheckStatus = "ok" | "stale" | "broken" | "skipped" | "updated";

export type ProbeResult = {
  status: VersionCheckStatus;
  detectedVersion: string | null;
  note?: string;
  /** When set, cron may write these onto the recipe. */
  patch?: {
    url?: string;
    fileName?: string;
    versionLabel?: string;
    directUrl?: string;
  };
};

function ghHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "playbound-catalog-probe",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function githubLatestRelease(repo: string): Promise<{
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

async function githubDefaultBranch(repo: string): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: ghHeaders(),
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`GitHub repo ${res.status} for ${repo}`);
  const data = (await res.json()) as { default_branch?: string };
  return data.default_branch || "master";
}

export async function probeGithubZip(opts: {
  repo: string;
  assetPattern?: string | null;
  currentVersion?: string | null;
}): Promise<ProbeResult> {
  const { repo, assetPattern, currentVersion } = opts;
  try {
    const release = await githubLatestRelease(repo);
    if (release?.tag) {
      const pattern = new RegExp(assetPattern || "\\.zip$", "i");
      const asset = release.assets.find((a) => pattern.test(a.name));
      if (asset) {
        const newer = currentVersion && currentVersion !== release.tag;
        return {
          status: newer ? "updated" : "ok",
          detectedVersion: release.tag,
          note: asset.name,
          patch: {
            url: asset.browser_download_url,
            fileName: asset.name,
            versionLabel: release.tag,
            directUrl: asset.browser_download_url,
          },
        };
      }
      return {
        status: "broken",
        detectedVersion: release.tag,
        note: `No asset matching /${assetPattern || "\\.zip$/"}/`,
      };
    }
    const branch = await githubDefaultBranch(repo);
    return {
      status: "ok",
      detectedVersion: branch,
      note: "Using default-branch archive (no release assets)",
      patch: {
        directUrl: `https://github.com/${repo}/archive/refs/heads/${encodeURIComponent(branch)}.zip`,
        versionLabel: branch,
      },
    };
  } catch (err) {
    return {
      status: "broken",
      detectedVersion: null,
      note: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function probeDirectUrl(url: string, currentVersion?: string | null): Promise<ProbeResult> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "user-agent": "playbound-catalog-probe" },
    });
    if (!res.ok) {
      // Some CDNs reject HEAD — try GET range
      const get = await fetch(url, {
        method: "GET",
        headers: { "user-agent": "playbound-catalog-probe", Range: "bytes=0-0" },
        redirect: "follow",
      });
      if (!get.ok && get.status !== 206) {
        return { status: "broken", detectedVersion: currentVersion || null, note: `HTTP ${res.status}` };
      }
    }
    return {
      status: "ok",
      detectedVersion: currentVersion || "fixed",
      note: "URL reachable",
    };
  } catch (err) {
    return {
      status: "broken",
      detectedVersion: currentVersion || null,
      note: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function probeOpenttdLatest(): Promise<ProbeResult> {
  try {
    const res = await fetch("https://cdn.openttd.org/openttd-releases/latest.yaml", {
      headers: { "user-agent": "playbound-catalog-probe" },
    });
    if (!res.ok) return { status: "broken", detectedVersion: null, note: `HTTP ${res.status}` };
    const text = await res.text();
    const match = text.match(/version:\s*["']?([^\s"']+)/i);
    const version = match?.[1] || null;
    return { status: version ? "ok" : "broken", detectedVersion: version, note: "OpenTTD CDN latest.yaml" };
  } catch (err) {
    return {
      status: "broken",
      detectedVersion: null,
      note: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function probeGameInstall(install: {
  kind?: string | null;
  repo?: string | null;
  assetPattern?: string | null;
  url?: string | null;
  versionLabel?: string | null;
  autoUpdatePinned?: boolean | null;
}): Promise<ProbeResult> {
  const kind = install.kind || "";
  if (kind === "external" || !kind) {
    return { status: "skipped", detectedVersion: null, note: "external or missing recipe" };
  }
  if (kind.startsWith("github") && install.repo) {
    return probeGithubZip({
      repo: install.repo,
      assetPattern: install.assetPattern,
      currentVersion: install.versionLabel,
    });
  }
  if (kind === "openttd-zip") return probeOpenttdLatest();
  if (kind.startsWith("direct") && install.url) {
    const reach = await probeDirectUrl(install.url, install.versionLabel);
    if (reach.status === "broken") return reach;
    if (install.repo && install.autoUpdatePinned !== false) {
      const gh = await probeGithubZip({
        repo: install.repo,
        assetPattern: install.assetPattern || "\\.(exe|zip)$",
        currentVersion: install.versionLabel,
      });
      if (gh.status === "updated" || (gh.status === "ok" && gh.patch?.url && gh.detectedVersion !== install.versionLabel)) {
        return {
          ...gh,
          status: gh.detectedVersion && gh.detectedVersion !== install.versionLabel ? "updated" : gh.status,
        };
      }
    }
    return reach;
  }
  return { status: "skipped", detectedVersion: install.versionLabel || null, note: `Unhandled kind ${kind}` };
}

export async function probeModInstall(mod: {
  downloadKind?: string | null;
  githubRepo?: string | null;
  assetPattern?: string | null;
  directUrl?: string | null;
  detectedVersion?: string | null;
  autoUpdatePinned?: boolean | null;
}): Promise<ProbeResult> {
  const kind = mod.downloadKind || "";
  if (kind === "external") {
    return { status: "skipped", detectedVersion: null, note: "external link" };
  }
  if (kind === "github-zip" && mod.githubRepo) {
    return probeGithubZip({
      repo: mod.githubRepo,
      assetPattern: mod.assetPattern,
      currentVersion: mod.detectedVersion,
    });
  }
  if (kind === "direct-zip" && mod.directUrl) {
    const reach = await probeDirectUrl(mod.directUrl, mod.detectedVersion);
    if (reach.status === "broken") return reach;
    if (mod.githubRepo && mod.autoUpdatePinned !== false) {
      const gh = await probeGithubZip({
        repo: mod.githubRepo,
        assetPattern: mod.assetPattern || "\\.zip$",
        currentVersion: mod.detectedVersion,
      });
      if (gh.patch?.directUrl && gh.detectedVersion && gh.detectedVersion !== mod.detectedVersion) {
        return { ...gh, status: "updated" };
      }
    }
    return reach;
  }
  return { status: "skipped", detectedVersion: null, note: `Unhandled kind ${kind}` };
}
