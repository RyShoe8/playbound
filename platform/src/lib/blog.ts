import { cacheLife, cacheTag } from "next/cache";
import dbConnect from "@/lib/db";
import BlogPost from "@/lib/models/BlogPost";

export type BlogPostRecord = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  coverImageUrl: string | null;
  authorName: string;
  published: boolean;
  publishedAt: string | null;
  updatedAt: string;
};

function serialize(doc: Record<string, unknown>): BlogPostRecord {
  return {
    id: String(doc._id),
    slug: String(doc.slug),
    title: String(doc.title),
    summary: String(doc.summary),
    bodyMarkdown: String(doc.bodyMarkdown || ""),
    coverImageUrl: doc.coverImageUrl ? String(doc.coverImageUrl) : null,
    authorName: String(doc.authorName || "PlayBound Team"),
    published: doc.published === true,
    publishedAt: doc.publishedAt ? new Date(String(doc.publishedAt)).toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(String(doc.updatedAt)).toISOString() : "",
  };
}

/** Admin reads are always live and include drafts. */
export async function listAdminBlogPosts(): Promise<BlogPostRecord[]> {
  await dbConnect();
  const docs = await BlogPost.find().sort({ updatedAt: -1 }).lean();
  return docs.map((doc) => serialize(doc as Record<string, unknown>));
}

/** Public reads are cached; writes invalidate the blog tag. */
export async function listPublishedBlogPosts(): Promise<BlogPostRecord[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("blog");
  try {
    await dbConnect();
    const docs = await BlogPost.find({ published: true })
      .select("slug title summary coverImageUrl authorName published publishedAt updatedAt")
      .sort({ publishedAt: -1 })
      .lean();
    return docs.map((doc) => serialize(doc as Record<string, unknown>));
  } catch (error) {
    console.error("[blog] list failed:", error);
    return [];
  }
}

export async function getPublishedBlogPost(slug: string): Promise<BlogPostRecord | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("blog");
  try {
    await dbConnect();
    const doc = await BlogPost.findOne({ slug, published: true }).lean();
    return doc ? serialize(doc as Record<string, unknown>) : null;
  } catch (error) {
    console.error("[blog] article failed:", error);
    return null;
  }
}
