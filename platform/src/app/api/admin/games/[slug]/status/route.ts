import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import { getGame } from "@/lib/catalog";
import { CATALOG_STATUSES, statusToPublished } from "@/lib/catalogStatus";
import { requireAdminSession } from "@/lib/requireAdmin";
import {
  requestDiscordProvision,
  hasPlayboundDiscordChannel,
  requestNewGameDiscordAnnounce,
} from "@/lib/discordProvision";
import { firstZodErrorMessage } from "@/lib/zodError";

const bodySchema = z.object({
  status: z.enum(CATALOG_STATUSES),
});

/**
 * Lightweight admin endpoint to update a game's catalog status directly.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { slug } = await params;
    const body = bodySchema.parse(await req.json());

    await dbConnect();
    const status = body.status;
    const published = statusToPublished(status);

    const previous = await CatalogGame.findOne({ slug })
      .select("status communityLinks")
      .lean();
    const wasPublished = (previous as { status?: string } | null)?.status === "published";

    /*
     * Stamp the moment of publication. Without this the admin list had nothing
     * to show in its Published column and fell back to createdAt, so a game
     * imported weeks ago appeared to have been published weeks ago the instant
     * you published it.
     *
     * Only written when the game is going published — unpublishing leaves the
     * previous date rather than wiping it, and republishing moves it forward.
     */
    const set: Record<string, unknown> = { status, published };
    if (published) set.publishedAt = new Date();

    let doc = await CatalogGame.findOneAndUpdate(
      { slug },
      { $set: set },
      { returnDocument: "after" }
    ).lean();

    if (!doc) {
      // If it's a static seed game not yet saved to MongoDB, copy its seed and save
      const existingGame = await getGame(slug);
      if (!existingGame) {
        return NextResponse.json({ error: "Game not found" }, { status: 404 });
      }
      const created = await CatalogGame.create({
        ...existingGame,
        status,
        published,
        publishedAt: published ? new Date() : null,
      });
      doc = created.toObject();
    }

    if (published && !hasPlayboundDiscordChannel(doc)) {
      void requestDiscordProvision(doc.slug);
    }
    if (published && !wasPublished) {
      void requestNewGameDiscordAnnounce({
        slug: doc.slug,
        title: doc.title,
        description: doc.description,
        tagline: doc.tagline,
        coverImage: doc.coverImage,
        screenshots: doc.screenshots,
      });
    }

    try {
      revalidateTag("catalog", { expire: 0 });
    } catch {
      /* ignore */
    }

    return NextResponse.json({
      ok: true,
      slug,
      status: doc.status,
      published: Boolean(doc.published),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: firstZodErrorMessage(err) }, { status: 400 });
    }
    console.error("Admin game status update error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
