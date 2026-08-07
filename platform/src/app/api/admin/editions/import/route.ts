import { NextResponse } from "next/server";
import { z } from "zod";
import { getGame } from "@/lib/catalog";
import { emptyEditionDraft, type EditionDraft } from "@/lib/editionDraft";
import { stripHtml, tryFetchPageMeta, softTitleFromUrl } from "@/lib/pageMeta";
import { parseSteamStoreMedia, MAX_SCREENSHOTS, MAX_VIDEOS } from "@/lib/fetchGameMedia";
import { requireAdminSession } from "@/lib/requireAdmin";
import {
  mapLabelsToFeatures,
  mapLabelsToGenresAndTags,
  steamCategoryLabels,
  steamGenreLabels,
  steamSupportedLanguages,
} from "@/lib/adminImportHelpers";
import {
  extractEpicProduct,
  fetchEpicProduct,
  parseEpicProductSlug,
} from "@/lib/epicStore";

const importSchema = z.object({
  url: z.string().trim().url().max(500),
  /** Parent catalog game this edition belongs to. */
  gameSlug: z.string().trim().min(1).max(80),
});

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parseSteamAppId(url: string): string | null {
  const m =
    url.match(/store\.steampowered\.com\/app\/(\d+)/i) ||
    url.match(/steamcommunity\.com\/app\/(\d+)/i);
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
    return (await res.text()).slice(0, 20000) || null;
  } catch {
    return null;
  }
}

function baseDraft(gameSlug: string, name: string): EditionDraft {
  const draft = emptyEditionDraft(gameSlug);
  const slug = slugify(name) || "edition";
  return {
    ...draft,
    name,
    slug,
    type: "community",
    status: "active",
    visibility: "public",
  };
}

async function fromSteam(
  appId: string,
  gameSlug: string
): Promise<{ draft: EditionDraft }> {
  const res = await fetch(
    `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`,
    {
      headers: { "user-agent": "PlayBoundAdmin/1.0" },
      next: { revalidate: 0 },
    }
  );
  if (!res.ok) throw new Error("Steam API request failed");
  const json = (await res.json()) as Record<
    string,
    { success?: boolean; data?: Record<string, unknown> }
  >;
  const entry = json[appId];
  if (!entry?.success || !entry.data) throw new Error("Steam app not found or unavailable");
  const data = entry.data;
  const title = String(data.name ?? "Edition");
  const short = String(data.short_description ?? "");
  const detailed = stripHtml(String(data.detailed_description ?? short));
  const website = (data.website as string) || `https://store.steampowered.com/app/${appId}`;
  const { coverImage: header, screenshots, videos } = parseSteamStoreMedia(data);
  const { tags } = mapLabelsToGenresAndTags(steamGenreLabels(data));
  const features = mapLabelsToFeatures(steamCategoryLabels(data));
  const languages = steamSupportedLanguages(data);

  const pcReq = data.pc_requirements as { minimum?: string; recommended?: string } | string | null;
  const pcReqMin = typeof pcReq === "object" && pcReq ? pcReq.minimum || "" : "";
  const pcReqRec = typeof pcReq === "object" && pcReq ? pcReq.recommended || "" : "";

  const draft = baseDraft(gameSlug, title);
  return {
    draft: {
      ...draft,
      shortDescription: short.slice(0, 300) || title,
      description: detailed.slice(0, 20000) || short,
      version: (data.release_date as { date?: string })?.date || "",
      tags,
      features,
      languages,
      aliases: title !== draft.name ? [title].filter(Boolean) : [],
      branding: {
        logo: "",
        heroImage: header || "",
        screenshots: screenshots.slice(0, MAX_SCREENSHOTS),
        videos: videos.slice(0, MAX_VIDEOS),
      },
      links: {
        ...draft.links,
        website,
      },
      requirements: {
        min: pcReqMin ? stripHtml(pcReqMin).slice(0, 500) : "",
        recommended: pcReqRec ? stripHtml(pcReqRec).slice(0, 500) : "",
        notes: "",
      },
      installMethod: "steam",
      installConfig: { steam: { appId } },
    },
  };
}

async function fromEpic(
  productSlug: string,
  gameSlug: string
): Promise<{ draft: EditionDraft }> {
  const product = await fetchEpicProduct(productSlug);
  const epic = extractEpicProduct(product, productSlug);
  const mapped = mapLabelsToGenresAndTags(epic.tags);
  const features = mapLabelsToFeatures(epic.tags);
  const tags = mapped.tags
    .map((t) => t.replace(/\b\w/g, (c) => c.toUpperCase()))
    .slice(0, 16);

  const draft = baseDraft(gameSlug, epic.title);
  return {
    draft: {
      ...draft,
      shortDescription: epic.shortDescription.slice(0, 300) || epic.title,
      description: epic.description || epic.shortDescription,
      tags,
      features,
      aliases: [],
      branding: {
        logo: "",
        heroImage: epic.coverImage || "",
        screenshots: epic.screenshots.slice(0, MAX_SCREENSHOTS),
        videos: epic.videos.slice(0, MAX_VIDEOS),
      },
      links: {
        ...draft.links,
        website: epic.homepageUrl || epic.storeUrl,
        discord: epic.discordInviteUrl || draft.links.discord,
      },
      requirements: {
        min: epic.systemRequirements.min,
        recommended: epic.systemRequirements.recommended,
        notes: "",
      },
      installMethod: "epic",
      installConfig: { epic: { productSlug } },
    },
  };
}

async function fromGithub(
  repo: string,
  gameSlug: string
): Promise<{ draft: EditionDraft; sourceMaterial: string | null }> {
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
    topics?: string[];
    license?: { spdx_id?: string; name?: string } | null;
    default_branch?: string;
  };

  const title = data.name || repo.split("/")[1];
  const description = data.description || `Edition built from ${repo}`;
  const website = data.homepage || data.html_url || `https://github.com/${repo}`;
  const sourceMaterial = await fetchReadme(repo);
  const { tags } = mapLabelsToGenresAndTags(data.topics ?? []);
  const draft = baseDraft(gameSlug, title);
  const licenseNote = data.license?.spdx_id
    ? `License: ${data.license.spdx_id}`
    : data.license?.name
      ? `License: ${data.license.name}`
      : "";

  return {
    sourceMaterial,
    draft: {
      ...draft,
      shortDescription: description.slice(0, 300),
      description: [description, licenseNote].filter(Boolean).join("\n\n"),
      tags,
      features: tags.includes("mod") || tags.includes("modding") ? ["Mod Support"] : [],
      branding: {
        logo: "",
        heroImage: `https://opengraph.githubassets.com/1/${repo}`,
        screenshots: [],
        videos: [],
      },
      links: {
        ...draft.links,
        website,
        github: `https://github.com/${repo}`,
      },
      installMethod: "playbound_installer",
      installConfig: {
        playbound_installer: {
          kind: "github-zip",
          repo,
          assetPattern: "\\.zip$",
        },
      },
    },
  };
}

async function fromWebsite(
  url: string,
  gameSlug: string
): Promise<{ draft: EditionDraft; warning?: string }> {
  const result = await tryFetchPageMeta(url);

  if (result.ok) {
    const meta = result.meta;
    const title = meta.title || softTitleFromUrl(url);
    const description = meta.description || `Edition of ${gameSlug}.`;
    const draft = baseDraft(gameSlug, title);
    const tags = ["Community"];
    if (meta.siteName) tags.push(meta.siteName.slice(0, 40));
    return {
      draft: {
        ...draft,
        shortDescription: description.slice(0, 300),
        description,
        tags,
        branding: {
          logo: "",
          heroImage: meta.images[0] ?? "",
          screenshots: meta.images.slice(0, MAX_SCREENSHOTS),
          videos: meta.videos.slice(0, MAX_VIDEOS),
        },
        links: { ...draft.links, website: url },
        installMethod: "browser",
        installConfig: { browser: { playUrl: url } },
      },
    };
  }

  const title = softTitleFromUrl(url);
  const draft = baseDraft(gameSlug, title);
  const warning =
    result.reason === "blocked"
      ? result.message
      : `Could not scrape this page${result.status ? ` (${result.status})` : ""}. Created a blank draft from the URL — fill title/description manually.`;

  return {
    warning,
    draft: {
      ...draft,
      shortDescription: `Edition of ${gameSlug}`,
      description: `Edition of ${gameSlug}.`,
      links: { ...draft.links, website: url },
      installMethod: "manual",
      installConfig: {
        manual: {
          steps: [{ platform: "all", text: `Visit ${url} for install instructions.`, command: null }],
        },
      },
    },
  };
}

/**
 * Prefill an edition draft from Steam, GitHub, or any website — same sources
 * as the game importer, mapped onto Edition fields.
 */
export async function POST(req: Request) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { url, gameSlug } = importSchema.parse(await req.json());
    const game = await getGame(gameSlug, { includeUnpublished: true });
    if (!game) {
      return NextResponse.json({ error: "Unknown game slug" }, { status: 400 });
    }

    const steamId = parseSteamAppId(url);
    const github = parseGithubRepo(url);
    const epicSlug = parseEpicProductSlug(url);

    let draft: EditionDraft;
    let sourceMaterial: string | null = null;
    let warning: string | undefined;

    if (steamId && (url.includes("steam") || /^\d+$/.test(url.trim()))) {
      ({ draft } = await fromSteam(steamId, gameSlug));
    } else if (
      url.includes("github.com") ||
      (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(url.trim()) && github)
    ) {
      ({ draft, sourceMaterial } = await fromGithub(github!, gameSlug));
    } else if (epicSlug) {
      ({ draft } = await fromEpic(epicSlug, gameSlug));
    } else if (steamId) {
      ({ draft } = await fromSteam(steamId, gameSlug));
    } else {
      ({ draft, warning } = await fromWebsite(url, gameSlug));
    }

    const evidence = [
      `Prefill mapped against parent game ${game.title}.`,
      "Review name, install method, and media before publishing.",
      ...(sourceMaterial
        ? ["GitHub README returned as source material — do not paste it wholesale into the description."]
        : []),
    ];

    return NextResponse.json({
      draft,
      evidence,
      sourceMaterial,
      ...(warning ? { warning } : {}),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? "Invalid URL" },
        { status: 400 }
      );
    }
    const message = err instanceof Error ? err.message : "Import failed";
    console.error("Edition import error:", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
