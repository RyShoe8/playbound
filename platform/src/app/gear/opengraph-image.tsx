import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_PUBLIC_HOST } from "@/lib/site";

export const alt = `${SITE_NAME} Gear — Tested PC Handhelds, Controllers & Hardware`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function GearOpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(140deg, #090a14 0%, #15162b 45%, #251b3d 100%)",
          padding: "60px 70px",
          color: "#f8fafc",
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
            background: "radial-gradient(circle, rgba(234, 179, 8, 0.25) 0%, rgba(202, 138, 4, 0) 70%)",
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
            background: "radial-gradient(circle, rgba(168, 85, 247, 0.2) 0%, rgba(99, 102, 241, 0) 70%)",
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
                background: "linear-gradient(135deg, #eab308 0%, #a855f7 100%)",
                boxShadow: "0 8px 24px -4px rgba(234, 179, 8, 0.4)",
              }}
            >
              <svg width={26} height={26} viewBox="0 0 24 24" fill="#ffffff">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <div style={{ display: "flex", fontSize: 36, fontWeight: 800, letterSpacing: -0.5 }}>
              {SITE_NAME.slice(0, 4)}
              <span style={{ color: "#facc15" }}>{SITE_NAME.slice(4)}</span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(250, 204, 21, 0.15)",
              border: "1.5px solid rgba(250, 204, 21, 0.4)",
              borderRadius: 999,
              padding: "8px 18px",
              fontSize: 16,
              fontWeight: 700,
              color: "#fef08a",
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: "#eab308",
                display: "flex",
                boxShadow: "0 0 10px #eab308",
              }}
            />
            Hardware & Gear
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
              background: "linear-gradient(180deg, #ffffff 0%, #fef9c3 100%)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            PC Gaming Hardware, Handhelds & Controllers
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
            Real-world performance testing, Steam Deck & ROG Ally compatibility, low-latency controllers, and verified hardware recommendations.
          </div>

          {/* Feature Pills */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "rgba(234, 179, 8, 0.2)",
                border: "1px solid rgba(250, 204, 21, 0.4)",
                color: "#fef08a",
                fontSize: 18,
                fontWeight: 700,
                padding: "8px 18px",
                borderRadius: 12,
              }}
            >
              🕹️ Handheld Compatibility
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
              🎮 Tested Controllers
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
              📊 Performance Benchmarks
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
            Tested on Real Hardware · Zero Sponsored Reviews
          </div>
          <div style={{ display: "flex", fontSize: 20, color: "#facc15", fontWeight: 700, letterSpacing: 0.5 }}>
            {SITE_PUBLIC_HOST}/gear
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
