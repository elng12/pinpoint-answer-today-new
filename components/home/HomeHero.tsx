import Link from "next/link";
import type { PuzzleDetail } from "@/lib/puzzles/data";
import { routes } from "@/lib/paths/routes";

function buildCluePreview(clues: string[]) {
  const preview = clues.slice(0, 3).join(", ");
  return clues.length > 3 ? `${preview}, ...` : preview;
}

export function HomeHero({
  puzzle,
}: {
  puzzle: PuzzleDetail;
}) {
  const cluePreview = buildCluePreview(puzzle.clues);

  return (
    <section className="home-hero">
      <div className="home-hero-inner">
        <span className="home-status-badge">Live now</span>
        <p className="home-hero-kicker">Today&apos;s Pinpoint hints, Pinpoint recap, and Pinpoint archive</p>
        <h1 className="home-hero-title">Today&apos;s LinkedIn Pinpoint #{puzzle.number} Solution</h1>
        <p className="home-hero-subtitle">
          {`Use this Pinpoint hub for spoiler-safe Pinpoint clues, the verified Pinpoint solution, and fast access to older Pinpoint boards. ${puzzle.shortSummary}`}
        </p>
        <div className="button-row home-hero-actions">
          <Link className="button-primary home-hero-primary" href={routes.detail(puzzle.slug)} prefetch={false}>
            Open today&apos;s Pinpoint breakdown
          </Link>
          <a
            className="button-secondary home-hero-secondary"
            href="https://www.linkedin.com/games/"
            rel="noreferrer"
            target="_blank"
          >
            Play on LinkedIn
          </a>
          <Link className="button-secondary home-hero-tertiary" href={routes.archive} prefetch={false}>
            Browse Pinpoint archive
          </Link>
        </div>
        <p className="home-hero-detail">
          Today&apos;s Pinpoint clues: {cluePreview}. Open the full Pinpoint breakdown when
          you&apos;re ready for the verified solution.
        </p>
      </div>
    </section>
  );
}
