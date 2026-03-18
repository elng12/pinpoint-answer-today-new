import Link from "next/link";
import type { ArchiveEntry, PuzzleDetail } from "@/lib/puzzles/data";
import { routes } from "@/lib/site/routes";

function buildCluePreview(clues: string[]) {
  const preview = clues.slice(0, 3).join(", ");
  return clues.length > 3 ? `${preview}, ...` : preview;
}

export function HomeHero({
  puzzle,
  previousEntry,
}: {
  puzzle: PuzzleDetail;
  previousEntry: ArchiveEntry | null;
}) {
  const cluePreview = buildCluePreview(puzzle.clues);
  const secondaryHref = previousEntry ? routes.detail(previousEntry.slug) : routes.archive;
  const secondaryLabel = previousEntry ? "View yesterday's Pinpoint recap" : "Browse recent Pinpoint boards";

  return (
    <section className="home-hero">
      <div className="home-hero-inner">
        <span className="home-status-badge">Live now</span>
        <p className="home-hero-kicker">Today&apos;s Pinpoint hints, yesterday&apos;s Pinpoint board, and the Pinpoint archive</p>
        <h1 className="home-hero-title">LinkedIn Pinpoint Answer Today</h1>
        <p className="home-hero-subtitle">
          {`Puzzle #${puzzle.number} is live now with spoiler-safe Pinpoint hints, the verified Pinpoint solution, and quick links to yesterday's Pinpoint board plus the full Pinpoint archive.`}
        </p>
        <div className="button-row home-hero-actions">
          <Link className="button-primary home-hero-primary" href={routes.detail(puzzle.slug)} prefetch={false}>
            Open today&apos;s Pinpoint solution
          </Link>
          <Link className="button-secondary home-hero-secondary" href={secondaryHref} prefetch={false}>
            {secondaryLabel}
          </Link>
          <Link className="button-secondary home-hero-tertiary" href={routes.archive} prefetch={false}>
            Browse Pinpoint archive
          </Link>
        </div>
        <p className="home-hero-detail">
          {`Today's Pinpoint clues for Puzzle #${puzzle.number}: ${cluePreview}. Open today's Pinpoint solution when you're ready.`}
        </p>
      </div>
    </section>
  );
}
