import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#8b5cf6",
        }}
      >
        <svg width="90" height="90" viewBox="0 0 24 24" fill="#faf8ff">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
