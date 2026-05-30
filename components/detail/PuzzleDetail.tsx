import Link from "next/link";
import type { ArchiveEntry, PuzzleDetail as PuzzleDetailRecord } from "@/lib/puzzles/data";
import { PuzzleAnswerReveal } from "@/components/detail/PuzzleAnswerReveal";
import { PuzzleCheckin } from "@/components/detail/PuzzleCheckin";
import { PuzzleFullAnalysis } from "@/components/detail/PuzzleFullAnalysis";
import { DetailShareButton } from "@/components/detail/DetailShareButton";
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

function formatCluePath(clues: string[]): string {
  return clues.join(", ");
}

function buildDetailSummary(puzzle: PuzzleDetailRecord, isShortMode: boolean, isFallbackShortMode: boolean): string {
  const answer = puzzle.answer.trim();
  const afterMatch = answer.match(/^Words that come after "(.+)"$/i);
  const beforeMatch = answer.match(/^Words that come before "(.+)"$/i);

  if (afterMatch) {
    return isShortMode
      ? "This quick guide shows which familiar phrases appear when one shared word comes before the clue set. Reveal the answer, then read the short reasoning and FAQ below."
      : "This Pinpoint answer guide asks which shared word turns the clue set into familiar phrases and common terms. Check the clue order, reveal the answer, then read why the same word makes each clue land cleanly.";
  }

  if (beforeMatch) {
    return isShortMode
      ? "This quick guide shows which familiar phrases appear when one shared word follows the clue set. Reveal the answer, then read the short reasoning and FAQ below."
      : "This Pinpoint answer guide asks which shared word fits after the clue set to create familiar phrases. Check the clue order, reveal the answer, then read why the same word completes each clue cleanly.";
  }

  if (isFallbackShortMode) {
    return "This quick guide keeps the clue order, answer reveal, reasoning, and FAQ focused on the fastest path to the final connection.";
  }

  if (isShortMode) {
    return "This quick guide keeps the clue order, answer reveal, reasoning, and FAQ focused on the fastest path to the final connection.";
  }

  return "This Pinpoint answer guide asks what shared idea links the clue set. Check the clues first, reveal the answer, then see how the board clicks into place.";
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
  const isShortMode = puzzle.detailMode === "short";
  const isLightExplainerMode = puzzle.pageExperienceMode === "light-explainer";
  const isFallbackShortMode = isShortMode && (puzzle.detailSource === "fallback" || isLightExplainerMode);
  const isFallbackDetail = puzzle.detailSource === "fallback";
  const verificationLabel = isFallbackDetail
    ? "Auto-generated quick guide from live puzzle data"
    : isLightExplainerMode
      ? "Compact explainer published from verified puzzle data"
    : "Machine-checked and AI-reviewed";
  const summary = buildDetailSummary(puzzle, isShortMode, isFallbackShortMode);
  const cluePath = formatCluePath(puzzle.clues);
  const publishedAt = `${puzzle.isoDate}T00:00:00Z`;
  const showUpdatedAt = Boolean(puzzle.updatedAt && puzzle.updatedAt !== publishedAt);
  return (
    <div className="legacy-detail-page">
      <section className="legacy-detail-header">
        <nav aria-label="Breadcrumb" className="legacy-detail-breadcrumbs">
          <Link href={routes.home}>Home</Link>
          <span>/</span>
          <Link href={routes.archive}>Archive</Link>
          <span>/</span>
          <span>{`Pinpoint #${puzzle.number}`}</span>
        </nav>

        <p className="eyebrow legacy-detail-kicker">Permanent Pinpoint answer &amp; analysis (Pinpoint Today archive)</p>
        <h1 className="legacy-detail-title">{`LinkedIn Pinpoint #${puzzle.number} Answer & Analysis`}</h1>
        <p className="legacy-detail-published">{`Published on ${formatLegacyDate(puzzle.isoDate)}`}</p>
        {showUpdatedAt ? (
          <p className="legacy-detail-updated">{`Updated on ${formatLegacyDate(puzzle.updatedAt.slice(0, 10))}`}</p>
        ) : null}
        <div className={`legacy-detail-verified${isFallbackDetail ? " legacy-detail-verified-fallback" : ""}`}>
          <span aria-hidden="true">{isFallbackDetail ? "i" : "✓"}</span>
          <span>{verificationLabel}</span>
          <Link href="/about-us#editorial-process" className="legacy-detail-verify-link">
            How we verify
          </Link>
        </div>
        <p className="legacy-detail-clue-path">
          <span>Clue path for LinkedIn Pinpoint:</span>
          <strong>{cluePath}</strong>
        </p>
        <p className="copy legacy-detail-summary">{summary}</p>

        <div className="legacy-detail-actions">
          <a className="button-primary" href="#analysis">
            Jump to answer reasoning
          </a>
          <Link className="button-secondary" href={routes.archive}>
            Browse all Pinpoint answer pages
          </Link>
        </div>

        <div className="legacy-detail-share">
          <DetailShareButton align="center" puzzleNumber={puzzle.number} />
        </div>
      </section>

      <PuzzleAnswerReveal
        puzzleNumber={puzzle.number}
        clues={puzzle.clues}
        answer={puzzle.answer}
        detailMode={puzzle.detailMode}
        trackFaqSectionView
      />

      <PuzzleCheckin puzzleNumber={puzzle.number} />

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
