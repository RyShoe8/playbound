import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!slug?.trim()) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  try {
    await dbConnect();
    const updated = await CatalogGame.findOneAndUpdate(
      { slug: slug.trim() },
      { $inc: { installCount: 1 } },
      { new: true, projection: { installCount: 1 } }
    ).lean();

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      installCount: Number((updated as { installCount?: number }).installCount) || 0,
    });
  } catch (err) {
    console.error("[install/report]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
