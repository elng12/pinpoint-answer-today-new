import type { Metadata } from "next";
import { HomeBenefitsFaq } from "@/components/home/HomeBenefitsFaq";
import { HomeBookmarkStrip } from "@/components/home/HomeBookmarkStrip";
import { HomeCtaFooter } from "@/components/home/HomeCtaFooter";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeNextUnlock } from "@/components/home/HomeNextUnlock";
import { HomeRecentAnswers } from "@/components/home/HomeRecentAnswers";
import { HomeRevealSection } from "@/components/home/HomeRevealSection";
import { HomeWhatIs } from "@/components/home/HomeWhatIs";
import { FooterBadgeWall } from "@/components/layout/FooterBadgeWall";
import { StructuredData } from "@/components/seo/StructuredData";
import { getArchiveEntries, getCurrentPuzzle, getNextPreview, getRecentEntries } from "@/lib/puzzles/data";
import { routes } from "@/lib/paths/routes";
import { footerBadges } from "@/lib/site/badges";
import {
  buildPageMetadata,
  HOME_SEO_DESCRIPTION,
  HOME_SEO_TITLE,
} from "@/lib/seo/metadata";
import { buildHomeStructuredData } from "@/lib/seo/home-structured-data";

export const revalidate = 86400;

export function generateMetadata(): Metadata {
  return buildPageMetadata({
    title: HOME_SEO_TITLE,
    description: HOME_SEO_DESCRIPTION,
    path: routes.home,
  });
}

export default async function HomePage() {
  const [current, preview, archive, allArchiveEntries] = await Promise.all([
    getCurrentPuzzle(),
    getNextPreview(),
    getRecentEntries(8),
    getArchiveEntries(),
  ]);

  const previousEntry = allArchiveEntries.find((entry) => entry.number < current.number) ?? null;
  const structuredDataItems = buildHomeStructuredData();

  return (
    <main className="container" style={{ padding: "48px 0 72px" }}>
      <StructuredData items={structuredDataItems} />
      <div className="stack">
        <HomeHero puzzle={current} />
        <HomeBookmarkStrip />
        <HomeRevealSection puzzle={current} previousEntry={previousEntry} preview={preview} />
        <HomeNextUnlock preview={preview} />
        <HomeRecentAnswers entries={archive} />
        <HomeWhatIs />
        <HomeBenefitsFaq puzzle={current} />
        <HomeCtaFooter currentSlug={current.slug} />
        <FooterBadgeWall badges={footerBadges} heading="Media & Featured In" />
      </div>
    </main>
  );
}
