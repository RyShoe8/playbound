import { NextResponse } from "next/server";
import { z } from "zod";
import { getGame } from "@/lib/catalog";
import { emptyModDraft, slugifyTitle, type ModPayload } from "@/lib/modPayload";
import { defaultArtFor } from "@/lib/gamePayload";
import { fetchPageMeta } from "@/lib/pageMeta";
import { requireAdminSession } from "@/lib/requireAdmin";
import {
  deriveModInstallSteps,
  deriveModFaq,
  modEditorialReadiness,
  fetchUpstreamActivity,
} from "@/lib/enrich";
import type { CatalogModPublic } from "@/lib/mods";

const importSchema = z.object({
  url: z.string().trim().url().max(500),
  /** Which catalog game this add-on is for. */
  baseGameSlug: z.string().trim().min(1).max(80),
});

function parseGithubRepo(url: string): string | null {
  const m = url.match(/github\.com\/([^/\s]+)\/([^/\s?#]+)/i);
  if (m) return `${m[1]}/${m[2].replace(/\.git$/, "")}`;
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(url.trim())) return url.trim();
  return null;
}

/** Turn "combined-arms" or "OpenRA_CombinedArms" into "Combined Arms". */
function humanizeRepoName(name: string): string {
  return name
    .replace(/[-_.]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
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

async function fromGithub(
  repo: string,
  baseGameSlug: string
): Promise<{ draft: Partial<ModPayload>; sourceMaterial: string | null }> {
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
    created_at?: string;
    pushed_at?: string;
  };

  const rawName = data.name || repo.split("/")[1];
  const title = humanizeRepoName(rawName);
  const description = data.description || `Add-on for ${baseGameSlug}.`;
  const website = data.homepage || data.html_url || `https://github.com/${repo}`;
  const license = data.license?.spdx_id
    ? `Open Source (${data.license.spdx_id})`
    : data.license?.name || "Open Source";
  const releaseYear = data.created_at
    ? new Date(data.created_at).getFullYear()
    : new Date().getFullYear();

  const slug = slugifyTitle(`${baseGameSlug}-${rawName}`);
  const sourceMaterial = await fetchReadme(repo);

  return {
    sourceMaterial,
    draft: {
      ...emptyModDraft(baseGameSlug),
      slug,
      title,
      tagline: description.slice(0, 200),
      description,
      website,
      githubRepo: repo,
      license,
      releaseYear,
      downloadKind: "github-zip",
      assetPattern: "\\.zip$",
      coverImage: `https://opengraph.githubassets.com/1/${repo}`,
      art: defaultArtFor([], slug),
      published: false,
    },
  };
}

async function fromWebsite(url: string, baseGameSlug: string): Promise<Partial<ModPayload>> {
  const meta = await fetchPageMeta(url);
  const title = meta.title || new URL(url).hostname.replace(/^www\./, "");
  const description = meta.description || `Add-on for ${baseGameSlug}.`;
  const slug = slugifyTitle(`${baseGameSlug}-${title}`);

  return {
    ...emptyModDraft(baseGameSlug),
    slug,
    title,
    tagline: description.slice(0, 200),
    description,
    website: url,
    downloadKind: "external",
    directUrl: url,
    assetPattern: null,
    coverImage: meta.images[0] ?? null,
    screenshots: meta.images.slice(0, 8),
    art: defaultArtFor([], slug),
    published: false,
  };
}

/**
 * Draft a mod from a GitHub repository or project page.
 *
 * Mirrors the game importer: derives install steps and an FAQ from facts, and
 * returns the README as source material for the editor without ever writing it
 * into the mod's own description. See lib/enrich.ts for the DERIVED / HUMAN
 * split and why it matters.
 */
export async function POST(req: Request) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { url, baseGameSlug } = importSchema.parse(await req.json());

    const baseGame = await getGame(baseGameSlug, { includeUnpublished: true });
    if (!baseGame) {
      return NextResponse.json({ error: "Unknown base game slug" }, { status: 400 });
    }

    const repo = parseGithubRepo(url);
    let base: Partial<ModPayload>;
    let sourceMaterial: string | null = null;

    if (repo && (url.includes("github.com") || /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(url.trim()))) {
      ({ draft: base, sourceMaterial } = await fromGithub(repo, baseGameSlug));
    } else {
      base = await fromWebsite(url, baseGameSlug);
    }

    const forDerivation = base as unknown as CatalogModPublic;
    const draft: Partial<ModPayload> = {
      ...base,
      installSteps: deriveModInstallSteps(forDerivation, baseGame.title),
      faq: deriveModFaq(forDerivation, baseGame.title),
    };

    const evidence: string[] = [];
    if (base.githubRepo) {
      const activity = await fetchUpstreamActivity(base.githubRepo);
      evidence.push(
        activity
          ? `Last upstream activity: ${activity.slice(0, 10)}. Mods are not scored against the PlayBound Bar, but an abandoned add-on is still worth flagging in the description.`
          : `No upstream activity found for ${base.githubRepo} — the repository may be archived. Check before publishing.`
      );
    }
    evidence.push(
      `Install steps and FAQ generated from catalog facts for ${baseGame.title}. Long description and "what it changes" still need writing.`
    );

    const readiness = modEditorialReadiness(draft as unknown as CatalogModPublic);

    return NextResponse.json({
      draft,
      evidence,
      missing: readiness.missing,
      sourceMaterial,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid URL" }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Import failed";
    console.error("Mod import error:", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
