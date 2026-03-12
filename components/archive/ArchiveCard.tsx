import { RecentAnswerCard } from "@/components/shared/RecentAnswerCard";
import type { ArchiveEntry } from "@/lib/puzzles/data";

export function ArchiveCard({ item }: { item: ArchiveEntry }) {
  return <RecentAnswerCard entry={item} />;
}
