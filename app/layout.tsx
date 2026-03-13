import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/app/globals.css";
import { inter, spaceGrotesk } from "@/app/fonts";
import { AnalyticsScripts } from "@/components/analytics/AnalyticsScripts";
import { buildSiteMetadata, HOME_SEO_DESCRIPTION, HOME_SEO_TITLE } from "@/lib/seo/metadata";

export const metadata: Metadata = buildSiteMetadata({
  title: HOME_SEO_TITLE,
  description: HOME_SEO_DESCRIPTION,
});

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${spaceGrotesk.variable} ${inter.className}`}>
        <div className="shell">{children}</div>
        <AnalyticsScripts />
      </body>
    </html>
  );
}
