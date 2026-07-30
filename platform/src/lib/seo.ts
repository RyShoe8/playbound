import type { Metadata } from "next";
import type { Game } from "@/lib/data/types";
import { SITE_NAME } from "@/lib/site";

/** Meta descriptions get truncated around 160 chars; keep a little headroom. */
export function clampDescription(text: string, max = 158): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 80 ? lastSpace : cut.length)}…`;
}

export function sizeLabel(sizeMB: number): string {
  if (!sizeMB) return "small";
  return sizeMB >= 1000 ? `${(sizeMB / 1000).toFixed(1)} GB` : `${sizeMB} MB`;
}

/**
 * Builds page metadata with a canonical URL.
 *
 * The canonical is the single most important field here: it collapses all nine
 * `?tab=` variants of a game page into one indexable URL, and it stops the
 * preview domain from being treated as authoritative.
 */
export function pageMetadata(opts: {
  title: string;
  description: string;
  path: string;
  images?: string[];
  type?: "website" | "article";
  publishedTime?: string;
  noIndex?: boolean;
}): Metadata {
  const description = clampDescription(opts.description);
  return {
    title: opts.title,
    description,
    alternates: { canonical: opts.path },
    ...(opts.noIndex ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      type: opts.type ?? "website",
      url: opts.path,
      siteName: SITE_NAME,
      title: opts.title,
      description,
      ...(opts.images?.length ? { images: opts.images } : {}),
      ...(opts.publishedTime ? { publishedTime: opts.publishedTime } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: opts.title,
      description,
      ...(opts.images?.length ? { images: opts.images } : {}),
    },
  };
}

/** Metadata for routes that must never be indexed (auth, admin, personal). */
export function privateMetadata(title: string): Metadata {
  return {
    title,
    robots: { index: false, follow: false },
  };
}

/**
 * Game page description, assembled from catalog facts.
 *
 * Deliberately front-loads the verifiable specifics — free, licence, platforms,
 * size — because those are the claims that get extracted and cited.
 */
export function gameDescription(game: Game): string {
  const genre = game.genres.slice(0, 2).join("/");
  const free = game.qualityBar?.genuinelyFree
    ? "Free forever, no pay-to-win"
    : "Free to play";
  return `${game.title} is a free ${genre} game for ${game.platforms.join(", ")} — ${sizeLabel(game.sizeMB)}, ${game.license}. ${free}. ${game.tagline}`;
}

export function gameTitle(game: Game): string {
  const genre = game.genres[0] ?? "Game";
  return `${game.title} — Free ${genre} Game, Download & Play`;
}
