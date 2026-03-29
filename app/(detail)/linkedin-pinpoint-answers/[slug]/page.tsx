import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PuzzleDetail } from "@/components/detail/PuzzleDetail";
import { StructuredData } from "@/components/seo/StructuredData";
import { getVisibleDetailFaqs } from "@/lib/puzzles/detail-view";
import {
  getAdjacentEntries,
  getAllDetailSlugs,
  getNextPreview,
  getPuzzleBySlug,
  getRecentEntries,
} from "@/lib/puzzles/data";
import { routes } from "@/lib/paths/routes";
import {
  absoluteUrl,
  buildPageMetadata,
  buildPuzzleSeoDescription,
  buildPuzzleSeoTitle,
} from "@/lib/seo/metadata";

// Pre-render only the most recent 50 slugs at build time.
// Older pages and new puzzles are rendered on first request (ISR fallback).
export function generateStaticParams() {
  return getAllDetailSlugs()
    .slice(0, 50)
    .map((slug) => ({ slug }));
}

export const revalidate = 86400;
export const dynamicParams = true;

function withTrailingSlash(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const puzzle = await getPuzzleBySlug(slug, { allowLiveWorkerFallback: false });
  const detailPath = withTrailingSlash(routes.detail(slug));

  if (!puzzle) {
    return buildPageMetadata({
      title: "Pinpoint Answer",
      description: "This Pinpoint answer page could not be found.",
      path: detailPath,
      noIndex: true,
    });
  }

  const seoTitle = buildPuzzleSeoTitle(puzzle.number, puzzle.clues);
  const isShortMode = puzzle.detailMode === "short";
  const seoDescription = isShortMode
    ? `LinkedIn Pinpoint ${puzzle.number} clues: ${puzzle.clues.join(", ")}. Spoiler-safe hints, a compact guide, and the answer included. Answer: ${puzzle.answer}.`
    : buildPuzzleSeoDescription(puzzle.number, puzzle.clues, puzzle.answer);
  const puzzleDetailPath = withTrailingSlash(routes.detail(puzzle.slug));

  return buildPageMetadata({
    title: seoTitle,
    description: seoDescription,
    path: puzzleDetailPath,
    type: "article",
    socialImagePath: `${puzzleDetailPath}opengraph-image`,
    socialImageAlt: `LinkedIn Pinpoint #${puzzle.number} social preview`,
  });
}

export default async function DetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const detailArchiveOptions = { allowLiveWorkerFallback: false } as const;
  const { slug } = await params;
  const [puzzle, recentPuzzles, nextPreview, adjacent] = await Promise.all([
    getPuzzleBySlug(slug, detailArchiveOptions),
    getRecentEntries(10, slug, detailArchiveOptions),
    getNextPreview(),
    getAdjacentEntries(slug, detailArchiveOptions),
  ]);

  if (!puzzle) {
    notFound();
  }

  const seoHeadline = buildPuzzleSeoTitle(puzzle.number, puzzle.clues);
  const detailPath = withTrailingSlash(routes.detail(puzzle.slug));
  const detailUrl = absoluteUrl(detailPath);
  const detailOpenGraphImagePath = `${detailPath}opengraph-image`;
  const isShortMode = puzzle.detailMode === "short";
  const visibleFaqs = getVisibleDetailFaqs(puzzle.faqs, puzzle.detailMode);
  const seoDescription = isShortMode
    ? `LinkedIn Pinpoint ${puzzle.number} clues: ${puzzle.clues.join(", ")}. Spoiler-safe hints, a compact guide, and the answer included. Answer: ${puzzle.answer}.`
    : buildPuzzleSeoDescription(puzzle.number, puzzle.clues, puzzle.answer);

  const structuredDataItems = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: seoHeadline,
      description: seoDescription,
      image: absoluteUrl(detailOpenGraphImagePath),
      dateModified: puzzle.updatedAt,
      datePublished: `${puzzle.isoDate}T00:00:00Z`,
      mainEntityOfPage: detailUrl,
      author: {
        "@type": "Organization",
        name: "Pinpoint Answer Today",
        url: absoluteUrl(routes.home),
      },
      publisher: {
        "@type": "Organization",
        name: "Pinpoint Answer Today",
        url: absoluteUrl(routes.home),
        logo: {
          "@type": "ImageObject",
          url: absoluteUrl("/favicon/apple-touch-icon.png"),
        },
      },
    },
    ...(
      visibleFaqs.length > 0
        ? [
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: visibleFaqs.map((faq) => ({
                "@type": "Question",
                name: faq.question,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: faq.answer,
                },
              })),
            },
          ]
        : []
    ),
    {
      "@context": "https://schema.org",
      "@type": "Game",
      name: `LinkedIn Pinpoint #${puzzle.number}`,
      genre: "Puzzle Game",
      creator: {
        "@type": "Organization",
        name: "LinkedIn",
      },
      inLanguage: "en-US",
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
      url: detailUrl,
      inLanguage: "en-US",
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
          text: isShortMode
            ? `Compare your guess with the compact guide for puzzle #${puzzle.number}. Reveal the validated connector and use the table below to confirm each clue.`
            : `Compare your guess with the full clue-by-clue walkthrough for puzzle #${puzzle.number}. Reveal the validated connector and see how each clue fits.`,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: recentPuzzles.map((entry, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absoluteUrl(withTrailingSlash(routes.detail(entry.slug))),
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
          item: detailUrl,
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
        nextPreview={nextPreview}
        adjacentPrev={adjacent.prev}
        adjacentNext={adjacent.next}
      />
    </main>
  );
}
