import type { PuzzleRegistryEntryRecord } from "@/lib/puzzles/schema";
import { formatDisplayDate, formatMonthLabel } from "@/lib/puzzles/data/date";
import type { ArchiveEntry, ArchiveGroup, PuzzleDetail } from "@/lib/puzzles/data/types";
import { isDetailEntry } from "@/lib/puzzles/data/registry";

function buildTitle(entry: Pick<PuzzleRegistryEntryRecord, "puzzleNumber">): string {
  return `Pinpoint #${entry.puzzleNumber}`;
}

export function toArchiveEntry(entry: PuzzleRegistryEntryRecord): ArchiveEntry {
  const detailEntry = isDetailEntry(entry) ? entry : null;
  return {
    number: entry.puzzleNumber,
    slug: entry.slug,
    title: buildTitle(entry),
    date: formatDisplayDate(entry.publishDate),
    isoDate: entry.publishDate,
    clues: entry.clues,
    shortSummary: entry.shortSummary,
    answer: detailEntry?.mainAnswer ?? "",
    category: detailEntry?.category ?? "",
    difficulty: entry.difficultyLevel ?? "Moderate",
    updatedAt: entry.updatedAt,
    status: entry.status as "live" | "archived",
  };
}

export function toArchiveEntryFromDetail(puzzle: PuzzleDetail): ArchiveEntry {
  return {
    number: puzzle.number,
    slug: puzzle.slug,
    title: puzzle.title,
    date: puzzle.date,
    isoDate: puzzle.isoDate,
    clues: puzzle.clues,
    shortSummary: puzzle.shortSummary,
    answer: puzzle.answer,
    category: puzzle.category,
    difficulty: puzzle.difficulty,
    updatedAt: puzzle.updatedAt,
    status: puzzle.status,
  };
}

export function groupArchiveEntriesByMonth(archiveEntries: ArchiveEntry[]): ArchiveGroup[] {
  const grouped = new Map<string, ArchiveEntry[]>();
  for (const entry of archiveEntries) {
    const label = formatMonthLabel(entry.isoDate);
    const current = grouped.get(label) ?? [];
    current.push(entry);
    grouped.set(label, current);
  }
  return Array.from(grouped.entries()).map(([label, items]) => ({ label, items }));
}

