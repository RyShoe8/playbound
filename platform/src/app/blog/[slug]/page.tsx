import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getPublishedBlogPost } from "@/lib/blog";
import { BlogMarkdown } from "@/components/BlogMarkdown";
import { JsonLd, ORGANIZATION_ID } from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedBlogPost(slug);
  if (!post) return { title: "Post not found", robots: { index: false } };
  return pageMetadata({
    title: post.title,
    description: post.summary,
    path: `/blog/${post.slug}`,
    type: "article",
    publishedTime: post.publishedAt || undefined,
    images: post.coverImageUrl ? [post.coverImageUrl] : undefined,
  });
}

export default async function BlogPostPage({ params }: Props) {
  await connection();
  const { slug } = await params;
  const post = await getPublishedBlogPost(slug);
  if (!post) notFound();
  return (
    <main className="w-full px-4 py-12 sm:px-6 lg:px-8">
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: post.title,
        description: post.summary,
        url: absoluteUrl(`/blog/${post.slug}`),
        datePublished: post.publishedAt,
        dateModified: post.updatedAt,
        author: post.authorName === "PlayBound Team"
          ? { "@id": ORGANIZATION_ID }
          : { "@type": "Person", name: post.authorName },
        publisher: { "@id": ORGANIZATION_ID },
        ...(post.coverImageUrl ? { image: post.coverImageUrl } : {}),
      }} />
      <div className="mx-auto max-w-5xl">
        <Link href="/blog" className="text-sm font-semibold text-primary hover:underline">← All posts</Link>
        <article className="mt-8">
          <header className="space-y-4">
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">{post.title}</h1>
            <p className="text-lg leading-relaxed text-muted-foreground">{post.summary}</p>
            <p className="text-sm text-muted-foreground">By {post.authorName}{post.publishedAt ? ` · ${new Date(post.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}` : ""}</p>
          </header>
          {post.coverImageUrl ? (
            // Admin-supplied HTTPS image; the browser loads it directly.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.coverImageUrl} alt="" className="mx-auto mt-8 block h-auto max-w-full rounded-xl" />
          ) : null}
          <BlogMarkdown content={post.bodyMarkdown} className="mt-10" />
        </article>
      </div>
    </main>
  );
}
