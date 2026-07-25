"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FEATURES,
  GENRES,
  LAUNCH_METHODS,
  PLATFORMS,
  TAGS,
  defaultArtFor,
  slugifyTitle,
  type GamePayload,
} from "@/lib/gamePayload";

type DevOption = { slug: string; name: string };

function ChipToggle({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-bold ${
        on ? "bg-primary text-primary-foreground" : "border border-border bg-secondary"
      }`}
    >
      {label}
    </button>
  );
}

function toggleInList<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
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
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<GamePayload>(initial);
  const [importUrl, setImportUrl] = useState(mode === "create" ? "" : initial.website || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [captureAvailable, setCaptureAvailable] = useState(false);
  const [uploadKind, setUploadKind] = useState<"cover" | "shot">("shot");

  const genreSet = useMemo(() => new Set(form.genres), [form.genres]);
  const launchSet = useMemo(() => new Set(form.launchMethods), [form.launchMethods]);
  const platformSet = useMemo(() => new Set(form.platforms), [form.platforms]);
  const featureSet = useMemo(() => new Set(form.features), [form.features]);
  const tagSet = useMemo(() => new Set(form.tags), [form.tags]);
  const extraTags = form.tags.filter((t) => !(TAGS as readonly string[]).includes(t));

  useEffect(() => {
    fetch("/api/admin/games/capture")
      .then((r) => r.json())
      .then((d) => setCaptureAvailable(Boolean(d?.available)))
      .catch(() => setCaptureAvailable(false));
  }, []);

  function patch<K extends keyof GamePayload>(key: K, value: GamePayload[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function runImport() {
    if (!importUrl.trim()) return;
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
        art: draft.art ?? defaultArtFor(draft.genres ?? [], draft.slug || prev.slug),
      }));
      setBusy(false);
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  async function fetchMedia() {
    const url = form.website || importUrl;
    if (!url.trim()) {
      setError("Set a website URL first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/games/media", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Media fetch failed");
        setBusy(false);
        return;
      }
      setForm((prev) => ({
        ...prev,
        coverImage: prev.coverImage || data.coverImage || null,
        screenshots: [
          ...new Set([...(prev.screenshots ?? []), ...((data.screenshots as string[]) ?? [])]),
        ].slice(0, 20),
      }));
      setBusy(false);
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  async function captureShot() {
    const url = form.website || importUrl;
    if (!url.trim()) {
      setError("Set a website URL first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/games/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, slug: form.slug || "capture" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Capture failed");
        setBusy(false);
        return;
      }
      setForm((prev) => ({
        ...prev,
        screenshots: [...(prev.screenshots ?? []), data.url].slice(0, 20),
        coverImage: prev.coverImage || data.url,
      }));
      setBusy(false);
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("slug", form.slug || "upload");
      body.set("kind", uploadKind);
      const res = await fetch("/api/admin/games/upload", { method: "POST", body });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Upload failed");
        setBusy(false);
        return;
      }
      if (uploadKind === "cover") {
        patch("coverImage", data.url);
      } else {
        setForm((prev) => ({
          ...prev,
          screenshots: [...(prev.screenshots ?? []), data.url].slice(0, 20),
        }));
      }
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
      githubRepo: form.githubRepo || null,
      coverImage: form.coverImage || null,
      art: form.art ?? defaultArtFor(form.genres, form.slug),
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
        <p className={label}>Import from Steam, GitHub, or any website URL</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="https://tinywind.io/ or Steam / GitHub URL"
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
          Website URLs default to browser-playable drafts. Steam/GitHub stay installable. Review before publishing.
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
          <textarea
            required
            rows={6}
            value={form.description}
            onChange={(e) => patch("description", e.target.value)}
            className={area}
          />
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

        <div>
          <label className={label}>GitHub (owner/repo)</label>
          <input
            value={form.githubRepo ?? ""}
            onChange={(e) => patch("githubRepo", e.target.value || null)}
            placeholder="OpenRA/OpenRA — optional"
            className={field}
          />
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div>
            <p className={label}>Cover & screenshots</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Fallback gradient art is automatic when there is no cover — no manual art colors needed.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={fetchMedia}
              className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-60"
            >
              Fetch from website
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setUploadKind("cover");
                fileRef.current?.click();
              }}
              className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-60"
            >
              Upload cover
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setUploadKind("shot");
                fileRef.current?.click();
              }}
              className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-60"
            >
              Upload screenshot
            </button>
            <button
              type="button"
              disabled={busy || !captureAvailable}
              onClick={captureShot}
              title={
                captureAvailable
                  ? "Capture via Microlink"
                  : "Needs MICROLINK_API_KEY + BLOB_READ_WRITE_TOKEN"
              }
              className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-60"
            >
              Capture screenshot
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileSelected} />
          </div>
          {form.coverImage ? (
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.coverImage} alt="Cover" className="h-28 w-20 rounded-md object-cover border border-border" />
              <button
                type="button"
                className="text-xs font-semibold text-destructive"
                onClick={() => patch("coverImage", null)}
              >
                Remove cover
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No cover yet — cards will use an auto gradient.</p>
          )}
          {(form.screenshots?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2">
              {form.screenshots!.map((src) => (
                <div key={src} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-20 w-32 rounded-md object-cover border border-border" />
                  <button
                    type="button"
                    className="absolute top-1 right-1 rounded bg-black/70 px-1.5 text-[10px] font-bold text-white"
                    onClick={() =>
                      patch(
                        "screenshots",
                        (form.screenshots ?? []).filter((s) => s !== src)
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className={label}>Genres</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {GENRES.map((g) => (
              <ChipToggle
                key={g}
                label={g}
                on={genreSet.has(g)}
                onClick={() => patch("genres", toggleInList([...form.genres], g))}
              />
            ))}
          </div>
        </div>

        <div>
          <label className={label}>Launch methods</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {LAUNCH_METHODS.map((m) => (
              <ChipToggle
                key={m}
                label={m}
                on={launchSet.has(m)}
                onClick={() => {
                  const next = toggleInList([...form.launchMethods], m);
                  if (next.length === 0) return;
                  setForm((prev) => ({
                    ...prev,
                    launchMethods: next,
                    browserPlayable: next.includes("browser") && !next.includes("install") ? true : prev.browserPlayable,
                    platforms:
                      next.includes("browser") && !prev.platforms.includes("Web")
                        ? [...prev.platforms, "Web"]
                        : prev.platforms,
                    sizeMB: next.includes("browser") && !next.includes("install") ? 0 : prev.sizeMB,
                  }));
                }}
              />
            ))}
          </div>
        </div>

        <div>
          <label className={label}>Platforms</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <ChipToggle
                key={p}
                label={p}
                on={platformSet.has(p)}
                onClick={() => patch("platforms", toggleInList([...form.platforms], p))}
              />
            ))}
          </div>
        </div>

        <div>
          <label className={label}>Features</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {FEATURES.map((f) => (
              <ChipToggle
                key={f}
                label={f}
                on={featureSet.has(f)}
                onClick={() => patch("features", toggleInList([...form.features], f))}
              />
            ))}
          </div>
        </div>

        <div>
          <label className={label}>Tags</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {TAGS.map((t) => (
              <ChipToggle
                key={t}
                label={t}
                on={tagSet.has(t)}
                onClick={() => patch("tags", toggleInList([...form.tags], t))}
              />
            ))}
            {extraTags.map((t) => (
              <ChipToggle
                key={t}
                label={t}
                on
                onClick={() => patch("tags", form.tags.filter((x) => x !== t))}
              />
            ))}
          </div>
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
              <input type="checkbox" checked={Boolean(form[key])} onChange={(e) => patch(key, e.target.checked)} />
              {labelText}
            </label>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Managed by</label>
            <select
              value={form.managedBy}
              onChange={(e) => patch("managedBy", e.target.value as GamePayload["managedBy"])}
              className={field}
            >
              <option value="admin">admin</option>
              <option value="developer">developer</option>
            </select>
          </div>
          <div>
            <label className={label}>Owner user id (optional)</label>
            <input
              value={form.ownerUserId ?? ""}
              onChange={(e) => patch("ownerUserId", e.target.value || null)}
              placeholder="When developer-managed"
              className={field}
            />
          </div>
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
