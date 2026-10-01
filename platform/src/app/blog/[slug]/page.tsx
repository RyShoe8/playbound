import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getPublishedBlogPost } from "@/lib/blog";
import { BlogMarkdown } from "@/components/BlogMarkdown";
import { BlogShare } from "@/components/BlogShare";
import { JsonLd, ORGANIZATION_ID } from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";
import { pageMetadata } from "@/lib/seo";
import { ArrowLeft, CalendarDays, PenLine } from "lucide-react";

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
  const publishedDate = post.publishedAt || post.updatedAt;
  const updatedLater = post.publishedAt && post.updatedAt &&
    new Date(post.updatedAt).getTime() - new Date(post.publishedAt).getTime() > 24 * 60 * 60 * 1000;
  const formatDate = (date: string) => new Date(date).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  });
  const articleUrl = absoluteUrl(`/blog/${post.slug}`);
  return (
    <main className="w-full px-4 py-12 sm:px-6 lg:px-8">
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: post.title,
        description: post.summary,
        url: absoluteUrl(`/blog/${post.slug}`),
        datePublished: publishedDate,
        dateModified: post.updatedAt,
        author: post.authorName === "PlayBound Team"
          ? { "@id": ORGANIZATION_ID }
          : { "@type": "Person", name: post.authorName },
        publisher: { "@id": ORGANIZATION_ID },
        ...(post.coverImageUrl ? { image: post.coverImageUrl } : {}),
      }} />
      <div className="w-full space-y-6">
        <Link href="/blog" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"><ArrowLeft className="size-4" /> All posts</Link>
        <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg shadow-black/10">
          <header className="border-b border-border bg-gradient-to-br from-primary/15 via-card to-card px-6 py-8 sm:px-10 sm:py-12">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">PlayBound Blog</p>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">{post.title}</h1>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{post.summary}</p>
          </header>
          {post.coverImageUrl ? (
            <div className="border-b border-border bg-background/40 px-6 py-6 sm:px-10">
              {/* Admin-supplied HTTPS image; the browser loads it directly. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={post.coverImageUrl} alt="" className="mx-auto block h-auto max-w-full rounded-xl" />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-border px-6 py-5 text-sm text-muted-foreground sm:px-10">
            <span className="inline-flex items-center gap-2"><PenLine className="size-4 text-primary" aria-hidden /> By <span className="font-semibold text-foreground">{post.authorName}</span></span>
            <span className="inline-flex items-center gap-2"><CalendarDays className="size-4 text-primary" aria-hidden /> Published <time dateTime={publishedDate} className="font-semibold text-foreground">{formatDate(publishedDate)}</time></span>
            {updatedLater ? <span>Updated <time dateTime={post.updatedAt}>{formatDate(post.updatedAt)}</time></span> : null}
          </div>
          <div className="px-6 py-8 sm:px-10 sm:py-10">
            <BlogMarkdown content={post.bodyMarkdown} />
          </div>
          <footer className="border-t border-border bg-secondary/20 px-6 py-5 sm:px-10">
            <BlogShare url={articleUrl} title={post.title} />
          </footer>
        </article>
        <Link href="/blog" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"><ArrowLeft className="size-4" /> More from the blog</Link>
      </div>
    </main>
  );
}
