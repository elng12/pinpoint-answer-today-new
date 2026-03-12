import type { Metadata } from "next";
import { routes } from "@/lib/paths/routes";
import { buildPageMetadata } from "@/lib/seo/metadata";

export function generateMetadata(): Metadata {
  return buildPageMetadata({
    title: "Media & Featured In",
    description:
      "Highlights, mentions, and featured placements for Pinpoint Answer Today. Reach out if you want to include this project.",
    path: routes.featured,
    noIndex: true,
  });
}

export default function FeaturedPage() {
  return (
    <main className="container" style={{ padding: "32px 0 56px" }}>
      <div className="stack">
        <header className="surface" style={{ padding: 32 }}>
          <p className="eyebrow">Media &amp; Featured In</p>
          <h1 className="section-title">Featured placements and mentions</h1>
          <p className="copy">
            This page is a placeholder so existing footer links are not broken. If you want to add real logos, quotes,
            or a press kit, tell me what sources to include and I will format them to match the site.
          </p>
        </header>
      </div>
    </main>
  );
}

