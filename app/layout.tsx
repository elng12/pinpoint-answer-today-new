import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/app/globals.css";
import { inter, spaceGrotesk } from "@/app/fonts";
import { AnalyticsScripts } from "@/components/analytics/AnalyticsScripts";
import { Footer } from "@/components/layout/Footer";
import { NavBar } from "@/components/layout/NavBar";
import { getRecentEntries } from "@/lib/puzzles/data";
import { buildSiteMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildSiteMetadata({
  title: "Pinpoint Answer Today",
  description: "Daily LinkedIn Pinpoint answers with spoiler-safe hints, full walkthroughs, and an archive of past puzzles.",
});

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const recentEntries = await getRecentEntries(10);

  return (
    <html lang="en">
      <body className={`${inter.variable} ${spaceGrotesk.variable} ${inter.className}`}>
        <div className="shell">
          <NavBar />
          {children}
          <Footer recentEntries={recentEntries} />
        </div>
        <AnalyticsScripts />
      </body>
    </html>
  );
}
