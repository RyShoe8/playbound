import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import LibraryModEntry from "@/lib/models/LibraryModEntry";
import { revalidateLibraryPages } from "@/lib/libraryCascade";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    await dbConnect();
    const rows = await LibraryModEntry.find({
      userId: session.user.id,
      installed: true,
    })
      .select("modSlug baseGameSlug")
      .lean();
    return NextResponse.json({
      mods: rows.map((r) => ({
        slug: String(r.modSlug),
        baseGameSlug: String(r.baseGameSlug),
      })),
    });
  } catch (error) {
    console.error("Library mod list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug")?.trim();
  if (!slug) {
    return NextResponse.json({ error: "slug required" }, { status: 400 });
  }

  try {
    await dbConnect();
    const existing = await LibraryModEntry.findOne({
      userId: session.user.id,
      modSlug: slug,
    })
      .select("baseGameSlug")
      .lean();
    const res = await LibraryModEntry.deleteOne({
      userId: session.user.id,
      modSlug: slug,
    });
    revalidateLibraryPages(existing?.baseGameSlug ? String(existing.baseGameSlug) : undefined, slug);
    return NextResponse.json({ success: true, deleted: res.deletedCount > 0 });
  } catch (error) {
    console.error("Library mod remove error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
