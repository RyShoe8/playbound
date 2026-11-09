"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, ExternalLink, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { aggregateEditorial, formatOutletScore, normalizedScore } from "@/lib/ratings";

interface GameOption {
  slug: string;
  title: string;
}

export interface AdminReviewItem {
  _id: string;
  gameSlug: string;
  editionSlug: string | null;
  outlet: string;
  author: string | null;
  url: string;
  snippet: string | null;
  score: number | null;
  scoreMax: number | null;
  scoreText: string | null;
  publishedAt: string | null;
  status: "published" | "hidden";
  source: "manual" | "wikipedia" | "outlet";
}

export interface AdminSyncSource {
  editionSlug: string | null;
  wikipediaTitle: string | null;
  disabled: boolean;
  lastSyncAt: string | null;
  lastStatus: string | null;
  matchedTitle: string | null;
  foundCount: number;
  outletCount: number;
}

const BLANK = {
  editionSlug: "",
  outlet: "",
  author: "",
  url: "",
  snippet: "",
  score: "",
  scoreMax: "10",
  scoreText: "",
  publishedAt: "",
  status: "published" as "published" | "hidden",
};

const input = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

const STATUS_TEXT: Record<string, string> = {
  ok: "found a reviews table",
  "no-article": "no matching Wikipedia article",
  "no-table": "article has no reviews table",
  error: "failed",
  disabled: "sync off",
};

/**
 * Admin for the Editorial Rating. One game at a time: its reviews grouped by
 * base game and edition with the resulting rating, the automated sync's state
 * per target, and a form for adding a review by hand.
 */
export function EditorialReviewsAdmin({
  games,
  game,
  items,
  editions,
  sources,
}: {
  games: GameOption[];
  game: string;
  items: AdminReviewItem[];
  editions: { slug: string; name: string }[];
  sources: AdminSyncSource[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(BLANK);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => startTransition(() => router.refresh());

  const targets = useMemo(
    () => [{ slug: null as string | null, name: "Base game" }, ...editions.map((e) => ({ slug: e.slug as string | null, name: e.name }))],
    [editions]
  );

  function pickGame(slug: string) {
    setEditing(null);
    setForm(BLANK);
    setMessage(null);
    startTransition(() => router.push(slug ? `?game=${encodeURIComponent(slug)}` : "?"));
  }

  function edit(it: AdminReviewItem) {
    setEditing(it._id);
    setForm({
      editionSlug: it.editionSlug ?? "",
      outlet: it.outlet,
      author: it.author ?? "",
      url: it.url,
      snippet: it.snippet ?? "",
      score: it.score == null ? "" : String(it.score),
      scoreMax: it.scoreMax == null ? "" : String(it.scoreMax),
      scoreText: it.scoreText ?? "",
      publishedAt: it.publishedAt ? it.publishedAt.slice(0, 10) : "",
      status: it.status,
    });
    setMessage(it.source !== "manual" ? "Saving takes this review over from the automated sync." : null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const scored = form.score.trim() !== "";
    const body = {
      gameSlug: game,
      editionSlug: form.editionSlug || null,
      outlet: form.outlet,
      author: form.author || null,
      url: form.url,
      snippet: form.snippet || null,
      score: scored ? Number(form.score) : null,
      scoreMax: scored ? Number(form.scoreMax) : null,
      scoreText: scored ? form.scoreText || null : null,
      publishedAt: form.publishedAt || null,
      status: form.status,
    };
    const res = await fetch(editing ? `/api/admin/editorial-reviews/${editing}` : "/api/admin/editorial-reviews", {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMessage(data.error ?? "Save failed");
    setMessage(editing ? "Updated." : "Added.");
    setEditing(null);
    setForm({ ...BLANK, editionSlug: form.editionSlug });
    refresh();
  }

  async function remove(it: AdminReviewItem) {
    const auto = it.source !== "manual";
    if (!confirm(auto ? `Hide the ${it.outlet} review? The sync will not bring it back.` : `Delete the ${it.outlet} review? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/editorial-reviews/${it._id}`, { method: "DELETE" });
    if (!res.ok) return setMessage("Delete failed");
    refresh();
  }

  async function syncNow() {
    setBusy(true);
    setMessage("Syncing from Wikipedia…");
    const res = await fetch("/api/admin/editorial-reviews/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gameSlug: game }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMessage(data.error ?? "Sync failed");
    const added = (data.results as { added: number }[]).reduce((n, r) => n + r.added, 0);
    setMessage(`Sync finished: ${added} new review${added === 1 ? "" : "s"}.`);
    refresh();
  }

  async function saveSource(editionSlug: string | null, wikipediaTitle: string, disabled: boolean) {
    const res = await fetch("/api/admin/editorial-reviews/sync", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gameSlug: game, editionSlug, wikipediaTitle: wikipediaTitle || null, disabled }),
    });
    setMessage(res.ok ? "Sync settings saved. Run Sync now to apply them." : "Could not save sync settings");
    refresh();
  }

  const set = (k: keyof typeof BLANK) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-6">
      <label className="block max-w-md text-sm font-semibold">
        Game
        <select className={`${input} mt-1`} value={game} onChange={(e) => pickGame(e.target.value)} disabled={pending}>
          <option value="">Choose a game…</option>
          {games.map((g) => (
            <option key={g.slug} value={g.slug}>
              {g.title}
            </option>
          ))}
        </select>
      </label>

      {game && (
        <>
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <Bot className="size-4" /> Automated gathering
              </h2>
              <button
                type="button"
                onClick={syncNow}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
              >
                <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} /> Sync now
              </button>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              An hourly job reads each target&apos;s Wikipedia &ldquo;Video game reviews&rdquo; table, searches the outlets PlayBound
              reads directly (COGconnected, Wccftech, Nintendo Insider and others) and watches feed-only outlets such as Polygon
              and Multiplayer.it for new reviews. It only adds rows and never edits ones entered or edited here. Pin a Wikipedia
              article when the automatic match is wrong or missing.
            </p>
            <ul className="space-y-2">
              {targets.map((t) => {
                const s = sources.find((x) => (x.editionSlug ?? null) === t.slug);
                return <SourceRow key={t.slug ?? "_game"} name={t.name} source={s} onSave={(title, off) => saveSource(t.slug, title, off)} />;
              })}
            </ul>
          </section>

          {targets.map((t) => {
            const list = items.filter((r) => (r.editionSlug ?? null) === t.slug);
            if (list.length === 0) return null;
            const agg = aggregateEditorial(list.filter((r) => r.status === "published"));
            return (
              <section key={t.slug ?? "_game"} className="rounded-xl border border-border bg-card p-4">
                <h2 className="mb-2 text-sm font-bold">
                  {t.slug ? `Edition: ${t.name}` : "Base game"} ·{" "}
                  <span className="font-normal text-muted-foreground">
                    Editorial Rating {agg.score ?? "not shown yet"} ({agg.scoredCount} scored, {agg.totalCount} published)
                  </span>
                </h2>
                <ul className="divide-y divide-border">
                  {list.map((it) => (
                    <li key={it._id} className="flex items-start gap-3 py-2 text-sm">
                      <span className="w-12 shrink-0 font-bold tabular-nums">{normalizedScore(it) ?? "—"}</span>
                      <div className="min-w-0 flex-1">
                        <p>
                          <span className="font-semibold">{it.outlet}</span>
                          {formatOutletScore(it) && <span className="text-muted-foreground"> · {formatOutletScore(it)}</span>}
                          {it.source !== "manual" && (
                            <span className="ml-2 rounded bg-muted px-1.5 text-xs">{it.source === "wikipedia" ? "via Wikipedia" : "from outlet"}</span>
                          )}
                          {it.status === "hidden" && <span className="ml-2 rounded bg-muted px-1.5 text-xs">hidden</span>}
                        </p>
                        <p className="truncate text-muted-foreground">{it.snippet ? `“${it.snippet}”` : "No snippet"}</p>
                      </div>
                      <a href={it.url} target="_blank" rel="noopener noreferrer" className="p-1 text-muted-foreground hover:text-foreground" aria-label="Open review">
                        <ExternalLink className="size-4" />
                      </a>
                      <button type="button" onClick={() => edit(it)} className="p-1 text-muted-foreground hover:text-foreground" aria-label="Edit">
                        <Pencil className="size-4" />
                      </button>
                      <button type="button" onClick={() => remove(it)} className="p-1 text-muted-foreground hover:text-red-500" aria-label="Delete">
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {items.length === 0 && <p className="text-sm text-muted-foreground">No editorial reviews for this game yet.</p>}

          <form onSubmit={save} className="grid max-w-3xl gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
            <h2 className="text-sm font-bold sm:col-span-2">{editing ? "Edit review" : "Add a review by hand"}</h2>
            <label className="text-sm">
              Covers
              <select className={`${input} mt-1`} value={form.editionSlug} onChange={set("editionSlug")}>
                {targets.map((t) => (
                  <option key={t.slug ?? "_game"} value={t.slug ?? ""}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Outlet
              <input className={`${input} mt-1`} value={form.outlet} onChange={set("outlet")} required maxLength={80} placeholder="PC Gamer" />
            </label>
            <label className="text-sm sm:col-span-2">
              Link to the full review
              <input className={`${input} mt-1`} value={form.url} onChange={set("url")} required type="url" />
            </label>
            <label className="text-sm sm:col-span-2">
              Snippet — a short excerpt from the review (optional)
              <textarea className={`${input} mt-1`} value={form.snippet} onChange={set("snippet")} maxLength={400} rows={3} />
              <span className="text-xs text-muted-foreground">{form.snippet.length}/400 — keep it to a sentence or two.</span>
            </label>
            <label className="text-sm">
              Score (blank if unscored)
              <input className={`${input} mt-1`} value={form.score} onChange={set("score")} inputMode="decimal" placeholder="8" />
            </label>
            <label className="text-sm">
              Out of
              <input className={`${input} mt-1`} value={form.scoreMax} onChange={set("scoreMax")} inputMode="numeric" placeholder="10" />
            </label>
            <label className="text-sm">
              Author
              <input className={`${input} mt-1`} value={form.author} onChange={set("author")} maxLength={80} />
            </label>
            <label className="text-sm">
              Published
              <input className={`${input} mt-1`} value={form.publishedAt} onChange={set("publishedAt")} type="date" />
            </label>
            <label className="text-sm">
              Status
              <select className={`${input} mt-1`} value={form.status} onChange={set("status")}>
                <option value="published">Published</option>
                <option value="hidden">Hidden</option>
              </select>
            </label>
            <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
              <button type="submit" disabled={busy} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {editing ? "Save changes" : "Add review"}
              </button>
              {editing && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setForm(BLANK);
                    setMessage(null);
                  }}
                  className="rounded-md border border-border px-4 py-2 text-sm"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
        </>
      )}
    </div>
  );
}

function SourceRow({
  name,
  source,
  onSave,
}: {
  name: string;
  source: AdminSyncSource | undefined;
  onSave: (wikipediaTitle: string, disabled: boolean) => void;
}) {
  const [title, setTitle] = useState(source?.wikipediaTitle ?? "");
  const [off, setOff] = useState(Boolean(source?.disabled));
  const status = source?.lastStatus
    ? `${STATUS_TEXT[source.lastStatus] ?? source.lastStatus}${source.matchedTitle ? ` (${source.matchedTitle}, ${source.foundCount} rows)` : ""} · ${source.outletCount} outlet${source.outletCount === 1 ? "" : "s"} · ${new Date(source.lastSyncAt!).toLocaleString()}`
    : "not synced yet";
  return (
    <li className="grid items-center gap-2 text-sm sm:grid-cols-[10rem_1fr_auto_auto]">
      <span className="font-semibold">{name}</span>
      <div className="min-w-0">
        <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Wikipedia article (automatic)" />
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{status}</p>
      </div>
      <label className="flex items-center gap-1.5 text-xs">
        <input type="checkbox" checked={off} onChange={(e) => setOff(e.target.checked)} /> Sync off
      </label>
      <button type="button" onClick={() => onSave(title.trim(), off)} className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold">
        Save
      </button>
    </li>
  );
}
