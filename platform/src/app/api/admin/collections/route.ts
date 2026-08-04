import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import CatalogCollection from "@/lib/models/CatalogCollection";
import { collectionPayloadSchema } from "@/lib/collectionPayload";
import { requireAdminSession } from "@/lib/requireAdmin";
import { listAllCollections } from "@/lib/collections";
import { listGames } from "@/lib/catalog";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;
  const collections = await listAllCollections();
  return NextResponse.json({ collections });
}

export async function POST(req: Request) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const body = collectionPayloadSchema.parse(await req.json());

    // Reject unknown game slugs up front — a typo would otherwise be invisible,
    // since the public page silently skips slugs it cannot resolve.
    const known = new Set((await listGames()).map((g) => g.slug));
    const unknown = body.gameSlugs.filter((s) => !known.has(s));
    if (unknown.length > 0) {
      return NextResponse.json(
        { error: `Unknown game slug(s): ${unknown.join(", ")}` },
        { status: 400 }
      );
    }

    await dbConnect();
    const exists = await CatalogCollection.findOne({ slug: body.slug }).lean();
    if (exists) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
    }

    const doc = await CatalogCollection.create(body);
    return NextResponse.json({ success: true, slug: doc.slug }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    console.error("Admin create collection error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
