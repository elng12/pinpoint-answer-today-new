import { ImageResponse } from "next/og";
import { siteName } from "@/lib/site/config";

export const socialImageSize = {
  width: 1200,
  height: 630,
};

type SocialImageOptions = {
  eyebrow: string;
  title: string;
  subtitle: string;
};

function clampText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

export function createSocialImageResponse({
  eyebrow,
  title,
  subtitle,
}: SocialImageOptions): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(135deg, #0f172a 0%, #11284d 45%, #1d4ed8 100%)",
          color: "#f8fafc",
          padding: "64px",
          fontFamily: "sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "auto -80px -120px auto",
            width: "360px",
            height: "360px",
            borderRadius: "9999px",
            background: "rgba(148, 163, 184, 0.15)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: "-120px auto auto -120px",
            width: "300px",
            height: "300px",
            borderRadius: "9999px",
            background: "rgba(125, 211, 252, 0.12)",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            height: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              fontSize: "28px",
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              opacity: 0.9,
            }}
          >
            <div
              style={{
                width: "18px",
                height: "18px",
                borderRadius: "9999px",
                background: "#7dd3fc",
              }}
            />
            {siteName}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "22px",
              maxWidth: "860px",
            }}
          >
            <div
              style={{
                fontSize: "30px",
                lineHeight: 1.2,
                fontWeight: 700,
                color: "rgba(191, 219, 254, 0.96)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {clampText(eyebrow, 48)}
            </div>
            <div
              style={{
                fontSize: "72px",
                lineHeight: 1.02,
                fontWeight: 800,
              }}
            >
              {clampText(title, 92)}
            </div>
            <div
              style={{
                fontSize: "30px",
                lineHeight: 1.35,
                color: "rgba(241, 245, 249, 0.88)",
              }}
            >
              {clampText(subtitle, 170)}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: "18px",
              fontSize: "26px",
              color: "rgba(226, 232, 240, 0.92)",
            }}
          >
            <span>Today answer</span>
            <span>Full walkthrough</span>
            <span>Archive</span>
          </div>
        </div>
      </div>
    ),
    socialImageSize,
  );
}
