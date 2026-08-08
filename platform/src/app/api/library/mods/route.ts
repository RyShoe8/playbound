import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import LibraryModEntry from "@/lib/models/LibraryModEntry";

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
    const res = await LibraryModEntry.deleteOne({
      userId: session.user.id,
      modSlug: slug,
    });
    return NextResponse.json({ success: true, deleted: res.deletedCount > 0 });
  } catch (error) {
    console.error("Library mod remove error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
