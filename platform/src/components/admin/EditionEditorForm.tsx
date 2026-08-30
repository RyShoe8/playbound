"use client";
import { PremiumSelect } from "@/components/ui/PremiumSelect";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Plus, X } from "lucide-react";
import {
  EDITION_STATUSES,
  EDITION_STATUS_LABELS,
  EDITION_TYPES,
  EDITION_TYPE_LABELS,
  EDITION_VISIBILITIES,
  INSTALL_METHODS,
  INSTALL_METHOD_LABELS,
  VERIFICATION_LABELS,
  VERIFICATION_LEVELS,
  type EditionFaqItem,
  type EditionInstallConfig,
  type EditionPatchNote,
  type InstallMethod,
} from "@/lib/editionTypes";
import { FEATURES, TAGS } from "@/lib/gamePayload";
import { ChipPicker } from "@/components/admin/ChipToggle";
import { type EditionDraft } from "@/lib/editionDraft";
import { classifyMediaUrl } from "@/lib/mediaEmbed";
import {
  coverLooksLikeSteamHeader,
  screenshotsAreThin,
} from "@/lib/mediaThin";
import { isScreenshotCandidate } from "@/lib/mediaImageFilter";
import { mergeUniqueMediaUrls } from "@/lib/mediaDedupe";
import { HlsVideo } from "@/components/HlsVideo";
import { HardwareRequirementsEditor } from "@/components/admin/HardwareRequirementsEditor";
import {
  EvidencePanel,
  ProseField,
  SourceMaterialPanel,
  StepListEditor,
} from "@/components/admin/EditorialFields";
import { AdminCollapsibleSection } from "@/components/admin/AdminCollapsibleSection";
import { SizeInput } from "@/components/admin/SizeInput";
import { LauncherPackageUploader } from "@/components/admin/LauncherPackageUploader";
import { LAUNCHER_INSTALL_KINDS } from "@/lib/launcherInstall";
import { uploadAdminMediaFile } from "@/lib/adminUploadHelper";

export type { EditionDraft };

const label = "block text-xs font-semibold text-muted-foreground";
const field =
  "mt-1 h-9 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";
const area =
  "mt-1 w-full resize-y rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";

/** Comma/newline separated text ⇄ string[], for the simple list fields. */
function toList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isUsableVideoUrl(src: string): boolean {
  try {
    const u = new URL(src);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return true;
  } catch {
    return false;
  }
}

function VideoPreview({ src }: { src: string }) {
  const media = classifyMediaUrl(src);
  if (media.kind === "youtube" || media.kind === "vimeo") {
    return (
      <iframe
        title="Video preview"
        src={media.embedUrl}
        className="aspect-video w-full max-w-md rounded-md border border-border bg-black"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }
  if (media.kind === "hls") {
    return (
      <HlsVideo
        src={media.src}
        className="aspect-video w-full max-w-md rounded-md border border-border bg-black"
        title="Video preview"
      />
    );
  }
  return (
    <video
      src={media.src}
      controls
      className="aspect-video w-full max-w-md rounded-md border border-border bg-black"
      preload="metadata"
    />
  );
}

function uploadSlugFor(form: EditionDraft): string {
  const raw = `edition-${form.gameSlug || "game"}-${form.slug || "new"}`;
  return raw.replace(/[^a-z0-9-]/gi, "-").slice(0, 80);
}

export function EditionEditorForm({
  mode,
  initial,
  games,
}: {
  mode: "create" | "edit";
  initial: EditionDraft;
  games: { slug: string; title: string }[];
}) {
  const router = useRouter();
  const heroFileRef = useRef<HTMLInputElement>(null);
  const shotsFileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<EditionDraft>({
    ...initial,
    patchNotes: initial.patchNotes ?? [],
    faq: initial.faq ?? [],
    branding: {
      ...initial.branding,
      videos: initial.branding.videos ?? [],
    },
  });
  const [importUrl, setImportUrl] = useState(
    mode === "create" ? "" : initial.links.website || ""
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [mediaNote, setMediaNote] = useState("");
  const [videoUrlDraft, setVideoUrlDraft] = useState("");
  const [uploadKind, setUploadKind] = useState<"cover" | "shot">("shot");
  const [evidence, setEvidence] = useState<string[]>([]);
  const [sourceMaterial, setSourceMaterial] = useState<string | null>(null);

  function patch<K extends keyof EditionDraft>(key: K, value: EditionDraft[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function patchBranding(partial: Partial<EditionDraft["branding"]>) {
    setForm((prev) => ({ ...prev, branding: { ...prev.branding, ...partial } }));
  }

  /** Update one method's config block without disturbing the others. */
  function patchConfig<M extends keyof EditionInstallConfig>(
    method: M,
    value: Partial<NonNullable<EditionInstallConfig[M]>>
  ) {
    setForm((prev) => ({
      ...prev,
      installConfig: {
        ...prev.installConfig,
        [method]: { ...(prev.installConfig[method] ?? {}), ...value },
      },
    }));
  }

  /**
   * Replaces a whole install-method object rather than merging into it.
   *
   * patchConfig above spreads, which is right for the individual fields but
   * cannot remove a key — so it can never be used to edit a recipe as JSON.
   */
  function replaceConfig<M extends keyof EditionInstallConfig>(
    method: M,
    value: NonNullable<EditionInstallConfig[M]>
  ) {
    setForm((prev) => ({
      ...prev,
      installConfig: { ...prev.installConfig, [method]: value },
    }));
  }

  const backHref = `/admin/games/${form.gameSlug}/editions`;

  async function runImport() {
    if (!importUrl.trim()) return;
    if (!form.gameSlug) {
      setError("Pick a parent game first.");
      return;
    }
    setBusy(true);
    setError("");
    setWarning("");
    try {
      const res = await fetch("/api/admin/editions/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: importUrl, gameSlug: form.gameSlug }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Import failed");
        setBusy(false);
        return;
      }
      const draft = data.draft as EditionDraft;
      setForm((prev) => ({
        ...prev,
        ...draft,
        gameSlug: prev.gameSlug,
        slug: mode === "edit" ? prev.slug : draft.slug || prev.slug,
        // Never clobber prose the editor has already written.
        description: prev.description.trim() ? prev.description : draft.description,
        shortDescription: prev.shortDescription.trim()
          ? prev.shortDescription
          : draft.shortDescription,
        faq: prev.faq.length ? prev.faq : draft.faq ?? [],
        patchNotes: prev.patchNotes.length ? prev.patchNotes : draft.patchNotes ?? [],
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

  async function fetchMedia() {
    const url = form.links.website || importUrl;
    const githubRepo =
      form.links.github?.match(/github\.com\/([^/\s]+)\/([^/\s?#]+)/i)?.slice(1, 3).join("/") ||
      null;
    if (!url.trim() && !githubRepo && !(form.branding.screenshots?.length)) {
      setError("Set a website or GitHub link first.");
      return;
    }
    setBusy(true);
    setError("");
    setMediaNote("");
    try {
      const existingShots = [...(form.branding.screenshots ?? [])].filter(Boolean);
      const existingVideos = [...(form.branding.videos ?? [])].filter(Boolean);
      const res = await fetch("/api/admin/games/media", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: url.trim() || null,
          steamAppId: form.installConfig.steam?.appId || null,
          githubRepo,
          slug: uploadSlugFor(form),
          coverImage: form.branding.heroImage || null,
          screenshots: form.branding.screenshots ?? [],
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = data?.error ?? "Media fetch failed";
        if (existingShots.length || existingVideos.length || form.branding.heroImage) {
          setMediaNote(`${msg} Existing media kept.`);
          setError("");
        } else {
          setError(msg);
        }
        setBusy(false);
        return;
      }

      const incomingShots = ((data.screenshots as string[]) ?? []).filter(Boolean);
      const incomingVideos = ((data.videos as string[]) ?? []).filter(Boolean);
      const cleanExisting = existingShots.filter((u) => isScreenshotCandidate(u));
      const cleanIncoming = incomingShots.filter((u) => isScreenshotCandidate(u));
      const thin = screenshotsAreThin(cleanExisting);
      let nextShots = mergeUniqueMediaUrls(cleanExisting, cleanIncoming, 20);
      if (thin && cleanIncoming.length > cleanExisting.length) {
        nextShots = mergeUniqueMediaUrls(cleanIncoming, cleanExisting, 20);
      }

      const nextVideos = mergeUniqueMediaUrls(existingVideos, incomingVideos, 10);
      const coverIsJunk =
        Boolean(form.branding.heroImage) &&
        !isScreenshotCandidate(form.branding.heroImage, { requireRaster: false });
      const replaceCover =
        (!form.branding.heroImage ||
          coverIsJunk ||
          coverLooksLikeSteamHeader(form.branding.heroImage) ||
          thin) &&
        Boolean(data.coverImage);
      const nextCover = replaceCover
        ? (data.coverImage as string) || form.branding.heroImage || ""
        : form.branding.heroImage || (data.coverImage as string) || "";

      const addedShots = Math.max(0, nextShots.length - cleanExisting.length);
      const addedVideos = Math.max(0, nextVideos.length - existingVideos.length);
      setMediaNote(
        `Refresh done — added ${addedShots} screenshot${addedShots === 1 ? "" : "s"}, ${addedVideos} video${
          addedVideos === 1 ? "" : "s"
        }. Save to persist.`
      );
      patchBranding({
        heroImage: nextCover,
        screenshots: nextShots,
        videos: nextVideos,
      });
      setBusy(false);
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  function addVideoUrl() {
    const raw = videoUrlDraft.trim();
    if (!raw) return;
    if (!isUsableVideoUrl(raw)) {
      setError("Enter a valid http(s) YouTube, Vimeo, or direct video URL.");
      return;
    }
    if ((form.branding.videos ?? []).includes(raw)) {
      setError("That video URL is already listed.");
      return;
    }
    if ((form.branding.videos?.length ?? 0) >= 10) {
      setError("Maximum of 10 videos.");
      return;
    }
    setError("");
    patchBranding({ videos: [...(form.branding.videos ?? []), raw] });
    setVideoUrlDraft("");
  }

  async function onVideoFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if ((form.branding.videos?.length ?? 0) >= 10) {
      setError("Maximum of 10 videos.");
      return;
    }
    if (!["video/mp4", "video/webm", "video/quicktime"].includes(file.type)) {
      setError("Upload an MP4 or WebM video.");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError("Max video size is 100MB.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const slug = uploadSlugFor(form);
      const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
      const pathname = `games/${slug || "upload"}/video-${Date.now()}.${ext}`;
      const blob = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/admin/games/upload/client",
      });
      patchBranding({
        videos: [...(form.branding.videos ?? []), blob.url].slice(0, 10),
      });
      setMediaNote("Video uploaded — save the edition to persist.");
      setBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Video upload failed");
      setBusy(false);
    }
  }

  async function onHeroFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    setMediaNote("Uploading hero…");
    try {
      const url = await uploadAdminMediaFile(file, {
        slug: uploadSlugFor(form),
        kind: "hero",
        prefix: "editions",
      });
      patchBranding({ heroImage: url });
      setMediaNote("Hero uploaded — save the edition to persist.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed.";
      setError(msg);
      setMediaNote(msg);
    } finally {
      setBusy(false);
    }
  }

  async function onShotFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (!picked.length) return;

    const existing = form.branding.screenshots ?? [];
    const remaining = Math.max(0, 20 - existing.length);
    if (remaining === 0) {
      setMediaNote("Screenshot gallery is full (20). Remove some before uploading more.");
      return;
    }

    const files = picked.slice(0, remaining);
    const skipped = picked.length - files.length;
    setBusy(true);
    setError("");
    const urls: string[] = [];
    const failures: string[] = [];

    for (let i = 0; i < files.length; i++) {
      setMediaNote(`Uploading screenshots… ${i + 1}/${files.length}`);
      try {
        const url = await uploadAdminMediaFile(files[i], {
          slug: uploadSlugFor(form),
          kind: "shot",
          prefix: "editions",
        });
        urls.push(url);
      } catch (err) {
        failures.push(
          `${files[i].name}: ${err instanceof Error ? err.message : "upload failed"}`
        );
      }
    }

    if (urls.length) {
      patchBranding({
        screenshots: mergeUniqueMediaUrls(form.branding.screenshots ?? [], urls, 20),
      });
    }

    const parts = [
      urls.length ? `Added ${urls.length} screenshot${urls.length === 1 ? "" : "s"}.` : null,
      skipped > 0 ? `${skipped} skipped (gallery max 20).` : null,
      failures.length ? `Failed: ${failures.join(", ")}.` : null,
      urls.length ? "Save to persist." : null,
    ].filter(Boolean);

    setMediaNote(parts.join(" ") || "No screenshots added.");
    if (failures.length && !urls.length) {
      setError(failures.join(", "));
    }
    setBusy(false);
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        mode === "create" ? "/api/editions" : `/api/editions/${initial.id}`,
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
      router.push(backHref);
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete the "${form.name}" edition? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/editions/${initial.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Delete failed");
        setBusy(false);
        return;
      }
      router.push(backHref);
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <input
        ref={heroFileRef}
        type="file"
        accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.avif"
        className="sr-only"
        tabIndex={-1}
        onChange={onHeroFileSelected}
      />
      <input
        ref={shotsFileRef}
        type="file"
        multiple
        accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.avif"
        className="sr-only"
        tabIndex={-1}
        onChange={onShotFilesSelected}
      />
      <input
        ref={videoFileRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        className="sr-only"
        tabIndex={-1}
        onChange={onVideoFileSelected}
      />
      <div className="rounded-xl border border-border bg-card p-4">
        <p className={label}>Import from Steam, Epic, GitHub, or any website URL</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="https://… or Steam / Epic / GitHub URL"
            className={`${field} mt-0 flex-1`}
          />
          <button
            type="button"
            disabled={busy || !importUrl.trim() || !form.gameSlug}
            onClick={runImport}
            className="rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold disabled:opacity-60"
          >
            Prefill
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Same sources as games. Epic URLs set install method to Epic Games Store. Pick the parent
          game first. Review install method and media before saving.
        </p>
        {warning && (
          <p className="mt-2 text-sm text-amber-500" role="status">
            {warning}
          </p>
        )}
      </div>

      {evidence.length > 0 && <EvidencePanel evidence={evidence} />}
      {sourceMaterial && (
        <SourceMaterialPanel
          text={sourceMaterial}
          onDismiss={() => setSourceMaterial(null)}
        />
      )}

      <AdminCollapsibleSection title="Basics" defaultOpen>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Game</label>
            <PremiumSelect
              value={form.gameSlug}
              onChange={(e) => patch("gameSlug", e.target.value)}
              className={field}
            >
              <option value="">Select a game…</option>
              {games.map((g) => (
                <option key={g.slug} value={g.slug}>
                  {g.title}
                </option>
              ))}
            </PremiumSelect>
          </div>
          <div>
            <label className={label}>Edition name</label>
            <input
              required
              value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                setForm((prev) => ({
                  ...prev,
                  name,
                  slug:
                    mode === "create" && (!prev.slug || prev.slug === slugify(prev.name))
                      ? slugify(name)
                      : prev.slug,
                }));
              }}
              className={field}
              placeholder="Turtle WoW"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Slug</label>
            <input
              required
              value={form.slug}
              onChange={(e) =>
                patch("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
              }
              className={field}
              placeholder="turtle-wow"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              URL: /games/{form.gameSlug || "…"}/editions/{form.slug || "…"}
            </p>
          </div>
          <div>
            <label className={label}>Version</label>
            <input
              value={form.version}
              onChange={(e) => patch("version", e.target.value)}
              className={field}
              placeholder="1.17.2"
            />
          </div>
        </div>

        <div>
          <label className={label}>Short description</label>
          <input
            value={form.shortDescription}
            onChange={(e) => patch("shortDescription", e.target.value)}
            className={field}
            placeholder="Blizzlike 1.12 progression with a custom content team."
          />
        </div>

        <ProseField
          title="Description"
          hint="What this edition is, who runs it, and why someone would pick it. Blank line between paragraphs."
          value={form.description}
          rows={8}
          minWords={40}
          onChange={(next) => patch("description", next)}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={label}>Type</label>
            <PremiumSelect
              value={form.type}
              onChange={(e) => patch("type", e.target.value)}
              className={field}
            >
              {EDITION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EDITION_TYPE_LABELS[t]}
                </option>
              ))}
            </PremiumSelect>
          </div>
          <div>
            <label className={label}>Status</label>
            <PremiumSelect
              value={form.status}
              onChange={(e) => patch("status", e.target.value)}
              className={field}
            >
              {EDITION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {EDITION_STATUS_LABELS[s]}
                </option>
              ))}
            </PremiumSelect>
          </div>
          <div>
            <label className={label}>Visibility</label>
            <PremiumSelect
              value={form.visibility}
              onChange={(e) => patch("visibility", e.target.value)}
              className={field}
            >
              {EDITION_VISIBILITIES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </PremiumSelect>
          </div>
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
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => patch("isDefault", e.target.checked)}
              className="size-4"
            />
            Default edition
          </label>
        </div>
      </AdminCollapsibleSection>

      <AdminCollapsibleSection title="Cover & media" defaultOpen>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={fetchMedia}
            className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-60"
          >
            Refresh media
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => heroFileRef.current?.click()}
            className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-60"
          >
            Upload hero
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => shotsFileRef.current?.click()}
            className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-60"
          >
            Upload screenshots
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => videoFileRef.current?.click()}
            className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-60"
          >
            Upload video
          </button>
        </div>

{/*
          Hero and logo are set by uploading, or by promoting a screenshot
          below — not by typing a URL.

          The two inputs that were here were `type="url"`, which the browser
          rejects for a site path like /games/holocure/…, so they could not
          express the values this catalog actually uses even after the schema
          learned to accept them. Removing them also means artwork now always
          arrives through the upload route, which compresses it — the way a
          1 MB JPEG got in was a URL pointing at a file nothing had processed.
        */}
        {form.branding.heroImage ? (
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={form.branding.heroImage}
              alt="Hero"
              className="h-28 w-44 rounded-md border border-border object-cover"
            />
            <button
              type="button"
              className="text-xs font-semibold text-destructive"
              onClick={() => patchBranding({ heroImage: "" })}
            >
              Remove hero
            </button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No hero image yet.</p>
        )}

        {(form.branding.screenshots?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-2">
            {form.branding.screenshots.map((src) => {
              const isCover = form.branding.heroImage === src;
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
                      onClick={() => patchBranding({ heroImage: src })}
                    >
                      {isCover ? "Cover" : "Use as cover"}
                    </button>
                    <button
                      type="button"
                      className="rounded bg-black/70 px-1.5 text-[10px] font-bold text-white"
                      onClick={() =>
                        patchBranding({
                          screenshots: form.branding.screenshots.filter((s) => s !== src),
                        })
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

        <div>
          <p className={label}>Videos</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              value={videoUrlDraft}
              onChange={(e) => setVideoUrlDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addVideoUrl();
                }
              }}
              placeholder="YouTube, Vimeo, or direct video URL"
              className={`${field} mt-0 min-w-[200px] flex-1`}
            />
            <button
              type="button"
              onClick={addVideoUrl}
              className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold"
            >
              Add video
            </button>
          </div>
          {(form.branding.videos?.length ?? 0) > 0 ? (
            <div className="mt-3 flex flex-col gap-4">
              {form.branding.videos.map((src) => (
                <div key={src} className="space-y-2">
                  <VideoPreview src={src} />
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded bg-secondary/70 px-2 py-1 text-[11px] text-muted-foreground">
                      {src}
                    </code>
                    <button
                      type="button"
                      className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white"
                      onClick={() =>
                        patchBranding({
                          videos: form.branding.videos.filter((s) => s !== src),
                        })
                      }
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              No videos yet — add a URL or upload one.
            </p>
          )}
        </div>

        <div>
          <label className={label}>Art hue (optional, 0–360)</label>
          <input
            type="number"
            min={0}
            max={360}
            value={form.branding.artHue ?? ""}
            onChange={(e) =>
              patchBranding({
                artHue: e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
            className={field}
            placeholder="Auto"
          />
        </div>
        {mediaNote && (
          <p className="text-xs text-muted-foreground" role="status">
            {mediaNote}
          </p>
        )}
      </AdminCollapsibleSection>

      <AdminCollapsibleSection title="Installation" defaultOpen>
        <div>
          <label className={label}>Install method</label>
          <PremiumSelect
            value={form.installMethod}
            onChange={(e) => patch("installMethod", e.target.value as InstallMethod)}
            className={field}
          >
            {INSTALL_METHODS.map((m) => (
              <option key={m} value={m}>
                {INSTALL_METHOD_LABELS[m]}
              </option>
            ))}
          </PremiumSelect>
        </div>
        <div className="mt-4 space-y-3">
          {mode === "edit" ? (
            <LauncherPackageUploader
              gameSlug={form.gameSlug}
              editionSlug={form.slug}
              onInstalled={(installed) => {
                patch("installMethod", "playbound_installer");
                patchConfig("playbound_installer", {
                  kind: installed.kind,
                  url: installed.url,
                  fileName: installed.fileName,
                });
              }}
            />
          ) : null}
          <InstallMethodFields
            method={form.installMethod}
            config={form.installConfig}
            patchConfig={patchConfig}
            replaceConfig={replaceConfig}
          />
        </div>
      </AdminCollapsibleSection>

      <AdminCollapsibleSection title="Requirements & features">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Minimum requirements</label>
            <textarea
              rows={3}
              value={form.requirements.min}
              onChange={(e) =>
                patch("requirements", { ...form.requirements, min: e.target.value })
              }
              className={area}
            />
          </div>
          <div>
            <label className={label}>Recommended requirements</label>
            <textarea
              rows={3}
              value={form.requirements.recommended}
              onChange={(e) =>
                patch("requirements", {
                  ...form.requirements,
                  recommended: e.target.value,
                })
              }
              className={area}
            />
          </div>
        </div>
        <div>
          <label className={label}>Requirement notes</label>
          <input
            value={form.requirements.notes}
            onChange={(e) =>
              patch("requirements", { ...form.requirements, notes: e.target.value })
            }
            className={field}
            placeholder="Requires a clean 1.12 client — patched clients will not connect."
          />
        </div>
        <div className="mt-4">
          <HardwareRequirementsEditor
            value={form.hardwareRequirements}
            onChange={(hardwareRequirements) => patch("hardwareRequirements", hardwareRequirements)}
          />
        </div>
        {/*
          Features and Tags were newline-separated textareas, which made them
          effectively unusable and let editions accumulate values that no game
          uses — so nothing downstream could match on them. Same vocabulary and
          same interaction as the game editor now.
        */}
        <div className="space-y-5">
          <ChipPicker
            label="Features"
            hint="What this edition supports. Drawn from the same list games use."
            options={FEATURES}
            selected={form.features}
            onChange={(features) => patch("features", features)}
          />
          <ChipPicker
            label="Tags"
            hint="How players find it. Keep to the shared vocabulary so search and filters line up with games."
            options={TAGS}
            selected={form.tags}
            onChange={(tags) => patch("tags", tags)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Languages</label>
            <textarea
              rows={4}
              value={form.languages.join("\n")}
              onChange={(e) => patch("languages", toList(e.target.value))}
              className={area}
              placeholder="English&#10;German"
            />
          </div>
        </div>
      </AdminCollapsibleSection>

      <AdminCollapsibleSection title="Links & findability">
        <div className="grid gap-4 sm:grid-cols-2">
          {(["website", "discord", "wiki", "github", "forum"] as const).map((key) => (
            <div key={key}>
              <label className={`${label} capitalize`}>{key}</label>
              <input
                type="url"
                value={form.links[key]}
                onChange={(e) => patch("links", { ...form.links, [key]: e.target.value })}
                className={field}
                placeholder="https://…"
              />
            </div>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Search aliases</label>
            <textarea
              rows={3}
              value={form.aliases.join("\n")}
              onChange={(e) =>
                patch(
                  "aliases",
                  e.target.value
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean)
                )
              }
              className={area}
              placeholder={"Turtle\nTWoW"}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Optional nicknames for search only. One per line — no commas. Max 80 characters each.
            </p>
          </div>
          <div>
            <label className={label}>Server name</label>
            <input
              value={form.serverName}
              onChange={(e) => patch("serverName", e.target.value)}
              className={field}
              placeholder="Nordanaar"
            />
          </div>
        </div>
      </AdminCollapsibleSection>

      <AdminCollapsibleSection title="FAQ & patch notes">
        <FaqEditor faq={form.faq} onChange={(faq) => patch("faq", faq)} />
        <PatchNotesEditor
          notes={form.patchNotes}
          onChange={(patchNotes) => patch("patchNotes", patchNotes)}
        />
      </AdminCollapsibleSection>

      <AdminCollapsibleSection title="First Play & Multiplayer Steps">
        <div className="space-y-6">
          <StepListEditor
            title="First Play Steps (First-Time Guidance)"
            description="Optional steps shown to players on their first 1-2 launches (e.g. create profile, configure controls, register account)."
            steps={form.firstPlaySteps ?? []}
            onStepsChange={(steps) => patch("firstPlaySteps", steps)}
            placeholder="e.g. In the main menu, create a player profile..."
          />
          <div className="border-t border-border pt-4">
            <StepListEditor
              title="Multiplayer Gaming Steps (Manual Join / Server Navigation)"
              description="Optional in-game navigation steps to reach party multiplayer servers or lobbies (use {address}, {host}, or {port} for dynamic substitution)."
              steps={form.multiplayerGamingSteps ?? []}
              onStepsChange={(steps) => patch("multiplayerGamingSteps", steps)}
              placeholder="e.g. Click Gather > Manual > Enter {address} and click Connect..."
            />
          </div>
        </div>
      </AdminCollapsibleSection>

      <AdminCollapsibleSection title="Certification">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Verification level</label>
            <PremiumSelect
              value={form.verificationLevel}
              onChange={(e) => patch("verificationLevel", e.target.value)}
              className={field}
            >
              {VERIFICATION_LEVELS.map((v) => (
                <option key={v} value={v}>
                  {VERIFICATION_LABELS[v]}
                </option>
              ))}
            </PremiumSelect>
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={form.verified}
              onChange={(e) => patch("verified", e.target.checked)}
              className="size-4"
            />
            Verified
          </label>
        </div>
        <div className="mt-3">
          <label className={label}>Verification note</label>
          <input
            value={form.verificationNote}
            onChange={(e) => patch("verificationNote", e.target.value)}
            className={field}
            placeholder="Installed and played to level 10 on 2026-08-04."
          />
        </div>
      </AdminCollapsibleSection>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy || !form.gameSlug}
          className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground hover:brightness-110 disabled:opacity-60"
        >
          {busy ? "Saving…" : mode === "create" ? "Create edition" : "Save changes"}
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

function FaqEditor({
  faq,
  onChange,
}: {
  faq: EditionFaqItem[];
  onChange: (next: EditionFaqItem[]) => void;
}) {
  return (
    <div>
      <p className="text-sm font-bold">FAQ</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Common questions about this edition. Shown on the public edition page.
      </p>
      <div className="mt-3 space-y-2">
        {faq.map((item, i) => (
          <div key={i} className="rounded-lg border border-border p-2.5">
            <div className="flex gap-2">
              <input
                value={item.q}
                placeholder="Question"
                onChange={(e) => {
                  const next = [...faq];
                  next[i] = { ...item, q: e.target.value };
                  onChange(next);
                }}
                className={`${field} mt-0 flex-1 font-semibold`}
              />
              <button
                type="button"
                onClick={() => onChange(faq.filter((_, x) => x !== i))}
                className="shrink-0 rounded-lg border border-border px-2.5 text-muted-foreground hover:text-foreground"
                aria-label={`Remove question ${i + 1}`}
              >
                <X className="size-4" />
              </button>
            </div>
            <textarea
              rows={2}
              value={item.a}
              placeholder="Answer"
              onChange={(e) => {
                const next = [...faq];
                next[i] = { ...item, a: e.target.value };
                onChange(next);
              }}
              className={area}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...faq, { q: "", a: "" }])}
        className="mt-2 inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-bold"
      >
        <Plus className="size-3" /> Add question
      </button>
    </div>
  );
}

function PatchNotesEditor({
  notes,
  onChange,
}: {
  notes: EditionPatchNote[];
  onChange: (next: EditionPatchNote[]) => void;
}) {
  return (
    <div className="border-t border-border pt-4">
      <p className="text-sm font-bold">Patch notes</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Version history for this edition. Newest first is conventional.
      </p>
      <div className="mt-3 space-y-2">
        {notes.map((note, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-border p-2.5">
            <div className="flex flex-wrap gap-2">
              <input
                value={note.version}
                placeholder="Version"
                onChange={(e) => {
                  const next = [...notes];
                  next[i] = { ...note, version: e.target.value };
                  onChange(next);
                }}
                className={`${field} mt-0 !w-28`}
              />
              <input
                value={note.date ?? ""}
                placeholder="Date"
                onChange={(e) => {
                  const next = [...notes];
                  next[i] = { ...note, date: e.target.value };
                  onChange(next);
                }}
                className={`${field} mt-0 !w-36`}
              />
              <input
                value={note.title ?? ""}
                placeholder="Title"
                onChange={(e) => {
                  const next = [...notes];
                  next[i] = { ...note, title: e.target.value };
                  onChange(next);
                }}
                className={`${field} mt-0 min-w-[140px] flex-1`}
              />
              <button
                type="button"
                onClick={() => onChange(notes.filter((_, x) => x !== i))}
                className="shrink-0 rounded-lg border border-border px-2.5 text-muted-foreground hover:text-foreground"
                aria-label={`Remove patch note ${i + 1}`}
              >
                <X className="size-4" />
              </button>
            </div>
            <textarea
              rows={2}
              value={note.body ?? ""}
              placeholder="Notes"
              onChange={(e) => {
                const next = [...notes];
                next[i] = { ...note, body: e.target.value };
                onChange(next);
              }}
              className={area}
            />
            <input
              value={note.url ?? ""}
              placeholder="Optional changelog URL"
              onChange={(e) => {
                const next = [...notes];
                next[i] = { ...note, url: e.target.value };
                onChange(next);
              }}
              className={field}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          onChange([...notes, { version: "", date: "", title: "", body: "", url: "" }])
        }
        className="mt-2 inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-bold"
      >
        <Plus className="size-3" /> Add patch note
      </button>
    </div>
  );
}

/**
 * Fields for the selected install method only.
 *
 * Mirrors the resolver registry: one branch per method, each reading its own
 * config block. Adding a method means adding a case here and a resolver — no
 * other component changes.
 */
function InstallMethodFields({
  method,
  config,
  patchConfig,
  replaceConfig,
}: {
  method: InstallMethod;
  config: EditionInstallConfig;
  patchConfig: <M extends keyof EditionInstallConfig>(
    method: M,
    value: Partial<NonNullable<EditionInstallConfig[M]>>
  ) => void;
  replaceConfig: <M extends keyof EditionInstallConfig>(
    method: M,
    value: NonNullable<EditionInstallConfig[M]>
  ) => void;
}) {
  switch (method) {
    case "steam":
      return (
        <Field
          label="Steam app ID"
          value={config.steam?.appId ?? ""}
          onChange={(v) => patchConfig("steam", { appId: v })}
          placeholder="440"
        />
      );
    case "epic":
      return (
        <>
          <Field
            label="Epic product slug"
            value={config.epic?.productSlug ?? ""}
            onChange={(v) => patchConfig("epic", { productSlug: v })}
          />
          <Field
            label="Launch URL (optional)"
            value={config.epic?.launchUrl ?? ""}
            onChange={(v) => patchConfig("epic", { launchUrl: v })}
          />
        </>
      );
    case "gog":
      return (
        <Field
          label="GOG product URL"
          value={config.gog?.productUrl ?? ""}
          onChange={(v) => patchConfig("gog", { productUrl: v })}
        />
      );
    case "itch":
      return (
        <Field
          label="itch.io page URL"
          value={config.itch?.pageUrl ?? ""}
          onChange={(v) => patchConfig("itch", { pageUrl: v })}
        />
      );
    case "browser":
      return (
        <Field
          label="Play URL"
          value={config.browser?.playUrl ?? ""}
          onChange={(v) => patchConfig("browser", { playUrl: v })}
        />
      );
    case "official_download":
      return (
        <>
          <Field
            label="Download URL"
            value={config.official_download?.url ?? ""}
            onChange={(v) => patchConfig("official_download", { url: v })}
          />
          <div>
            <label className={label}>Download size (MB)</label>
            <SizeInput
              value={config.official_download?.sizeMB}
              onChange={(v) => patchConfig("official_download", { sizeMB: v })}
              className={field}
            />
          </div>
        </>
      );
    case "external_installer":
      return (
        <>
          <Field
            label="Installer URL"
            value={config.external_installer?.url ?? ""}
            onChange={(v) => patchConfig("external_installer", { url: v })}
          />
          <Field
            label="Instructions"
            value={config.external_installer?.instructions ?? ""}
            onChange={(v) => patchConfig("external_installer", { instructions: v })}
          />
        </>
      );
    case "mobile_store":
      return (
        <>
          <Field
            label="Google Play URL"
            value={config.mobile_store?.androidUrl ?? ""}
            onChange={(v) => patchConfig("mobile_store", { androidUrl: v })}
          />
          <Field
            label="App Store URL"
            value={config.mobile_store?.iosUrl ?? ""}
            onChange={(v) => patchConfig("mobile_store", { iosUrl: v })}
          />
        </>
      );
    case "playbound_installer":
      return (
        <>
          {/*
            The same list the game editor offers and the payload schema
            validates, so an edition cannot be given a kind the launcher has no
            branch for — which as free text produced an edition that looked
            configured and failed at install with nothing on screen to say why.
          */}
          <SelectField
            label="Recipe kind"
            value={config.playbound_installer?.kind ?? ""}
            onChange={(v) => patchConfig("playbound_installer", { kind: v })}
            options={LAUNCHER_INSTALL_KINDS}
            placeholder="Select how this installs…"
          />
          <Field
            label="GitHub repo"
            value={config.playbound_installer?.repo ?? ""}
            onChange={(v) => patchConfig("playbound_installer", { repo: v })}
            placeholder="owner/repo"
          />
          <Field
            label="Asset pattern"
            value={config.playbound_installer?.assetPattern ?? ""}
            onChange={(v) => patchConfig("playbound_installer", { assetPattern: v })}
          />
          <Field
            label="Direct URL"
            value={config.playbound_installer?.url ?? ""}
            onChange={(v) => patchConfig("playbound_installer", { url: v })}
          />
          {/*
            Not cosmetic. The launcher names the download from the URL, and an
            endpoint like /download/file/736 has no extension — so it falls back
            to <slug>.bin, and extraction dispatches on the extension. A direct
            recipe whose URL ends in an id needs this or the archive is never
            unpacked. It was only reachable through the raw JSON editor.
          */}
          <Field
            label="File name"
            value={config.playbound_installer?.fileName ?? ""}
            onChange={(v) => patchConfig("playbound_installer", { fileName: v })}
            placeholder="etlegacy-v2.85.0-x64.zip"
          />
          <Field
            label="Version label"
            value={config.playbound_installer?.versionLabel ?? ""}
            onChange={(v) => patchConfig("playbound_installer", { versionLabel: v })}
            placeholder="v2.85.0"
          />
          <Field
            label="Checksum (MD5)"
            value={config.playbound_installer?.checksumMd5 ?? ""}
            onChange={(v) => patchConfig("playbound_installer", { checksumMd5: v })}
            placeholder="Optional — verified after download"
          />
          <Field
            label="Executable hint"
            value={config.playbound_installer?.exeHint ?? ""}
            onChange={(v) => patchConfig("playbound_installer", { exeHint: v })}
          />
          {/*
            Editions carry their own install recipe, and the launcher reads
            needsAdmin from *this* config when a game installs through an
            edition — so the game-level flag does not cover it. Without this the
            box could only be ticked on the game, and an edition install would
            still spawn unelevated and be refused by Windows.
          */}
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              className="size-4"
              checked={Boolean(config.playbound_installer?.needsAdmin)}
              onChange={(e) =>
                patchConfig("playbound_installer", { needsAdmin: e.target.checked })
              }
            />
            Run as administrator
            <span className="text-xs font-normal text-muted-foreground">
              (loader needs elevation — players get a UAC prompt)
            </span>
          </label>
          <RecipeJsonField
            value={config.playbound_installer ?? {}}
            onChange={(next) => replaceConfig("playbound_installer", next)}
          />
        </>
      );
    case "manual":
      return (
        <ManualSteps
          steps={config.manual?.steps ?? []}
          onChange={(steps) => patchConfig("manual", { steps })}
        />
      );
    default:
      return null;
  }
}

/**
 * The whole playbound_installer recipe as editable JSON.
 *
 * The fields above cover the common recipe keys, but not every one — the mod
 * loader file list, install roots, connect args and add-ons have no field, so
 * editing them meant running a script against the database. This is the escape
 * hatch for those, and for any key added later before it gets a control.
 *
 * Local draft state so a half-typed object does not blow away the form on every
 * keystroke; the parent is only updated once the text parses to an object.
 */
function RecipeJsonField({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}) {
  const [draft, setDraft] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Re-sync when the fields above change the recipe, but never mid-edit.
  const serialized = JSON.stringify(value, null, 2);
  const lastExternal = useRef(serialized);
  useEffect(() => {
    if (serialized !== lastExternal.current) {
      lastExternal.current = serialized;
      if (!error) setDraft(serialized);
    }
  }, [serialized, error]);

  function apply(text: string) {
    setDraft(text);
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setError("Recipe must be a JSON object.");
        return;
      }
      setError(null);
      lastExternal.current = JSON.stringify(parsed, null, 2);
      onChange(parsed as Record<string, unknown>);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON");
    }
  }

  return (
    <div className="sm:col-span-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        {open ? "Hide" : "Edit"} full recipe JSON
      </button>
      {open ? (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            Everything the fields above cannot reach — mod loader files, install roots, connect
            args. Saves with the form.
          </p>
          <textarea
            rows={14}
            spellCheck={false}
            value={draft}
            onChange={(e) => apply(e.target.value)}
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
          />
          {error ? (
            <p className="mt-1 text-xs text-destructive">{error} — not saved until valid.</p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">Valid JSON.</p>
          )}
        </>
      ) : null}
    </div>
  );
}

/**
 * A closed set of values, chosen rather than typed.
 *
 * An unrecognised stored value is kept as an option so opening an edition that
 * predates this list cannot silently rewrite its kind to something else just by
 * rendering the form.
 */
function SelectField({
  label: text,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder?: string;
}) {
  const known = options.includes(value);
  return (
    <div>
      <label className={label}>{text}</label>
      <PremiumSelect
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={field}
      >
        <option value="">{placeholder ?? "—"}</option>
        {/*
          A stored value outside the list is kept as an option rather than
          dropped, so opening an old edition cannot silently rewrite its kind
          to something else just by rendering the form.
        */}
        {!known && value ? <option value={value}>{value} (unrecognised)</option> : null}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </PremiumSelect>
    </div>
  );
}

function Field({
  label: text,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className={label}>{text}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={field}
        placeholder={placeholder}
      />
    </div>
  );
}

function ManualSteps({
  steps,
  onChange,
}: {
  steps: NonNullable<EditionInstallConfig["manual"]>["steps"];
  onChange: (steps: NonNullable<NonNullable<EditionInstallConfig["manual"]>["steps"]>) => void;
}) {
  const list = steps ?? [];
  return (
    <div>
      <label className={label}>Install steps</label>
      <div className="mt-2 space-y-2">
        {list.map((step, i) => (
          <div key={i} className="flex items-start gap-2 rounded-lg border border-border p-2">
            <span className="mt-2 w-4 shrink-0 text-center text-xs font-bold text-muted-foreground">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <input
                value={step.text}
                onChange={(e) => {
                  const next = [...list];
                  next[i] = { ...step, text: e.target.value };
                  onChange(next);
                }}
                className={`${field} mt-0`}
                placeholder="What the reader should do"
              />
              <input
                value={step.command ?? ""}
                onChange={(e) => {
                  const next = [...list];
                  next[i] = { ...step, command: e.target.value || null };
                  onChange(next);
                }}
                className={`${field} mt-0 font-mono text-xs`}
                placeholder="Optional command"
              />
            </div>
            <PremiumSelect
              value={step.platform ?? "all"}
              onChange={(e) => {
                const next = [...list];
                next[i] = { ...step, platform: e.target.value };
                onChange(next);
              }}
              className={`${field} mt-0 !w-28 shrink-0`}
            >
              <option value="all">All</option>
              <option value="windows">Windows</option>
              <option value="macos">macOS</option>
              <option value="linux">Linux</option>
            </PremiumSelect>
            <button
              type="button"
              onClick={() => onChange(list.filter((_, x) => x !== i))}
              className="mt-1.5 shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label={`Remove step ${i + 1}`}
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...list, { platform: "all", text: "", command: null }])}
        className="mt-2 inline-flex items-center gap-1 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-bold"
      >
        <Plus className="size-3" /> Add step
      </button>
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
