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
    const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=${limit}`, {
      headers: { accept: "application/vnd.github+json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((r) => ({
      name: r.name || r.tag_name,
      tagName: r.tag_name,
      publishedAt: r.published_at,
      url: r.html_url,
      body: (r.body || "").slice(0, 600),
    }));
  } catch {
    return [];
  }
}
