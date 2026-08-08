"use client";
import { PremiumSelect } from "@/components/ui/PremiumSelect";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DOWNLOAD_KINDS, MANAGED_BY, slugifyTitle, type ModPayload } from "@/lib/modPayload";
import { ensureDerivedModFields, modEditorialReadiness } from "@/lib/enrich";
import { CATALOG_STATUSES, normalizeStatus } from "@/lib/catalogStatus";
import {
  coverLooksLikeSteamHeader,
  screenshotsAreThin,
} from "@/lib/mediaThin";
import { isScreenshotCandidate } from "@/lib/mediaImageFilter";
import { mergeUniqueMediaUrls } from "@/lib/mediaDedupe";
import {
  DerivedContentEditor,
  EvidencePanel,
  ProseField,
  ReadinessPanel,
  SourceMaterialPanel,
} from "@/components/admin/EditorialFields";
import { ModHardwareRequirementsEditor } from "@/components/admin/HardwareRequirementsEditor";
import { AdminCollapsibleSection } from "@/components/admin/AdminCollapsibleSection";

type DevOption = { slug: string; name: string };
type GameOption = { slug: string; title: string };

const field =
  "mt-1 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";
const label = "text-xs font-bold uppercase tracking-wide text-muted-foreground";

function modUploadSlug(slug: string): string {
  const s = (slug || "upload").replace(/[^a-z0-9-]/gi, "-").slice(0, 60);
  return `mod-${s || "upload"}`;
}

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
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingImageKindRef = useRef<"cover" | "shot">("shot");
  const [form, setForm] = useState<ModPayload>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [mediaNote, setMediaNote] = useState("");
  const [importUrl, setImportUrl] = useState(mode === "create" ? "" : initial.website || "");
  const [evidence, setEvidence] = useState<string[]>([]);
  const [sourceMaterial, setSourceMaterial] = useState<string | null>(null);

  const gameOptions = useMemo(
    () => [...games].sort((a, b) => a.title.localeCompare(b.title)),
    [games]
  );

  // Mirrors the server-side publish gate, including the derivation the server
  // applies first — otherwise install steps and the FAQ read as missing here.
  const readiness = useMemo(() => {
    const baseTitle = games.find((g) => g.slug === form.baseGameSlug)?.title;
    return modEditorialReadiness(ensureDerivedModFields(form, baseTitle));
  }, [form, games]);

  function patch<K extends keyof ModPayload>(key: K, value: ModPayload[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function fetchMedia() {
    const url = form.website || importUrl;
    const githubRepo = form.githubRepo?.trim() || null;
    if (!url.trim() && !githubRepo && !(form.screenshots?.length)) {
      setError("Set a website URL or GitHub repo first.");
      return;
    }
    setBusy(true);
    setError("");
    setMediaNote("");
    try {
      const existingShots = [...(form.screenshots ?? [])].filter(Boolean);
      const hadCover = Boolean(form.coverImage);
      const res = await fetch("/api/admin/games/media", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: url.trim() || null,
          steamAppId: null,
          githubRepo,
          slug: modUploadSlug(form.slug),
          coverImage: form.coverImage,
          screenshots: form.screenshots ?? [],
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = data?.error ?? "Media fetch failed";
        if (existingShots.length || form.coverImage) {
          setMediaNote(`${msg} Existing media kept.`);
          setError("");
        } else {
          setError(msg);
        }
        setBusy(false);
        return;
      }

      const incomingShots = ((data.screenshots as string[]) ?? []).filter(Boolean);
      const cleanExisting = existingShots.filter((u) => isScreenshotCandidate(u));
      const cleanIncoming = incomingShots.filter((u) => isScreenshotCandidate(u));
      const thin = screenshotsAreThin(cleanExisting);
      let nextShots = mergeUniqueMediaUrls(cleanExisting, cleanIncoming, 20);
      if (thin && cleanIncoming.length > cleanExisting.length) {
        nextShots = mergeUniqueMediaUrls(cleanIncoming, cleanExisting, 20);
      }

      const coverIsJunk =
        Boolean(form.coverImage) &&
        !isScreenshotCandidate(form.coverImage, { requireRaster: false });
      const replaceCover =
        (!form.coverImage ||
          coverIsJunk ||
          coverLooksLikeSteamHeader(form.coverImage) ||
          thin) &&
        Boolean(data.coverImage);
      const nextCover = replaceCover
        ? (data.coverImage as string) || form.coverImage || null
        : form.coverImage || (data.coverImage as string) || null;

      const addedShots = Math.max(0, nextShots.length - cleanExisting.length);
      setForm((prev) => ({
        ...prev,
        coverImage: nextCover,
        screenshots: nextShots,
      }));
      setMediaNote(
        addedShots > 0 || ((!hadCover || replaceCover) && nextCover !== form.coverImage)
          ? `Refresh done — ${addedShots} new screenshot${addedShots === 1 ? "" : "s"}. Save to persist.`
          : "No new media found. Existing media kept."
      );
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
    const kind = pendingImageKindRef.current;
    setBusy(true);
    setError("");
    setMediaNote(kind === "cover" ? "Uploading cover…" : "Uploading screenshot…");
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("slug", modUploadSlug(form.slug));
      body.set("kind", kind);
      const res = await fetch("/api/admin/games/upload", { method: "POST", body });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = data?.error ?? "Upload failed";
        setError(msg);
        setMediaNote(msg);
        setBusy(false);
        return;
      }
      if (!data?.url || typeof data.url !== "string") {
        const msg = "Upload succeeded but no image URL was returned.";
        setError(msg);
        setMediaNote(msg);
        setBusy(false);
        return;
      }
      if (kind === "cover") {
        patch("coverImage", data.url);
        setMediaNote("Cover uploaded — save the mod to persist.");
      } else {
        setForm((prev) => ({
          ...prev,
          screenshots: mergeUniqueMediaUrls(prev.screenshots, [data.url], 20),
        }));
        setMediaNote("Screenshot uploaded — save the mod to persist.");
      }
      setBusy(false);
    } catch {
      const msg = "Couldn't reach the server.";
      setError(msg);
      setMediaNote(msg);
      setBusy(false);
    }
  }

  async function runImport() {
    if (!importUrl.trim()) return;
    if (!form.baseGameSlug) {
      setError("Pick a base game first — install steps and the FAQ are written against it.");
      return;
    }
    setBusy(true);
    setError("");
    setWarning("");
    try {
      const res = await fetch("/api/admin/mods/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: importUrl, baseGameSlug: form.baseGameSlug }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Import failed");
        setBusy(false);
        return;
      }
      const draft = data.draft as ModPayload;
      setForm((prev) => ({
        ...prev,
        ...draft,
        slug: mode === "edit" ? prev.slug : draft.slug || prev.slug,
        baseGameSlug: prev.baseGameSlug,
        published: false,
        // Never clobber prose the editor has already written.
        longDescription: prev.longDescription || draft.longDescription,
        whatItChanges: prev.whatItChanges || draft.whatItChanges,
      }));
      setEvidence((data.evidence as string[]) ?? []);
      setSourceMaterial((data.sourceMaterial as string | null) ?? null);
      setWarning(typeof data.warning === "string" ? data.warning : "");
      setBusy(false);
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const status = normalizeStatus(form);
    const payload = { ...form, status, published: status === "published" };
    try {
      const res = await fetch(mode === "create" ? "/api/admin/mods" : `/api/admin/mods/${initial.slug}`, {
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
      router.push(`/admin/games/${form.baseGameSlug}/mods`);
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
      router.push(`/admin/games/${form.baseGameSlug}/mods`);
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className={label}>Import from a GitHub repo or project page</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="https://github.com/owner/repo, Steam, or a project page URL"
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
          Same sources as games (Steam, GitHub, website). Pick the base game below first —
          install steps and the FAQ are generated against it.
        </p>
        {warning && (
          <p className="mt-2 text-sm text-amber-500" role="status">
            {warning}
          </p>
        )}
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
        <p className="text-[11px] normal-case text-muted-foreground">
          Short summary for cards and meta descriptions. The long description below is
          the one that has to be original.
        </p>
        <textarea
          required
          rows={4}
          value={form.description}
          onChange={(e) => patch("description", e.target.value)}
          className={field}
        />
      </div>

      {/* ── Editorial depth ─────────────────────────────────── */}
      <details open className="rounded-xl border border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-bold">
          Editorial — required to publish
          {!readiness.ready && (
            <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
              {readiness.missing.length} missing
            </span>
          )}
        </summary>

        <div className="mt-4 space-y-5">
          <ReadinessPanel fields={readiness.fields} ready={readiness.ready} kind="mod" />

          {evidence.length > 0 && <EvidencePanel evidence={evidence} />}

          {sourceMaterial && (
            <SourceMaterialPanel
              text={sourceMaterial}
              onDismiss={() => setSourceMaterial(null)}
            />
          )}

          <ProseField
            title="What it changes"
            hint="The single most useful thing to say about a mod, and the thing people actually search for. Be concrete: which units, which maps, which systems."
            value={form.whatItChanges ?? ""}
            minWords={10}
            rows={4}
            onChange={(v) => patch("whatItChanges", v)}
          />

          <ProseField
            title="Long description"
            hint="80+ words of original editorial. Do not paste the project README — that is duplicate content and will not rank."
            value={form.longDescription ?? ""}
            minWords={30}
            rows={10}
            onChange={(v) => patch("longDescription", v)}
          />

          <div>
            <label className={label}>Compatibility</label>
            <p className="text-[11px] normal-case text-muted-foreground">
              Base game versions this works with, if it matters. Optional.
            </p>
            <input
              value={form.compatibility ?? ""}
              placeholder="e.g. Requires OpenRA release-20231010 or newer"
              onChange={(e) => patch("compatibility", e.target.value)}
              className={field}
            />
          </div>

          <ModHardwareRequirementsEditor
            value={form.hardwareRequirements}
            onChange={(hardwareRequirements) => patch("hardwareRequirements", hardwareRequirements)}
          />

          <DerivedContentEditor
            installSteps={form.installSteps ?? []}
            faq={form.faq ?? []}
            onInstallStepsChange={(next) => patch("installSteps", next)}
            onFaqChange={(next) => patch("faq", next)}
          />
        </div>
      </details>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Base game</label>
          <PremiumSelect
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
          </PremiumSelect>
        </div>
        <div>
          <label className={label}>Developer</label>
          <PremiumSelect
            required
            value={form.developerSlug}
            onChange={(e) => patch("developerSlug", e.target.value)}
            className={field}
          >
            {/* Blank option so an unmatched developerSlug cannot masquerade as
                the first entry in the list. */}
            <option value="">Select a developer…</option>
            {developers.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.name}
              </option>
            ))}
            {form.developerSlug && !developers.some((d) => d.slug === form.developerSlug) && (
              <option value={form.developerSlug}>
                {form.developerSlug} (unknown — no such developer)
              </option>
            )}
          </PremiumSelect>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Missing one?{" "}
            <a href="/admin/developers/new" className="text-primary hover:underline">
              Add a developer
            </a>
            .
          </p>
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

      <AdminCollapsibleSection title="Cover & media" defaultOpen>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFileSelected}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void fetchMedia()}
            className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-60"
          >
            Refresh media
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              pendingImageKindRef.current = "cover";
              window.setTimeout(() => fileRef.current?.click(), 0);
            }}
            className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-60"
          >
            Upload cover
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              pendingImageKindRef.current = "shot";
              window.setTimeout(() => fileRef.current?.click(), 0);
            }}
            className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-60"
          >
            Upload screenshot
          </button>
        </div>
        {mediaNote && <p className="text-xs text-muted-foreground">{mediaNote}</p>}
        {form.coverImage ? (
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={form.coverImage}
              alt="Cover"
              className="h-28 w-20 rounded-md border border-border object-cover"
            />
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
            {form.screenshots!.map((src) => {
              const isCover = form.coverImage === src;
              return (
                <div key={src} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    className={
                      "h-20 w-32 rounded-md object-cover border " +
                      (isCover ? "border-primary ring-2 ring-primary/40" : "border-border")
                    }
                  />
                  <div className="absolute inset-x-0 bottom-0 flex gap-0.5 p-0.5">
                    <button
                      type="button"
                      className="flex-1 rounded bg-black/70 px-1 py-0.5 text-[9px] font-bold text-white"
                      onClick={() => patch("coverImage", src)}
                    >
                      {isCover ? "Cover" : "Use as cover"}
                    </button>
                    <button
                      type="button"
                      className="rounded bg-black/70 px-1.5 text-[10px] font-bold text-white"
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
                </div>
              );
            })}
          </div>
        )}
      </AdminCollapsibleSection>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={label}>Download kind</label>
          <PremiumSelect
            value={form.downloadKind}
            onChange={(e) => patch("downloadKind", e.target.value as ModPayload["downloadKind"])}
            className={field}
          >
            {DOWNLOAD_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </PremiumSelect>
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

      {form.downloadKind === "external" && normalizeStatus(form) === "published" ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Published as an external link — prefer converting to github-zip or direct-zip when a package URL exists.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.autoUpdatePinned !== false}
            onChange={(e) => patch("autoUpdatePinned", e.target.checked)}
          />
          Auto-update pinned download URLs (daily cron)
        </label>
        {mode === "edit" ? (
          <button
            type="button"
            className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-bold"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const res = await fetch(`/api/admin/mods/${form.slug}/check-version`, { method: "POST" });
                const data = await res.json().catch(() => null);
                if (!res.ok) {
                  setError(data?.error || "Version check failed");
                } else if (data?.applied?.directUrl) {
                  patch("directUrl", data.applied.directUrl);
                }
              } finally {
                setBusy(false);
              }
            }}
          >
            Check version now
          </button>
        ) : null}
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
          <PremiumSelect
            value={form.managedBy}
            onChange={(e) => patch("managedBy", e.target.value as ModPayload["managedBy"])}
            className={field}
          >
            {MANAGED_BY.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </PremiumSelect>
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

      <fieldset className="flex flex-wrap items-center gap-3 text-sm">
        <legend className="sr-only">Catalog status</legend>
        <span className="font-semibold">Status</span>
        {CATALOG_STATUSES.map((value) => {
          const current = normalizeStatus(form);
          const publishLocked = value === "published" && !readiness.ready && current !== "published";
          return (
            <label
              key={value}
              className={`flex items-center gap-1.5 font-semibold capitalize ${
                publishLocked ? "opacity-50" : ""
              }`}
              title={
                publishLocked
                  ? `Still needs: ${readiness.missing.join(", ")}`
                  : value === "testing"
                    ? "Visible only to admins on site and launcher"
                    : undefined
              }
            >
              <input
                type="radio"
                name="mod-catalog-status"
                checked={current === value}
                disabled={publishLocked}
                onChange={() =>
                  setForm((prev) => ({
                    ...prev,
                    status: value,
                    published: value === "published",
                  }))
                }
              />
              {value}
            </label>
          );
        })}
        {!readiness.ready && normalizeStatus(form) !== "published" && (
          <span className="text-[11px] font-normal text-muted-foreground">
            ({readiness.missing.length} field
            {readiness.missing.length === 1 ? "" : "s"} missing for Published)
          </span>
        )}
      </fieldset>

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
    </div>
  );
}
