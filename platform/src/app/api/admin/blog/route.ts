import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import dbConnect from "@/lib/db";
import BlogPost from "@/lib/models/BlogPost";
import { listAdminBlogPosts } from "@/lib/blog";
import { createBlogPostInput } from "@/lib/blogValidation";
import { requireAdminSession, requireAdminViewSession } from "@/lib/requireAdmin";

export async function GET() {
  const { error } = await requireAdminViewSession();
  if (error) return error;
  try {
    return NextResponse.json({ posts: await listAdminBlogPosts() });
  } catch (err) {
    console.error("[blog] admin list failed:", err);
    return NextResponse.json({ error: "Could not load blog posts" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;
  try {
    const input = createBlogPostInput.parse(await req.json());
    await dbConnect();
    if (await BlogPost.exists({ slug: input.slug })) {
      return NextResponse.json({ error: "That slug is already in use" }, { status: 409 });
    }
    const post = await BlogPost.create({
      ...input,
      coverImageUrl: input.coverImageUrl || null,
      publishedAt: input.published ? new Date() : null,
    });
    revalidateTag("blog", { expire: 0 });
    revalidatePath("/sitemap.xml");
    return NextResponse.json({ id: String(post._id), slug: post.slug }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message || "Invalid post" }, { status: 400 });
    if (typeof err === "object" && err !== null && "code" in err && err.code === 11000) {
      return NextResponse.json({ error: "That slug is already in use" }, { status: 409 });
    }
    console.error("[blog] create failed:", err);
    return NextResponse.json({ error: "Could not create post" }, { status: 500 });
  }
}
