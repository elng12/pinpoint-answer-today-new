import Link from "next/link";
import type { ArchiveEntry, NextPreview, PuzzleDetail } from "@/lib/puzzles/data";
import { routes } from "@/lib/paths/routes";
import { AnswerReveal } from "@/components/shared/AnswerReveal";

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
          description: "Open yesterday's full answer and Today's Pinpoint review.",
          href: routes.detail(previousEntry.slug),
        }
      : null,
    {
      badge: "Today",
      label: `LinkedIn Pinpoint answer today (Puzzle ${puzzle.number})`,
      description: "Open today's answer, clue proof, and full breakdown together.",
      href: routes.detail(puzzle.slug),
    },
    {
      badge: "Archive",
      label: "All LinkedIn Pinpoint answers",
      description: "Search older answer pages by puzzle number, clue, or date.",
      href: routes.archive,
    },
    {
      badge: "Pro Tips",
      label: preview
        ? `Pro Tips & next puzzle (Puzzle ${preview.number})`
        : "Open Pro Tips and next puzzle guidance",
      description: preview
        ? `Review Today's Pinpoint practice before Puzzle ${preview.number} unlocks.`
        : "Review Today's Pinpoint practice, clue types, and preview guidance.",
      href: routes.preview,
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
          {`Today's LinkedIn Pinpoint answer and clue explanation (${puzzle.isoDate})`}
        </h2>
        <p className="copy home-reveal-description">
          {`Pinpoint #${puzzle.number} is ready. Reveal the final answer when you want it, or check the clues first.`}
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
          <Link
            key={`${item.badge}-${item.label}`}
            href={item.href}
            className="home-adjacent-card"
            prefetch={false}
          >
            <span className="home-adjacent-badge">{item.badge}</span>
            <span className="home-adjacent-title">{item.label}</span>
            <span className="home-adjacent-copy">{item.description}</span>
          </Link>
        ))}
      </nav>
    </section>
  );
}
