import Link from "next/link";
import type { PuzzleDetail } from "@/lib/puzzles/data";
import { routes } from "@/lib/paths/routes";

export function HomeHero({
  puzzle,
}: {
  puzzle: PuzzleDetail;
}) {
  return (
    <section className="home-hero">
      <div className="home-hero-inner">
        <span className="home-status-badge">Live now</span>
        <p className="home-hero-kicker">LinkedIn Pinpoint answer hub</p>
        <h1 className="home-hero-title">Pinpoint Answer Today for Puzzle {puzzle.number}</h1>
        <p className="home-hero-subtitle">{puzzle.shortSummary}</p>
        <div className="button-row home-hero-actions">
          <Link className="button-primary home-hero-primary" href={routes.detail(puzzle.slug)} prefetch={false}>
            View Puzzle {puzzle.number} breakdown
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
            Browse archive
          </Link>
        </div>
        <p className="home-hero-detail">
          Today&apos;s clues: {puzzle.clues.join(", ")}. Open the full breakdown for the verified answer.
        </p>
      </div>
    </section>
  );
}
