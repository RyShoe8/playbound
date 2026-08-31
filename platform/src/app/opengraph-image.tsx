import { ImageResponse } from "next/og";
import { newestGame } from "@/lib/catalog";
import {
  SITE_NAME,
  SITE_PUBLIC_HOST,
  SITE_SOCIAL_SUBTITLE,
  SITE_TAGLINE,
  SITE_URL,
} from "@/lib/site";

/*
 * The share card is the homepage hero: the newest game in the catalog.
 *
 * Every word of the fallback copy comes from lib/site.ts. This card used to
 * carry its own — "The Home of Free Gaming" — and kept showing it in every
 * shared link long after the catalog stopped being free-only, because nothing
 * connected it to the description the rest of the site already used. It is the
 * one piece of site copy nobody sees while working on the site, so it has to
 * be derived rather than remembered.
 */
export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/*
 * Rendered hourly rather than per request or at build.
 *
 * Per request would put an image render on a route every crawler and messaging
 * app hits. At build time the newest game would freeze until the next deploy,
 * and the cover fetch below would have to reach a site that is not up yet.
 */

function PlayMark({ box }: { box: number }) {
  const icon = Math.round(box * 0.44);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: box,
        height: box,
        borderRadius: Math.round(box * 0.25),
        background: "#8b5cf6",
      }}
    >
      <svg width={icon} height={icon} viewBox="0 0 24 24" fill="#faf8ff">
        <path d="M8 5v14l11-7z" />
      </svg>
    </div>
  );
}

function Wordmark({ size: fontSize }: { size: number }) {
  return (
    <div style={{ display: "flex", fontSize, fontWeight: 800, letterSpacing: -1 }}>
      {SITE_NAME.slice(0, 4)}
      <span style={{ color: "#a78bfa" }}>{SITE_NAME.slice(4)}</span>
    </div>
  );
}

const BACKDROP = "linear-gradient(145deg, #14121c 0%, #1c1830 45%, #2a1f4a 100%)";

const shell = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column" as const,
  justifyContent: "space-between" as const,
  padding: 72,
  color: "#f5f3ff",
};

/**
 * The card as it looked before it knew about any game.
 *
 * Not dead code — it is what renders if the catalog read fails or the catalog
 * is empty. An ImageResponse that throws produces no preview at all, which is
 * worse in a shared link than one without a game on it.
 */
function brandedCard() {
  return (
    <div style={{ ...shell, background: BACKDROP }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <PlayMark box={72} />
        <Wordmark size={48} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          style={{
            display: "flex",
            fontSize: 64,
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: -1.5,
            maxWidth: 900,
          }}
        >
          {SITE_TAGLINE}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 28,
            color: "#c4b5fd",
            maxWidth: 820,
            lineHeight: 1.35,
          }}
        >
          {SITE_SOCIAL_SUBTITLE}
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 24, color: "#a1a1aa", letterSpacing: 0.5 }}>
        {SITE_PUBLIC_HOST}
      </div>
    </div>
  );
}

/**
 * Formats the image renderer can decode directly.
 *
 * Satori handles PNG, JPEG and GIF. It does not handle WebP — it logs
 * "Unsupported image type: image/webp" and draws nothing, so the failure is a
 * card that quietly loses its artwork rather than an error anyone would see.
 * Nearly every catalog cover is .webp.
 */
const DIRECTLY_RENDERABLE = /\.(png|jpe?g|gif)(?:[?#]|$)/i;

/**
 * The cover, in something Satori can draw.
 *
 * A site-relative cover goes through Next's own image optimiser, which
 * transcodes to JPEG when the request does not advertise WebP support — which
 * Satori's fetch does not. That is what lets the card show the same .webp
 * covers the site itself uses, rather than falling back to a gradient on
 * nearly every game.
 *
 * Screenshots are deliberately not a fallback here. The homepage hero this
 * card mirrors shows the cover, and screenshots are the least reliable field
 * in the catalog — 0 A.D.'s seed entry points at a different game's Steam
 * header, and a wrong screenshot full-bleed behind the title is broadcast to
 * everyone the link is sent to. A gradient is the honest alternative.
 */
export function coverImageUrl(
  raw: string | null | undefined,
  siteUrl: string
): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;

  if (/^https?:\/\//i.test(value)) {
    // Remote covers are used as-is: the optimiser only accepts hosts listed in
    // next.config, so routing an arbitrary one through it would 400 and lose
    // the image entirely rather than transcode it.
    return DIRECTLY_RENDERABLE.test(value) ? value : null;
  }

  if (!value.startsWith("/")) return null;
  return `${siteUrl}/_next/image?url=${encodeURIComponent(value)}&w=1200&q=75`;
}

function heroCard(game: {
  title: string;
  tagline?: string;
  genres?: string[];
  releaseYear?: number;
  coverImage?: string | null;
  art?: { from?: string; to?: string };
}) {
  const cover = coverImageUrl(game.coverImage, SITE_URL);
  // The catalog's own two-colour gradient, which is what the site falls back to
  // when a game has no cover.
  const gradient =
    game.art?.from && game.art?.to
      ? `linear-gradient(135deg, ${game.art.from}, ${game.art.to})`
      : BACKDROP;

  const meta = [game.genres?.slice(0, 3).join(" / "), game.releaseYear ? String(game.releaseYear) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", background: gradient }}>
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt=""
          width={size.width}
          height={size.height}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: size.width,
            height: size.height,
            objectFit: "cover",
          }}
        />
      ) : null}
      {/* Same left-weighted scrim the homepage hero uses, so text stays legible
          over any cover. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: size.width,
          height: size.height,
          background:
            "linear-gradient(90deg, rgba(9,7,15,0.94) 0%, rgba(9,7,15,0.78) 45%, rgba(9,7,15,0.25) 100%)",
        }}
      />
      <div style={{ ...shell, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <PlayMark box={64} />
          <Wordmark size={40} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 780 }}>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              fontSize: 20,
              fontWeight: 800,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "#0b0713",
              background: "#a78bfa",
              padding: "6px 14px",
              borderRadius: 999,
            }}
          >
            Newest on {SITE_NAME}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 68,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -2,
            }}
          >
            {game.title}
          </div>
          {game.tagline ? (
            <div style={{ display: "flex", fontSize: 30, color: "#e9e4ff", lineHeight: 1.3 }}>
              {game.tagline}
            </div>
          ) : null}
          {meta ? (
            <div style={{ display: "flex", fontSize: 24, color: "#c4b5fd" }}>{meta}</div>
          ) : null}
        </div>

        <div style={{ display: "flex", fontSize: 24, color: "#cfcbd8", letterSpacing: 0.5 }}>
          {SITE_PUBLIC_HOST}
        </div>
      </div>
    </div>
  );
}

export default async function Image() {
  let content = brandedCard();
  try {
    const game = await newestGame();
    if (game?.title) content = heroCard(game);
  } catch {
    // Catalog unavailable — the branded card still says who this is.
  }
  return new ImageResponse(content, { ...size });
}
