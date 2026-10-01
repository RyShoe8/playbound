"use client";

import { useState } from "react";
import Link from "next/link";
import { BlogMarkdown } from "@/components/BlogMarkdown";
import type { BlogPostRecord } from "@/lib/blog";

type Draft = Pick<BlogPostRecord, "slug" | "title" | "summary" | "bodyMarkdown" | "coverImageUrl" | "authorName" | "published">;
const emptyDraft: Draft = {
  slug: "", title: "", summary: "", bodyMarkdown: "", coverImageUrl: null,
  authorName: "PlayBound Team", published: false,
};

function slugFrom(title: string): string {
  return title.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120).replace(/-$/, "");
}

export function BlogManager({ initialPosts, canEdit }: { initialPosts: BlogPostRecord[]; canEdit: boolean }) {
  const [posts, setPosts] = useState(initialPosts);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [slugEdited, setSlugEdited] = useState(false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const selected = posts.find((post) => post.id === selectedId);

  function select(post: BlogPostRecord | null) {
    setSelectedId(post?.id || null);
    setDraft(post ? {
      slug: post.slug, title: post.title, summary: post.summary, bodyMarkdown: post.bodyMarkdown,
      coverImageUrl: post.coverImageUrl, authorName: post.authorName, published: post.published,
    } : emptyDraft);
    setSlugEdited(Boolean(post));
    setPreview(false);
    setMessage(null);
  }

  async function save(published: boolean) {
    if (!canEdit || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(selectedId ? `/api/admin/blog/${selectedId}` : "/api/admin/blog", {
        method: selectedId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...draft, coverImageUrl: draft.coverImageUrl || "", published }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save post");
      const refreshed = await fetch("/api/admin/blog", { cache: "no-store" });
      if (!refreshed.ok) throw new Error("Saved, but could not refresh the list");
      const data = await refreshed.json();
      const nextPosts = data.posts as BlogPostRecord[];
      setPosts(nextPosts);
      const nextId = selectedId || result.id;
      const nextPost = nextPosts.find((post) => post.id === nextId);
      if (nextPost) {
        setSelectedId(nextPost.id);
        setDraft({ slug: nextPost.slug, title: nextPost.title, summary: nextPost.summary,
          bodyMarkdown: nextPost.bodyMarkdown, coverImageUrl: nextPost.coverImageUrl,
          authorName: nextPost.authorName, published: nextPost.published });
      }
      setMessage(published ? "Post published." : "Draft saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save post");
    } finally {
      setBusy(false);
    }
  }

  const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Blog</h1>
        <p className="mt-1 text-muted-foreground">Write and publish PlayBound stories. Drafts stay private until you publish them.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-2 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold">Posts</h2>
            {canEdit ? <button type="button" onClick={() => select(null)} className="text-sm font-semibold text-primary hover:underline">New post</button> : null}
          </div>
          {posts.length === 0 ? <p className="text-sm text-muted-foreground">No posts yet.</p> : null}
          {posts.map((post) => (
            <button key={post.id} type="button" onClick={() => select(post)}
              className={`w-full rounded-lg border p-3 text-left text-sm ${selectedId === post.id ? "border-primary/50 bg-primary/10" : "border-border bg-background hover:border-primary/30"}`}>
              <span className="block font-semibold">{post.title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{post.published ? "Published" : "Draft"}</span>
            </button>
          ))}
        </aside>
        <section className="space-y-5 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">{selected ? "Edit post" : "New post"}</h2>
            <div className="flex gap-3 text-sm font-semibold">
              <button type="button" onClick={() => setPreview(false)} className={!preview ? "text-primary" : "text-muted-foreground"}>Edit</button>
              <button type="button" onClick={() => setPreview(true)} className={preview ? "text-primary" : "text-muted-foreground"}>Preview</button>
              {selected?.published ? <Link href={`/blog/${selected.slug}`} target="_blank" className="text-primary hover:underline">View live ↗</Link> : null}
            </div>
          </div>
          {preview ? (
            <div className="space-y-4">
              <h3 className="text-3xl font-bold">{draft.title || "Untitled post"}</h3>
              <p className="text-muted-foreground">{draft.summary}</p>
              <BlogMarkdown content={draft.bodyMarkdown} />
            </div>
          ) : (
            <div className="grid gap-4">
              <label className="space-y-1 text-sm font-semibold">Title
                <input className={inputClass} value={draft.title} disabled={!canEdit} maxLength={160}
                  onChange={(event) => { const title = event.target.value; setDraft((current) => ({ ...current, title, slug: slugEdited ? current.slug : slugFrom(title) })); }} />
              </label>
              <label className="space-y-1 text-sm font-semibold">URL slug
                <input className={inputClass} value={draft.slug} disabled={!canEdit || Boolean(selectedId)} maxLength={120}
                  onChange={(event) => { setSlugEdited(true); setDraft((current) => ({ ...current, slug: event.target.value })); }} />
                <span className="block text-xs font-normal text-muted-foreground">Stable after creation: /blog/{draft.slug || "your-post"}</span>
              </label>
              <label className="space-y-1 text-sm font-semibold">Summary
                <textarea className={inputClass} value={draft.summary} disabled={!canEdit} maxLength={400} rows={3}
                  onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))} />
              </label>
              <label className="space-y-1 text-sm font-semibold">Author name
                <input className={inputClass} value={draft.authorName} disabled={!canEdit} maxLength={100}
                  onChange={(event) => setDraft((current) => ({ ...current, authorName: event.target.value }))} />
              </label>
              <label className="space-y-1 text-sm font-semibold">Cover image URL (optional)
                <input className={inputClass} value={draft.coverImageUrl || ""} disabled={!canEdit} type="url" placeholder="https://..."
                  onChange={(event) => setDraft((current) => ({ ...current, coverImageUrl: event.target.value }))} />
              </label>
              <label className="space-y-1 text-sm font-semibold">Article (Markdown)
                <textarea className={`${inputClass} min-h-[340px] font-mono leading-relaxed`} value={draft.bodyMarkdown} disabled={!canEdit}
                  onChange={(event) => setDraft((current) => ({ ...current, bodyMarkdown: event.target.value }))} />
              </label>
            </div>
          )}
          {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
          {canEdit ? (
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <button type="button" disabled={busy} onClick={() => void save(draft.published)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
              {!draft.published ? <button type="button" disabled={busy} onClick={() => void save(true)} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">Publish</button> :
                <button type="button" disabled={busy} onClick={() => void save(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50">Move to Draft</button>}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
