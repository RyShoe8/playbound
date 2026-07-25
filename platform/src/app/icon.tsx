import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          background: "#8b5cf6",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#faf8ff">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
