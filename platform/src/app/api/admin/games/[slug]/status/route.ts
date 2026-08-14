import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import { getGame } from "@/lib/catalog";
import { CATALOG_STATUSES, statusToPublished } from "@/lib/catalogStatus";
import { requireAdminSession } from "@/lib/requireAdmin";
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

    let doc = await CatalogGame.findOneAndUpdate(
      { slug },
      { $set: { status, published } },
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
      });
      doc = created.toObject();
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
