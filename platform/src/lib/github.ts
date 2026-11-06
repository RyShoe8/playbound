import { unstable_cache } from "next/cache";

export interface GithubRelease {
  name: string;
  tagName: string;
  publishedAt: string;
  url: string;
  body: string;
}

/**
 * Fetches real release notes from a game's official GitHub repo, when one is
 * known. Returns an empty array if the project doesn't publish releases
 * there (no fabricated fallback content).
 */
export async function fetchGithubReleases(repo: string, limit = 5): Promise<GithubRelease[]> {
  try {
    // Cache the trimmed result, not GitHub's response: three Veloren releases
    // are 3.2 MB, over the data cache's 2 MB limit, so every render refetched.
    // A failure throws so it is not cached as "no releases" for an hour.
    return await unstable_cache(() => readGithubReleases(repo, limit), ["github-releases-v1", repo, String(limit)], {
      revalidate: 3600,
    })();
  } catch {
    return [];
  }
}

async function readGithubReleases(repo: string, limit: number): Promise<GithubRelease[]> {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=${limit}`, {
    headers: { accept: "application/vnd.github+json" },
    cache: "no-store",
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.map((r) => ({
    name: r.name || r.tag_name,
    tagName: r.tag_name,
    publishedAt: r.published_at,
    url: r.html_url,
    body: (r.body || "").slice(0, 600),
  }));
}
