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
          description: "Open yesterday's full answer and breakdown.",
          href: routes.detail(previousEntry.slug),
        }
      : null,
    {
      badge: "Today",
      label: `Today's LinkedIn Pinpoint answer (Puzzle ${puzzle.number})`,
      description: "Open today's answer, hints, and full breakdown together.",
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
          label: "Browse older answers",
          description: "Jump into the full archive of recent and past answers.",
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
          {`Today's LinkedIn Pinpoint clues, hints, and answer (${formatCompactDate(puzzle.isoDate)})`}
        </h2>
        <p className="copy home-reveal-description">
          Reveal spoiler-safe hints first, then open today&apos;s verified answer. Many players who
          search LinkedIn Pinpoint answer today start here before moving to yesterday&apos;s
          answer or the full archive.
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
