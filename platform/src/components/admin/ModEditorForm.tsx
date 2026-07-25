"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DOWNLOAD_KINDS, MANAGED_BY, slugifyTitle, type ModPayload } from "@/lib/modPayload";

type DevOption = { slug: string; name: string };
type GameOption = { slug: string; title: string };

const field =
  "mt-1 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";
const label = "text-xs font-bold uppercase tracking-wide text-muted-foreground";

export function ModEditorForm({
  mode,
  initial,
  developers,
  games,
}: {
  mode: "create" | "edit";
  initial: ModPayload;
  developers: DevOption[];
  games: GameOption[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<ModPayload>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const gameOptions = useMemo(
    () => [...games].sort((a, b) => a.title.localeCompare(b.title)),
    [games]
  );

  function patch<K extends keyof ModPayload>(key: K, value: ModPayload[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(mode === "create" ? "/api/admin/mods" : `/api/admin/mods/${initial.slug}`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Save failed");
        setBusy(false);
        return;
      }
      router.push("/admin/mods");
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete mod "${form.title}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/mods/${initial.slug}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Delete failed");
        setBusy(false);
        return;
      }
      router.push("/admin/mods");
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="mx-auto max-w-3xl space-y-4">
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
                slug: mode === "create" && !prev.slug ? slugifyTitle(title) : prev.slug,
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
            disabled={mode === "edit"}
            onChange={(e) => patch("slug", e.target.value)}
            className={field}
          />
        </div>
      </div>

      <div>
        <label className={label}>Tagline</label>
        <input required value={form.tagline} onChange={(e) => patch("tagline", e.target.value)} className={field} />
      </div>

      <div>
        <label className={label}>Description</label>
        <textarea
          required
          rows={5}
          value={form.description}
          onChange={(e) => patch("description", e.target.value)}
          className={field}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Base game</label>
          <select
            required
            value={form.baseGameSlug}
            onChange={(e) => patch("baseGameSlug", e.target.value)}
            className={field}
          >
            <option value="">Select game…</option>
            {gameOptions.map((g) => (
              <option key={g.slug} value={g.slug}>
                {g.title} ({g.slug})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Developer</label>
          <select
            required
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
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Website</label>
          <input required type="url" value={form.website} onChange={(e) => patch("website", e.target.value)} className={field} />
        </div>
        <div>
          <label className={label}>License</label>
          <input required value={form.license} onChange={(e) => patch("license", e.target.value)} className={field} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={label}>Download kind</label>
          <select
            value={form.downloadKind}
            onChange={(e) => patch("downloadKind", e.target.value as ModPayload["downloadKind"])}
            className={field}
          >
            {DOWNLOAD_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>GitHub repo</label>
          <input
            value={form.githubRepo ?? ""}
            onChange={(e) => patch("githubRepo", e.target.value || null)}
            placeholder="owner/repo"
            className={field}
          />
        </div>
        <div>
          <label className={label}>Asset pattern</label>
          <input
            value={form.assetPattern ?? ""}
            onChange={(e) => patch("assetPattern", e.target.value || null)}
            placeholder="\\.zip$"
            className={field}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Direct URL</label>
          <input
            value={form.directUrl ?? ""}
            onChange={(e) => patch("directUrl", e.target.value || null)}
            placeholder="For direct-zip / external"
            className={field}
          />
        </div>
        <div>
          <label className={label}>Install path under game</label>
          <input
            value={form.installRelativePath}
            onChange={(e) => patch("installRelativePath", e.target.value)}
            placeholder="mods"
            className={field}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Relative to the base game folder (e.g. <code className="text-play">mods</code>). Leave empty for game root.
          </p>
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
          <label className={label}>Managed by</label>
          <select
            value={form.managedBy}
            onChange={(e) => patch("managedBy", e.target.value as ModPayload["managedBy"])}
            className={field}
          >
            {MANAGED_BY.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={label}>Owner user id (optional)</label>
        <input
          value={form.ownerUserId ?? ""}
          onChange={(e) => patch("ownerUserId", e.target.value || null)}
          placeholder="Mongo user id when developer-managed"
          className={field}
        />
      </div>

      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={form.published} onChange={(e) => patch("published", e.target.checked)} />
        Published
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          {mode === "create" ? "Create mod" : "Save changes"}
        </button>
        {mode === "edit" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="rounded-full border border-destructive/40 px-5 py-2.5 text-sm font-bold text-destructive disabled:opacity-60"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
