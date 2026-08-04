"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Developer } from "@/lib/data/types";

const label = "block text-xs font-semibold text-muted-foreground";
const field =
  "mt-1 h-9 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";
const area =
  "mt-1 w-full resize-y rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";

export type DeveloperDraft = Developer & { published: boolean };

export function DeveloperEditorForm({
  mode,
  initial,
  usage,
}: {
  mode: "create" | "edit";
  initial: DeveloperDraft;
  /** How many games/mods credit this developer — drives the rename warning. */
  usage?: { games: number; mods: number };
}) {
  const router = useRouter();
  const [form, setForm] = useState<DeveloperDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function patch<K extends keyof DeveloperDraft>(key: K, value: DeveloperDraft[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const referenceCount = (usage?.games ?? 0) + (usage?.mods ?? 0);
  const renaming = mode === "edit" && form.slug !== initial.slug;

  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        mode === "create" ? "/api/admin/developers" : `/api/admin/developers/${initial.slug}`,
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
      router.push("/admin/developers");
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${form.name}"?`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/developers/${initial.slug}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Delete failed");
        setBusy(false);
        return;
      }
      router.push("/admin/developers");
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
          <label className={label}>Name</label>
          <input
            required
            value={form.name}
            onChange={(e) => {
              const name = e.target.value;
              setForm((prev) => ({
                ...prev,
                name,
                // Auto-slug only a new developer, and only while the slug is
                // still the untouched derivative of the name.
                slug:
                  mode === "create" && (!prev.slug || prev.slug === slugify(prev.name))
                    ? slugify(name)
                    : prev.slug,
              }));
            }}
            className={field}
            placeholder="OpenRA Team"
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
            placeholder="openra-team"
          />
          {renaming && (
            <p className="mt-1 text-[11px] text-amber-500">
              Renaming changes this profile&apos;s URL to /developers/{form.slug || "…"}.
              {referenceCount > 0
                ? ` ${referenceCount} game/mod credit${referenceCount === 1 ? "" : "s"} will be updated automatically.`
                : ""}{" "}
              The old URL will 404.
            </p>
          )}
        </div>
      </div>

      <div>
        <label className={label}>Tagline</label>
        <input
          value={form.tagline}
          onChange={(e) => patch("tagline", e.target.value)}
          className={field}
          placeholder="Reimagining classic RTS games for the modern era."
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          One line, shown under the name on the profile and in the directory.
        </p>
      </div>

      <div>
        <label className={label}>About</label>
        <textarea
          rows={4}
          value={form.about}
          onChange={(e) => patch("about", e.target.value)}
          className={area}
          placeholder="Who they are, what they've shipped, and why they're worth following."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={label}>Founded</label>
          <input
            type="number"
            min={0}
            max={new Date().getFullYear() + 1}
            value={form.founded || ""}
            onChange={(e) => patch("founded", Number(e.target.value) || 0)}
            className={field}
            placeholder="2007"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">Leave blank if unknown.</p>
        </div>
        <div>
          <label className={label}>Location</label>
          <input
            value={form.location}
            onChange={(e) => patch("location", e.target.value)}
            className={field}
            placeholder="Worldwide"
          />
        </div>
        <div>
          <label className={label}>Art hue</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={360}
              value={form.artHue}
              onChange={(e) => patch("artHue", Number(e.target.value))}
              className="h-9 flex-1"
            />
            <span
              className="size-9 shrink-0 rounded-lg border border-border"
              style={{ background: `oklch(0.55 0.15 ${form.artHue})` }}
              aria-hidden
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Colour of the generated profile artwork ({form.artHue}°).
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Website</label>
          <input
            type="url"
            value={form.website}
            onChange={(e) => patch("website", e.target.value)}
            className={field}
            placeholder="https://www.openra.net"
          />
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

      {mode === "edit" && referenceCount > 0 && (
        <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          Credited on {usage?.games ?? 0} game{(usage?.games ?? 0) === 1 ? "" : "s"} and{" "}
          {usage?.mods ?? 0} mod{(usage?.mods ?? 0) === 1 ? "" : "s"}. Deleting is blocked while
          anything still credits them — untick Published to hide the profile instead.
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground hover:brightness-110 disabled:opacity-60"
        >
          {busy ? "Saving…" : mode === "create" ? "Create developer" : "Save changes"}
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
