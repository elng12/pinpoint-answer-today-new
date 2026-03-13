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

export function PuzzleDetail({
  puzzle,
  recentPuzzles,
  nextPreview,
}: {
  puzzle: PuzzleDetailRecord;
  recentPuzzles: ArchiveEntry[];
  nextPreview: NextPreview | null;
}) {
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

        <p className="eyebrow legacy-detail-kicker">Permanent answer &amp; walkthrough (Pinpoint Today archive)</p>
        <h1 className="legacy-detail-title">{`LinkedIn Pinpoint ${puzzle.number}: ${puzzle.clues.join(", ")}`}</h1>
        <p className="legacy-detail-published">{`Published on ${formatLegacyDate(puzzle.isoDate)}`}</p>
        <div className="legacy-detail-verified">
          <span aria-hidden="true">✅</span>
          <span>Verified by Human Editor</span>
        </div>
        <p className="copy legacy-detail-summary">
          {`Pinpoint Answer Today asks: what links ${formatClueList(puzzle.clues)} - and what story do they share? Follow the spoiler-safe hints one by one, then reveal the final connection and see how each clue fits together.`}
        </p>

        <div className="legacy-detail-actions">
          <a className="button-primary" href="#analysis">
            Jump to full Pinpoint walkthrough
          </a>
          <Link className="button-secondary" href={routes.archive}>
            Browse all LinkedIn Pinpoint answers
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
      />

      <PuzzleCheckin puzzleNumber={puzzle.number} />

      <PuzzleFullAnalysis puzzle={puzzle} recentPuzzles={recentPuzzles} nextPreview={nextPreview} />
    </div>
  );
}
