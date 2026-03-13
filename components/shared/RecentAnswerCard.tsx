import Link from "next/link";
import type { ArchiveEntry } from "@/lib/puzzles/data";
import { routes } from "@/lib/paths/routes";
import { formatShortDate } from "@/lib/utils/date";

export function RecentAnswerCard({
  entry,
  isLatest = false,
  answerText,
}: {
  entry: ArchiveEntry;
  isLatest?: boolean;
  answerText?: string;
}) {
  const shortDate = formatShortDate(entry.isoDate);

  return (
    <Link
      href={routes.detail(entry.slug)}
      className={`recent-answer-card recent-answer-card-compact${isLatest ? " recent-answer-card-current" : ""}`}
      prefetch={false}
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
      {answerText ? (
        <p className="recent-answer-answer">Answer: {answerText}</p>
      ) : null}
      <div className="recent-answer-footer">
        <span className="recent-answer-meta">{shortDate}</span>
        <span className="recent-answer-cta">View Answer</span>
      </div>
    </Link>
  );
}
