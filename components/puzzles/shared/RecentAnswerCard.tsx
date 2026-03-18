import Link from "next/link";
import type { ArchiveEntry } from "@/lib/puzzles/data";
import { routes } from "@/lib/site/routes";
import { formatShortDate } from "@/lib/utils/date";

function buildCluePreview(clues: string[]) {
  const preview = clues.slice(0, 3).join(", ");
  return clues.length > 3 ? `${preview}, ...` : preview;
}

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
  const cluePreview = buildCluePreview(entry.clues);

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
      <p className="recent-answer-title">{cluePreview}</p>
      {answerText ? (
        <p className="recent-answer-answer">Solution: {answerText}</p>
      ) : null}
      <div className="recent-answer-footer">
        <span className="recent-answer-meta">{shortDate}</span>
        <span className="recent-answer-cta">View Recap</span>
      </div>
    </Link>
  );
}
