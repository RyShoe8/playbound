import { ImageResponse } from "next/og";
import { getGame } from "@/lib/catalog";
import { SITE_NAME, SITE_PUBLIC_HOST } from "@/lib/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function GameOpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const game = await getGame(slug);

  const title = game?.title || "PlayBound Game";
  const tagline = game?.tagline || "Discover and play exceptional PC games on PlayBound.";
  const genres = game?.genres?.slice(0, 3) || ["Action", "Indie"];
  const releaseYear = game?.releaseYear ? String(game.releaseYear) : null;
  const fromColor = game?.art?.from || "#1e1b4b";
  const toColor = game?.art?.to || "#312e81";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: `linear-gradient(140deg, #090a16 0%, ${fromColor}55 50%, #080718 100%)`,
          padding: "54px 64px",
          color: "#f8fafc",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Glow orb accents matching game's curated hues */}
        <div
          style={{
            position: "absolute",
            top: -80,
            right: -80,
            width: 500,
            height: 500,
            borderRadius: 999,
            background: `radial-gradient(circle, ${toColor}66 0%, rgba(0,0,0,0) 70%)`,
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -100,
            left: 100,
            width: 500,
            height: 500,
            borderRadius: 999,
            background: `radial-gradient(circle, ${fromColor}55 0%, rgba(0,0,0,0) 70%)`,
            display: "flex",
          }}
        />

        {/* Top Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            zIndex: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 50,
                height: 50,
                borderRadius: 14,
                background: "linear-gradient(135deg, #a855f7 0%, #6366f1 100%)",
                boxShadow: "0 6px 20px -2px rgba(168, 85, 247, 0.5)",
              }}
            >
              <svg width={24} height={24} viewBox="0 0 24 24" fill="#ffffff">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <div style={{ display: "flex", fontSize: 34, fontWeight: 800, letterSpacing: -0.5 }}>
              {SITE_NAME.slice(0, 4)}
              <span style={{ color: "#c084fc" }}>{SITE_NAME.slice(4)}</span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(34, 197, 94, 0.15)",
              border: "1.5px solid rgba(74, 222, 128, 0.4)",
              borderRadius: 999,
              padding: "8px 18px",
              fontSize: 16,
              fontWeight: 700,
              color: "#86efac",
              letterSpacing: 0.5,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: "#22c55e",
                display: "flex",
                boxShadow: "0 0 10px #22c55e",
              }}
            />
            Verified PlayBound Title
          </div>
        </div>

        {/* Center Main Info */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 40,
            zIndex: 10,
            width: "100%",
            flex: 1,
            marginTop: 20,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              maxWidth: 950,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: title.length > 30 ? 52 : 62,
                fontWeight: 900,
                lineHeight: 1.08,
                letterSpacing: -1.5,
                background: "linear-gradient(180deg, #ffffff 0%, #e2e8f0 100%)",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {title}
            </div>

            <div
              style={{
                display: "flex",
                fontSize: 24,
                color: "#cbd5e1",
                lineHeight: 1.38,
                maxWidth: 880,
              }}
            >
              {tagline}
            </div>

            {/* Genres & Stats */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
              {genres.map((g) => (
                <div
                  key={g}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: "rgba(255, 255, 255, 0.08)",
                    border: "1px solid rgba(255, 255, 255, 0.16)",
                    color: "#e2e8f0",
                    fontSize: 16,
                    fontWeight: 600,
                    padding: "6px 14px",
                    borderRadius: 10,
                  }}
                >
                  {g}
                </div>
              ))}
              {releaseYear && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: "rgba(168, 85, 247, 0.15)",
                    border: "1px solid rgba(192, 132, 252, 0.3)",
                    color: "#e9d5ff",
                    fontSize: 16,
                    fontWeight: 600,
                    padding: "6px 14px",
                    borderRadius: 10,
                  }}
                >
                  {releaseYear}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(255, 255, 255, 0.12)",
            paddingTop: 18,
            zIndex: 10,
          }}
        >
          <div style={{ display: "flex", fontSize: 16, color: "#94a3b8", fontWeight: 500 }}>
            Curated, tested, and ready to play on PlayBound
          </div>
          <div style={{ display: "flex", fontSize: 18, color: "#c084fc", fontWeight: 700, letterSpacing: 0.3 }}>
            {SITE_PUBLIC_HOST}/games/{slug}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
