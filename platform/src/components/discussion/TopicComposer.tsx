"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CategoryMeta } from "@/lib/discussion/categories";
import { getRecaptchaToken } from "@/lib/recaptchaClient";
import { useTelemetry } from "@/lib/telemetry";

type Related = { slug: string; title: string; replyCount: number };

export function TopicComposer({
  gameSlug,
  categories,
  isSignedIn,
}: {
  gameSlug: string;
  categories: CategoryMeta[];
  isSignedIn: boolean;
}) {
  const router = useRouter();
  const { track } = useTelemetry();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState(categories[0]?.id ?? "general");
  const [tags, setTags] = useState("");
  const [hasSpoilers, setHasSpoilers] = useState(false);
  const [related, setRelated] = useState<Related[]>([]);
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (title.trim().length < 8) {
      setRelated([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/games/${gameSlug}/discussions?q=${encodeURIComponent(title.trim())}&limit=5`
        );
        const data = await res.json();
        setRelated(
          (data.topics ?? []).map((t: { slug: string; title: string; replyCount: number }) => ({
            slug: t.slug,
            title: t.title,
            replyCount: t.replyCount ?? 0,
          }))
        );
      } catch {
        /* ignore */
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [title, gameSlug]);

  if (!isSignedIn) {
    return (
      <p className="text-sm text-muted-foreground">
        <Link
          href={`/login?callbackUrl=/games/${gameSlug}?tab=discussion`}
          className="font-semibold text-primary hover:underline"
        >
          Sign in
        </Link>{" "}
        to start a discussion.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-all hover:brightness-110"
      >
        Start a discussion
      </button>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    setMessage("");
    try {
      const recaptchaToken = await getRecaptchaToken("discussion_topic");
      const res = await fetch(`/api/games/${gameSlug}/discussions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          category,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          hasSpoilers,
          recaptchaToken: recaptchaToken ?? undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.topic?.href) {
        void track("discussion_created", {
          gameId: gameSlug,
          topicId: data.topic.id || data.topic.slug || undefined,
        });
        router.push(data.topic.href);
        router.refresh();
        return;
      }
      setState("error");
      setMessage(data?.error ?? "Something went wrong.");
    } catch {
      setState("error");
      setMessage("Couldn't reach the server.");
    }
  }

  return (
    <form onSubmit={submit} className="w-full space-y-3 rounded-xl border border-border bg-card p-4">
      <input
        required
        minLength={3}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Discussion title"
        className="h-9 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
      />
      {related.length > 0 && (
        <div className="rounded-lg border border-border bg-secondary/30 p-3 text-sm">
          <p className="font-semibold">These discussions may already answer your question:</p>
          <ul className="mt-2 space-y-1">
            {related.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/games/${gameSlug}/discussion/${r.slug}`}
                  className="text-primary hover:underline"
                >
                  {r.title}
                </Link>
                <span className="text-muted-foreground"> · {r.replyCount} replies</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as typeof category)}
          className="h-9 rounded-lg border border-input bg-secondary/50 px-3 text-sm"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Tags (comma-separated)"
          className="h-9 min-w-[12rem] flex-1 rounded-lg border border-input bg-secondary/50 px-3 text-sm"
        />
      </div>
      <textarea
        required
        minLength={5}
        rows={6}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write your post. Markdown is supported."
        className="w-full resize-y rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
      />
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={hasSpoilers}
          onChange={(e) => setHasSpoilers(e.target.checked)}
        />
        Contains spoilers
      </label>
      {state === "error" && <p className="text-xs text-destructive">{message}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={state === "busy"}
          className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          {state === "busy" ? "Posting…" : "Post discussion"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full px-5 py-2 text-sm font-semibold text-muted-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
