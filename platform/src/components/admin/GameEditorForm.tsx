"use client";
import { PremiumSelect } from "@/components/ui/PremiumSelect";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserPlus } from "lucide-react";
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
import { isScreenshotCandidate } from "@/lib/mediaImageFilter";
import { mergeUniqueMediaUrls } from "@/lib/mediaDedupe";
import { HlsVideo } from "@/components/HlsVideo";
import { HardwareRequirementsEditor } from "@/components/admin/HardwareRequirementsEditor";
import { uploadAdminMediaFile } from "@/lib/adminUploadHelper";
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
import { AccessPricingFields } from "@/components/admin/AccessPricingFields";
import type { GameTierMap } from "@/lib/access/tierMap";
import type { PriceType } from "@/lib/access/types";
import { SizeInput } from "@/components/admin/SizeInput";
import { LauncherPackageUploader } from "@/components/admin/LauncherPackageUploader";

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
  "everquest",
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
  catalogGames = [],
  catalogTiers = {},
}: {
  mode: "create" | "edit";
  initial: GamePayload;
  developers: DevOption[];
  catalogGames?: { slug: string; title: string; priceType?: PriceType }[];
  catalogTiers?: GameTierMap;
}) {
  const router = useRouter();
  const coverFileRef = useRef<HTMLInputElement>(null);
  const shotFileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<GamePayload>(initial);
  const [importUrl, setImportUrl] = useState(mode === "create" ? "" : initial.website || "");
  const [busy, setBusy] = useState(false);
  const [launcherSaving, setLauncherSaving] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [mediaNote, setMediaNote] = useState("");
  const [videoUrlDraft, setVideoUrlDraft] = useState("");
  const [forcePublishNext, setForcePublishNext] = useState(false);
  const [launcherDiscoverNote, setLauncherDiscoverNote] = useState("");
  const [evidence, setEvidence] = useState<string[]>([]);
  const [sourceMaterial, setSourceMaterial] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{ bestFor: string[]; notFor: string[] }>({
    bestFor: [],
    notFor: [],
  });

  const isKnownDev = useMemo(
    () => developers.some((d) => d.slug === form.developerSlug),
    [developers, form.developerSlug]
  );
  const [isCustomDev, setIsCustomDev] = useState(() => {
    return Boolean(form.developerSlug && !developers.some((d) => d.slug === form.developerSlug));
  });
  const [customDevName, setCustomDevName] = useState(() => {
    if (form.developerName) return form.developerName;
    if (form.developerSlug && !developers.some((d) => d.slug === form.developerSlug)) {
      return form.developerSlug
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
    return "";
  });

  function handleCustomDevNameChange(name: string) {
    setCustomDevName(name);
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    setForm((prev) => ({
      ...prev,
      developerName: name || null,
      developerSlug: slug || prev.developerSlug || "indie-web",
    }));
  }

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
  const extraTags = form.tags.filter(
    (t) => t !== "Multiplayer" && t !== "Singleplayer" && !(TAGS as readonly string[]).includes(t)
  );
  const onPlayboundLauncher =
    isPcInstallCandidate(form) &&
    Boolean(form.launcherInstall?.kind) &&
    form.launcherInstall?.enabled !== false;
  const browserOnlyLauncher =
    launchSet.has("browser") && !launchSet.has("install");

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

  /** Save operational install data without submitting the surrounding game form. */
  async function saveLauncherInstallOnly() {
    if (mode !== "edit" || !form.launcherInstall) return;
    setLauncherSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/games/${initial.slug}/launcher-install`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ launcherInstall: toPayloadLauncherInstall(form.launcherInstall) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't save the install recipe.");
        return;
      }
      setLauncherDiscoverNote("Install recipe saved. No other game fields were changed.");
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setLauncherSaving(false);
    }
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
      if (draft.developerSlug && !developers.some((d) => d.slug === draft.developerSlug)) {
        setIsCustomDev(true);
        setCustomDevName(draft.developerName || draft.developerSlug);
      } else if (draft.developerSlug) {
        setIsCustomDev(false);
      }
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
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  async function fetchMedia() {
    const url = form.website || importUrl;
    const steamAppId = form.steamAppId?.trim() || null;
    const githubRepo = form.githubRepo?.trim() || null;
    if (!url.trim() && !steamAppId && !githubRepo && !(form.screenshots?.length)) {
      setError("Set a website URL, Steam app id, or GitHub repo first.");
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
          githubRepo,
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
      // Drop social/UI junk so a prior polluted Refresh can heal on the next run.
      const cleanExisting = existingShots.filter((u) => isScreenshotCandidate(u));
      const cleanIncoming = incomingShots.filter((u) => isScreenshotCandidate(u));
      const thin = screenshotsAreThin(cleanExisting);
      let nextShots = mergeUniqueMediaUrls(cleanExisting, cleanIncoming, 20);
      if (thin && cleanIncoming.length > cleanExisting.length) {
        // Prefer a fuller scrape when the gallery is thin/junk-heavy.
        nextShots = mergeUniqueMediaUrls(cleanIncoming, cleanExisting, 20);
      }

      const nextVideos = mergeUniqueMediaUrls(existingVideos, incomingVideos, 10);
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
      const inferredSteam =
        typeof data.steamAppId === "string" && /^\d+$/.test(data.steamAppId)
          ? data.steamAppId
          : null;

      const addedShots = Math.max(0, nextShots.length - cleanExisting.length);
      const removedJunk = Math.max(0, existingShots.length - cleanExisting.length);
      const addedVideos = Math.max(0, nextVideos.length - existingVideos.length);
      const stats = data.stats as { fetched?: number; rehosted?: number; keptRemote?: number } | undefined;

      if (
        addedShots === 0 &&
        addedVideos === 0 &&
        removedJunk === 0 &&
        nextCover === form.coverImage &&
        !(stats?.fetched)
      ) {
        setMediaNote(
          nextShots.length === 0
            ? "No gallery images on the website — try Upload screenshot or paste image URLs."
            : "No new media found from website or Steam. Existing media kept."
        );
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
        const junkBit =
          removedJunk > 0
            ? `Removed ${removedJunk} non-screenshot image${removedJunk === 1 ? "" : "s"}. `
            : "";
        const trailerBit =
          addedVideos === 0 ? " No trailers found — paste a YouTube URL if you have one." : "";
        const galleryBit =
          nextShots.length === 0
            ? " No gallery images on the website — try Upload screenshot or paste image URLs."
            : "";
        setMediaNote(
          `Refresh done — ${steamBit}${coverBit}${junkBit}added ${addedShots} screenshot${
            addedShots === 1 ? "" : "s"
          }, ${addedVideos} video${addedVideos === 1 ? "" : "s"}. ${rehostBit}Save to persist.${trailerBit}${galleryBit}`
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

  async function uploadImageFile(file: File, kind: "cover" | "shot"): Promise<string> {
    return uploadAdminMediaFile(file, {
      slug: form.slug || "upload",
      kind,
      prefix: "games",
    });
  }

  async function onCoverFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    setMediaNote("Uploading cover…");
    try {
      const url = await uploadImageFile(file, "cover");
      patch("coverImage", url);
      setMediaNote("Cover uploaded — save the game to persist.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't reach the server.";
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

    const existing = form.screenshots ?? [];
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
        urls.push(await uploadImageFile(files[i], "shot"));
      } catch (err) {
        failures.push(
          `${files[i].name}: ${err instanceof Error ? err.message : "upload failed"}`
        );
      }
    }

    if (urls.length) {
      setForm((prev) => ({
        ...prev,
        screenshots: mergeUniqueMediaUrls(prev.screenshots ?? [], urls, 20),
      }));
    }

    const parts = [
      urls.length
        ? `Added ${urls.length} screenshot${urls.length === 1 ? "" : "s"} — save the game to persist.`
        : "No screenshots uploaded.",
    ];
    if (skipped > 0) {
      parts.push(`Skipped ${skipped} (gallery cap 20).`);
    }
    if (failures.length) {
      const summary = failures.slice(0, 2).join("; ");
      parts.push(
        `${failures.length} failed${summary ? `: ${summary}` : ""}${
          failures.length > 2 ? "…" : ""
        }.`
      );
      setError(parts.join(" "));
    }
    setMediaNote(parts.join(" "));
    setBusy(false);
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
        <p className={label}>Import from Steam, Epic, GitHub, or any website URL</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="https://store.epicgames.com/p/… or Steam / GitHub / site URL"
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
          Website URLs default to browser-playable drafts. Steam, Epic, and GitHub stay installable.
          Review before publishing.
        </p>
        {warning && (
          <p className="mt-2 text-sm text-amber-500" role="status">
            {warning}
          </p>
        )}
      </div>

      <form onSubmit={save} className="space-y-4">
        {/* Keep pickers outside collapsible <details> so change events aren't dropped. */}
        <input
          ref={coverFileRef}
          type="file"
          accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.avif"
          className="sr-only"
          tabIndex={-1}
          onChange={onCoverFileSelected}
        />
        <input
          ref={shotFileRef}
          type="file"
          accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.avif"
          multiple
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
            <div className="flex items-center justify-between">
              <label className={label}>Developer</label>
              {!isCustomDev ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomDev(true);
                    if (isKnownDev) {
                      setCustomDevName("");
                      patch("developerSlug", "");
                      patch("developerName", null);
                    }
                  }}
                  className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                >
                  <Plus className="size-3" /> New developer
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomDev(false);
                    if (!isKnownDev) {
                      patch("developerSlug", "");
                      patch("developerName", null);
                    }
                  }}
                  className="text-[11px] font-semibold text-muted-foreground hover:text-foreground underline"
                >
                  Pick from list
                </button>
              )}
            </div>

            {isCustomDev ? (
              <div className="mt-1 space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
                <div>
                  <input
                    type="text"
                    required
                    value={customDevName}
                    onChange={(e) => handleCustomDevNameChange(e.target.value)}
                    placeholder="Enter new developer name (e.g. Team Cherry)"
                    className={field}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    Slug: <code className="font-mono text-primary font-bold">{form.developerSlug || "…"}</code>
                  </span>
                  <span className="font-semibold text-primary text-[10px]">
                    ✨ Added to developer list on save
                  </span>
                </div>
              </div>
            ) : (
              <>
                <PremiumSelect
                  value={form.developerSlug}
                  onChange={(e) => {
                    if (e.target.value === "__custom__") {
                      setIsCustomDev(true);
                      setCustomDevName("");
                      patch("developerSlug", "");
                      patch("developerName", null);
                    } else {
                      const chosen = developers.find((d) => d.slug === e.target.value);
                      setForm((prev) => ({
                        ...prev,
                        developerSlug: e.target.value,
                        developerName: chosen?.name || null,
                      }));
                    }
                  }}
                  className={field}
                >
                  <option value="">Select a developer…</option>
                  <option value="__custom__">+ Enter new developer…</option>
                  <option disabled>──────────</option>
                  {developers.map((d) => (
                    <option key={d.slug} value={d.slug}>
                      {d.name}
                    </option>
                  ))}
                  {form.developerSlug && !isKnownDev && (
                    <option value={form.developerSlug}>
                      {customDevName || form.developerSlug} (new developer)
                    </option>
                  )}
                </PremiumSelect>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Select an existing developer or click <strong className="text-primary">+ New developer</strong> to add one on save.
                </p>
              </>
            )}
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
            <SizeInput
              required
              value={form.sizeMB}
              onChange={(v) => patch("sizeMB", v || 0)}
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

        <AdminCollapsibleSection title="Access & pricing" defaultOpen>
          <AccessPricingFields
            value={form.access}
            catalogGames={catalogGames.filter((g) => g.slug !== form.slug)}
            catalogTiers={catalogTiers}
            gameSlug={mode === "edit" ? form.slug : undefined}
            masterCopy={Boolean(form.masterCopy)}
            onMasterCopyChange={(next) => patch("masterCopy", next)}
            onChange={(next) => patch("access", next)}
          />
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
                // Defer so the input stays stable if a surrounding <details> toggles.
                window.setTimeout(() => coverFileRef.current?.click(), 0);
              }}
              className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-60"
            >
              Upload cover
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                window.setTimeout(() => shotFileRef.current?.click(), 0);
              }}
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
            title="That One Thing"
            hint="One punchy sentence: the hook you would excitedly tell a friend about. Be specific to this game. The callout stays hidden until this is written."
            value={form.thatOneThing ?? ""}
            minWords={4}
            rows={3}
            onChange={(v) => patch("thatOneThing", v)}
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
            firstPlaySteps={form.firstPlaySteps ?? []}
            multiplayerGamingSteps={form.multiplayerGamingSteps ?? []}
            faq={form.faq ?? []}
            onInstallStepsChange={(next) => patch("installSteps", next)}
            onFirstPlayStepsChange={(next) => patch("firstPlaySteps", next)}
            onMultiplayerGamingStepsChange={(next) => patch("multiplayerGamingSteps", next)}
            onFaqChange={(next) => patch("faq", next)}
          />
        </AdminCollapsibleSection>

        <AdminCollapsibleSection title="Taxonomy" defaultOpen>
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
                      /*
                       * Clears as well as sets. It only ever set, so a game
                       * imported as browser-playable and later given an install
                       * recipe kept the flag — and isBrowserGame short-circuits
                       * on it before it ever looks at the recipe, so the game
                       * still loaded in a browser tab with a perfectly good zip
                       * sitting unused. Pokemon: Dawn of Darkness was in exactly
                       * that state.
                       */
                      browserPlayable: next.includes("browser")
                        ? !next.includes("install") || prev.browserPlayable
                        : next.includes("install")
                          ? false
                          : prev.browserPlayable,
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

          {featureSet.has("Multiplayer") && (
            <div>
              <label className={label}>Max players</label>
              <input
                type="number"
                min={2}
                max={100000}
                value={form.maxPlayers ?? ""}
                onChange={(e) => patch("maxPlayers", e.target.value ? Number(e.target.value) : null)}
                placeholder="e.g. 32 — leave blank until verified"
                className={field}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Real concurrent-player cap for one session — a lobby size, a match size, a
                server slot count. Feeds /play-with-friends and structured data, so leave it
                blank rather than estimate.
              </p>
            </div>
          )}

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
              rows={3}
              value={(form.aliases ?? []).join("\n")}
              onChange={(e) =>
                patch(
                  "aliases",
                  e.target.value
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean)
                )
              }
              className={`${field} h-auto py-2`}
              placeholder={"WoW\nC&C\nCommand and Conquer"}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Optional nicknames for search only (never shown on the public page). Put one alias per
              line — no commas. Max 60 characters each, up to 20 aliases.
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
            <div className="flex flex-col items-start gap-1">
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setError("");
                  setBusy(true);
                  try {
                    const res = await fetch(`/api/admin/games/${initial.slug}/provision-discord`, {
                      method: "POST",
                    });
                    const data = await res.json().catch(() => null);
                    if (!res.ok) {
                      setError(data?.error ?? `Provision failed (${res.status})`);
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
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Couldn't reach the Discord bot webhook.");
                  } finally {
                    setBusy(false);
                  }
                }}
                className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-60"
              >
                Provision PlayBound Channel
              </button>
            </div>
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

        <HardwareRequirementsEditor
          value={form.hardwareRequirements}
          onChange={(hardwareRequirements) => patch("hardwareRequirements", hardwareRequirements)}
        />

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
          {browserOnlyLauncher ? (
            <div className="space-y-3">
              <p className="text-sm font-bold">Browser play (no Windows install)</p>
              <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs">
                <p className="font-semibold">This game opens in the browser.</p>
                <p className="mt-1 text-muted-foreground">
                  Play uses{" "}
                  <code className="text-[10px]">{form.website || "the official site URL"}</code>.
                  The desktop launcher lists it as an external browser title — no install recipe,
                  exe hint, or package upload is needed.
                </p>
              </div>
              {form.launcherInstall?.kind ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
                  <p className="font-semibold text-amber-800 dark:text-amber-200">
                    Stale install recipe on file
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    A previous desktop edition left a Windows install recipe saved. Clear it so the
                    launcher catalog does not offer a zip download.
                  </p>
                  <button
                    type="button"
                    disabled={busy || launcherSaving}
                    onClick={() => patch("launcherInstall", null)}
                    className="mt-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-bold"
                  >
                    Clear install recipe
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
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
          {mode === "edit" ? (
            <div className="mt-3">
              <LauncherPackageUploader
                gameSlug={form.slug}
                onInstalled={(installed) =>
                  patchLauncher({
                    enabled: true,
                    kind: installed.kind,
                    url: installed.url,
                    fileName: installed.fileName,
                  })
                }
              />
            </div>
          ) : null}
          {Boolean(form.launcherInstall?.kind) && (
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
                    <PremiumSelect
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
                    </PremiumSelect>
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
                  form.launcherInstall?.kind === "direct-7z" ||
                  form.launcherInstall?.kind === "direct-installer" ||
                  form.launcherInstall?.kind === "direct-exe" ||
                  form.launcherInstall?.kind === "external" ||
                  form.launcherInstall?.kind === "itch-zip") && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className={label}>
                        {form.launcherInstall?.kind === "itch-zip" ? "itch.io page URL" : "Download URL"}
                      </label>
                      <input
                        value={form.launcherInstall?.url ?? ""}
                        onChange={(e) => patchLauncher({ url: e.target.value || null })}
                        placeholder={
                          form.launcherInstall?.kind === "itch-zip"
                            ? "https://creator.itch.io/game"
                            : undefined
                        }
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
                    {form.launcherInstall?.kind === "itch-zip" && (
                      <div>
                        <label className={label}>Upload ID (optional)</label>
                        <input
                          value={form.launcherInstall?.uploadId ?? ""}
                          onChange={(e) => patchLauncher({ uploadId: e.target.value || null })}
                          placeholder="Pin one file when the page lists several downloads"
                          className={field}
                        />
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          itch.io&apos;s data-upload_id for the exact file to grab. Without it, the
                          launcher takes whichever download is listed first on the page.
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {form.launcherInstall?.kind === "steamcmd" && (
                  <div>
                    <label className={label}>Anonymous SteamCMD app ID</label>
                    <input
                      inputMode="numeric"
                      value={form.launcherInstall?.steamAppId ?? ""}
                      onChange={(e) =>
                        patchLauncher({
                          steamAppId: e.target.value.replace(/\D/g, "").slice(0, 20) || null,
                        })
                      }
                      placeholder="1136510"
                      className={field}
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Public depots only. PlayBound signs in anonymously and never asks for Steam credentials.
                    </p>
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
                  {/*
                    Windows cannot raise privileges on a normal spawn, so a game
                    whose loader demands elevation fails before it starts. This
                    has to be curated: Windows reports "needs elevation" and
                    "antivirus blocked this" as the same error, so the launcher
                    cannot tell them apart and must be told.
                  */}
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(form.launcherInstall?.needsAdmin)}
                      onChange={(e) => patchLauncher({ needsAdmin: e.target.checked })}
                    />
                    Run as administrator
                    <span className="text-xs font-normal text-muted-foreground">
                      (loader needs elevation — players get a UAC prompt)
                    </span>
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
                  form.launcherInstall?.kind === "direct-7z" ||
                  form.launcherInstall?.kind === "openttd-zip" ||
                  form.launcherInstall?.kind === "steamcmd") && (
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
                  <label className={label}>Steam prerequisites (app ID | name, one per line)</label>
                  <textarea
                    value={(form.launcherInstall?.steamPrerequisites ?? [])
                      .map((item) => `${item.appId} | ${item.name}`)
                      .join("\n")}
                    onChange={(e) =>
                      patchLauncher({
                        steamPrerequisites: e.target.value
                          .split("\n")
                          .map((line) => {
                            const [rawAppId, ...rawName] = line.split("|");
                            const appId = rawAppId.replace(/\D/g, "").slice(0, 20);
                            const name = rawName.join("|").trim();
                            return appId && name ? { appId, name } : null;
                          })
                          .filter((item): item is { appId: string; name: string } => Boolean(item)),
                      })
                    }
                    rows={2}
                    className={area}
                    placeholder="218 | Source SDK Base 2007"
                  />
                </div>
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
          {mode === "edit" && form.launcherInstall && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5">
              <button
                type="button"
                disabled={busy || launcherSaving}
                onClick={saveLauncherInstallOnly}
                className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60"
              >
                {launcherSaving ? "Saving recipe…" : "Save install recipe only"}
              </button>
              <span className="text-[11px] font-medium text-muted-foreground">
                Updates only this recipe. It does not save any other game fields.
              </span>
            </div>
          )}
            </>
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
              ["complete", "Complete"],
            ] as const
          ).map(([key, labelText]) => (
            <label key={key} className="flex items-center gap-2 font-semibold">
              <input type="checkbox" checked={Boolean(form[key])} onChange={(e) => patch(key, e.target.checked)} />
              <span>
                {labelText}
                {key === "complete" && (
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    All catalog info entered for this title
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Managed by</label>
            <PremiumSelect
              value={form.managedBy}
              onChange={(e) => patch("managedBy", e.target.value as GamePayload["managedBy"])}
              className={field}
            >
              <option value="admin">admin</option>
              <option value="developer">developer</option>
            </PremiumSelect>
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
