import type { Metadata } from "next";
import { HomeBenefitsFaq } from "@/components/site/home/HomeBenefitsFaq";
import { HomeBookmarkStrip } from "@/components/site/home/HomeBookmarkStrip";
import { HomeCtaFooter } from "@/components/site/home/HomeCtaFooter";
import { HomeHero } from "@/components/site/home/HomeHero";
import { HomeNextUnlock } from "@/components/site/home/HomeNextUnlock";
import { HomeRecentAnswers } from "@/components/site/home/HomeRecentAnswers";
import { HomeRevealSection } from "@/components/site/home/HomeRevealSection";
import { HomeWhatIs } from "@/components/site/home/HomeWhatIs";
import { FooterBadgeWall } from "@/components/site/layout/FooterBadgeWall";
import { StructuredData } from "@/components/site/seo/StructuredData";
import { getArchiveEntries, getCurrentPuzzle, getNextPreview, getRecentEntries } from "@/lib/puzzles/data";
import { routes } from "@/lib/site/routes";
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
  const metadata = buildPageMetadata({
    title: HOME_SEO_TITLE,
    description: HOME_SEO_DESCRIPTION,
    path: routes.home,
  });

  return {
    ...metadata,
    alternates: null,
  };
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
          question: previousEntry
            ? `Where can I find yesterday's Pinpoint answer for Puzzle ${previousEntry.number}?`
            : "Where can I find yesterday's Pinpoint answer?",
          answer: previousEntry
            ? `Open Puzzle ${previousEntry.number} to review yesterday's answer and the full breakdown.`
            : "Use the archive page to review yesterday's board and other recent puzzles.",
        },
        {
          question: "Where can I browse older Pinpoint answers?",
          answer: "Use the archive page to review recent and older puzzles in one place.",
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
    <>
      <link rel="canonical" href={absoluteUrl(routes.home)} />
      <link rel="alternate" hrefLang="en" href={absoluteUrl(routes.home)} />
      <link rel="alternate" hrefLang="x-default" href={absoluteUrl(routes.home)} />
      <main className="container" style={{ padding: "48px 0 72px" }}>
        <StructuredData items={structuredDataItems} />
        <div className="stack">
          <HomeHero puzzle={current} previousEntry={previousEntry} />
          <HomeBookmarkStrip />
          <HomeRevealSection puzzle={current} previousEntry={previousEntry} preview={preview} />
          <HomeNextUnlock preview={preview} />
          <HomeRecentAnswers entries={archive} />
          <HomeWhatIs />
          <HomeBenefitsFaq puzzle={current} />
          <HomeCtaFooter currentPuzzleNumber={current.number} currentSlug={current.slug} />
          <FooterBadgeWall badges={footerBadges} heading="Media & Featured In" />
        </div>
      </main>
    </>
  );
}
