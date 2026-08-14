import { NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/db";
import CatalogCollection from "@/lib/models/CatalogCollection";
import { collectionPayloadSchema } from "@/lib/collectionPayload";
import { requireAdminSession } from "@/lib/requireAdmin";
import { listGames } from "@/lib/catalog";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { slug } = await params;
    const body = collectionPayloadSchema.parse(await req.json());

    const known = new Set((await listGames()).map((g) => g.slug));
    const unknown = body.gameSlugs.filter((s) => !known.has(s));
    if (unknown.length > 0) {
      return NextResponse.json(
        { error: `Unknown game slug(s): ${unknown.join(", ")}` },
        { status: 400 }
      );
    }

    await dbConnect();

    if (body.slug !== slug) {
      const clash = await CatalogCollection.findOne({ slug: body.slug }).lean();
      if (clash) {
        return NextResponse.json({ error: "New slug already exists" }, { status: 409 });
      }
    }

    const doc = await CatalogCollection.findOneAndUpdate(
      { slug },
      { $set: body },
      { returnDocument: "after" }
    );
    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, slug: doc.slug });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    console.error("Admin update collection error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const { slug } = await params;
    await dbConnect();
    const doc = await CatalogCollection.findOneAndDelete({ slug });
    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Admin delete collection error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
