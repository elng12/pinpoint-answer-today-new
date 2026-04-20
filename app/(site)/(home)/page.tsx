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
import { supportEmail } from "@/lib/site/config";
import {
  absoluteUrl,
  buildPageMetadata,
  HOME_SEO_DESCRIPTION,
  HOME_SEO_TITLE,
} from "@/lib/seo/metadata";

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const current = await getCurrentPuzzle();
  const description = `Today's LinkedIn Pinpoint answer is Puzzle #${current.number}. Get spoiler-safe hints, clue help, and the verified solution for the current puzzle.`;
  return buildPageMetadata({
    title: HOME_SEO_TITLE,
    description,
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
  const structuredDataItems = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Pinpoint Answer Today",
      url: absoluteUrl(routes.home),
      logo: {
        "@type": "ImageObject",
        url: absoluteUrl("/favicon/apple-touch-icon.png"),
        width: 180,
        height: 180,
      },
      description: HOME_SEO_DESCRIPTION,
      email: supportEmail,
      contactPoint: [
        {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: supportEmail,
          url: absoluteUrl(routes.contact),
          availableLanguage: ["en"],
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Pinpoint Answer Today",
      url: absoluteUrl(routes.home),
      description: HOME_SEO_DESCRIPTION,
      inLanguage: "en-US",
      potentialAction: {
        "@type": "SearchAction",
        target: `${absoluteUrl(routes.archive)}?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          question: `What is the Pinpoint answer today for Puzzle ${current.number}?`,
          answer: `The answer for Puzzle ${current.number} is ${current.answer}.`,
        },
        {
          question: "Where can I browse older Pinpoint answers?",
          answer:
            "Open the archive page to browse recent answers, search past puzzles by keyword, and jump into older clue-by-clue walkthroughs from one place.",
        },
        {
          question: "What is LinkedIn Pinpoint?",
          answer: "It is a daily word-association puzzle built around a shared connection.",
        },
      ].map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer,
        },
      })),
    },
  ];

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
