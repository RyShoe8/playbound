import Link from "next/link";
import { connection } from "next/server";
import { listPublishedBlogPosts } from "@/lib/blog";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Game News, Guides & Platform Updates",
  description: "Stories, updates, and practical notes from PlayBound about great games, mods, multiplayer, and the platform we are building.",
  path: "/blog",
});

export default async function BlogPage() {
  await connection();
  const posts = await listPublishedBlogPosts();
  return (
    <main className="w-full space-y-8 px-4 py-12 sm:px-6 lg:px-8">
      <header className="max-w-3xl space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">From PlayBound</p>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">The Blog</h1>
        <p className="text-lg leading-relaxed text-muted-foreground">Games worth your time, the people who make them better, and what we are building to make playing together easier.</p>
      </header>
      {posts.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-8 text-muted-foreground">Our first post is on its way.</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <article key={post.slug} className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition hover:border-primary/40">
              <Link href={`/blog/${post.slug}`} className="flex h-full flex-col">
                {post.coverImageUrl ? (
                  // Admin-supplied HTTPS image; the browser loads it directly.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.coverImageUrl} alt={`Cover image for ${post.title}`} loading="lazy" className="aspect-video w-full bg-secondary/30 object-contain" />
                ) : null}
                <div className="flex flex-1 flex-col gap-3 p-5">
                  <p className="text-xs font-semibold text-primary">{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) : ""}</p>
                  <h2 className="text-xl font-bold leading-tight group-hover:text-primary">{post.title}</h2>
                  <p className="flex-1 text-sm leading-relaxed text-muted-foreground">{post.summary}</p>
                  <span className="text-sm font-semibold text-primary">Read article →</span>
                </div>
              </Link>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
