import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_PUBLIC_HOST, SITE_TAGLINE, SITE_DESCRIPTION } from "@/lib/site";

export const runtime = "edge";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const title = searchParams.get("title") || `${SITE_NAME} — ${SITE_TAGLINE}`;
    const description = searchParams.get("description") || SITE_DESCRIPTION;
    const badge = searchParams.get("badge") || "PlayBound";
    const path = searchParams.get("path") || "";
    const tagsParam = searchParams.get("tags");
    const tags = tagsParam
      ? tagsParam.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 3)
      : [];
    const imageUrl = searchParams.get("image");

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            background: "linear-gradient(140deg, #080a14 0%, #0f172a 45%, #1e1b4b 100%)",
            padding: "54px 64px",
            color: "#f8fafc",
            fontFamily: "system-ui, -apple-system, sans-serif",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Ambient glow lights */}
          <div
            style={{
              position: "absolute",
              top: -80,
              right: -80,
              width: 500,
              height: 500,
              borderRadius: 999,
              background: "radial-gradient(circle, rgba(168, 85, 247, 0.22) 0%, rgba(99, 102, 241, 0) 70%)",
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
              background: "radial-gradient(circle, rgba(59, 130, 246, 0.18) 0%, rgba(14, 165, 233, 0) 70%)",
              display: "flex",
            }}
          />

          {/* Top Row: PlayBound Brand + Badge */}
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
                background: "rgba(168, 85, 247, 0.15)",
                border: "1.5px solid rgba(192, 132, 252, 0.4)",
                borderRadius: 999,
                padding: "8px 18px",
                fontSize: 16,
                fontWeight: 700,
                color: "#e9d5ff",
                letterSpacing: 0.5,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: "#a855f7",
                  display: "flex",
                  boxShadow: "0 0 10px #a855f7",
                }}
              />
              {badge}
            </div>
          </div>

          {/* Center Content: Title, Description, Tags */}
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
                maxWidth: imageUrl ? 720 : 1060,
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: title.length > 40 ? 50 : 58,
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
                  fontSize: 23,
                  color: "#cbd5e1",
                  lineHeight: 1.38,
                  maxHeight: 110,
                  overflow: "hidden",
                }}
              >
                {description}
              </div>

              {tags.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                  {tags.map((tag) => (
                    <div
                      key={tag}
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
                      {tag}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {imageUrl && (
              <div
                style={{
                  display: "flex",
                  width: 280,
                  height: 280,
                  borderRadius: 20,
                  overflow: "hidden",
                  border: "2px solid rgba(255, 255, 255, 0.15)",
                  boxShadow: "0 16px 36px -8px rgba(0, 0, 0, 0.6)",
                  position: "relative",
                  flexShrink: 0,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt={title}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              </div>
            )}
          </div>

          {/* Footer: Tagline / Path */}
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
              {SITE_TAGLINE} — Free & Affordable PC Gaming
            </div>
            <div style={{ display: "flex", fontSize: 18, color: "#c084fc", fontWeight: 700, letterSpacing: 0.3 }}>
              {SITE_PUBLIC_HOST}{path.startsWith("/") ? path : `/${path}`}
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (err) {
    console.error("Failed to generate OpenGraph image:", err);
    return new Response("Failed to generate image", { status: 500 });
  }
}
