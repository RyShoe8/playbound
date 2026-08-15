/**
 * Probe remote sources for catalog game/mod install versions.
 * Used by the daily cron and admin "Check now".
 */

export type VersionCheckStatus = "ok" | "stale" | "broken" | "skipped" | "updated";

export type ProbeResult = {
  status: VersionCheckStatus;
  detectedVersion: string | null;
  note?: string;
  /** When set, cron / Check now may write these onto the recipe. */
  patch?: {
    url?: string;
    fileName?: string;
    versionLabel?: string;
    directUrl?: string;
    assetPattern?: string;
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

/**
 * Thrown when GitHub declined to answer rather than answering "no".
 *
 * Anonymous GitHub allows 60 requests an hour and this cron walks the whole
 * catalog, so being throttled is routine. Without separating it from a real
 * 404 the cron would mark most of the catalog broken every time it ran out of
 * quota, and admin/version-issues would fill with games that install fine.
 */
class ProbeUnknown extends Error {}

async function githubLatestRelease(repo: string): Promise<{
  tag: string;
  assets: { name: string; browser_download_url: string }[];
} | null> {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: ghHeaders(),
    next: { revalidate: 0 },
  });
  if (res.status === 404) return null;
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    throw new ProbeUnknown(
      remaining === "0" ? "GitHub rate limit reached" : `GitHub ${res.status}`
    );
  }
  if (res.status === 401) {
    throw new ProbeUnknown("GitHub rejected the configured token");
  }
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
      // Match launcher resolveModDownload: no matching upload → use release zipball.
      const zipball = `https://github.com/${repo}/archive/refs/tags/${encodeURIComponent(release.tag)}.zip`;
      const reach = await probeDirectUrl(zipball, release.tag);
      if (reach.status !== "broken") {
        const newer = currentVersion && currentVersion !== release.tag;
        return {
          status: newer ? "updated" : "ok",
          detectedVersion: release.tag,
          note: "Using release zipball (no matching assets)",
          patch: {
            url: zipball,
            fileName: `${repo.split("/").pop() || "mod"}-${release.tag}.zip`,
            versionLabel: release.tag,
            directUrl: zipball,
          },
        };
      }
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
    // Being throttled is not evidence of breakage.
    if (err instanceof ProbeUnknown) {
      return { status: "skipped", detectedVersion: currentVersion || null, note: err.message };
    }
    return {
      status: "broken",
      detectedVersion: null,
      note: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Identify as the launcher, because that is whose experience is being tested.
 *
 * A probe-specific agent answers a different question: GitLab serves 406 to
 * unfamiliar clients while serving the same file to "playbound-launcher", which
 * would report a perfectly good download as broken.
 */
const PROBE_UA = "playbound-launcher";

/** Attempts before a connection failure is believed. */
const PROBE_ATTEMPTS = 3;

async function reachOnce(url: string): Promise<{ ok: boolean; status?: number; threw?: boolean; detail?: string }> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "user-agent": PROBE_UA },
    });
    if (res.ok) return { ok: true };
    // Some CDNs reject HEAD — try a one-byte GET.
    const get = await fetch(url, {
      method: "GET",
      headers: { "user-agent": PROBE_UA, Range: "bytes=0-0" },
      redirect: "follow",
    });
    if (get.ok || get.status === 206) return { ok: true };
    return { ok: false, status: get.status, detail: `HTTP ${get.status}` };
  } catch (err) {
    return { ok: false, threw: true, detail: err instanceof Error ? err.message : String(err) };
  }
}

export async function probeDirectUrl(url: string, currentVersion?: string | null): Promise<ProbeResult> {
  try {
    let last = await reachOnce(url);
    /*
     * Retry dropped connections rather than believing the first one. A single
     * blip is far more often our network or a host briefly throttling a
     * scripted client than a dead download — Freeciv, a published game, was
     * reported broken by one run and fine by the next for exactly this reason.
     */
    for (let i = 1; i < PROBE_ATTEMPTS && !last.ok && last.threw; i++) {
      await new Promise((r) => setTimeout(r, 400 * i));
      last = await reachOnce(url);
    }

    if (last.ok) {
      return {
        status: "ok",
        detectedVersion: currentVersion || "fixed",
        note: "URL reachable",
      };
    }

    /*
     * 429 and 5xx mean "ask again later". Marking them broken would pull a
     * working game's install button over someone else's bad afternoon.
     *
     * 406 and 403 belong with them. They are refusals of the caller, not
     * statements about the file: GitLab answers 406 to requests from cloud
     * egress while serving the identical URL to a browser, which is what put
     * the FlightGear Blacklist add-on in the broken list while it downloaded
     * fine for every actual player. A file that is gone answers 404.
     */
    const status = last.status ?? 0;
    if (status === 429 || status === 406 || status === 403 || status >= 500) {
      return { status: "skipped", detectedVersion: currentVersion || null, note: last.detail };
    }

    return { status: "broken", detectedVersion: currentVersion || null, note: last.detail };
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
  /*
   * Fall back on what the recipe can actually do rather than on what it calls
   * itself. locate-then-zip and itch-zip both landed on the old "unhandled
   * kind" line and were skipped in silence, which read in admin as "this game
   * has no version" when it really meant "nobody ever looked".
   *
   * A locate-then-zip base game is supplied by the player, but the overlay we
   * put on top of it is ordinary software with ordinary releases — KeeperFX
   * publishes them at dkfans/keeperfx — and that is worth tracking.
   *
   * Only the version is learned here. gameProbePatchFields rewrites url,
   * fileName, versionLabel and assetPattern for direct* recipes and auto-heals
   * alone, so neither of these kinds can have its recipe edited by this path.
   */
  if (install.repo) {
    return probeGithubZip({
      repo: install.repo,
      assetPattern: install.assetPattern,
      currentVersion: install.versionLabel,
    });
  }
  if (install.url) {
    return probeDirectUrl(install.url, install.versionLabel);
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
