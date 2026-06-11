import Link from "next/link";
import type { PuzzleDetail } from "@/lib/puzzles/data";
import { routes } from "@/lib/paths/routes";

function formatHeroDate(input: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${input}T00:00:00Z`));
}

export function HomeHero({
  puzzle,
}: {
  puzzle: PuzzleDetail;
}) {
  const heroDate = formatHeroDate(puzzle.isoDate);
  const clueList = puzzle.clues.join(", ");

  return (
    <section className="home-hero">
      <div className="home-hero-inner">
        <span className="home-status-badge">Live now</span>
        <div className="home-hero-status-row" aria-label={`Puzzle ${puzzle.number} for ${heroDate}`}>
          <span className="home-hero-status-item">Puzzle #{puzzle.number}</span>
          <span className="home-hero-status-item">{heroDate}</span>
          <span className="home-hero-status-item">{puzzle.clues.length} clues</span>
          <span className="home-hero-status-item">Verified solution</span>
        </div>
        <p className="home-hero-kicker">Today&apos;s LinkedIn Pinpoint answer, updated daily</p>
        <h1 className="home-hero-title">{`LinkedIn Pinpoint Answer Today #${puzzle.number}`}</h1>
        <p className="home-hero-subtitle">
          Your daily LinkedIn Pinpoint answer hub. Check today&apos;s clues, reveal the answer, and read the full explanation.
        </p>
        <p className="home-hero-clue-summary">
          <span>Today&apos;s Pinpoint clues:</span> {clueList}
        </p>
        <div className="button-row home-hero-actions">
          <a className="button-primary home-hero-primary" href="#answer-reveal">
            Reveal today&apos;s Pinpoint answer
          </a>
          <Link className="button-secondary home-hero-secondary" href={routes.detail(puzzle.slug)} prefetch={false}>
            Read today&apos;s full answer
          </Link>
          <a className="button-secondary home-hero-tertiary" href="https://www.linkedin.com/games/" rel="noopener noreferrer" target="_blank">
            Play LinkedIn Pinpoint
          </a>
        </div>
      </div>
    </section>
  );
}
