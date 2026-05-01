import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PuzzleDetail } from "@/components/detail/PuzzleDetail";
import { StructuredData } from "@/components/seo/StructuredData";
import {
  getAdjacentEntries,
  getAllDetailSlugs,
  getCurrentPuzzle,
  getNextPreview,
  getPuzzleBySlug,
  getRecentEntries,
} from "@/lib/puzzles/data";
import { routes } from "@/lib/paths/routes";
import {
  buildPageMetadata,
  buildPuzzleSeoDescription,
  buildPuzzleSeoTitle,
} from "@/lib/seo/metadata";
import { buildPuzzleDetailStructuredData } from "@/lib/seo/puzzle-detail-structured-data";

export function generateStaticParams() {
  return getAllDetailSlugs().map((slug) => ({ slug }));
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
  const seoDescription = buildPuzzleSeoDescription(puzzle.number, puzzle.clues, puzzle.answer);
  const puzzleDetailPath = withTrailingSlash(routes.detail(puzzle.slug));

  return buildPageMetadata({
    title: seoTitle,
    description: seoDescription,
    path: puzzleDetailPath,
    type: "article",
    socialImagePath: `${puzzleDetailPath}opengraph-image`,
    socialImageAlt: `LinkedIn Pinpoint #${puzzle.number}: ${puzzle.clues.join(", ")}`,
  });
}

export default async function DetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const detailArchiveOptions = { allowLiveWorkerFallback: false } as const;
  const { slug } = await params;
  const [puzzle, recentPuzzles, nextPreview, adjacent, currentPuzzle] = await Promise.all([
    getPuzzleBySlug(slug, detailArchiveOptions),
    getRecentEntries(10, slug, detailArchiveOptions),
    getNextPreview(),
    getAdjacentEntries(slug, detailArchiveOptions),
    getCurrentPuzzle(detailArchiveOptions),
  ]);

  if (!puzzle) {
    notFound();
  }

  const structuredDataItems = buildPuzzleDetailStructuredData({ puzzle, recentPuzzles });

  return (
    <main className="container detail-page-main">
      <StructuredData items={structuredDataItems} />
      <PuzzleDetail
        puzzle={puzzle}
        recentPuzzles={recentPuzzles}
        nextPreview={nextPreview}
        adjacentPrev={adjacent.prev}
        adjacentNext={adjacent.next}
        latestPuzzle={{ number: currentPuzzle.number, slug: currentPuzzle.slug }}
      />
    </main>
  );
}
