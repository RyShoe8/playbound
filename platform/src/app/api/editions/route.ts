import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import EditionModel from "@/lib/models/Edition";
import CatalogGame from "@/lib/models/CatalogGame";
import { editionPayloadSchema } from "@/lib/editionPayload";
import { requireAdminSession } from "@/lib/requireAdmin";
import { getGame } from "@/lib/catalog";
import { searchEditions } from "@/lib/editions";

/**
 * GET /api/editions?q=turtle
 *
 * Edition search, used by site search and available to clients. Hidden
 * editions are never returned.
 */
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams.get("q") ?? "";
    const editions = await searchEditions(q);
    return NextResponse.json({ editions });
  } catch (err) {
    console.error("Search editions error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** POST /api/editions — create an edition. Admin only. */
export async function POST(req: Request) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const body = editionPayloadSchema.parse(await req.json());

    // The parent game must exist, or the edition would be unreachable: every
    // edition URL is nested under a game page.
    const game = await getGame(body.gameSlug, { includeUnpublished: true });
    if (!game) {
      return NextResponse.json({ error: `Unknown game slug: ${body.gameSlug}` }, { status: 400 });
    }

    await dbConnect();

    const clash = await EditionModel.findOne({
      gameSlug: body.gameSlug,
      slug: body.slug,
    }).lean();
    if (clash) {
      return NextResponse.json(
        { error: `That game already has an edition with the slug "${body.slug}".` },
        { status: 409 }
      );
    }

    // Resolve the real ObjectId when the game is a database row. Seed-only
    // games legitimately have none; gameSlug remains the working reference.
    const gameDoc = await CatalogGame.findOne({ slug: body.gameSlug }).select("_id").lean();
    const gameId = (gameDoc as { _id?: unknown } | null)?._id ?? null;

    const doc = await EditionModel.create({ ...body, gameId });

    // Exactly one default per game.
    if (body.isDefault) {
      await EditionModel.updateMany(
        { gameSlug: body.gameSlug, _id: { $ne: doc._id } },
        { $set: { isDefault: false } }
      );
    }

    return NextResponse.json(
      { success: true, id: String(doc._id), slug: doc.slug },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    console.error("Create edition error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
