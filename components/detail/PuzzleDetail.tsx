import Link from "next/link";
import type { ArchiveEntry, PuzzleDetail as PuzzleDetailRecord } from "@/lib/puzzles/data";
import { PuzzleAnswerReveal } from "@/components/detail/PuzzleAnswerReveal";
import { PuzzleFullAnalysis } from "@/components/detail/PuzzleFullAnalysis";
import { routes } from "@/lib/paths/routes";
import type { LatestAnswerCtaPuzzle } from "@/components/detail/LatestAnswerCta";
import { LatestAnswerStickyBanner } from "@/components/detail/LatestAnswerStickyBanner";

function formatLegacyDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

function formatPlainCluePath(clues: string[]): string {
  return clues.join(" ");
}

function buildDetailSummary(puzzle: PuzzleDetailRecord): string {
  const cluePath = formatPlainCluePath(puzzle.clues);
  return `For LinkedIn Pinpoint ${puzzle.number}, the clue path is ${cluePath}. The early clues can point in a few directions. The Pinpoint ${puzzle.number} answer starts to make sense only when one shared word turns the whole set into familiar phrases.`;
}

export function PuzzleDetail({
  puzzle,
  recentPuzzles,
  adjacentPrev,
  adjacentNext,
  latestPuzzle,
}: {
  puzzle: PuzzleDetailRecord;
  recentPuzzles: ArchiveEntry[];
  adjacentPrev: ArchiveEntry | null;
  adjacentNext: ArchiveEntry | null;
  latestPuzzle: LatestAnswerCtaPuzzle | null;
}) {
  const isLightExplainerMode = puzzle.pageExperienceMode === "light-explainer";
  const isFallbackDetail = puzzle.detailSource === "fallback";
  const verificationLabel = isFallbackDetail
    ? "Quick guide from live puzzle data"
    : isLightExplainerMode
      ? "Compact explainer from verified puzzle data"
    : "LinkedIn puzzle verified";
  const summary = buildDetailSummary(puzzle);
  const publishedAt = `${puzzle.isoDate}T00:00:00Z`;
  const updatedDate = puzzle.updatedAt?.slice(0, 10);
  const showUpdatedAt = Boolean(updatedDate && updatedDate !== puzzle.isoDate && puzzle.updatedAt !== publishedAt);
  return (
    <div className="legacy-detail-page">
      <section className="legacy-detail-header">
        <nav aria-label="Breadcrumb" className="legacy-detail-breadcrumbs">
          <Link href={routes.home}>Home</Link>
          <span>/</span>
          <Link href={routes.archive}>Archive</Link>
          <span>/</span>
          <span>{`LinkedIn Pinpoint ${puzzle.number} Answer`}</span>
        </nav>

        <p className="eyebrow legacy-detail-kicker">{`LinkedIn Pinpoint ${puzzle.number} answer guide`}</p>
        <h1 className="legacy-detail-title">{`Pinpoint ${puzzle.number} Answer & LinkedIn Analysis`}</h1>
        <p className="legacy-detail-published">{`Published ${formatLegacyDate(puzzle.isoDate)}`}</p>
        {showUpdatedAt ? (
          <p className="legacy-detail-updated">{`Updated ${formatLegacyDate(updatedDate ?? puzzle.isoDate)}`}</p>
        ) : null}
        <div className={`legacy-detail-verified${isFallbackDetail ? " legacy-detail-verified-fallback" : ""}`}>
          <span aria-hidden="true">{isFallbackDetail ? "i" : "✓"}</span>
          <span>{verificationLabel}</span>
          <Link href="/about-us#editorial-process" className="legacy-detail-verify-link">
            How we verify
          </Link>
        </div>
        <p className="copy legacy-detail-summary">{summary}</p>
      </section>

      <PuzzleAnswerReveal
        puzzleNumber={puzzle.number}
        clues={puzzle.clues}
        answer={puzzle.answer}
        detailMode={puzzle.detailMode}
        trackFaqSectionView
      />

      <PuzzleFullAnalysis
        puzzle={puzzle}
        recentPuzzles={recentPuzzles}
        adjacentPrev={adjacentPrev}
        adjacentNext={adjacentNext}
      />

      <LatestAnswerStickyBanner
        currentSlug={puzzle.slug}
        currentNumber={puzzle.number}
        latestPuzzle={latestPuzzle}
      />
    </div>
  );
}
