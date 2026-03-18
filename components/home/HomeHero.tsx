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
        <p className="home-hero-kicker">Today&apos;s Pinpoint hints, yesterday&apos;s answer, and the archive</p>
        <h1 className="home-hero-title">{`Today's LinkedIn Pinpoint #${puzzle.number} Answer`}</h1>
        <p className="home-hero-subtitle">
          {`If you need LinkedIn Pinpoint answer today, this page keeps today's answer, spoiler-safe hints, yesterday's answer, and the full archive in one place for Puzzle #${puzzle.number}.`}
        </p>
        <div className="button-row home-hero-actions">
          <Link className="button-primary home-hero-primary" href={routes.detail(puzzle.slug)} prefetch={false}>
            Open today&apos;s answer
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
            Open full archive
          </Link>
        </div>
        <p className="home-hero-detail">
          Today&apos;s clue preview for Puzzle #{puzzle.number}: {cluePreview}. Open today&apos;s answer whenever you&apos;re ready.
        </p>
      </div>
    </section>
  );
}
