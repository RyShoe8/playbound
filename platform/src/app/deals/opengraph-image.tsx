import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_PUBLIC_HOST } from "@/lib/site";

export const alt = `${SITE_NAME} Deals — Top PC Game Deals & Live Free Giveaways`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function DealsOpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(140deg, #09070f 0%, #150f28 45%, #251247 100%)",
          padding: "60px 70px",
          color: "#f5f3ff",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Glow orb accents */}
        <div
          style={{
            position: "absolute",
            top: -100,
            right: -100,
            width: 450,
            height: 450,
            borderRadius: 999,
            background: "radial-gradient(circle, rgba(168, 85, 247, 0.28) 0%, rgba(139, 92, 246, 0) 70%)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -120,
            left: 200,
            width: 500,
            height: 500,
            borderRadius: 999,
            background: "radial-gradient(circle, rgba(236, 72, 153, 0.18) 0%, rgba(217, 70, 239, 0) 70%)",
            display: "flex",
          }}
        />

        {/* Header row: PlayBound brand + Live tag */}
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
            {/* Play icon mark */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 54,
                height: 54,
                borderRadius: 14,
                background: "linear-gradient(135deg, #a855f7 0%, #6366f1 100%)",
                boxShadow: "0 8px 24px -4px rgba(168, 85, 247, 0.5)",
              }}
            >
              <svg width={26} height={26} viewBox="0 0 24 24" fill="#ffffff">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            {/* Wordmark */}
            <div style={{ display: "flex", fontSize: 36, fontWeight: 800, letterSpacing: -0.5 }}>
              {SITE_NAME.slice(0, 4)}
              <span style={{ color: "#c084fc" }}>{SITE_NAME.slice(4)}</span>
            </div>
          </div>

          {/* Deal tracker pill */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(168, 85, 247, 0.15)",
              border: "1.5px solid rgba(192, 132, 252, 0.4)",
              borderRadius: 999,
              padding: "8px 18px",
              fontSize: 16,
              fontWeight: 700,
              color: "#e9d5ff",
              letterSpacing: 0.5,
              textTransform: "uppercase",
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
            Live Deal Tracker
          </div>
        </div>

        {/* Main hero typography & value proposition */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18, zIndex: 10, maxWidth: 960 }}>
          <div
            style={{
              display: "flex",
              fontSize: 66,
              fontWeight: 900,
              lineHeight: 1.06,
              letterSpacing: -2,
              background: "linear-gradient(180deg, #ffffff 0%, #e2e8f0 100%)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            PC Game Deals & Free Giveaways
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 26,
              color: "#cbd5e1",
              lineHeight: 1.4,
              maxWidth: 900,
            }}
          >
            Massive 75% to 95% discounts & 100% free games, tracked live across Steam, Epic Games, GOG, and GamersGate.
          </div>

          {/* Feature Pills */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "rgba(239, 68, 68, 0.2)",
                border: "1px solid rgba(248, 113, 113, 0.4)",
                color: "#fca5a5",
                fontSize: 18,
                fontWeight: 700,
                padding: "8px 18px",
                borderRadius: 12,
              }}
            >
              🔥 75%+ Off or Deeper
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "rgba(34, 197, 94, 0.2)",
                border: "1px solid rgba(74, 222, 128, 0.4)",
                color: "#86efac",
                fontSize: 18,
                fontWeight: 700,
                padding: "8px 18px",
                borderRadius: 12,
              }}
            >
              🎁 100% Free to Keep
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "rgba(99, 102, 241, 0.2)",
                border: "1px solid rgba(129, 140, 248, 0.4)",
                color: "#c7d2fe",
                fontSize: 18,
                fontWeight: 700,
                padding: "8px 18px",
                borderRadius: 12,
              }}
            >
              ⚡ Verified Daily
            </div>
          </div>
        </div>

        {/* Footer: Supported Stores + URL */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(255, 255, 255, 0.12)",
            paddingTop: 22,
            zIndex: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 16, color: "#94a3b8", fontWeight: 600 }}>Tracked Stores:</span>
            {["Steam", "Epic Games", "GOG", "GamersGate"].map((store) => (
              <div
                key={store}
                style={{
                  display: "flex",
                  background: "rgba(255, 255, 255, 0.08)",
                  borderRadius: 8,
                  padding: "5px 12px",
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#e2e8f0",
                }}
              >
                {store}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", fontSize: 20, color: "#a855f7", fontWeight: 700, letterSpacing: 0.5 }}>
            {SITE_PUBLIC_HOST}/deals
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
