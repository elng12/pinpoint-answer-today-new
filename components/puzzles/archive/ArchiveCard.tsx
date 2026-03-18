import { ArchiveAnswerReveal } from "@/components/puzzles/archive/ArchiveAnswerReveal";
import { RecentAnswerCard } from "@/components/puzzles/shared/RecentAnswerCard";
import type { ArchiveEntry } from "@/lib/puzzles/data";

export function ArchiveCard({ item }: { item: ArchiveEntry }) {
  if (item.status === "live") {
    return (
      <div className="archive-card-live">
        <RecentAnswerCard entry={item} isLatest />
        {item.answer ? <ArchiveAnswerReveal answer={item.answer} /> : null}
      </div>
    );
  }

  return <RecentAnswerCard entry={item} answerText={item.answer || undefined} />;
}
