import Link from "next/link";
import type { ArchiveEntry } from "@/lib/puzzles/data";
import { routes } from "@/lib/paths/routes";
import { formatShortDate } from "@/lib/utils/date";

function buildCluePreview(clues: string[]) {
  return clues.join(", ");
}

export function RecentAnswerCard({
  entry,
  isLatest = false,
  answerText,
  title,
}: {
  entry: ArchiveEntry;
  isLatest?: boolean;
  answerText?: string;
  title?: string;
}) {
  const shortDate = formatShortDate(entry.isoDate);
  const cluePreview = buildCluePreview(entry.clues);

  return (
    <Link
      href={routes.detail(entry.slug)}
      className={`recent-answer-card recent-answer-card-compact${isLatest ? " recent-answer-card-current" : ""}`}
      prefetch={false}
      aria-label={`Open puzzle ${entry.number} for clues ${cluePreview}`}
    >
      <div className="recent-answer-top">
        <div className="recent-answer-number-wrap">
          <span className="recent-answer-number">{entry.number}</span>
        </div>
        {isLatest ? <span className="recent-answer-badge">Latest</span> : null}
      </div>
      <h3 className="recent-answer-title">
        {title ?? `LinkedIn Pinpoint ${entry.number}: ${cluePreview}`}
      </h3>
      {answerText ? (
        <p className="recent-answer-answer">Solution: {answerText}</p>
      ) : null}
      <div className="recent-answer-footer">
        <span className="recent-answer-meta">{shortDate}</span>
      </div>
    </Link>
  );
}
