import type { ArchiveEntry, PuzzleDetail } from "@/lib/puzzles/data";
import { routes } from "@/lib/paths/routes";
import { defaultSocialImagePath } from "@/lib/site/config";
import {
  absoluteUrl,
  buildPuzzleSeoDescription,
  buildPuzzleSeoTitle,
} from "@/lib/seo/metadata";

type PuzzleStructuredDataInput = Pick<
  PuzzleDetail,
  "answer" | "clues" | "isoDate" | "number" | "slug" | "updatedAt"
>;

type RecentPuzzleStructuredDataInput = Pick<ArchiveEntry, "number" | "slug">;

function withTrailingSlash(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

export function buildPuzzleDetailStructuredData({
  puzzle,
  recentPuzzles,
}: {
  puzzle: PuzzleStructuredDataInput;
  recentPuzzles: RecentPuzzleStructuredDataInput[];
}): Record<string, unknown>[] {
  const seoHeadline = buildPuzzleSeoTitle(puzzle.number, puzzle.clues);
  const detailPath = withTrailingSlash(routes.detail(puzzle.slug));
  const detailUrl = absoluteUrl(detailPath);
  const seoDescription = buildPuzzleSeoDescription(puzzle.number, puzzle.clues, puzzle.answer);

  return [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: seoHeadline,
      description: seoDescription,
      image: absoluteUrl(defaultSocialImagePath),
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
}
