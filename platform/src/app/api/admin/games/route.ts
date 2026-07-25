import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import { developersBySlug } from "@/lib/data";
import { gamePayloadSchema, withDefaultArt } from "@/lib/gamePayload";
import { requireAdminSession } from "@/lib/requireAdmin";
import { listAllGames } from "@/lib/catalog";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;
  const games = await listAllGames();
  return NextResponse.json({ games });
}

export async function POST(req: Request) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const body = withDefaultArt(gamePayloadSchema.parse(await req.json()));
    await dbConnect();

    const exists = await CatalogGame.findOne({ slug: body.slug }).lean();
    if (exists) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
    }

    const developerName =
      body.developerName || developersBySlug.get(body.developerSlug)?.name || null;

    if (body.gameOfWeek) {
      await CatalogGame.updateMany({ gameOfWeek: true }, { $set: { gameOfWeek: false } });
    }

    const doc = await CatalogGame.create({
      ...body,
      githubRepo: body.githubRepo || null,
      coverImage: body.coverImage || null,
      screenshots: body.screenshots ?? [],
      developerName,
      submissionId: body.submissionId || null,
    });

    return NextResponse.json({ success: true, slug: doc.slug }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    console.error("Admin create game error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
