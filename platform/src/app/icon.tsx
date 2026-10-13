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
          background: "#15161c",
        }}
      >
        <svg width="32" height="32" viewBox="0 0 1024 1024" fill="#38BDF8">
          <path d="M342 182 L809 512 L342 842 Z" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
