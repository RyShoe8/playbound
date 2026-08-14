"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminCollapsibleSection } from "@/components/admin/AdminCollapsibleSection";
import { absoluteMediaUrl, type CatalogGamePrefill, type NewsletterEmailDraft } from "@/lib/newsletterEmail";
import { youtubeId, vimeoId } from "@/lib/mediaEmbed";

const btnGhost =
  "rounded-lg border border-border bg-secondary px-2.5 py-1 text-[11px] font-semibold hover:bg-secondary/80 disabled:opacity-50";
const btnPrimary =
  "rounded-lg bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground disabled:opacity-50";

type Role = "Featured" | "New on Playbound" | "Epic";

type PackGame = {
  key: string;
  title: string;
  role: Role;
  slug: string;
  cover?: string;
  screenshots: string[];
  videos: string[];
  storeUrl?: string;
  needsEpicLookup: boolean;
};

function catalogSlugFromUrl(url: string): string | null {
  const raw = url.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw, "https://playbound.club");
    const m = u.pathname.match(/\/games\/([^/]+)/i);
    return m?.[1] ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

function titlesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function isEmbedVideo(url: string): boolean {
  return Boolean(youtubeId(url) || vimeoId(url) || /\.m3u8(\?|$)/i.test(url) || /\/hls/i.test(url));
}

function uniqueUrls(urls: (string | undefined | null)[]): string[] {
  const out: string[] = [];
  for (const raw of urls) {
    const u = (raw || "").trim();
    if (!u || out.includes(u)) continue;
    out.push(u);
  }
  return out;
}

function collectPackGames(
  draft: NewsletterEmailDraft,
  featuredSlug: string,
  catalog: CatalogGamePrefill[]
): PackGame[] {
  const bySlug = new Map(catalog.map((g) => [g.slug, g]));
  const byTitle = new Map(catalog.map((g) => [g.title.trim().toLowerCase(), g]));
  const seen = new Set<string>();
  const out: PackGame[] = [];

  function push(game: PackGame) {
    const id = game.slug || game.title.trim().toLowerCase();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(game);
  }

  if (featuredSlug) {
    const g = bySlug.get(featuredSlug);
    if (g) {
      push({
        key: `featured-${g.slug}`,
        title: g.title,
        role: "Featured",
        slug: g.slug,
        cover: g.coverImage,
        screenshots: g.screenshots ?? [],
        videos: g.videos ?? [],
        needsEpicLookup: false,
      });
    }
  }

  for (const card of draft.newGames) {
    if (!card.title.trim() && !card.imageUrl.trim()) continue;
    const slug = catalogSlugFromUrl(card.url) || byTitle.get(card.title.trim().toLowerCase())?.slug;
    const g = slug ? bySlug.get(slug) : undefined;
    if (g) {
      push({
        key: `new-${g.slug}`,
        title: g.title,
        role: "New on Playbound",
        slug: g.slug,
        cover: g.coverImage || card.imageUrl,
        screenshots: g.screenshots ?? [],
        videos: g.videos ?? [],
        needsEpicLookup: false,
      });
    } else {
      push({
        key: `new-${card.title || card.imageUrl}`,
        title: card.title || "Untitled",
        role: "New on Playbound",
        slug: slug || card.title.trim().toLowerCase().replace(/\s+/g, "-") || "game",
        cover: card.imageUrl,
        screenshots: [],
        videos: [],
        needsEpicLookup: false,
      });
    }
  }

  for (const card of draft.epic.games) {
    if (!card.title.trim() && !card.imageUrl.trim()) continue;
    const g = byTitle.get(card.title.trim().toLowerCase());
    if (g) {
      push({
        key: `epic-${g.slug}`,
        title: g.title,
        role: "Epic",
        slug: g.slug,
        cover: g.coverImage || card.imageUrl,
        screenshots: g.screenshots ?? [],
        videos: g.videos ?? [],
        storeUrl: card.storeUrl,
        needsEpicLookup: false,
      });
    } else {
      push({
        key: `epic-${card.storeUrl || card.title}`,
        title: card.title || "Epic game",
        role: "Epic",
        slug: card.title.trim().toLowerCase().replace(/\s+/g, "-") || "epic-game",
        cover: card.imageUrl,
        screenshots: [],
        videos: [],
        storeUrl: card.storeUrl,
        needsEpicLookup: true,
      });
    }
  }

  return out;
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

async function downloadOptimized(url: string, kind: "image" | "video", filename: string) {
  const res = await fetch("/api/admin/newsletter/media-download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, kind, filename }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || "Download failed");
  }
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}

function MediaRow({
  label,
  url,
  kind,
  filename,
  preview,
}: {
  label: string;
  url: string;
  kind: "image" | "video";
  filename: string;
  preview?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");
  const embed = kind === "video" && isEmbedVideo(url);
  const abs = absoluteMediaUrl(url);

  async function onCopy() {
    try {
      await copyText(abs);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setErr("Copy failed");
    }
  }

  async function onDownload() {
    setErr("");
    setBusy(true);
    try {
      await downloadOptimized(abs, kind, filename);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/60 p-2">
      {preview && kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={abs} alt="" className="h-14 w-20 shrink-0 rounded object-cover bg-secondary" />
      ) : (
        <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded bg-secondary text-[10px] font-semibold text-muted-foreground">
          {kind === "video" ? "Video" : "Image"}
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-[11px] font-bold text-muted-foreground">{label}</p>
        <p className="truncate text-[11px] text-foreground/80" title={abs}>
          {abs}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={btnGhost} onClick={() => void onCopy()}>
            {copied ? "Copied" : "Copy URL"}
          </button>
          {kind === "video" ? (
            <a href={abs} target="_blank" rel="noreferrer" className={btnGhost}>
              Open
            </a>
          ) : null}
          {embed ? (
            <span className="self-center text-[10px] text-muted-foreground">Hosted video — copy URL</span>
          ) : (
            <button type="button" className={btnPrimary} disabled={busy} onClick={() => void onDownload()}>
              {busy ? "Preparing…" : "Download optimized"}
            </button>
          )}
        </div>
        {err ? <p className="text-[11px] text-destructive">{err}</p> : null}
      </div>
    </div>
  );
}

export function NewsletterMediaPack({
  draft,
  featuredSlug,
  games,
}: {
  draft: NewsletterEmailDraft;
  featuredSlug: string;
  games: CatalogGamePrefill[];
}) {
  const base = useMemo(
    () => collectPackGames(draft, featuredSlug, games),
    [draft, featuredSlug, games]
  );
  const [epicExtra, setEpicExtra] = useState<
    Record<string, { coverImage: string | null; screenshots: string[]; videos: string[] }>
  >({});
  const [epicError, setEpicError] = useState<Record<string, string>>({});

  useEffect(() => {
    const pending = base.filter((g) => g.needsEpicLookup && (g.storeUrl || g.title));
    if (!pending.length) return;
    let cancelled = false;
    void (async () => {
      for (const g of pending) {
        if (epicExtra[g.key] || epicError[g.key]) continue;
        try {
          const res = await fetch("/api/admin/newsletter/epic-media", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ storeUrl: g.storeUrl || undefined, title: g.title }),
          });
          const data = await res.json().catch(() => null);
          if (cancelled) return;
          if (!res.ok) {
            setEpicError((prev) => ({ ...prev, [g.key]: data?.error || "Epic lookup failed" }));
            continue;
          }
          setEpicExtra((prev) => ({
            ...prev,
            [g.key]: {
              coverImage: data.coverImage || null,
              screenshots: Array.isArray(data.screenshots) ? data.screenshots : [],
              videos: Array.isArray(data.videos) ? data.videos : [],
            },
          }));
        } catch {
          if (!cancelled) {
            setEpicError((prev) => ({ ...prev, [g.key]: "Epic lookup failed" }));
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally keyed on pack identity, not epicExtra (avoids a fetch loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base.map((g) => `${g.key}:${g.storeUrl}:${g.title}`).join("|")]);

  return (
    <AdminCollapsibleSection
      title="Newsletter media"
      badge={<span className="ml-2 text-xs font-normal text-muted-foreground">covers, screenshots, videos</span>}
    >
      <p className="text-sm text-muted-foreground">
        Every game in this issue. Images download as optimized WebP. Direct video files download as stored;
        YouTube and Vimeo stay as URLs.
      </p>
      {!base.length ? (
        <p className="text-sm text-muted-foreground">Add a featured game or newsletter cards to see media here.</p>
      ) : (
        <div className="space-y-6">
          {base.map((g) => {
            const extra = epicExtra[g.key];
            const cover = extra?.coverImage || g.cover;
            const shots = uniqueUrls([...(g.screenshots || []), ...(extra?.screenshots || [])]).filter(
              (u) => u !== cover
            );
            const videos = uniqueUrls([...(g.videos || []), ...(extra?.videos || [])]);
            return (
              <section key={g.key} className="space-y-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="text-sm font-bold">{g.title}</h3>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.role}
                  </span>
                </div>
                {epicError[g.key] ? (
                  <p className="text-[11px] text-muted-foreground">{epicError[g.key]} — showing the card image only.</p>
                ) : null}
                {cover ? (
                  <MediaRow
                    label="Cover"
                    url={cover}
                    kind="image"
                    filename={`${g.slug}-cover.webp`}
                    preview
                  />
                ) : (
                  <p className="text-[11px] text-muted-foreground">No cover yet.</p>
                )}
                {shots.map((url, i) => (
                  <MediaRow
                    key={url}
                    label={`Screenshot ${i + 1}`}
                    url={url}
                    kind="image"
                    filename={`${g.slug}-shot-${i + 1}.webp`}
                    preview
                  />
                ))}
                {videos.map((url, i) => (
                  <MediaRow
                    key={url}
                    label={`Video ${i + 1}`}
                    url={url}
                    kind="video"
                    filename={`${g.slug}-video-${i + 1}.mp4`}
                  />
                ))}
              </section>
            );
          })}
        </div>
      )}
    </AdminCollapsibleSection>
  );
}
