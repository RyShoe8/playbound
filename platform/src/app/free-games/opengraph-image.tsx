import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_PUBLIC_HOST } from "@/lib/site";

export const alt = `${SITE_NAME} Free Games — Track 100% Free PC Games & Weekly Giveaways`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function FreeGamesOpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(140deg, #060913 0%, #0d1527 45%, #112340 100%)",
          padding: "60px 70px",
          color: "#f0fdf4",
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
            width: 480,
            height: 480,
            borderRadius: 999,
            background: "radial-gradient(circle, rgba(34, 197, 94, 0.25) 0%, rgba(16, 185, 129, 0) 70%)",
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
            background: "radial-gradient(circle, rgba(59, 130, 246, 0.20) 0%, rgba(99, 102, 241, 0) 70%)",
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
                background: "linear-gradient(135deg, #22c55e 0%, #3b82f6 100%)",
                boxShadow: "0 8px 24px -4px rgba(34, 197, 94, 0.5)",
              }}
            >
              <svg width={26} height={26} viewBox="0 0 24 24" fill="#ffffff">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            {/* Wordmark */}
            <div style={{ display: "flex", fontSize: 36, fontWeight: 800, letterSpacing: -0.5, color: "#ffffff" }}>
              {SITE_NAME.slice(0, 4)}
              <span style={{ color: "#4ade80" }}>{SITE_NAME.slice(4)}</span>
            </div>
          </div>

          {/* Giveaway tracker pill */}
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
              color: "#bbf7d0",
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
            Live Giveaway Tracker
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
              background: "linear-gradient(180deg, #ffffff 0%, #dcfce7 100%)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Free PC Games This Week
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
            Track active & upcoming free game promotions from Epic Games, Steam, GOG, Prime Gaming, and Alienware. Claim them before they expire.
          </div>

          {/* Feature Pills */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
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
                background: "rgba(234, 179, 8, 0.2)",
                border: "1px solid rgba(250, 204, 21, 0.4)",
                color: "#fde047",
                fontSize: 18,
                fontWeight: 700,
                padding: "8px 18px",
                borderRadius: 12,
              }}
            >
              ⏰ Limited-Time Drops
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "rgba(59, 130, 246, 0.2)",
                border: "1px solid rgba(96, 165, 250, 0.4)",
                color: "#bfdbfe",
                fontSize: 18,
                fontWeight: 700,
                padding: "8px 18px",
                borderRadius: 12,
              }}
            >
              🔔 Tracked & Verified Daily
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
            {["Epic Games", "Steam", "GOG", "Prime Gaming", "Alienware"].map((store) => (
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

          <div style={{ display: "flex", fontSize: 20, color: "#4ade80", fontWeight: 700, letterSpacing: 0.5 }}>
            {SITE_PUBLIC_HOST}/free-games
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
