import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_PUBLIC_HOST } from "@/lib/site";

export const alt = `${SITE_NAME} Mods — Curated Game Modifications, Fixes & Overhauls`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function ModsOpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(140deg, #090712 0%, #170d28 45%, #2a1147 100%)",
          padding: "60px 70px",
          color: "#faf5ff",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -100,
            right: -100,
            width: 480,
            height: 480,
            borderRadius: 999,
            background: "radial-gradient(circle, rgba(168, 85, 247, 0.3) 0%, rgba(139, 92, 246, 0) 70%)",
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
            background: "radial-gradient(circle, rgba(236, 72, 153, 0.2) 0%, rgba(217, 70, 239, 0) 70%)",
            display: "flex",
          }}
        />

        {/* Header */}
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
                width: 54,
                height: 54,
                borderRadius: 14,
                background: "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)",
                boxShadow: "0 8px 24px -4px rgba(168, 85, 247, 0.5)",
              }}
            >
              <svg width={26} height={26} viewBox="0 0 24 24" fill="#ffffff">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <div style={{ display: "flex", fontSize: 36, fontWeight: 800, letterSpacing: -0.5 }}>
              {SITE_NAME.slice(0, 4)}
              <span style={{ color: "#f472b6" }}>{SITE_NAME.slice(4)}</span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(244, 114, 182, 0.15)",
              border: "1.5px solid rgba(244, 114, 182, 0.4)",
              borderRadius: 999,
              padding: "8px 18px",
              fontSize: 16,
              fontWeight: 700,
              color: "#fbcfe8",
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: "#ec4899",
                display: "flex",
                boxShadow: "0 0 10px #ec4899",
              }}
            />
            Mod Directory
          </div>
        </div>

        {/* Hero */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18, zIndex: 10, maxWidth: 960 }}>
          <div
            style={{
              display: "flex",
              fontSize: 64,
              fontWeight: 900,
              lineHeight: 1.06,
              letterSpacing: -2,
              background: "linear-gradient(180deg, #ffffff 0%, #fce7f3 100%)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Curated PC Game Mods & Fixes
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
            Enhance your games with tested community patches, HD widescreen mods, balance overhauls, and one-click launcher installation.
          </div>

          {/* Feature Pills */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "rgba(236, 72, 153, 0.2)",
                border: "1px solid rgba(244, 114, 182, 0.4)",
                color: "#fbcfe8",
                fontSize: 18,
                fontWeight: 700,
                padding: "8px 18px",
                borderRadius: 12,
              }}
            >
              📦 1-Click Mod Installs
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "rgba(168, 85, 247, 0.2)",
                border: "1px solid rgba(192, 132, 252, 0.4)",
                color: "#e9d5ff",
                fontSize: 18,
                fontWeight: 700,
                padding: "8px 18px",
                borderRadius: 12,
              }}
            >
              🖥️ HD & Ultrawide Fixes
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
              🛡️ Compatibility Tested
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
            paddingTop: 22,
            zIndex: 10,
          }}
        >
          <div style={{ display: "flex", fontSize: 16, color: "#94a3b8", fontWeight: 500 }}>
            Tested Community Creations · Auto-Configured & Ready
          </div>
          <div style={{ display: "flex", fontSize: 20, color: "#f472b6", fontWeight: 700, letterSpacing: 0.5 }}>
            {SITE_PUBLIC_HOST}/mods
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
