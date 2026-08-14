"use client";
import { PremiumSelect } from "@/components/ui/PremiumSelect";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  WeeklyNewsletterBuilder,
  initialNewsletterDraft,
} from "@/components/admin/WeeklyNewsletterBuilder";
import { NewsletterMediaPack } from "@/components/admin/NewsletterMediaPack";
import type { CatalogGamePrefill } from "@/lib/newsletterEmail";

type GameOption = CatalogGamePrefill;

export function WeeklyIssueForm({
  mode,
  initial,
  games,
}: {
  mode: "create" | "edit";
  initial: {
    id?: string;
    gameSlug: string;
    publishedAt: string;
    published: boolean;
    emailDraft?: unknown;
  };
  games: GameOption[];
}) {
  const router = useRouter();
  const [gameSlug, setGameSlug] = useState(initial.gameSlug);
  const [publishedAt, setPublishedAt] = useState(initial.publishedAt);
  const [published, setPublished] = useState(initial.published);
  const [emailDraft, setEmailDraft] = useState(() =>
    initialNewsletterDraft(initial.emailDraft, initial.publishedAt)
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const url =
        mode === "create" ? "/api/admin/weekly" : `/api/admin/weekly/${encodeURIComponent(initial.id!)}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameSlug, publishedAt, published, emailDraft }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Save failed");
        setBusy(false);
        return;
      }
      router.push("/admin/weekly");
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!initial.id) return;
    if (!confirm("Delete this weekly issue? This cannot be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/weekly/${encodeURIComponent(initial.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Delete failed");
        setBusy(false);
        return;
      }
      router.push("/admin/weekly");
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  const field =
    "mt-1 h-10 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";
  const label = "text-xs font-semibold text-muted-foreground";

  return (
    <form onSubmit={save} className="mx-auto max-w-6xl space-y-6">
      <div className="mx-auto max-w-lg space-y-4">
        <div>
          <label className={label}>Featured game</label>
          <PremiumSelect required value={gameSlug} onChange={(e) => setGameSlug(e.target.value)} className={field}>
            <option value="">Select a game…</option>
            {games.map((g) => (
              <option key={g.slug} value={g.slug}>
                {g.title}
              </option>
            ))}
          </PremiumSelect>
        </div>
        <div>
          <label className={label}>Publication date (Wednesday)</label>
          <input
            required
            type="date"
            value={publishedAt}
            onChange={(e) => setPublishedAt(e.target.value)}
            className={field}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Slug and ISO week are derived from this date. Prefer Wednesdays to match the newsletter.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          Published on /weekly
        </label>
      </div>

      <WeeklyNewsletterBuilder
        draft={emailDraft}
        onChange={setEmailDraft}
        games={games}
        featuredSlug={gameSlug}
        publishedAt={publishedAt}
      />

      <NewsletterMediaPack draft={emailDraft} featuredSlug={gameSlug} games={games} />

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2 pt-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Saving…" : mode === "create" ? "Create issue" : "Save"}
        </button>
        <Link
          href="/admin/weekly"
          className="rounded-full border border-border bg-secondary px-5 py-2 text-sm font-bold"
        >
          Cancel
        </Link>
        {mode === "edit" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="rounded-full border border-destructive/40 px-5 py-2 text-sm font-bold text-destructive"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
