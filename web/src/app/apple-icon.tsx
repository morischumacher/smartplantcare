import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#059669" }}>
        <svg width="120" height="120" viewBox="0 0 64 64">
          <path d="M17 47c0-17 10-28 30-30-2 20-13 30-30 30Z" fill="#d1fae5" />
          <path d="M17 47 34 30" stroke="#059669" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      </div>
    ),
    size,
  );
}
