"use client";
import { PremiumSelect } from "@/components/ui/PremiumSelect";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import type { Collection } from "@/lib/data/types";

const label = "block text-xs font-semibold text-muted-foreground";
const field =
  "mt-1 h-9 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";
const area =
  "mt-1 w-full resize-y rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";

export type CollectionDraft = Collection & { published: boolean; sortOrder: number };

export function CollectionEditorForm({
  mode,
  initial,
  games,
}: {
  mode: "create" | "edit";
  initial: CollectionDraft;
  games: { slug: string; title: string }[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<CollectionDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [picker, setPicker] = useState("");

  const titleBySlug = useMemo(
    () => new Map(games.map((g) => [g.slug, g.title])),
    [games]
  );

  // Only offer games not already in the list, so you cannot add a duplicate.
  const available = useMemo(
    () =>
      games
        .filter((g) => !form.gameSlugs.includes(g.slug))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [games, form.gameSlugs]
  );

  function patch<K extends keyof CollectionDraft>(key: K, value: CollectionDraft[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addGame(slug: string) {
    if (!slug || form.gameSlugs.includes(slug)) return;
    patch("gameSlugs", [...form.gameSlugs, slug]);
    setPicker("");
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= form.gameSlugs.length) return;
    const next = [...form.gameSlugs];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    patch("gameSlugs", next);
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        mode === "create" ? "/api/admin/collections" : `/api/admin/collections/${initial.slug}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Save failed");
        setBusy(false);
        return;
      }
      router.push("/admin/collections");
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete the "${form.title}" collection?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/collections/${initial.slug}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Delete failed");
        setBusy(false);
        return;
      }
      router.push("/admin/collections");
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Title</label>
          <input
            required
            value={form.title}
            onChange={(e) => {
              const title = e.target.value;
              setForm((prev) => ({
                ...prev,
                title,
                // Only auto-slug a new collection, and only while untouched.
                slug:
                  mode === "create" && (!prev.slug || prev.slug === slugify(prev.title))
                    ? slugify(title)
                    : prev.slug,
              }));
            }}
            className={field}
          />
        </div>
        <div>
          <label className={label}>Slug</label>
          <input
            required
            value={form.slug}
            onChange={(e) =>
              patch("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
            }
            className={field}
          />
          {mode === "edit" && form.slug !== initial.slug && (
            <p className="mt-1 text-[11px] text-amber-500">
              Renaming changes this collection&apos;s URL to /collections/{form.slug || "…"}.
              The old URL will 404.
            </p>
          )}
        </div>
      </div>

      <div>
        <label className={label}>Description</label>
        <textarea
          required
          rows={3}
          value={form.description}
          onChange={(e) => patch("description", e.target.value)}
          className={area}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Sort order</label>
          <input
            type="number"
            min={0}
            value={form.sortOrder}
            onChange={(e) => patch("sortOrder", Number(e.target.value) || 0)}
            className={field}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Ascending. Lower shows first on /collections.
          </p>
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={form.published}
            onChange={(e) => patch("published", e.target.checked)}
            className="size-4"
          />
          Published
        </label>
      </div>

      <div>
        <label className={label}>Games — {form.gameSlugs.length} in this collection</label>
        <p className="text-[11px] text-muted-foreground">
          Order is the ranking shown on the page. Pick from the catalog so a slug
          can never be mistyped.
        </p>

        <div className="mt-2 space-y-2">
          {form.gameSlugs.map((slug, i) => (
            <div key={slug} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
              <span className="w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {titleBySlug.get(slug) ?? slug}{" "}
                <span className="text-xs text-muted-foreground">({slug})</span>
              </span>
              <button
                type="button"
                onClick={() => move(i, i - 1)}
                disabled={i === 0}
                className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                aria-label="Move up"
              >
                <ArrowUp className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => move(i, i + 1)}
                disabled={i === form.gameSlugs.length - 1}
                className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                aria-label="Move down"
              >
                <ArrowDown className="size-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  patch("gameSlugs", form.gameSlugs.filter((_, x) => x !== i))
                }
                className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${slug}`}
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
          {form.gameSlugs.length === 0 && (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              No games yet. Add one below.
            </p>
          )}
        </div>

        <div className="mt-2 flex gap-2">
          <PremiumSelect
            value={picker}
            onChange={(e) => setPicker(e.target.value)}
            className={`${field} mt-0 flex-1`}
          >
            <option value="">Choose a game…</option>
            {available.map((g) => (
              <option key={g.slug} value={g.slug}>
                {g.title}
              </option>
            ))}
          </PremiumSelect>
          <button
            type="button"
            onClick={() => addGame(picker)}
            disabled={!picker}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-secondary px-3 text-xs font-bold disabled:opacity-40"
          >
            <Plus className="size-3" /> Add
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground hover:brightness-110 disabled:opacity-60"
        >
          {busy ? "Saving…" : mode === "create" ? "Create collection" : "Save changes"}
        </button>
        {mode === "edit" && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="rounded-full border border-border px-5 py-2 text-sm font-bold text-destructive hover:bg-destructive/10 disabled:opacity-60"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
