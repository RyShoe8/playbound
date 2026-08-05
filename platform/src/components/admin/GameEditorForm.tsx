"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import {
  FEATURES,
  GENRES,
  LAUNCH_METHODS,
  LAUNCHER_KINDS,
  PLATFORMS,
  TAGS,
  defaultArtFor,
  slugifyTitle,
  toPayloadLauncherInstall,

  patchCommunityLinks,
  type GamePayload,
} from "@/lib/gamePayload";
import {
  defaultLauncherInstallForWebsite,
  disableServerSupportFields,
  enableInstallerSupportFields,
  enableServerSupportFields,
  isPcInstallCandidate,
} from "@/lib/launcherInstall";
import type { LauncherInstallKind } from "@/lib/launcherInstall";
import { editorialReadiness, ensureDerivedGameFields } from "@/lib/enrich";
import type { QualityBar } from "@/lib/data/types";
import { CATALOG_STATUSES, type CatalogStatus, normalizeStatus } from "@/lib/catalogStatus";
import { classifyMediaUrl } from "@/lib/mediaEmbed";
import {
  coverLooksLikeSteamHeader,
  screenshotsAreThin,
} from "@/lib/mediaThin";
import { HlsVideo } from "@/components/HlsVideo";
import {
  DerivedContentEditor,
  EvidencePanel,
  ProseField,
  QualityBarEditor,
  ReadinessPanel,
  SourceMaterialPanel,
  StringListEditor,
} from "@/components/admin/EditorialFields";
import { AdminCollapsibleSection } from "@/components/admin/AdminCollapsibleSection";

/** Games with a live PlayBound server list provider (keep in sync with registry). */
const WIRED_SERVER_PROVIDERS = new Set([
  "openra",
  "luanti",
  "openttd",
  "veloren",
  "beyond-all-reason",
  "supertuxkart",
  "xonotic",
  "unvanquished",
  "mindustry",
  "hedgewars",
  "battle-for-wesnoth",
  "warzone-2100",
  "zero-k",
  "0ad",
]);

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

function isUsableVideoUrl(src: string): boolean {
  try {
    const u = new URL(src);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const kind = classifyMediaUrl(src).kind;
    if (kind === "youtube" || kind === "vimeo") return true;
    // Direct: accept video extensions or any https (Steam CDN trails often omit extensions).
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
  const videoFileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<GamePayload>(initial);
  const [importUrl, setImportUrl] = useState(mode === "create" ? "" : initial.website || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [mediaNote, setMediaNote] = useState("");
  const [videoUrlDraft, setVideoUrlDraft] = useState("");
  const [forcePublishNext, setForcePublishNext] = useState(false);
  const [captureAvailable, setCaptureAvailable] = useState(false);
  const [uploadKind, setUploadKind] = useState<"cover" | "shot">("shot");
  const [launcherDiscoverNote, setLauncherDiscoverNote] = useState("");
  const [evidence, setEvidence] = useState<string[]>([]);
  const [sourceMaterial, setSourceMaterial] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{ bestFor: string[]; notFor: string[] }>({
    bestFor: [],
    notFor: [],
  });

  // Mirrors the server-side publish gate so nothing is a surprise on save.
  // Must apply the same derivation first — the server fills install steps and
  // the FAQ before checking readiness, so evaluating the raw form here would
  // report them missing and wrongly disable the Published toggle.
  const readiness = useMemo(() => editorialReadiness(ensureDerivedGameFields(form)), [form]);

  const genreSet = useMemo(() => new Set(form.genres), [form.genres]);
  const launchSet = useMemo(() => new Set(form.launchMethods), [form.launchMethods]);
  const platformSet = useMemo(() => new Set(form.platforms), [form.platforms]);
  const featureSet = useMemo(() => new Set(form.features), [form.features]);
  const tagSet = useMemo(() => new Set(form.tags), [form.tags]);
  const extraTags = form.tags.filter((t) => !(TAGS as readonly string[]).includes(t));
  const onPlayboundLauncher =
    isPcInstallCandidate(form) &&
    Boolean(form.launcherInstall?.kind) &&
    form.launcherInstall?.enabled !== false;

  function patchLauncher(partial: Partial<NonNullable<GamePayload["launcherInstall"]>>) {
    setForm((prev) => {
      const base =
        prev.launcherInstall ??
        toPayloadLauncherInstall(defaultLauncherInstallForWebsite(prev.website || "https://example.com"))!;
      return {
        ...prev,
        launcherInstall: toPayloadLauncherInstall({ ...base, ...partial }),
      };
    });
  }

  async function addToPlayboundLauncher() {
    setBusy(true);
    setError("");
    setLauncherDiscoverNote("");
    const base = enableInstallerSupportFields(form);
    let recipe = toPayloadLauncherInstall(base.launcherInstall);
    let note = "Opening official site via the launcher.";

    try {
      const res = await fetch("/api/admin/games/discover-install", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          website: form.website,
          steamAppId: form.steamAppId,
          githubRepo: form.githubRepo,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.recipe?.kind) {
        recipe = toPayloadLauncherInstall(data.recipe);
        if (data.source === "direct") note = "Found installer download — PlayBound will fetch and run it.";
        else if (data.source === "steam") note = "Using Steam install link — opens Steam to install.";
        else note = "No public installer found — opens the official site via the launcher.";
      } else if (form.steamAppId) {
        recipe = toPayloadLauncherInstall({
          enabled: true,
          kind: "external",
          url: `steam://install/${form.steamAppId}`,
          note: "Opens Steam to install this game",
        });
        note = "Using Steam install link — opens Steam to install.";
      }
    } catch {
      if (form.steamAppId) {
        recipe = toPayloadLauncherInstall({
          enabled: true,
          kind: "external",
          url: `steam://install/${form.steamAppId}`,
          note: "Opens Steam to install this game",
        });
        note = "Using Steam install link — opens Steam to install.";
      }
    }

    setForm((prev) => ({
      ...prev,
      ...base,
      launcherInstall: recipe,
    }));
    setLauncherDiscoverNote(note);
    setBusy(false);
  }

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
    setWarning("");
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
        // Prefill never arms launcher — admin uses Add to PlayBound Launcher.
        launcherInstall: null,
        // Never clobber prose the editor has already written.
        longDescription: prev.longDescription || draft.longDescription,
        whyWePickedIt: prev.whyWePickedIt || draft.whyWePickedIt,
        bestFor: prev.bestFor?.length ? prev.bestFor : (draft.bestFor ?? []),
        notFor: prev.notFor?.length ? prev.notFor : (draft.notFor ?? []),
      }));
      setEvidence((data.evidence as string[]) ?? []);
      setSourceMaterial((data.sourceMaterial as string | null) ?? null);
      setSuggestions(
        (data.suggestions as { bestFor: string[]; notFor: string[] }) ?? {
          bestFor: [],
          notFor: [],
        }
      );
      setWarning(typeof data.warning === "string" ? data.warning : "");
      setLauncherDiscoverNote("");
      setBusy(false);
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  async function fetchMedia() {
    const url = form.website || importUrl;
    const steamAppId = form.steamAppId?.trim() || null;
    if (!url.trim() && !steamAppId && !(form.screenshots?.length)) {
      setError("Set a website URL or Steam app id first.");
      return;
    }
    setBusy(true);
    setError("");
    setMediaNote("");
    try {
      const existingShots = [...(form.screenshots ?? [])].filter(Boolean);
      const existingVideos = [...(form.videos ?? [])].filter(Boolean);
      const hadCover = Boolean(form.coverImage);
      const res = await fetch("/api/admin/games/media", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: url.trim() || null,
          steamAppId,
          slug: form.slug || "upload",
          coverImage: form.coverImage,
          screenshots: form.screenshots ?? [],
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // Non-fatal when we already have media — don't wipe.
        const msg = data?.error ?? "Media fetch failed";
        if (existingShots.length || existingVideos.length || form.coverImage) {
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
      const thin = screenshotsAreThin(existingShots);
      const unionShots = [...new Set([...existingShots, ...incomingShots])].slice(0, 20);
      let nextShots =
        thin && incomingShots.length > existingShots.length
          ? incomingShots.slice(0, 20)
          : unionShots;
      if (nextShots.length < existingShots.length) {
        nextShots = unionShots;
      }

      const nextVideos = [...new Set([...existingVideos, ...incomingVideos])].slice(0, 10);
      const replaceCover =
        (!form.coverImage || coverLooksLikeSteamHeader(form.coverImage) || thin) &&
        Boolean(data.coverImage);
      const nextCover = replaceCover
        ? (data.coverImage as string) || form.coverImage || null
        : form.coverImage || (data.coverImage as string) || null;
      const inferredSteam =
        typeof data.steamAppId === "string" && /^\d+$/.test(data.steamAppId)
          ? data.steamAppId
          : null;

      const addedShots = Math.max(0, nextShots.length - existingShots.length);
      const addedVideos = Math.max(0, nextVideos.length - existingVideos.length);
      const stats = data.stats as { fetched?: number; rehosted?: number; keptRemote?: number } | undefined;

      if (
        addedShots === 0 &&
        addedVideos === 0 &&
        nextCover === form.coverImage &&
        !(stats?.fetched)
      ) {
        setMediaNote("No new media found from website or Steam. Existing media kept.");
      } else {
        const steamBit = inferredSteam && !steamAppId ? `steam id ${inferredSteam}, ` : "";
        const coverBit =
          (!hadCover || replaceCover) && nextCover && nextCover !== form.coverImage
            ? "updated cover, "
            : "";
        const rehostBit =
          stats && (stats.rehosted || stats.keptRemote)
            ? `rehosted ${stats.rehosted ?? 0}, kept remote ${stats.keptRemote ?? 0}. `
            : "";
        const trailerBit =
          addedVideos === 0 ? " No trailers found — paste a YouTube URL if you have one." : "";
        setMediaNote(
          `Refresh done — ${steamBit}${coverBit}added ${addedShots} screenshot${
            addedShots === 1 ? "" : "s"
          }, ${addedVideos} video${addedVideos === 1 ? "" : "s"}. ${rehostBit}Save to persist.${trailerBit}`
        );
      }

      setForm((prev) => ({
        ...prev,
        coverImage: nextCover,
        screenshots: nextShots,
        videos: nextVideos,
        steamAppId: prev.steamAppId || inferredSteam,
      }));
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
    if ((form.videos ?? []).includes(raw)) {
      setError("That video URL is already listed.");
      return;
    }
    if ((form.videos?.length ?? 0) >= 10) {
      setError("Maximum of 10 videos.");
      return;
    }
    setError("");
    patch("videos", [...(form.videos ?? []), raw]);
    setVideoUrlDraft("");
  }

  async function onVideoFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if ((form.videos?.length ?? 0) >= 10) {
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
      const slug = (form.slug || "upload").replace(/[^a-z0-9-]/gi, "-").slice(0, 80);
      const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
      const pathname = `games/${slug || "upload"}/video-${Date.now()}.${ext}`;
      const blob = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/admin/games/upload/client",
      });
      setForm((prev) => ({
        ...prev,
        videos: [...(prev.videos ?? []), blob.url].slice(0, 10),
      }));
      setMediaNote("Video uploaded — save the game to persist.");
      setBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Video upload failed");
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

  async function save(e?: React.FormEvent, opts?: { forcePublish?: boolean; status?: CatalogStatus }) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    const force = Boolean(opts?.forcePublish || forcePublishNext);
    const status = opts?.status ?? normalizeStatus(form);
    const payload: GamePayload = {
      ...form,
      status,
      published: status === "published",
      githubRepo: form.githubRepo || null,
      coverImage: form.coverImage || null,
      art: form.art ?? defaultArtFor(form.genres, form.slug),
    };
    if (status !== normalizeStatus(form)) {
      setForm((prev) => ({ ...prev, status, published: status === "published" }));
    }
    try {
      const res = await fetch(mode === "create" ? "/api/admin/games" : `/api/admin/games/${initial.slug}`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(force ? { ...payload, forcePublish: true } : payload),
      });
      const data = await res.json().catch(() => null);
      setForcePublishNext(false);
      if (!res.ok) {
        setError(data?.error ?? "Save failed");
        setBusy(false);
        return;
      }
      router.push("/admin/games");
      router.refresh();
    } catch {
      setForcePublishNext(false);
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  function forcePublish() {
    const missing = readiness.missing.length
      ? readiness.missing.join(", ")
      : "editorial readiness fields";
    if (
      !confirm(
        `Force publish anyway?\n\nStill missing: ${missing}\n\nThis skips the editorial quality gate for this save.`
      )
    ) {
      return;
    }
    setForcePublishNext(true);
    void save(undefined, { forcePublish: true, status: "published" });
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
        {warning && (
          <p className="mt-2 text-sm text-amber-500" role="status">
            {warning}
          </p>
        )}
      </div>

      <form onSubmit={save} className="space-y-4">
        <AdminCollapsibleSection title="Basics" defaultOpen>
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
              onChange={(e) =>
                patch(
                  "slug",
                  // Keep it URL-safe as you type; the server validates too.
                  e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-")
                )
              }
              className={field}
              aria-describedby={mode === "edit" ? "slug-rename-warning" : undefined}
            />
            {mode === "edit" && form.slug !== initial.slug && (
              <p id="slug-rename-warning" className="mt-1 text-[11px] text-amber-500">
                Renaming moves this game to /games/{form.slug || "…"}. Reviews,
                guides, discussions, mods, events and users&apos; libraries are
                repointed automatically, and {initial.slug} will redirect here.
                Any mention in src/lib/data (collections, comparisons,
                alternatives) still needs updating by hand.
              </p>
            )}
          </div>
        </div>

        <div>
          <label className={label}>Tagline</label>
          <input required value={form.tagline} onChange={(e) => patch("tagline", e.target.value)} className={field} />
        </div>

        <div>
          <label className={label}>Description</label>
          <p className="text-[11px] text-muted-foreground">
            Short summary for cards and meta descriptions. Scraped copy is fine here —
            the long description below is the one that has to be original.
          </p>
          <textarea
            required
            rows={4}
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
              {/* Without a blank option, a game whose developerSlug matches
                  nothing in the list renders as the first entry while the
                  stored value is something else — the credit looks wrong and
                  touching the dropdown would silently overwrite it. */}
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
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Missing one?{" "}
              <a href="/admin/developers/new" className="text-primary hover:underline">
                Add a developer
              </a>
              .
            </p>
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
          <div>
            <label className={label}>Android store / download URL</label>
            <input
              type="url"
              value={form.androidStoreUrl ?? ""}
              onChange={(e) => patch("androidStoreUrl", e.target.value || null)}
              placeholder="https://play.google.com/store/apps/details?id=…"
              className={field}
            />
          </div>
          <div>
            <label className={label}>iOS App Store URL</label>
            <input
              type="url"
              value={form.iosStoreUrl ?? ""}
              onChange={(e) => patch("iosStoreUrl", e.target.value || null)}
              placeholder="https://apps.apple.com/app/…"
              className={field}
            />
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

        <div>
          <label className={label}>Steam app ID</label>
          <input
            value={form.steamAppId ?? ""}
            onChange={(e) => patch("steamAppId", e.target.value.replace(/\D/g, "").slice(0, 20) || null)}
            placeholder="480 — optional, for Steam media"
            className={field}
          />
        </div>
        </AdminCollapsibleSection>

        <AdminCollapsibleSection title="Cover & media" defaultOpen>
          <div>
            <p className="text-[11px] text-muted-foreground">
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
              Refresh media
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
            <button
              type="button"
              disabled={busy}
              onClick={() => videoFileRef.current?.click()}
              className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-60"
            >
              Upload video
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileSelected} />
            <input
              ref={videoFileRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              className="hidden"
              onChange={onVideoFileSelected}
            />
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
            {(form.videos?.length ?? 0) > 0 ? (
              <div className="mt-3 flex flex-col gap-4">
                {form.videos!.map((src) => (
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
                          patch(
                            "videos",
                            (form.videos ?? []).filter((s) => s !== src)
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">No videos yet — add a URL or upload one.</p>
            )}
          </div>
          {mediaNote && <p className="text-xs text-muted-foreground" role="status">{mediaNote}</p>}
        </AdminCollapsibleSection>

        <AdminCollapsibleSection
          title="Editorial — required to publish"
          badge={
            !readiness.ready ? (
              <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                {readiness.missing.length} missing
              </span>
            ) : undefined
          }
        >
          <ReadinessPanel fields={readiness.fields} ready={readiness.ready} kind="game" />

          {evidence.length > 0 && <EvidencePanel evidence={evidence} />}

          {sourceMaterial && (
            <SourceMaterialPanel
              text={sourceMaterial}
              onDismiss={() => setSourceMaterial(null)}
            />
          )}

          <QualityBarEditor
            value={form.qualityBar ?? null}
            onChange={(next: QualityBar) => patch("qualityBar", next)}
          />

          <ProseField
            title="Long description"
            hint="400–600 words of original editorial. This replaces the scraped summary on the public page — do not paste store or README copy, it is duplicate content and will not rank. Blank line between paragraphs."
            value={form.longDescription ?? ""}
            minWords={150}
            rows={14}
            onChange={(v) => patch("longDescription", v)}
          />

          <ProseField
            title="Why we picked it"
            hint="~100 words in your own voice. The curation rationale — this is what separates PlayBound from a directory listing."
            value={form.whyWePickedIt ?? ""}
            minWords={20}
            rows={5}
            onChange={(v) => patch("whyWePickedIt", v)}
          />

          <StringListEditor
            title="Best for"
            hint={
              'Concrete situations you’d recommend this game for — e.g. "LAN parties" ' +
              'or "people who miss Command & Conquer." Specific enough that a reader ' +
              'pictures themselves in it, not a genre label. At least two.'
            }
            values={form.bestFor ?? []}
            suggestions={suggestions.bestFor}
            onChange={(next) => patch("bestFor", next)}
          />

          <StringListEditor
            title="Not for"
            hint={
              'Honest limitations — e.g. "players who want ranked matchmaking" or ' +
              '"anyone without a decent GPU." At least two. This is the strongest trust ' +
              'signal on the page — nobody else in this niche publishes it, so resist ' +
              "softening them into a Best For in disguise."
            }
            values={form.notFor ?? []}
            suggestions={suggestions.notFor}
            onChange={(next) => patch("notFor", next)}
          />

          <StringListEditor
            title="Comparable to"
            hint={
              "Commercial (paid) games this resembles, not other free ones — e.g. a free " +
              "RTS might list Command & Conquer or StarCraft. Powers the /alternatives " +
              "pages, which exist to catch searches for a paid game's name from people " +
              "looking for a free substitute."
            }
            values={form.comparableTo ?? []}
            onChange={(next) => patch("comparableTo", next)}
          />

          <DerivedContentEditor
            installSteps={form.installSteps ?? []}
            faq={form.faq ?? []}
            onInstallStepsChange={(next) => patch("installSteps", next)}
            onFaqChange={(next) => patch("faq", next)}
          />
        </AdminCollapsibleSection>

        <AdminCollapsibleSection title="Taxonomy">
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

          <div>
            <label className={label}>Search aliases</label>
            <textarea
              rows={2}
              value={(form.aliases ?? []).join("\n")}
              onChange={(e) =>
                patch(
                  "aliases",
                  e.target.value
                    .split(/[\n,]/)
                    .map((s) => s.trim())
                    .filter(Boolean)
                )
              }
              className={`${field} h-auto py-2`}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Shorthand people search by — &ldquo;WoW&rdquo;, &ldquo;C&amp;C&rdquo;. Never displayed,
              only matched. One per line.
            </p>
          </div>
        </AdminCollapsibleSection>

        <AdminCollapsibleSection title="Community">
          <div>
            <p className="text-[11px] text-muted-foreground">
              Official Discord must be verified against the developer&apos;s site or repo. PlayBound
              channel fields are filled manually until the Discord bot provisions them.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Official Discord invite URL</label>
              <input
                value={form.communityLinks?.officialDiscord?.inviteUrl ?? ""}
                onChange={(e) =>
                  patch(
                    "communityLinks",
                    patchCommunityLinks(form.communityLinks, {
                      officialDiscord: { inviteUrl: e.target.value || null },
                    })
                  )
                }
                placeholder="https://discord.gg/…"
                className={field}
              />
            </div>
            <div>
              <label className={label}>Verification source URL</label>
              <input
                value={form.communityLinks?.officialDiscord?.verifiedSourceUrl ?? ""}
                onChange={(e) =>
                  patch(
                    "communityLinks",
                    patchCommunityLinks(form.communityLinks, {
                      officialDiscord: { verifiedSourceUrl: e.target.value || null },
                    })
                  )
                }
                placeholder="https://… official site linking this Discord"
                className={field}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(form.communityLinks?.officialDiscord?.verified)}
              onChange={(e) =>
                patch(
                  "communityLinks",
                  patchCommunityLinks(form.communityLinks, {
                    officialDiscord: {
                      verified: e.target.checked,
                      verifiedAt: e.target.checked ? new Date().toISOString() : null,
                    },
                  })
                )
              }
            />
            Official Discord verified
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>PlayBound channel name</label>
              <input
                value={form.communityLinks?.playboundDiscord?.channelName ?? ""}
                onChange={(e) =>
                  patch(
                    "communityLinks",
                    patchCommunityLinks(form.communityLinks, {
                      playboundDiscord: { channelName: e.target.value || null },
                    })
                  )
                }
                placeholder="openra"
                className={field}
              />
            </div>
            <div>
              <label className={label}>PlayBound invite URL</label>
              <input
                value={form.communityLinks?.playboundDiscord?.inviteUrl ?? ""}
                onChange={(e) =>
                  patch(
                    "communityLinks",
                    patchCommunityLinks(form.communityLinks, {
                      playboundDiscord: { inviteUrl: e.target.value || null },
                    })
                  )
                }
                placeholder="https://discord.gg/…"
                className={field}
              />
            </div>
            <div>
              <label className={label}>Channel ID</label>
              <input
                value={form.communityLinks?.playboundDiscord?.channelId ?? ""}
                onChange={(e) =>
                  patch(
                    "communityLinks",
                    patchCommunityLinks(form.communityLinks, {
                      playboundDiscord: { channelId: e.target.value || null },
                    })
                  )
                }
                className={field}
              />
            </div>
            <div>
              <label className={label}>Guild ID</label>
              <input
                value={form.communityLinks?.playboundDiscord?.guildId ?? ""}
                onChange={(e) =>
                  patch(
                    "communityLinks",
                    patchCommunityLinks(form.communityLinks, {
                      playboundDiscord: { guildId: e.target.value || null },
                    })
                  )
                }
                className={field}
              />
            </div>
          </div>
          {mode === "edit" && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const res = await fetch(`/api/admin/games/${initial.slug}/provision-discord`, {
                    method: "POST",
                  });
                  const data = await res.json().catch(() => null);
                  if (!res.ok) {
                    setError(data?.error ?? "Provision failed");
                  } else if (data?.playboundDiscord) {
                    patch(
                      "communityLinks",
                      patchCommunityLinks(form.communityLinks, {
                        playboundDiscord: {
                          guildId: data.playboundDiscord.guildId ?? null,
                          channelId: data.playboundDiscord.channelId ?? null,
                          channelName: data.playboundDiscord.channelName ?? null,
                          inviteCode: data.playboundDiscord.inviteCode ?? null,
                          inviteUrl: data.playboundDiscord.inviteUrl ?? null,
                          provisionedAt: data.playboundDiscord.provisionedAt
                            ? String(data.playboundDiscord.provisionedAt)
                            : new Date().toISOString(),
                        },
                      })
                    );
                  }
                } catch {
                  setError("Couldn't reach the Discord bot webhook.");
                }
                setBusy(false);
              }}
              className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-60"
            >
              Provision PlayBound Channel
            </button>
          )}
        </AdminCollapsibleSection>

        <AdminCollapsibleSection title="System & servers">
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

        <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
          <p className="text-sm font-bold">Dedicated servers</p>
          <p className="text-[11px] text-muted-foreground">
            Turns on the Servers tab and multiplayer listing APIs for this game (
            <code className="text-[10px]">launchMethods: server</code>).
          </p>
          {launchSet.has("server") ? (
            <>
              <p className="rounded-lg border border-border bg-secondary/60 px-3 py-2 text-xs font-semibold">
                Dedicated servers enabled
                {!WIRED_SERVER_PROVIDERS.has(form.slug)
                  ? " — live listings aren't wired for this slug yet."
                  : " — live listings are available when a provider is online."}
              </p>
              {(form.slug === "zero-k" || form.slug === "0ad" || form.slug === "battle-for-wesnoth") && (
                <div className="space-y-3 rounded-lg border border-border bg-background/40 p-3">
                  <p className="text-xs font-bold">
                    {form.slug === "zero-k"
                      ? "Zero-K lobby login"
                      : form.slug === "0ad"
                        ? "0 A.D. lobby login"
                        : "Wesnoth lobby login"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {form.slug === "zero-k"
                      ? "Optional. Without this, listings show lobby presence only. Password must be the Chobby PasswordHash (not the plain account password)."
                      : form.slug === "0ad"
                        ? "Optional. Without this, listings show a lobby pointer only. Enter your Wildfire Games lobby username (or JID) and the same plain password as the game client — the adapter hashes it like official EncryptPassword. A 64-char hex value from user.cfg lobby.password also works."
                        : "Optional. Without this, listings may show only a lobby pointer. Enter your Wesnoth forums / multiplayer nick and the same plain password as the game client (sent over TLS to wesnothd)."}
                  </p>
                  <div>
                    <label className={label}>
                      {form.slug === "zero-k"
                        ? "Lobby username"
                        : form.slug === "0ad"
                          ? "Lobby username / JID"
                          : "Lobby username"}
                    </label>
                    <input
                      type="text"
                      autoComplete="off"
                      value={form.serverLobbyAuth?.username ?? ""}
                      onChange={(e) =>
                        patch("serverLobbyAuth", {
                          username: e.target.value,
                          password: form.serverLobbyAuth?.password ?? "",
                        })
                      }
                      className={field}
                      placeholder={
                        form.slug === "0ad"
                          ? "player or player@lobby…"
                          : form.slug === "battle-for-wesnoth"
                            ? "forum nick"
                            : "username"
                      }
                    />
                  </div>
                  <div>
                    <label className={label}>
                      {form.slug === "zero-k" ? "Lobby password hash" : "Lobby password"}
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={form.serverLobbyAuth?.password ?? ""}
                      onChange={(e) =>
                        patch("serverLobbyAuth", {
                          username: form.serverLobbyAuth?.username ?? "",
                          password: e.target.value,
                        })
                      }
                      className={field}
                    />
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  const next = disableServerSupportFields(form);
                  setForm((prev) => ({ ...prev, launchMethods: next.launchMethods }));
                }}
                className="rounded-full border border-border bg-secondary px-4 py-2 text-xs font-bold"
              >
                Disable dedicated servers
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                const next = enableServerSupportFields(form);
                setForm((prev) => ({
                  ...prev,
                  launchMethods: next.launchMethods,
                  features: next.features,
                }));
              }}
              className="rounded-full bg-foreground px-4 py-2 text-xs font-bold text-background"
            >
              Enable dedicated servers
            </button>
          )}
        </div>
        </AdminCollapsibleSection>

        <AdminCollapsibleSection title="Launcher">
          <p className="text-sm font-bold">Launcher install (Windows)</p>
          {onPlayboundLauncher ? (
            <>
              <p className="rounded-lg border border-border bg-secondary/60 px-3 py-2 text-xs font-semibold">
                On PlayBound Launcher — save the game to publish it to the desktop catalog.
              </p>
              {launcherDiscoverNote ? (
                <p className="text-[11px] text-muted-foreground">{launcherDiscoverNote}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Recipe is set. Customize below only if you need a different download or GitHub release.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground">
                One click looks for a public installer, then falls back to Steam (if known) or the
                website. No other fields required.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={addToPlayboundLauncher}
                className="rounded-full bg-foreground px-4 py-2 text-xs font-bold text-background disabled:opacity-60"
              >
                {busy ? "Discovering install…" : "Add to PlayBound Launcher"}
              </button>
            </>
          )}
          {onPlayboundLauncher && (
            <details className="rounded-lg border border-border bg-background/40 p-3">
              <summary className="cursor-pointer text-xs font-bold">Customize install recipe</summary>
              <div className="mt-3 space-y-3">
                <label className="flex items-center gap-2 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={form.launcherInstall?.enabled !== false}
                    onChange={(e) => patchLauncher({ enabled: e.target.checked })}
                  />
                  Enabled
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={label}>Install kind</label>
                    <select
                      value={form.launcherInstall?.kind ?? "external"}
                      onChange={(e) =>
                        patchLauncher({ kind: e.target.value as LauncherInstallKind })
                      }
                      className={field}
                    >
                      {LAUNCHER_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={label}>Note (optional)</label>
                    <input
                      value={form.launcherInstall?.note ?? ""}
                      onChange={(e) => patchLauncher({ note: e.target.value || null })}
                      className={field}
                    />
                  </div>
                </div>
                {(form.launcherInstall?.kind === "github-zip" ||
                  form.launcherInstall?.kind === "github-installer" ||
                  form.launcherInstall?.kind === "github-jar") && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className={label}>GitHub repo (owner/repo)</label>
                      <input
                        value={form.launcherInstall?.repo ?? form.githubRepo ?? ""}
                        onChange={(e) => patchLauncher({ repo: e.target.value || null })}
                        placeholder={form.githubRepo || "owner/repo"}
                        className={field}
                      />
                    </div>
                    <div>
                      <label className={label}>Asset pattern (regex)</label>
                      <input
                        value={form.launcherInstall?.assetPattern ?? ""}
                        onChange={(e) => patchLauncher({ assetPattern: e.target.value || null })}
                        placeholder="win64.*\\.zip$"
                        className={field}
                      />
                    </div>
                  </div>
                )}
                {(form.launcherInstall?.kind === "direct-zip" ||
                  form.launcherInstall?.kind === "direct-installer" ||
                  form.launcherInstall?.kind === "direct-exe" ||
                  form.launcherInstall?.kind === "external") && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className={label}>Download URL</label>
                      <input
                        value={form.launcherInstall?.url ?? ""}
                        onChange={(e) => patchLauncher({ url: e.target.value || null })}
                        className={field}
                      />
                    </div>
                    <div>
                      <label className={label}>File name (optional)</label>
                      <input
                        value={form.launcherInstall?.fileName ?? ""}
                        onChange={(e) => patchLauncher({ fileName: e.target.value || null })}
                        placeholder="setup.exe"
                        className={field}
                      />
                    </div>
                    <div>
                      <label className={label}>Version label</label>
                      <input
                        value={form.launcherInstall?.versionLabel ?? ""}
                        onChange={(e) => patchLauncher({ versionLabel: e.target.value || null })}
                        placeholder="1.2.3"
                        className={field}
                      />
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.launcherInstall?.autoUpdatePinned !== false}
                      onChange={(e) => patchLauncher({ autoUpdatePinned: e.target.checked })}
                    />
                    Auto-update pinned download URLs (daily cron)
                  </label>
                  {form.launcherInstall?.detectedVersion ? (
                    <span className="text-xs text-muted-foreground">
                      Detected: {form.launcherInstall.detectedVersion}
                      {form.launcherInstall.versionCheckStatus
                        ? ` (${form.launcherInstall.versionCheckStatus})`
                        : ""}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-bold"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const res = await fetch(`/api/admin/games/${form.slug}/check-version`, {
                          method: "POST",
                        });
                        const data = await res.json().catch(() => null);
                        if (!res.ok) {
                          setError(data?.error || "Version check failed");
                        } else if (data?.result) {
                          patchLauncher({
                            detectedVersion: data.result.detectedVersion,
                            versionCheckStatus: data.result.status,
                            versionCheckNote: data.result.note || null,
                            ...(data.applied?.url ? { url: data.applied.url } : {}),
                            ...(data.applied?.versionLabel
                              ? { versionLabel: data.applied.versionLabel }
                              : {}),
                            ...(data.applied?.fileName ? { fileName: data.applied.fileName } : {}),
                          });
                        }
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Check version now
                  </button>
                </div>
                {(form.launcherInstall?.kind === "github-zip" ||
                  form.launcherInstall?.kind === "direct-zip" ||
                  form.launcherInstall?.kind === "openttd-zip") && (
                  <div>
                    <label className={label}>Exe hint (optional regex)</label>
                    <input
                      value={form.launcherInstall?.exeHint ?? ""}
                      onChange={(e) => patchLauncher({ exeHint: e.target.value || null })}
                      className={field}
                    />
                  </div>
                )}
                <div>
                  <label className={label}>Known exe paths (one per line, optional)</label>
                  <textarea
                    value={(form.launcherInstall?.knownExePaths ?? []).join("\n")}
                    onChange={(e) =>
                      patchLauncher({
                        knownExePaths: e.target.value
                          .split("\n")
                          .map((l) => l.trim())
                          .filter(Boolean),
                      })
                    }
                    rows={3}
                    className={area}
                    placeholder="%LOCALAPPDATA%\Programs\MyGame\game.exe"
                  />
                </div>
                <div>
                  <label className={label}>Connect args (one per line, optional)</label>
                  <textarea
                    value={(form.launcherInstall?.connectArgs ?? []).join("\n")}
                    onChange={(e) =>
                      patchLauncher({
                        connectArgs: e.target.value
                          .split("\n")
                          .map((l) => l.trim())
                          .filter(Boolean),
                      })
                    }
                    rows={2}
                    className={area}
                    placeholder="+connect {host}:{port}"
                  />
                </div>
              </div>
            </details>
          )}
        </AdminCollapsibleSection>

        <AdminCollapsibleSection title="Publishing">
          <div className="flex flex-wrap items-center gap-4 text-sm">
          <fieldset className="flex flex-wrap items-center gap-3">
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
                    name="catalog-status"
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
            {!readiness.ready && (
              <span className="text-[11px] font-normal text-muted-foreground">
                ({readiness.missing.length} field
                {readiness.missing.length === 1 ? "" : "s"} missing for Published)
              </span>
            )}
          </fieldset>
          {!readiness.ready && (
            <button
              type="button"
              disabled={busy}
              onClick={forcePublish}
              className="rounded-full border border-amber-500/40 px-3 py-1 text-xs font-bold text-amber-700 disabled:opacity-60 dark:text-amber-300"
              title={`Still needs: ${readiness.missing.join(", ")}`}
            >
              Force publish
            </button>
          )}

          {(
            [
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
        </AdminCollapsibleSection>

        {error && (
          <div className="space-y-2">
            <p className="text-sm text-destructive">{error}</p>
            {!readiness.ready && /cannot publish|publish|missing/i.test(error) && (
              <button
                type="button"
                disabled={busy}
                onClick={forcePublish}
                className="rounded-full border border-amber-500/40 px-3 py-1.5 text-xs font-bold text-amber-700 disabled:opacity-60 dark:text-amber-300"
              >
                Force publish anyway
              </button>
            )}
          </div>
        )}

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
