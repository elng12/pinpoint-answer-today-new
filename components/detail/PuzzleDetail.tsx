import Link from "next/link";
import type { ArchiveEntry, NextPreview, PuzzleDetail as PuzzleDetailRecord } from "@/lib/puzzles/data";
import { PuzzleAnswerReveal } from "@/components/detail/PuzzleAnswerReveal";
import { PuzzleCheckin } from "@/components/detail/PuzzleCheckin";
import { PuzzleFullAnalysis } from "@/components/detail/PuzzleFullAnalysis";
import { DetailShareButton } from "@/components/detail/DetailShareButton";
import { routes } from "@/lib/paths/routes";

function formatLegacyDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

function formatClueList(clues: string[]): string {
  if (clues.length <= 1) {
    return clues.join("");
  }
  if (clues.length === 2) {
    return `${clues[0]} and ${clues[1]}`;
  }
  return `${clues.slice(0, -1).join(", ")}, and ${clues[clues.length - 1]}`;
}

function buildDetailSummary(puzzle: PuzzleDetailRecord, isShortMode: boolean, isFallbackShortMode: boolean): string {
  const answer = puzzle.answer.trim();
  const afterMatch = answer.match(/^Words that come after "(.+)"$/i);
  const beforeMatch = answer.match(/^Words that come before "(.+)"$/i);

  if (afterMatch) {
    return isShortMode
      ? `This quick guide shows which familiar phrases appear when one shared word comes before ${formatClueList(puzzle.clues)}. Use the spoiler-safe hints, clue table, and compact FAQ to see why the same word solves the set.`
      : `This Pinpoint answer guide asks which shared word turns ${formatClueList(puzzle.clues)} into familiar phrases and common terms. Follow the spoiler-safe hints, then see why the same word makes each clue land cleanly.`;
  }

  if (beforeMatch) {
    return isShortMode
      ? `This quick guide shows which familiar phrases appear when one shared word follows ${formatClueList(puzzle.clues)}. Use the spoiler-safe hints, clue table, and compact FAQ to see why the same word solves the set.`
      : `This Pinpoint answer guide asks which shared word fits before ${formatClueList(puzzle.clues)} to create familiar phrases. Follow the spoiler-safe hints, then see why the same word completes each clue cleanly.`;
  }

  if (isFallbackShortMode) {
    return `This quick guide keeps the spoiler-safe hints, answer reveal, and compact clue table focused on the fastest path from ${formatClueList(puzzle.clues)} to the final connection.`;
  }

  if (isShortMode) {
    return `This quick guide keeps the spoiler-safe hints, answer reveal, and compact clue table focused on the fastest path from ${formatClueList(puzzle.clues)} to the final connection.`;
  }

  return `This Pinpoint answer guide asks what shared idea links ${formatClueList(puzzle.clues)}. Follow the spoiler-safe hints one by one, then see how each clue clicks into the final answer.`;
}

export function PuzzleDetail({
  puzzle,
  recentPuzzles,
  nextPreview,
  adjacentPrev,
  adjacentNext,
}: {
  puzzle: PuzzleDetailRecord;
  recentPuzzles: ArchiveEntry[];
  nextPreview: NextPreview | null;
  adjacentPrev: ArchiveEntry | null;
  adjacentNext: ArchiveEntry | null;
}) {
  const isShortMode = puzzle.detailMode === "short";
  const isFallbackShortMode = isShortMode && puzzle.detailSource === "fallback";
  const isFallbackDetail = puzzle.detailSource === "fallback";
  const verificationLabel = isFallbackDetail
    ? "Auto-generated quick guide from live puzzle data"
    : "Verified by Human Editor";
  const summary = buildDetailSummary(puzzle, isShortMode, isFallbackShortMode);
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
        <p className="copy legacy-detail-summary">{summary}</p>

        <div className="legacy-detail-actions">
          <a className="button-primary" href="#analysis">
            {isShortMode ? "Jump to quick Pinpoint guide" : "Jump to full Pinpoint analysis"}
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
        category={puzzle.category}
        hintMap={puzzle.wordHints}
        detailMode={puzzle.detailMode}
      />

      <PuzzleCheckin puzzleNumber={puzzle.number} />

      <PuzzleFullAnalysis
        puzzle={puzzle}
        recentPuzzles={recentPuzzles}
        nextPreview={nextPreview}
        adjacentPrev={adjacentPrev}
        adjacentNext={adjacentNext}
      />
    </div>
  );
}
