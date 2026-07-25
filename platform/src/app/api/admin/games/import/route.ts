import { NextResponse } from "next/server";
import { z } from "zod";
import { emptyGameDraft, slugifyTitle, type GamePayload } from "@/lib/gamePayload";
import { requireAdminSession } from "@/lib/requireAdmin";

const importSchema = z.object({
  url: z.string().trim().url().max(500),
});

function parseSteamAppId(url: string): string | null {
  const m = url.match(/store\.steampowered\.com\/app\/(\d+)/i) || url.match(/steamcommunity\.com\/app\/(\d+)/i);
  if (m) return m[1];
  if (/^\d+$/.test(url.trim())) return url.trim();
  return null;
}

function parseGithubRepo(url: string): string | null {
  const m = url.match(/github\.com\/([^/\s]+)\/([^/\s?#]+)/i);
  if (m) return `${m[1]}/${m[2].replace(/\.git$/, "")}`;
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(url.trim())) return url.trim();
  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fromSteam(appId: string): Promise<Partial<GamePayload>> {
  const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`, {
    headers: { "user-agent": "PlayBoundAdmin/1.0" },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error("Steam API request failed");
  const json = (await res.json()) as Record<
    string,
    { success?: boolean; data?: Record<string, unknown> }
  >;
  const entry = json[appId];
  if (!entry?.success || !entry.data) throw new Error("Steam app not found or unavailable");
  const data = entry.data;
  const title = String(data.name ?? "");
  const short = String(data.short_description ?? "");
  const detailed = stripHtml(String(data.detailed_description ?? short));
  const website = (data.website as string) || `https://store.steampowered.com/app/${appId}`;
  const header = (data.header_image as string) || null;
  const genres = Array.isArray(data.genres)
    ? (data.genres as { description?: string }[])
        .map((g) => g.description)
        .filter(Boolean)
        .slice(0, 8)
    : [];

  return {
    ...emptyGameDraft(),
    slug: slugifyTitle(title),
    title,
    tagline: short.slice(0, 200) || title,
    description: detailed.slice(0, 8000) || short,
    website,
    coverImage: header,
    tags: genres as string[],
    platforms: ["Windows"],
    license: "See Steam store page",
    published: false,
  };
}

async function fromGithub(repo: string): Promise<Partial<GamePayload>> {
  const res = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "PlayBoundAdmin/1.0",
    },
    next: { revalidate: 0 },
  });
  if (res.status === 404) throw new Error("GitHub repository not found");
  if (!res.ok) throw new Error("GitHub API request failed");
  const data = (await res.json()) as {
    name?: string;
    full_name?: string;
    description?: string | null;
    homepage?: string | null;
    html_url?: string;
    license?: { spdx_id?: string; name?: string } | null;
    topics?: string[];
  };

  const title = data.name || repo.split("/")[1];
  const description = data.description || `Open-source project ${repo}`;
  const website = data.homepage || data.html_url || `https://github.com/${repo}`;
  const license = data.license?.spdx_id
    ? `Open Source (${data.license.spdx_id})`
    : data.license?.name || "Open Source";

  return {
    ...emptyGameDraft(),
    slug: slugifyTitle(title),
    title,
    tagline: description.slice(0, 200),
    description,
    website,
    githubRepo: repo,
    coverImage: `https://opengraph.githubassets.com/1/${repo}`,
    license,
    tags: (data.topics ?? []).slice(0, 12),
    platforms: ["Windows", "macOS", "Linux"],
    published: false,
  };
}

export async function POST(req: Request) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { url } = importSchema.parse(await req.json());
    const steamId = parseSteamAppId(url);
    const github = parseGithubRepo(url);

    let draft: Partial<GamePayload>;
    if (steamId && (url.includes("steam") || /^\d+$/.test(url.trim()))) {
      draft = await fromSteam(steamId);
    } else if (github) {
      draft = await fromGithub(github);
    } else if (steamId) {
      draft = await fromSteam(steamId);
    } else {
      return NextResponse.json(
        { error: "Provide a Steam store URL/app id or a GitHub owner/repo URL" },
        { status: 400 }
      );
    }

    return NextResponse.json({ draft });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid URL" }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Import failed";
    console.error("Game import error:", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
