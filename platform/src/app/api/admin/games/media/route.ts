import { NextResponse } from "next/server";
import { z } from "zod";
import {
  emptyGameMedia,
  fetchSteamStoreMedia,
  fetchWebsiteMedia,
  inferSteamAppId,
  mergeGameMedia,
  rehostMediaBundle,
  type GameMediaBundle,
} from "@/lib/fetchGameMedia";
import { requireAdminSession } from "@/lib/requireAdmin";

export const maxDuration = 120;

const schema = z.object({
  url: z.string().trim().url().max(500).optional().nullable(),
  steamAppId: z
    .string()
    .trim()
    .regex(/^\d+$/)
    .max(20)
    .optional()
    .nullable(),
  slug: z.string().trim().max(80).optional().nullable(),
  coverImage: z.string().trim().max(500).optional().nullable(),
  screenshots: z.array(z.string().trim().max(500)).max(20).optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const body = schema.parse(await req.json());
    const steamAppId = inferSteamAppId({
      steamAppId: body.steamAppId,
      website: body.url,
      coverImage: body.coverImage,
      screenshots: body.screenshots ?? undefined,
    });
    const url = body.url?.trim() || null;

    if (!steamAppId && !url) {
      return NextResponse.json(
        { error: "Provide a website URL, Steam app id, or media URLs that contain a Steam id" },
        { status: 400 }
      );
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "BLOB_READ_WRITE_TOKEN is required to refresh and rehost media" },
        { status: 503 }
      );
    }

    let bundle: GameMediaBundle = emptyGameMedia();
    if (steamAppId) {
      bundle = mergeGameMedia(bundle, await fetchSteamStoreMedia(steamAppId));
    }

    // Always scrape the website for non-Steam games; for Steam, fill shot or video gaps.
    const shouldScrapeSite =
      Boolean(url) && (!steamAppId || bundle.screenshots.length < 4 || bundle.videos.length === 0);
    if (shouldScrapeSite && url) {
      try {
        const site = await fetchWebsiteMedia(url);
        if (site) bundle = mergeGameMedia(bundle, site);
      } catch {
        /* soft-fail */
      }
    }

    if (!bundle.coverImage && bundle.screenshots.length === 0 && bundle.videos.length === 0) {
      return NextResponse.json({
        error: "No new media found from website",
        coverImage: null,
        screenshots: [],
        videos: [],
        steamAppId,
        stats: { fetched: 0, rehosted: 0, keptRemote: 0 },
      }, { status: 502 });
    }

    const slug = (body.slug || "upload").replace(/[^a-z0-9-]/gi, "-").slice(0, 80) || "upload";
    const rehosted = await rehostMediaBundle(bundle, slug);

    return NextResponse.json({
      coverImage: rehosted.coverImage,
      screenshots: rehosted.screenshots,
      videos: rehosted.videos,
      images: rehosted.screenshots,
      steamAppId,
      rehosted: true,
      stats: rehosted.stats,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Media fetch failed";
    console.error("Media fetch error:", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
