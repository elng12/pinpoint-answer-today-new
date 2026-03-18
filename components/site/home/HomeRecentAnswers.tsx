import Link from "next/link";
import { RecentAnswerCard } from "@/components/puzzles/shared/RecentAnswerCard";
import { SectionHeading } from "@/components/site/ui/SectionHeading";
import type { ArchiveEntry } from "@/lib/puzzles/data";
import { routes } from "@/lib/site/routes";

export function HomeRecentAnswers({ entries }: { entries: ArchiveEntry[] }) {
  return (
    <section className="surface surface-block">
      <div className="home-search-heading recent-answers-heading">
        <SectionHeading
          eyebrow="Recent Pinpoint boards"
          title="Recent LinkedIn Pinpoint Clues & Solutions"
          description="Open any recent Pinpoint recap to review the clue-by-clue solution and move fast into the full Pinpoint archive."
        />
      </div>
      <div className="recent-answer-grid recent-answer-grid-compact">
        {entries.map((entry, index) => (
          <RecentAnswerCard key={entry.slug} entry={entry} isLatest={index === 0} />
        ))}
      </div>
      <div className="button-row recent-answer-actions recent-answer-actions-bottom">
        <Link href={routes.archive} className="button-secondary" prefetch={false}>
          View All Pinpoint Boards and Solutions
        </Link>
      </div>
      <div className="recent-answer-bottom-link">
        <Link href={routes.archive} className="home-inline-link" prefetch={false}>
          Explore the full historical Pinpoint archive
        </Link>
      </div>
    </section>
  );
}
