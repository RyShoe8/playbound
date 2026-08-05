import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import { requireAdminSession } from "@/lib/requireAdmin";
import {
  emptyGameMedia,
  fetchSteamStoreMedia,
  fetchWebsiteMedia,
  mediaChanged,
  mediaIsThin,
  mergeGameMedia,
  type GameMediaBundle,
} from "@/lib/fetchGameMedia";

export const maxDuration = 300;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Walk catalog games that are light on media and enrich from Steam (preferred)
 * or website Open Graph. Only updates coverImage / screenshots / videos.
 */
export async function POST() {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    await dbConnect();
    const docs = await CatalogGame.find({})
      .select("slug title website steamAppId coverImage screenshots videos")
      .lean();

    let updated = 0;
    let skipped = 0;
    const errors: { slug: string; error: string }[] = [];

    for (const doc of docs) {
      const slug = String(doc.slug);
      const existing: GameMediaBundle = {
        coverImage: (doc.coverImage as string) || null,
        screenshots: Array.isArray(doc.screenshots)
          ? (doc.screenshots as string[]).filter(Boolean)
          : [],
        videos: Array.isArray(doc.videos) ? (doc.videos as string[]).filter(Boolean) : [],
      };

      if (!mediaIsThin(existing)) {
        skipped += 1;
        continue;
      }

      const steamAppId = typeof doc.steamAppId === "string" ? doc.steamAppId.trim() : "";
      const website = typeof doc.website === "string" ? doc.website.trim() : "";

      if (!steamAppId && !website) {
        skipped += 1;
        continue;
      }

      try {
        let incoming = emptyGameMedia();
        if (steamAppId) {
          incoming = mergeGameMedia(incoming, await fetchSteamStoreMedia(steamAppId));
          await sleep(350);
        } else if (website) {
          const site = await fetchWebsiteMedia(website);
          if (site) incoming = mergeGameMedia(incoming, site);
          await sleep(200);
        }

        // If Steam returned media but still thin on videos and a website exists, try site too.
        if (steamAppId && website && mediaIsThin(mergeGameMedia(existing, incoming))) {
          try {
            const site = await fetchWebsiteMedia(website);
            if (site) incoming = mergeGameMedia(incoming, site);
          } catch {
            /* soft-fail */
          }
          await sleep(200);
        }

        const merged = mergeGameMedia(existing, incoming);
        if (!mediaChanged(existing, merged)) {
          skipped += 1;
          continue;
        }

        await CatalogGame.updateOne(
          { slug },
          {
            $set: {
              coverImage: merged.coverImage,
              screenshots: merged.screenshots,
              videos: merged.videos,
            },
          }
        );
        updated += 1;
      } catch (err) {
        errors.push({
          slug,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      updated,
      skipped,
      errors,
      total: docs.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Backfill failed";
    console.error("Media backfill error:", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
