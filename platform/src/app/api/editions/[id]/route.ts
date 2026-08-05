import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import EditionModel from "@/lib/models/Edition";
import CatalogGame from "@/lib/models/CatalogGame";
import { editionUpdateSchema } from "@/lib/editionPayload";
import { requireAdminSession } from "@/lib/requireAdmin";
import { getEditionById, isVirtualId } from "@/lib/editions";
import { resolveInstallAction } from "@/lib/editionInstall";

/** A virtual edition has no document, so nothing can be read, edited or deleted by id. */
function virtualRejection() {
  return NextResponse.json(
    {
      error:
        "This game's Official edition is generated from the game itself and has no record to edit. Create a real edition for this game instead.",
    },
    { status: 400 }
  );
}

/** GET /api/editions/:id */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (isVirtualId(id)) return virtualRejection();

    const edition = await getEditionById(id);
    if (!edition || edition.visibility === "hidden") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      edition: { ...edition, installAction: resolveInstallAction(edition) },
    });
  } catch (err) {
    console.error("Get edition error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** PATCH /api/editions/:id — admin only. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { id } = await params;
    if (isVirtualId(id)) return virtualRejection();

    const body = editionUpdateSchema.parse(await req.json());
    await dbConnect();

    const existing = await EditionModel.findById(id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Slug is unique per game, and the game itself can be reassigned, so both
    // sides of the pair have to be checked against the incoming values.
    const slugChanged = existing.slug !== body.slug || existing.gameSlug !== body.gameSlug;
    if (slugChanged) {
      const clash = await EditionModel.findOne({
        gameSlug: body.gameSlug,
        slug: body.slug,
        _id: { $ne: existing._id },
      }).lean();
      if (clash) {
        return NextResponse.json(
          { error: `That game already has an edition with the slug "${body.slug}".` },
          { status: 409 }
        );
      }
    }

    // Keep the ObjectId reference in step when an edition moves between games.
    let gameId = existing.gameId;
    if (existing.gameSlug !== body.gameSlug) {
      const gameDoc = await CatalogGame.findOne({ slug: body.gameSlug }).select("_id").lean();
      gameId = (gameDoc as { _id?: unknown } | null)?._id ?? null;
    }

    Object.assign(existing, body, { gameId });
    await existing.save();

    if (body.isDefault) {
      await EditionModel.updateMany(
        { gameSlug: body.gameSlug, _id: { $ne: existing._id } },
        { $set: { isDefault: false } }
      );
    }

    return NextResponse.json({ success: true, id: String(existing._id), slug: existing.slug });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    console.error("Update edition error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/editions/:id — admin only.
 *
 * Deleting the last edition of a game is allowed: the game simply falls back
 * to its synthesized Official edition, so nothing breaks. Deleting the default
 * promotes the next one so a game is never left without one.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { id } = await params;
    if (isVirtualId(id)) return virtualRejection();

    await dbConnect();
    const doc = await EditionModel.findByIdAndDelete(id);
    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (doc.isDefault) {
      const next = await EditionModel.findOne({ gameSlug: doc.gameSlug }).sort({ sortOrder: 1, name: 1 });
      if (next) {
        next.isDefault = true;
        await next.save();
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete edition error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
