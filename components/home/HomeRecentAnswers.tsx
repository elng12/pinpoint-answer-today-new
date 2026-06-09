import Link from "next/link";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { RecentAnswerCard } from "@/components/shared/RecentAnswerCard";
import type { ArchiveEntry } from "@/lib/puzzles/data";
import { routes } from "@/lib/paths/routes";

export function HomeRecentAnswers({ entries }: { entries: ArchiveEntry[] }) {
  return (
    <section className="surface surface-block">
      <div className="home-search-heading recent-answers-heading">
        <SectionHeading
          eyebrow="Recent answers"
          title="Recent LinkedIn Pinpoint answers"
          description="Open recent answer pages, compare clue patterns by date, and jump into the full archive when you need an older puzzle."
        />
      </div>
      <div className="recent-answer-grid recent-answer-grid-compact">
        {entries.map((entry, index) => {
          const previewClues = entry.clues.slice(0, 3).join(", ");
          const titleSuffix = entry.clues.length > 3 ? "..." : "";

          return (
            <RecentAnswerCard
              key={entry.slug}
              entry={entry}
              isLatest={index === 0}
              title={`Pinpoint Today #${entry.number}: ${previewClues}${titleSuffix}`}
            />
          );
        })}
      </div>
      <div className="button-row recent-answer-actions recent-answer-actions-bottom">
        <Link href={routes.archive} className="button-secondary" prefetch={false}>
          Open full archive
        </Link>
      </div>
    </section>
  );
}
