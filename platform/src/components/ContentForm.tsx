"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

type Kind = "review" | "guide" | "discussion";

const endpoints: Record<Kind, (slug: string) => string> = {
  review: (slug) => `/api/games/${slug}/reviews`,
  guide: (slug) => `/api/games/${slug}/guides`,
  discussion: (slug) => `/api/games/${slug}/discussion`,
};

const copy: Record<Kind, { cta: string; titlePlaceholder: string; bodyPlaceholder: string; bodyRows: number }> = {
  review: {
    cta: "Post Review",
    titlePlaceholder: "Sum it up in one line",
    bodyPlaceholder: "What did you think? Be specific — mention what you played and for how long.",
    bodyRows: 4,
  },
  guide: {
    cta: "Publish Guide",
    titlePlaceholder: "Guide title",
    bodyPlaceholder: "Write your guide. Markdown-style plain text is fine.",
    bodyRows: 8,
  },
  discussion: {
    cta: "Start Discussion",
    titlePlaceholder: "Thread title",
    bodyPlaceholder: "What's on your mind?",
    bodyRows: 4,
  },
};

export function ContentForm({
  kind,
  gameSlug,
  isSignedIn,
}: {
  kind: Kind;
  gameSlug: string;
  isSignedIn: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [rating, setRating] = useState(5);
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);

  if (!isSignedIn) {
    return (
      <p className="text-sm text-muted-foreground">
        <Link href={`/login?callbackUrl=/games/${gameSlug}`} className="font-semibold text-primary hover:underline">
          Sign in
        </Link>{" "}
        to {kind === "review" ? "write a review" : kind === "guide" ? "publish a guide" : "start a discussion"}.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-secondary px-4 py-2 text-sm font-bold transition-colors hover:bg-secondary/70"
      >
        {copy[kind].cta}
      </button>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    try {
      const res = await fetch(endpoints[kind](gameSlug), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(kind === "review" ? { rating, title, body } : { title, body }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setTitle("");
        setBody("");
        setOpen(false);
        setState("idle");
        router.refresh();
      } else {
        setState("error");
        setMessage(data?.error ?? "Something went wrong.");
      }
    } catch {
      setState("error");
      setMessage("Couldn't reach the server.");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-card p-4">
      {kind === "review" && (
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n)}>
              <Star className={cn("size-5", n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
            </button>
          ))}
        </div>
      )}
      <input
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={copy[kind].titlePlaceholder}
        className="h-9 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
      />
      <textarea
        required
        rows={copy[kind].bodyRows}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={copy[kind].bodyPlaceholder}
        className="w-full resize-y rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
      />
      {state === "error" && <p className="text-xs text-destructive">{message}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={state === "busy"}
          className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60"
        >
          {state === "busy" ? "Posting…" : copy[kind].cta}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full px-5 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
