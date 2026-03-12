"use client";

import Link from "next/link";
import type { ArchiveEntry } from "@/lib/puzzles/data";
import { routes } from "@/lib/paths/routes";
import { trackClientEvent } from "@/lib/analytics";

export function RecentAnswerCard({
  entry,
  isLatest = false,
}: {
  entry: ArchiveEntry;
  isLatest?: boolean;
}) {
  const shortDate = new Date(entry.date).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  });

  return (
    <Link
      href={routes.detail(entry.slug)}
      className={`recent-answer-card recent-answer-card-compact${isLatest ? " recent-answer-card-current" : ""}`}
      onClick={() =>
        trackClientEvent("recent_card_click", {
          event_category: "engagement",
          event_label: `Puzzle ${entry.number}`,
          value: entry.number,
        })
      }
    >
      <div className="recent-answer-top">
        <div className="recent-answer-number-wrap">
          <span className="recent-answer-number">{entry.number}</span>
          <div>
            <p className="recent-answer-label">Puzzle {entry.number}</p>
          </div>
        </div>
        {isLatest ? <span className="recent-answer-badge">Latest</span> : null}
      </div>
      <p className="recent-answer-title">{`Pinpoint Puzzle ${entry.number}: ${entry.clues.join(", ")}`}</p>
      <div className="recent-answer-footer">
        <span className="recent-answer-meta">{shortDate}</span>
        <span className="recent-answer-cta">View Answer</span>
      </div>
    </Link>
  );
}
