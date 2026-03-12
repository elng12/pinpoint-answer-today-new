import Link from "next/link";
import type { ArchiveEntry, NextPreview, PuzzleDetail } from "@/lib/puzzles/data";
import { routes } from "@/lib/paths/routes";
import { AnswerReveal } from "@/components/shared/AnswerReveal";

function formatCompactDate(input: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${input}T00:00:00Z`));
}

export function HomeRevealSection({
  puzzle,
  previousEntry,
  preview,
}: {
  puzzle: PuzzleDetail;
  previousEntry: ArchiveEntry | null;
  preview: NextPreview | null;
}) {
  const navItems = [
    previousEntry
      ? {
          badge: "Previous",
          label: `Yesterday's answer (Puzzle ${previousEntry.number})`,
          description: "View Full Breakdown",
          href: routes.detail(previousEntry.slug),
        }
      : null,
    {
      badge: "Today",
      label: `Today's answer: Puzzle ${puzzle.number}`,
      description: "View Full Breakdown",
      href: routes.detail(puzzle.slug),
    },
    preview
      ? {
          badge: "Next",
          label: `Tomorrow's preview (Puzzle ${preview.number})`,
          description: `Puzzle ${preview.number} unlocks soon.`,
          href: routes.preview,
        }
      : {
          badge: "Archive",
          label: "Browse older puzzles",
          description: "Jump into the archive if you want past boards instead.",
          href: routes.archive,
        },
  ].filter(Boolean) as Array<{
    badge: string;
    label: string;
    description: string;
    href: string;
  }>;

  return (
    <section className="surface surface-block reveal-surface">
      <div className="home-reveal-heading">
        <p className="eyebrow">Reveal</p>
        <h2 className="home-reveal-title">
          {`Today's Pinpoint Clues & Answer (${formatCompactDate(puzzle.isoDate)})`}
        </h2>
        <p className="copy home-reveal-description">
          Pinpoint Answer Today keeps your streak safe with spoiler-free clues while you control
          when to reveal the LinkedIn Pinpoint Answer Today.
        </p>
      </div>
      <div className="reveal-section-body">
        <AnswerReveal
          puzzleNumber={puzzle.number}
          clues={puzzle.clues}
          answer={puzzle.answer}
          category={puzzle.category}
          hintMap={puzzle.wordHints}
          detailHref={routes.detail(puzzle.slug)}
        />
      </div>
      <nav className="home-adjacent-nav" aria-label="Fast puzzle navigation">
        {navItems.map((item) => (
          <Link key={`${item.badge}-${item.label}`} href={item.href} className="home-adjacent-card">
            <span className="home-adjacent-badge">{item.badge}</span>
            <span className="home-adjacent-title">{item.label}</span>
            <span className="home-adjacent-copy">{item.description}</span>
          </Link>
        ))}
      </nav>
    </section>
  );
}
