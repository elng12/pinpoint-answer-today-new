import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/app/globals.css";
import { inter } from "@/app/fonts";
import { AnalyticsScripts } from "@/components/analytics/AnalyticsScripts";
import { buildSiteMetadata, HOME_SEO_DESCRIPTION, HOME_SEO_TITLE } from "@/lib/seo/metadata";

export const metadata: Metadata = buildSiteMetadata({
  title: HOME_SEO_TITLE,
  description: HOME_SEO_DESCRIPTION,
  // Real pages provide their own canonical and social metadata.
  // Keep the root fallback minimal so 404 pages do not inherit homepage signals.
  includeAlternates: false,
  includeSocial: false,
});

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${inter.className}`}>
        <div className="shell">{children}</div>
        <AnalyticsScripts />
      </body>
    </html>
  );
}
