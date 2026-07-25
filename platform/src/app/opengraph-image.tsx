import { ImageResponse } from "next/og";

export const alt = "PlayBound — The Home of Free Gaming";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background:
            "linear-gradient(145deg, #14121c 0%, #1c1830 45%, #2a1f4a 100%)",
          color: "#f5f3ff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <PlayMark box={72} />
          <div
            style={{
              display: "flex",
              fontSize: 48,
              fontWeight: 800,
              letterSpacing: -1,
            }}
          >
            Play
            <span style={{ color: "#a78bfa" }}>Bound</span>
          </div>
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
            The Home of Free Gaming
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 28,
              color: "#c4b5fd",
              maxWidth: 820,
            }}
          >
            Discover, play, and share the best free games.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 24,
            color: "#a1a1aa",
            letterSpacing: 0.5,
          }}
        >
          playbound.club
        </div>
      </div>
    ),
    { ...size },
  );
}
