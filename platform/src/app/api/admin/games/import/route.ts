import { NextResponse } from "next/server";
import { z } from "zod";
import {
  defaultArtFor,
  emptyGameDraft,
  slugifyTitle,
  type GamePayload,
} from "@/lib/gamePayload";
import { fetchPageMeta, stripHtml } from "@/lib/pageMeta";
import { requireAdminSession } from "@/lib/requireAdmin";
import {
  deriveInstallSteps,
  deriveFaq,
  deriveQualityBarSignals,
  draftQualityBar,
  suggestBestFor,
  suggestNotFor,
  fetchUpstreamActivity,
  editorialReadiness,
} from "@/lib/enrich";

const importSchema = z.object({
  url: z.string().trim().url().max(500),
});

/**
 * Fill the derivable half of the editorial fields.
 *
 * Everything set here is a restatement of a fact already in the draft, plus a
 * live check of upstream repository activity. Nothing that requires judgement
 * is written — see the DERIVED / HUMAN split in lib/enrich.ts. The response
 * carries `evidence` and `suggestions` so the admin UI can show the editor what
 * was established and on what basis.
 */
async function enrichDraft(
  draft: GamePayload,
  opts: { steamIsFree?: boolean | null } = {}
): Promise<{
  draft: GamePayload;
  evidence: string[];
  suggestions: { bestFor: string[]; notFor: string[] };
  missing: string[];
}> {
  const lastUpstreamActivity = draft.githubRepo
    ? await fetchUpstreamActivity(draft.githubRepo)
    : null;

  const signals = deriveQualityBarSignals({
    license: draft.license,
    githubRepo: draft.githubRepo,
    steamIsFree: opts.steamIsFree ?? null,
    lastUpstreamActivity,
  });

  // Every from* importer returns a complete GamePayload (each spreads
  // emptyGameDraft), so the derivation helpers get every field they read —
  // enforced by the type rather than assumed.
  const withBar: GamePayload = { ...draft, qualityBar: draftQualityBar(signals) };

  const enriched: GamePayload = {
    ...withBar,
    installSteps: deriveInstallSteps(withBar),
    faq: deriveFaq(withBar),
  };

  return {
    draft: enriched,
    evidence: signals.evidence,
    suggestions: { bestFor: suggestBestFor(withBar), notFor: suggestNotFor(withBar) },
    missing: editorialReadiness(enriched).missing,
  };
}

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

async function fromSteam(
  appId: string
): Promise<{ draft: GamePayload; steamIsFree: boolean | null }> {
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
  const screenshots = Array.isArray(data.screenshots)
    ? (data.screenshots as { path_full?: string }[])
        .map((s) => s.path_full)
        .filter((u): u is string => Boolean(u))
        .slice(0, 8)
    : [];
  const genreTags = Array.isArray(data.genres)
    ? (data.genres as { description?: string }[])
        .map((g) => g.description)
        .filter((x): x is string => Boolean(x))
        .slice(0, 8)
    : [];

  // Extract videos from Steam movies array
  const videos: string[] = [];
  if (Array.isArray(data.movies)) {
    for (const movie of data.movies as { mp4?: { max?: string; "480"?: string }; webm?: { max?: string } }[]) {
      const url = movie.mp4?.max || movie.mp4?.["480"] || movie.webm?.max;
      if (url && !videos.includes(url)) videos.push(url);
      if (videos.length >= 5) break;
    }
  }

  // Extract sizeMB from pc_requirements disk space text
  const pcReq = data.pc_requirements as { minimum?: string; recommended?: string } | string | null;
  const pcReqMin = typeof pcReq === "object" && pcReq ? pcReq.minimum || "" : "";
  const pcReqRec = typeof pcReq === "object" && pcReq ? pcReq.recommended || "" : "";
  const diskText = stripHtml(pcReqMin) + " " + stripHtml(pcReqRec);
  const diskMatch = diskText.match(/(\d+(?:\.\d+)?)\s*(GB|MB)\s*(?:available|free|disk|hard|storage|space)/i);
  let sizeMB = 0;
  if (diskMatch) {
    const val = parseFloat(diskMatch[1]);
    sizeMB = diskMatch[2].toUpperCase() === "GB" ? Math.round(val * 1000) : Math.round(val);
  }

  // Extract system requirements text
  const sysMin = pcReqMin ? stripHtml(pcReqMin).slice(0, 500) || "See Steam store page" : "See Steam store page";
  const sysRec = pcReqRec ? stripHtml(pcReqRec).slice(0, 500) || "See Steam store page" : "See Steam store page";

  // Extract release year
  const releaseDateStr = (data.release_date as { date?: string })?.date || "";
  const yearMatch = releaseDateStr.match(/\b(19|20)\d{2}\b/);
  const releaseYear = yearMatch ? parseInt(yearMatch[0], 10) : new Date().getFullYear();

  // Extract platforms
  const steamPlatforms = data.platforms as { windows?: boolean; mac?: boolean; linux?: boolean } | null;
  const platforms: string[] = [];
  if (steamPlatforms?.windows) platforms.push("Windows");
  if (steamPlatforms?.mac) platforms.push("macOS");
  if (steamPlatforms?.linux) platforms.push("Linux");
  if (platforms.length === 0) platforms.push("Windows");

  // Steam's own free-to-play flag. Note this says nothing about pay-to-win or
  // cosmetic monetisation, so it is treated as one signal rather than proof.
  const steamIsFree = typeof data.is_free === "boolean" ? (data.is_free as boolean) : null;

  const slug = slugifyTitle(title);
  return {
    steamIsFree,
    draft: {
      ...emptyGameDraft(),
      slug,
      title,
      tagline: short.slice(0, 200) || title,
      description: detailed.slice(0, 8000) || short,
      website,
      coverImage: header,
      screenshots,
      videos,
      tags: genreTags,
      platforms,
      sizeMB,
      releaseYear,
      launchMethods: ["install"],
      browserPlayable: false,
      license: "See Steam store page",
      systemRequirements: { min: sysMin, recommended: sysRec },
      art: defaultArtFor([], slug),
      published: false,
      launcherInstall: null,
      steamAppId: appId,
    },
  };
}

/**
 * Fetch the repository README as raw text.
 *
 * Returned to the admin UI as *source material* only — never written into
 * longDescription. Publishing a project's own README as PlayBound editorial
 * would be duplicate content and would hollow out the curation claim. The
 * point is to give the editor something to read, not something to paste.
 */
async function fetchReadme(repo: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/readme`, {
      headers: {
        accept: "application/vnd.github.raw+json",
        "user-agent": "PlayBoundAdmin/1.0",
        ...(process.env.GITHUB_TOKEN
          ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.slice(0, 20000) || null;
  } catch {
    return null;
  }
}

async function fromGithub(
  repo: string
): Promise<{ draft: GamePayload; sourceMaterial: string | null }> {
  const res = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "PlayBoundAdmin/1.0",
      ...(process.env.GITHUB_TOKEN
        ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
        : {}),
    },
    next: { revalidate: 0 },
  });
  if (res.status === 404) throw new Error("GitHub repository not found");
  if (!res.ok) throw new Error("GitHub API request failed");
  const data = (await res.json()) as {
    name?: string;
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
  const slug = slugifyTitle(title);
  const sourceMaterial = await fetchReadme(repo);

  return {
    sourceMaterial,
    draft: {
      ...emptyGameDraft(),
      slug,
      title,
      tagline: description.slice(0, 200),
      description,
      website,
      githubRepo: repo,
      coverImage: `https://opengraph.githubassets.com/1/${repo}`,
      license,
      tags: (data.topics ?? []).slice(0, 12),
      platforms: ["Windows", "macOS", "Linux"],
      launchMethods: ["install"],
      browserPlayable: false,
      art: defaultArtFor([], slug),
      published: false,
      launcherInstall: null,
    },
  };
}

async function fromWebsite(url: string): Promise<GamePayload> {
  const meta = await fetchPageMeta(url);
  const title = meta.title || new URL(url).hostname.replace(/^www\./, "");
  const description = meta.description || `Play ${title} free in your browser.`;
  const slug = slugifyTitle(title);
  const cover = meta.images[0] ?? null;

  return {
    ...emptyGameDraft(),
    slug,
    title,
    tagline: description.slice(0, 200),
    description,
    website: url,
    developerSlug: "indie-web",
    coverImage: cover,
    screenshots: meta.images.slice(0, 8),
    videos: meta.videos.slice(0, 5),
    platforms: ["Web"],
    launchMethods: ["browser"],
    browserPlayable: true,
    sizeMB: 0,
    license: "Free to play",
    tags: ["Browser", "Indie"],
    systemRequirements: {
      min: "Modern web browser",
      recommended: "Modern web browser",
    },
    art: defaultArtFor(["Arcade"], slug),
    published: false,
    launcherInstall: null,
  };
}

export async function POST(req: Request) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { url } = importSchema.parse(await req.json());
    const steamId = parseSteamAppId(url);
    const github = parseGithubRepo(url);

    let base: GamePayload;
    let steamIsFree: boolean | null = null;
    let sourceMaterial: string | null = null;

    if (steamId && (url.includes("steam") || /^\d+$/.test(url.trim()))) {
      ({ draft: base, steamIsFree } = await fromSteam(steamId));
    } else if (url.includes("github.com") || (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(url.trim()) && github)) {
      ({ draft: base, sourceMaterial } = await fromGithub(github!));
    } else if (steamId) {
      ({ draft: base, steamIsFree } = await fromSteam(steamId));
    } else {
      base = await fromWebsite(url);
    }

    const { draft, evidence, suggestions, missing } = await enrichDraft(base, { steamIsFree });

    return NextResponse.json({ draft, evidence, suggestions, missing, sourceMaterial });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid URL" }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Import failed";
    console.error("Game import error:", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
