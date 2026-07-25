"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GENRES, LAUNCH_METHODS, slugifyTitle, type GamePayload } from "@/lib/gamePayload";

type DevOption = { slug: string; name: string };

function csv(list: string[]) {
  return list.join(", ");
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function GameEditorForm({
  mode,
  initial,
  developers,
}: {
  mode: "create" | "edit";
  initial: GamePayload;
  developers: DevOption[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<GamePayload>(initial);
  const [importUrl, setImportUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tagsText, setTagsText] = useState(csv(initial.tags));
  const [platformsText, setPlatformsText] = useState(csv(initial.platforms));
  const [featuresText, setFeaturesText] = useState(csv(initial.features));
  const [screenshotsText, setScreenshotsText] = useState(csv(initial.screenshots ?? []));

  const genreSet = useMemo(() => new Set(form.genres), [form.genres]);
  const launchSet = useMemo(() => new Set(form.launchMethods), [form.launchMethods]);

  function patch<K extends keyof GamePayload>(key: K, value: GamePayload[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function runImport() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/games/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: importUrl }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Import failed");
        setBusy(false);
        return;
      }
      const draft = data.draft as GamePayload;
      setForm((prev) => ({
        ...prev,
        ...draft,
        slug: mode === "edit" ? prev.slug : draft.slug || prev.slug,
        published: false,
        submissionId: prev.submissionId,
      }));
      setTagsText(csv(draft.tags ?? []));
      setPlatformsText(csv(draft.platforms ?? []));
      setFeaturesText(csv(draft.features ?? []));
      setScreenshotsText(csv(draft.screenshots ?? []));
      setBusy(false);
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const payload: GamePayload = {
      ...form,
      tags: parseCsv(tagsText),
      platforms: parseCsv(platformsText),
      features: parseCsv(featuresText),
      screenshots: parseCsv(screenshotsText),
      githubRepo: form.githubRepo || null,
      coverImage: form.coverImage || null,
    };
    try {
      const res = await fetch(mode === "create" ? "/api/admin/games" : `/api/admin/games/${initial.slug}`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Save failed");
        setBusy(false);
        return;
      }
      router.push("/admin/games");
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${form.title}" from the catalog? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/games/${initial.slug}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Delete failed");
        setBusy(false);
        return;
      }
      router.push("/admin/games");
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  const field =
    "mt-1 h-10 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";
  const area =
    "mt-1 w-full resize-y rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";
  const label = "text-xs font-semibold text-muted-foreground";

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className={label}>Import from Steam or GitHub URL</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="https://store.steampowered.com/app/… or https://github.com/owner/repo"
            className={`${field} mt-0 flex-1`}
          />
          <button
            type="button"
            disabled={busy || !importUrl.trim()}
            onClick={runImport}
            className="rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold disabled:opacity-60"
          >
            Prefill
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Best-effort draft only — review every field before publishing. One-click launcher entries still need a
          separate update in the desktop catalog.
        </p>
      </div>

      <form onSubmit={save} className="space-y-4">
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
                  slug:
                    mode === "create" && (!prev.slug || prev.slug === slugifyTitle(prev.title))
                      ? slugifyTitle(title)
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
              onChange={(e) => patch("slug", e.target.value.toLowerCase())}
              className={field}
              disabled={mode === "edit"}
            />
          </div>
        </div>

        <div>
          <label className={label}>Tagline</label>
          <input required value={form.tagline} onChange={(e) => patch("tagline", e.target.value)} className={field} />
        </div>

        <div>
          <label className={label}>Description</label>
          <textarea required rows={6} value={form.description} onChange={(e) => patch("description", e.target.value)} className={area} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Developer</label>
            <select
              value={form.developerSlug}
              onChange={(e) => patch("developerSlug", e.target.value)}
              className={field}
            >
              {developers.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>License</label>
            <input required value={form.license} onChange={(e) => patch("license", e.target.value)} className={field} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={label}>Release year</label>
            <input
              type="number"
              required
              value={form.releaseYear}
              onChange={(e) => patch("releaseYear", Number(e.target.value))}
              className={field}
            />
          </div>
          <div>
            <label className={label}>Size (MB)</label>
            <input
              type="number"
              required
              value={form.sizeMB}
              onChange={(e) => patch("sizeMB", Number(e.target.value))}
              className={field}
            />
          </div>
          <div>
            <label className={label}>Website</label>
            <input required type="url" value={form.website} onChange={(e) => patch("website", e.target.value)} className={field} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>GitHub (owner/repo)</label>
            <input
              value={form.githubRepo ?? ""}
              onChange={(e) => patch("githubRepo", e.target.value || null)}
              placeholder="OpenRA/OpenRA"
              className={field}
            />
          </div>
          <div>
            <label className={label}>Cover image path or URL</label>
            <input
              value={form.coverImage ?? ""}
              onChange={(e) => patch("coverImage", e.target.value || null)}
              placeholder="/games/slug/cover.jpg"
              className={field}
            />
          </div>
        </div>

        <div>
          <label className={label}>Genres</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {GENRES.map((g) => {
              const on = genreSet.has(g);
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() =>
                    patch(
                      "genres",
                      on ? form.genres.filter((x) => x !== g) : [...form.genres, g]
                    )
                  }
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    on ? "bg-primary text-primary-foreground" : "border border-border bg-secondary"
                  }`}
                >
                  {g}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className={label}>Launch methods</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {LAUNCH_METHODS.map((m) => {
              const on = launchSet.has(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() =>
                    patch(
                      "launchMethods",
                      on
                        ? form.launchMethods.filter((x) => x !== m)
                        : [...form.launchMethods, m]
                    )
                  }
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    on ? "bg-primary text-primary-foreground" : "border border-border bg-secondary"
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Tags (comma-separated)</label>
            <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Platforms (comma-separated)</label>
            <input value={platformsText} onChange={(e) => setPlatformsText(e.target.value)} className={field} />
          </div>
        </div>

        <div>
          <label className={label}>Features (comma-separated)</label>
          <input value={featuresText} onChange={(e) => setFeaturesText(e.target.value)} className={field} />
        </div>

        <div>
          <label className={label}>Screenshots (comma-separated URLs/paths)</label>
          <input value={screenshotsText} onChange={(e) => setScreenshotsText(e.target.value)} className={field} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Min requirements</label>
            <input
              required
              value={form.systemRequirements.min}
              onChange={(e) => patch("systemRequirements", { ...form.systemRequirements, min: e.target.value })}
              className={field}
            />
          </div>
          <div>
            <label className={label}>Recommended requirements</label>
            <input
              required
              value={form.systemRequirements.recommended}
              onChange={(e) =>
                patch("systemRequirements", { ...form.systemRequirements, recommended: e.target.value })
              }
              className={field}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={label}>Art from</label>
            <input value={form.art.from} onChange={(e) => patch("art", { ...form.art, from: e.target.value })} className={field} />
          </div>
          <div>
            <label className={label}>Art to</label>
            <input value={form.art.to} onChange={(e) => patch("art", { ...form.art, to: e.target.value })} className={field} />
          </div>
          <div>
            <label className={label}>Art icon (Lucide name)</label>
            <input value={form.art.icon} onChange={(e) => patch("art", { ...form.art, icon: e.target.value })} className={field} />
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          {(
            [
              ["published", "Published"],
              ["browserPlayable", "Browser playable"],
              ["steamDeck", "Steam Deck"],
              ["gameOfWeek", "Game of the week"],
              ["hiddenGem", "Hidden gem"],
            ] as const
          ).map(([key, labelText]) => (
            <label key={key} className="flex items-center gap-2 font-semibold">
              <input
                type="checkbox"
                checked={Boolean(form[key])}
                onChange={(e) => patch(key, e.target.checked)}
              />
              {labelText}
            </label>
          ))}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {mode === "create" ? "Create game" : "Save changes"}
          </button>
          {mode === "edit" && (
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="rounded-full border border-destructive/40 px-5 py-2.5 text-sm font-bold text-destructive disabled:opacity-60"
            >
              Delete
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
