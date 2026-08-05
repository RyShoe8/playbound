"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTelemetry } from "@/lib/telemetry";

type Kind = "review" | "guide";

const endpoints: Record<Kind, (slug: string) => string> = {
  review: (slug) => `/api/games/${slug}/reviews`,
  guide: (slug) => `/api/games/${slug}/guides`,
};

const copy: Record<Kind, { cta: string; titlePlaceholder: string; bodyPlaceholder: string; bodyRows: number }> = {
  review: {
    cta: "Post Review",
    titlePlaceholder: "Sum it up in one line",
    bodyPlaceholder:
      "Write a detailed review — what you played, how long, what worked, and what didn't. Aim for a few sentences minimum.",
    bodyRows: 6,
  },
  guide: {
    cta: "Publish Guide",
    titlePlaceholder: "Guide title",
    bodyPlaceholder: "Write your guide. Markdown-style plain text is fine.",
    bodyRows: 8,
  },
};

export function ContentForm({
  kind,
  gameSlug,
  isSignedIn,
  editionSlug,
  editionName,
}: {
  kind: Kind;
  gameSlug: string;
  isSignedIn: boolean;
  /** Set on an edition page so the review attaches to that edition. */
  editionSlug?: string;
  editionName?: string;
}) {
  const router = useRouter();
  const { track } = useTelemetry();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [rating, setRating] = useState(5);
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(kind === "review");

  if (!isSignedIn) {
    return (
      <p className="text-sm text-muted-foreground">
        <Link
          href={`/login?callbackUrl=/games/${gameSlug}?tab=${kind === "review" ? "reviews" : "guides"}`}
          className="font-semibold text-primary hover:underline"
        >
          Sign in
        </Link>{" "}
        to{" "}
        {kind === "review"
          ? editionName
            ? `rate and review the ${editionName} edition`
            : "rate and review this game"
          : "publish a guide"}
        .
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
    if (kind === "review" && body.trim().length < 40) {
      setState("error");
      setMessage("Please write a more detailed review (at least a few sentences).");
      return;
    }
    setState("busy");
    try {
      const res = await fetch(endpoints[kind](gameSlug), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          kind === "review" ? { rating, title, body, editionSlug: editionSlug ?? null } : { title, body }
        ),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        if (kind === "review") {
          void track("review_created", { gameSlug, rating, editionSlug });
        }
        setTitle("");
        setBody("");
        setOpen(kind !== "review");
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
    <form onSubmit={submit} className="w-full max-w-xl space-y-3 rounded-xl border border-border bg-card p-4">
      {kind === "review" && (
        <div>
          <p className="mb-1 text-xs font-semibold text-muted-foreground">Your rating</p>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} stars`}>
                <Star
                  className={cn(
                    "size-6",
                    n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
                  )}
                />
              </button>
            ))}
          </div>
        </div>
      )}
      <input
        required
        minLength={3}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={copy[kind].titlePlaceholder}
        className="h-9 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
      />
      <textarea
        required
        minLength={kind === "review" ? 40 : 10}
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
        {kind !== "review" && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full px-5 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
