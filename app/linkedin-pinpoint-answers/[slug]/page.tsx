import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PuzzleDetail } from "@/components/detail/PuzzleDetail";
import { StructuredData } from "@/components/seo/StructuredData";
import { getAllDetailSlugs, getNextPreview, getPuzzleBySlug, getRecentEntries } from "@/lib/puzzles/data";
import { routes } from "@/lib/paths/routes";
import { absoluteUrl, buildPageMetadata } from "@/lib/seo/metadata";

export function generateStaticParams() {
  return getAllDetailSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const puzzle = getPuzzleBySlug(slug);

  if (!puzzle) {
    return buildPageMetadata({
      title: "Pinpoint Answer",
      description: "This Pinpoint answer page could not be found.",
      path: routes.archive,
    });
  }

  const clueList = puzzle.clues.join(", ");
  const seoTitle = `LinkedIn Pinpoint ${puzzle.number}: ${clueList}`;
  const seoDescription = `Explore LinkedIn Pinpoint ${puzzle.number} with clues: ${clueList}. Get spoiler-safe hints, a walkthrough, and an archive recap.`;

  return buildPageMetadata({
    title: seoTitle,
    description: seoDescription,
    path: routes.detail(puzzle.slug),
    type: "article",
  });
}

export default async function DetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const puzzle = getPuzzleBySlug(slug);

  if (!puzzle) {
    notFound();
  }

  const clueList = puzzle.clues.join(", ");
  const seoHeadline = `LinkedIn Pinpoint ${puzzle.number}: ${clueList}`;
  const seoDescription = `Explore LinkedIn Pinpoint ${puzzle.number} with clues: ${clueList}. Get spoiler-safe hints, a walkthrough, and an archive recap.`;
  const recentPuzzles = getRecentEntries(10, puzzle.slug);

  const structuredDataItems = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: seoHeadline,
      description: seoDescription,
      dateModified: puzzle.updatedAt,
      datePublished: `${puzzle.isoDate}T00:00:00Z`,
      mainEntityOfPage: absoluteUrl(routes.detail(puzzle.slug)),
      author: {
        "@type": "Organization",
        name: "Pinpoint Answer Today",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: puzzle.faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer,
        },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "Game",
      name: `LinkedIn Pinpoint #${puzzle.number}`,
      genre: "Puzzle Game",
      creator: {
        "@type": "Organization",
        name: "LinkedIn",
      },
      inLanguage: "en_US",
      isPartOf: {
        "@type": "WebSite",
        name: "Pinpoint Answer Today",
        url: absoluteUrl(routes.home),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: `How to solve LinkedIn Pinpoint #${puzzle.number}`,
      description: `Step-by-step method to solve LinkedIn Pinpoint #${puzzle.number} using clue grouping and connector validation.`,
      url: absoluteUrl(routes.detail(puzzle.slug)),
      inLanguage: "en_US",
      step: [
        {
          "@type": "HowToStep",
          position: 1,
          name: "List the clues",
          text: `Write down the five clues: ${puzzle.clues.join(", ")}.`,
        },
        {
          "@type": "HowToStep",
          position: 2,
          name: "Group by meaning",
          text: "Cluster clues by domain, phrase pattern, or shared context before guessing a final connector.",
        },
        {
          "@type": "HowToStep",
          position: 3,
          name: "Test one connector across all clues",
          text: "Use one candidate word and verify it forms a meaningful phrase or relation with every clue.",
        },
        {
          "@type": "HowToStep",
          position: 4,
          name: "Confirm with walkthrough",
          text: `Compare your guess with the full clue-by-clue walkthrough for puzzle #${puzzle.number}. Reveal the validated connector and see how each clue fits.`,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "Review",
      name: `Editorial review for LinkedIn Pinpoint #${puzzle.number}`,
      reviewBody: puzzle.shortSummary,
      inLanguage: "en_US",
      author: {
        "@type": "Organization",
        name: "Pinpoint Answer Today Editorial Team",
        url: absoluteUrl(routes.home),
      },
      itemReviewed: {
        "@type": "Game",
        name: `LinkedIn Pinpoint #${puzzle.number}`,
        url: absoluteUrl(routes.detail(puzzle.slug)),
        genre: "Puzzle Game",
        gamePlatform: "Web browser",
        publisher: {
          "@type": "Organization",
          name: "LinkedIn",
        },
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: recentPuzzles.map((entry, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absoluteUrl(routes.detail(entry.slug)),
        name: `LinkedIn Pinpoint #${entry.number} answer`,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: absoluteUrl(routes.home),
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "LinkedIn Pinpoint Answers Archive",
          item: absoluteUrl(routes.archive),
        },
        {
          "@type": "ListItem",
          position: 3,
          name: `Pinpoint #${puzzle.number}`,
          item: absoluteUrl(routes.detail(puzzle.slug)),
        },
      ],
    },
  ];

  return (
    <main className="container detail-page-main">
      <StructuredData items={structuredDataItems} />
      <PuzzleDetail
        puzzle={puzzle}
        recentPuzzles={recentPuzzles}
        nextPreview={getNextPreview()}
      />
    </main>
  );
}
