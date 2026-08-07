import { NextResponse } from "next/server";
import { z } from "zod";
import {
  defaultArtFor,
  emptyGameDraft,
  slugifyTitle,
  type GamePayload,
  GENRES,
} from "@/lib/gamePayload";
import { stripHtml, tryFetchPageMeta, softTitleFromUrl } from "@/lib/pageMeta";
import { parseSteamStoreMedia, MAX_SCREENSHOTS, MAX_VIDEOS } from "@/lib/fetchGameMedia";
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
import {
  mapLabelsToFeatures,
  mapLabelsToGenresAndTags,
  resolveOrCreateDeveloper,
  steamCategoryLabels,
  steamDeveloperCandidate,
  steamDiskSizeMB,
  steamGenreLabels,
  steamPlatforms,
  steamReleaseYear,
} from "@/lib/adminImportHelpers";

const importSchema = z.object({
  url: z.string().trim().url().max(500),
});

type ImportExtras = {
  developerNote?: string;
};

type Genre = (typeof GENRES)[number];

function asGenres(values: string[]): Genre[] {
  const allowed = new Set<string>(GENRES);
  return values.filter((v): v is Genre => allowed.has(v));
}

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
): Promise<{ draft: GamePayload; steamIsFree: boolean | null; extras: ImportExtras }> {
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
  const { coverImage: header, screenshots, videos } = parseSteamStoreMedia(data);

  const mapped = mapLabelsToGenresAndTags(steamGenreLabels(data));
  const genres = asGenres(mapped.genres);
  const tags = mapped.tags;
  const features = mapLabelsToFeatures(steamCategoryLabels(data));
  const sizeMB = steamDiskSizeMB(data);

  const pcReq = data.pc_requirements as { minimum?: string; recommended?: string } | string | null;
  const pcReqMin = typeof pcReq === "object" && pcReq ? pcReq.minimum || "" : "";
  const pcReqRec = typeof pcReq === "object" && pcReq ? pcReq.recommended || "" : "";
  const sysMin = pcReqMin ? stripHtml(pcReqMin).slice(0, 500) || "See Steam store page" : "See Steam store page";
  const sysRec = pcReqRec ? stripHtml(pcReqRec).slice(0, 500) || "See Steam store page" : "See Steam store page";

  const releaseYear = steamReleaseYear(data);
  const platforms = steamPlatforms(data);
  const steamIsFree = typeof data.is_free === "boolean" ? (data.is_free as boolean) : null;

  const slug = slugifyTitle(title);
  const publisher = steamDeveloperCandidate(data);
  let developerSlug = "indie-web";
  let developerName: string | null = null;
  let developerNote: string | undefined;
  if (publisher) {
    const resolved = await resolveOrCreateDeveloper({
      name: publisher,
      website,
      tagline: `${publisher} — from Steam store credits`,
    });
    if (resolved) {
      developerSlug = resolved.slug;
      developerName = resolved.name;
      developerNote = resolved.created
        ? `Created published developer “${resolved.name}” (${resolved.slug}) from Steam credits.`
        : `Matched developer “${resolved.name}” (${resolved.slug}) from Steam credits.`;
    }
  }

  const aliases = [title, short.slice(0, 80)].filter(Boolean);
  // Keep unique aliases that differ from the slugified title
  const aliasList = [...new Set(aliases.map((a) => a.trim()).filter((a) => a && a !== title))].slice(
    0,
    8
  );

  return {
    steamIsFree,
    extras: { developerNote },
    draft: {
      ...emptyGameDraft(),
      slug,
      title,
      tagline: short.slice(0, 200) || title,
      description: detailed.slice(0, 8000) || short,
      website,
      developerSlug,
      developerName,
      coverImage: header,
      screenshots,
      videos,
      genres: genres.length ? genres : [],
      features,
      tags,
      aliases: aliasList,
      platforms,
      sizeMB,
      releaseYear,
      launchMethods: ["install"],
      browserPlayable: false,
      license: "See Steam store page",
      systemRequirements: { min: sysMin, recommended: sysRec },
      art: defaultArtFor(genres, slug),
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
): Promise<{ draft: GamePayload; sourceMaterial: string | null; extras: ImportExtras }> {
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
    created_at?: string;
    owner?: { login?: string; type?: string; html_url?: string };
    language?: string | null;
  };

  const title = data.name || repo.split("/")[1];
  const description = data.description || `Open-source project ${repo}`;
  const website = data.homepage || data.html_url || `https://github.com/${repo}`;
  const license = data.license?.spdx_id
    ? `Open Source (${data.license.spdx_id})`
    : data.license?.name || "Open Source";
  const slug = slugifyTitle(title);
  const sourceMaterial = await fetchReadme(repo);
  const mapped = mapLabelsToGenresAndTags(data.topics ?? []);
  const genres = asGenres(mapped.genres);
  const tags = [...mapped.tags];
  if (data.language && !tags.includes(data.language)) tags.push(data.language);
  const releaseYear = data.created_at
    ? new Date(data.created_at).getFullYear()
    : new Date().getFullYear();

  const ownerName = data.owner?.login?.trim();
  let developerSlug = "indie-web";
  let developerName: string | null = null;
  let developerNote: string | undefined;
  if (ownerName) {
    const resolved = await resolveOrCreateDeveloper({
      name: ownerName,
      website: data.owner?.html_url || `https://github.com/${ownerName}`,
      tagline: `GitHub ${data.owner?.type === "Organization" ? "organization" : "user"}`,
    });
    if (resolved) {
      developerSlug = resolved.slug;
      developerName = resolved.name;
      developerNote = resolved.created
        ? `Created published developer “${resolved.name}” (${resolved.slug}) from GitHub owner.`
        : `Matched developer “${resolved.name}” (${resolved.slug}) from GitHub owner.`;
    }
  }

  return {
    sourceMaterial,
    extras: { developerNote },
    draft: {
      ...emptyGameDraft(),
      slug,
      title,
      tagline: description.slice(0, 200),
      description,
      website,
      githubRepo: repo,
      developerSlug,
      developerName,
      coverImage: `https://opengraph.githubassets.com/1/${repo}`,
      license,
      genres,
      tags: tags.slice(0, 16),
      releaseYear,
      platforms: ["Windows", "macOS", "Linux"],
      launchMethods: ["install"],
      browserPlayable: false,
      art: defaultArtFor(genres, slug),
      published: false,
      launcherInstall: null,
    },
  };
}

async function fromWebsite(
  url: string
): Promise<{ draft: GamePayload; warning?: string; extras: ImportExtras }> {
  const result = await tryFetchPageMeta(url);

  if (result.ok) {
    const meta = result.meta;
    const title = meta.title || softTitleFromUrl(url);
    const description = meta.description || `Play ${title} free in your browser.`;
    const slug = slugifyTitle(title);
    const cover = meta.images[0] ?? null;

    let developerSlug = "indie-web";
    let developerName: string | null = null;
    let developerNote: string | undefined;
    if (meta.siteName?.trim() && !/steam|github|itch\.io|google/i.test(meta.siteName)) {
      const resolved = await resolveOrCreateDeveloper({
        name: meta.siteName.trim(),
        website: url,
        tagline: meta.description?.slice(0, 200) || undefined,
      });
      if (resolved) {
        developerSlug = resolved.slug;
        developerName = resolved.name;
        developerNote = resolved.created
          ? `Created published developer “${resolved.name}” (${resolved.slug}) from site name.`
          : `Matched developer “${resolved.name}” (${resolved.slug}) from site name.`;
      }
    }

    return {
      extras: { developerNote },
      draft: {
        ...emptyGameDraft(),
        slug,
        title,
        tagline: description.slice(0, 200),
        description,
        website: url,
        developerSlug,
        developerName,
        coverImage: cover,
        screenshots: meta.images.slice(0, MAX_SCREENSHOTS),
        videos: meta.videos.slice(0, MAX_VIDEOS),
        platforms: ["Web"],
        launchMethods: ["browser"],
        browserPlayable: true,
        sizeMB: 0,
        license: "Free to play",
        genres: ["Arcade"],
        tags: ["Browser", "Indie"],
        systemRequirements: {
          min: "Modern web browser",
          recommended: "Modern web browser",
        },
        art: defaultArtFor(["Arcade"], slug),
        published: false,
        launcherInstall: null,
      },
    };
  }

  const title = softTitleFromUrl(url);
  const slug = slugifyTitle(title);
  const warning =
    result.reason === "blocked"
      ? result.message
      : `Could not scrape this page${result.status ? ` (${result.status})` : ""}. Created a blank draft from the URL — fill title/description manually.`;

  return {
    warning,
    extras: {},
    draft: {
      ...emptyGameDraft(),
      slug,
      title,
      tagline: `Play ${title}`,
      description: `Play ${title} free in your browser.`,
      website: url,
      developerSlug: "indie-web",
      coverImage: null,
      screenshots: [],
      videos: [],
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
    },
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
    let warning: string | undefined;
    let extras: ImportExtras = {};

    if (steamId && (url.includes("steam") || /^\d+$/.test(url.trim()))) {
      ({ draft: base, steamIsFree, extras } = await fromSteam(steamId));
    } else if (url.includes("github.com") || (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(url.trim()) && github)) {
      ({ draft: base, sourceMaterial, extras } = await fromGithub(github!));
    } else if (steamId) {
      ({ draft: base, steamIsFree, extras } = await fromSteam(steamId));
    } else {
      ({ draft: base, warning, extras } = await fromWebsite(url));
    }

    const { draft, evidence, suggestions, missing } = await enrichDraft(base, { steamIsFree });
    if (extras.developerNote) evidence.unshift(extras.developerNote);

    return NextResponse.json({
      draft,
      evidence,
      suggestions,
      missing,
      sourceMaterial,
      ...(warning ? { warning } : {}),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid URL" }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Import failed";
    console.error("Game import error:", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
