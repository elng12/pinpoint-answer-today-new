"use client";

import Link from "next/link";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { RecentAnswerCard } from "@/components/shared/RecentAnswerCard";
import type { ArchiveEntry } from "@/lib/puzzles/data";
import { routes } from "@/lib/paths/routes";
import { trackClientEvent } from "@/lib/analytics";

export function HomeRecentAnswers({ entries }: { entries: ArchiveEntry[] }) {
  return (
    <section className="surface surface-block">
      <div className="home-search-heading recent-answers-heading">
        <SectionHeading
          eyebrow="Recent puzzle answers"
          title="LinkedIn Pinpoint Answer Today: Recent Clues & Solutions"
          description="Open any recent answer to review the clue-by-clue solution and move fast into the full archive."
        />
      </div>
      <div className="recent-answer-grid recent-answer-grid-compact">
        {entries.map((entry, index) => (
          <RecentAnswerCard key={entry.slug} entry={entry} isLatest={index === 0} />
        ))}
      </div>
      <div className="button-row recent-answer-actions recent-answer-actions-bottom">
        <Link
          href={routes.archive}
          className="button-secondary"
          onClick={() =>
            trackClientEvent("archive_open_click", {
              event_category: "navigation",
              event_label: "home_recent_answers",
            })
          }
        >
          View All Pinpoint Answers and Solutions
        </Link>
      </div>
      <div className="recent-answer-bottom-link">
        <Link
          href={routes.archive}
          className="home-inline-link"
          onClick={() =>
            trackClientEvent("archive_open_click", {
              event_category: "navigation",
              event_label: "home_recent_answers_text_link",
            })
          }
        >
          Explore the full historical answer archive
        </Link>
      </div>
    </section>
  );
}
