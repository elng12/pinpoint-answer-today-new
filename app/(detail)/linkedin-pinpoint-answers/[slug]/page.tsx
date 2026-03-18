import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PuzzleDetail } from "@/components/puzzles/detail/PuzzleDetail";
import { StructuredData } from "@/components/site/seo/StructuredData";
import {
  getAdjacentEntries,
  getAllDetailSlugs,
  getCurrentPuzzle,
  getNextPreview,
  getPuzzleBySlug,
  getRecentEntries,
} from "@/lib/puzzles/data";
import { routes } from "@/lib/site/routes";
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

function parsePuzzleNumberFromSlug(slug: string): number | null {
  const match = slug.match(/^pinpoint-answer-(\d+)$/);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

async function getPublishingFallback(slug: string): Promise<{ requestedNumber: number } | null> {
  const requestedNumber = parsePuzzleNumberFromSlug(slug);
  if (!requestedNumber) return null;

  try {
    const current = await getCurrentPuzzle();
    const today = new Date().toISOString().slice(0, 10);

    if (requestedNumber !== current.number + 1) return null;
    if (current.isoDate >= today) return null;

    return { requestedNumber };
  } catch {
    return null;
  }
}

function PublishingFallback({ requestedNumber }: { requestedNumber: number }) {
  return (
    <main className="container" style={{ padding: "48px 0 72px" }}>
      <section className="surface" style={{ padding: 32, textAlign: "center" }}>
        <p className="eyebrow">Publishing</p>
        <h1 className="section-title">Pinpoint #{requestedNumber} is still rolling out</h1>
        <p className="copy" style={{ margin: "12px auto 0", maxWidth: 640 }}>
          {
            "The new answer page is still propagating across the live site. This is usually a short deployment gap and should clear within a minute or two."
          }
        </p>
        <div className="button-row" style={{ justifyContent: "center" }}>
          <Link className="button-primary" href={routes.home}>
            Go to today
          </Link>
          <Link className="button-secondary" href={routes.archive}>
            Browse archive
          </Link>
        </div>
      </section>
    </main>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const puzzle = await getPuzzleBySlug(slug);

  if (!puzzle) {
    const pending = await getPublishingFallback(slug);
    if (pending) {
      return buildPageMetadata({
        title: `Pinpoint #${pending.requestedNumber} is publishing`,
        description:
          "This answer page is still propagating across the live site. Please retry shortly for the full walkthrough.",
        path: routes.detail(slug),
        noIndex: true,
      });
    }

    return buildPageMetadata({
      title: "Pinpoint Answer",
      description: "This Pinpoint answer page could not be found.",
      path: routes.archive,
      noIndex: true,
    });
  }

  const seoTitle = buildPuzzleSeoTitle(puzzle.number, puzzle.clues);
  const seoDescription = buildPuzzleSeoDescription(puzzle.number, puzzle.clues, puzzle.answer);

  return buildPageMetadata({
    title: seoTitle,
    description: seoDescription,
    path: routes.detail(puzzle.slug),
    type: "article",
    socialImagePath: `${routes.detail(puzzle.slug)}/opengraph-image`,
    socialImageAlt: `LinkedIn Pinpoint #${puzzle.number} social preview`,
  });
}

export default async function DetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [puzzle, recentPuzzles, nextPreview, adjacent] = await Promise.all([
    getPuzzleBySlug(slug),
    getRecentEntries(10, slug),
    getNextPreview(),
    getAdjacentEntries(slug),
  ]);

  if (!puzzle) {
    const pending = await getPublishingFallback(slug);
    if (pending) {
      return <PublishingFallback requestedNumber={pending.requestedNumber} />;
    }

    notFound();
  }

  const seoHeadline = buildPuzzleSeoTitle(puzzle.number, puzzle.clues);
  const seoDescription = buildPuzzleSeoDescription(puzzle.number, puzzle.clues, puzzle.answer);

  const structuredDataItems = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: seoHeadline,
      description: seoDescription,
      image: absoluteUrl(
        `${routes.detail(puzzle.slug)}/opengraph-image`
      ),
      dateModified: puzzle.updatedAt,
      datePublished: `${puzzle.isoDate}T00:00:00Z`,
      mainEntityOfPage: absoluteUrl(routes.detail(puzzle.slug)),
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
      url: absoluteUrl(routes.detail(puzzle.slug)),
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
          text: `Compare your guess with the full clue-by-clue walkthrough for puzzle #${puzzle.number}. Reveal the validated connector and see how each clue fits.`,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "Review",
      name: `Editorial review for LinkedIn Pinpoint #${puzzle.number}`,
      reviewBody: puzzle.shortSummary,
      inLanguage: "en-US",
      author: {
        "@type": "Organization",
        name: "Pinpoint Answer Today Editorial Team",
        url: absoluteUrl(routes.home),
      },
      itemReviewed: {
        "@type": "SoftwareApplication",
        name: `LinkedIn Pinpoint #${puzzle.number}`,
        url: absoluteUrl(routes.detail(puzzle.slug)),
        applicationCategory: "GameApplication",
        operatingSystem: "Web browser",
        author: {
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
        nextPreview={nextPreview}
        adjacentPrev={adjacent.prev}
        adjacentNext={adjacent.next}
      />
    </main>
  );
}
