import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { Types } from "mongoose";
import { z } from "zod";
import dbConnect from "@/lib/db";
import BlogPost from "@/lib/models/BlogPost";
import { blogPostInput } from "@/lib/blogValidation";
import { requireAdminSession } from "@/lib/requireAdmin";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminSession();
  if (error) return error;
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid post ID" }, { status: 400 });
  try {
    const input = blogPostInput.parse(await req.json());
    await dbConnect();
    const existing = await BlogPost.findById(id).select("publishedAt").lean();
    if (!existing) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    await BlogPost.findByIdAndUpdate(id, {
      $set: {
        ...input,
        coverImageUrl: input.coverImageUrl || null,
        publishedAt: input.published ? existing.publishedAt || new Date() : existing.publishedAt,
      },
    }, { runValidators: true });
    revalidateTag("blog", { expire: 0 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message || "Invalid post" }, { status: 400 });
    console.error("[blog] update failed:", err);
    return NextResponse.json({ error: "Could not update post" }, { status: 500 });
  }
}
