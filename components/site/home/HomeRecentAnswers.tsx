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
          eyebrow="Recent answers"
          title="Recent LinkedIn Pinpoint Answers"
          description="Open recent LinkedIn Pinpoint answer pages, compare clue patterns, and jump into the full archive without digging through clutter."
        />
      </div>
      <div className="recent-answer-grid recent-answer-grid-compact">
        {entries.map((entry, index) => (
          <RecentAnswerCard key={entry.slug} entry={entry} isLatest={index === 0} />
        ))}
      </div>
      <div className="button-row recent-answer-actions recent-answer-actions-bottom">
        <Link href={routes.archive} className="button-secondary" prefetch={false}>
          Open Full Archive
        </Link>
      </div>
    </section>
  );
}
