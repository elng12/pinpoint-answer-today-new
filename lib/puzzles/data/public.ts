import type {
  ArchiveEntry,
  ArchiveGroup,
  NextPreview,
  PuzzleDetail,
  PuzzleQueryOptions,
} from "@/lib/puzzles/data/types";
import { formatDisplayDate } from "@/lib/puzzles/data/date";
import { toArchiveEntry, toArchiveEntryFromDetail, groupArchiveEntriesByMonth } from "@/lib/puzzles/data/archive";
import { toPuzzleDetail } from "@/lib/puzzles/data/detail";
import { getDetailEntries, isPublicDetailEntry } from "@/lib/puzzles/data/registry";
import { getLiveWorkerPuzzle } from "@/lib/puzzles/data/live-worker";
import { fetchRegistry } from "@/lib/puzzles/data-sources";
import { getBundledRegistryEntries } from "@/lib/puzzles/registry-bundled";

export {
  getLegacyConnectorRedirectSlug,
  getLegacyThemeOrConnectorRedirectSlug,
  getLegacyThemeRedirectSlug,
} from "@/lib/puzzles/data/legacy-redirects";

const DETAIL_PUBLIC_FORMAL_ONLY =
  (process.env.DETAIL_PUBLIC_FORMAL_ONLY ?? "true").trim().toLowerCase() !== "false";

function allowLiveWorkerFallback(options?: PuzzleQueryOptions): boolean {
  if (typeof options?.allowLiveWorkerFallback === "boolean") {
    return options.allowLiveWorkerFallback;
  }

  return !DETAIL_PUBLIC_FORMAL_ONLY;
}

/** Used only by generateStaticParams — reads bundled registry at build time. */
export function getAllDetailSlugs(): string[] {
  return getBundledRegistryEntries()
    .filter(isPublicDetailEntry)
    .map((e) => e.slug);
}

export async function getCurrentPuzzle(options?: PuzzleQueryOptions): Promise<PuzzleDetail> {
  const entries = await getDetailEntries();
  if (allowLiveWorkerFallback(options)) {
    const livePuzzle = await getLiveWorkerPuzzle(entries);
    if (livePuzzle) {
      return livePuzzle;
    }
  }

  const current = entries.find((e) => e.status === "live") ?? entries[0];
  if (!current) throw new Error("Expected one live puzzle in the registry.");
  return toPuzzleDetail(current);
}

export async function getPuzzleBySlug(
  slug: string,
  options?: PuzzleQueryOptions,
): Promise<PuzzleDetail | null> {
  const entries = await getDetailEntries();
  const entry = entries.find((e) => e.slug === slug);
  if (entry) {
    return toPuzzleDetail(entry);
  }

  if (!allowLiveWorkerFallback(options)) {
    return null;
  }

  const livePuzzle = await getLiveWorkerPuzzle(entries);
  return livePuzzle?.slug === slug ? livePuzzle : null;
}

export async function getPuzzleSlugByNumber(
  number: number,
  options?: PuzzleQueryOptions,
): Promise<string | null> {
  const entries = await getDetailEntries();
  const entry = entries.find((e) => e.puzzleNumber === number);
  if (entry) return entry.slug;

  if (!allowLiveWorkerFallback(options)) {
    return null;
  }

  const livePuzzle = await getLiveWorkerPuzzle(entries);
  return livePuzzle?.number === number ? livePuzzle.slug : null;
}

export async function getPuzzleSlugByPublishDate(
  isoDate: string,
  options?: PuzzleQueryOptions,
): Promise<string | null> {
  const entries = await getDetailEntries();
  const entry = entries.find((e) => e.publishDate === isoDate);
  if (entry) return entry.slug;

  if (!allowLiveWorkerFallback(options)) {
    return null;
  }

  const livePuzzle = await getLiveWorkerPuzzle(entries);
  return livePuzzle?.isoDate === isoDate ? livePuzzle.slug : null;
}

export async function getRecentEntries(
  limit: number,
  excludeSlug?: string,
  options?: PuzzleQueryOptions,
): Promise<ArchiveEntry[]> {
  const entries = await getArchiveEntries(options);
  return entries
    .filter((e) => e.slug !== excludeSlug)
    .slice(0, limit)
    .map((entry) => ({ ...entry }));
}

export async function getAdjacentEntries(
  slug: string,
  options?: PuzzleQueryOptions,
): Promise<{
  prev: ArchiveEntry | null;
  next: ArchiveEntry | null;
}> {
  const entries = await getArchiveEntries(options);
  const idx = entries.findIndex((e) => e.slug === slug);
  if (idx === -1) {
    return { prev: null, next: null };
  }
  // entries sorted newest-first: idx-1 = newer, idx+1 = older
  const next = idx > 0 ? { ...entries[idx - 1]! } : null;
  const prev = idx < entries.length - 1 ? { ...entries[idx + 1]! } : null;
  return { prev, next };
}

export async function getArchiveEntries(options?: PuzzleQueryOptions): Promise<ArchiveEntry[]> {
  const entries = await getDetailEntries();
  const archiveEntries = entries.map(toArchiveEntry);
  if (!allowLiveWorkerFallback(options)) {
    return archiveEntries;
  }

  const livePuzzle = await getLiveWorkerPuzzle(entries);
  return livePuzzle ? [toArchiveEntryFromDetail(livePuzzle), ...archiveEntries] : archiveEntries;
}

export async function getArchiveEntriesGrouped(options?: PuzzleQueryOptions): Promise<ArchiveGroup[]> {
  return groupArchiveEntriesByMonth(await getArchiveEntries(options));
}

export async function getNextPreview(): Promise<NextPreview | null> {
  const entries = await fetchRegistry();
  const previewEntry = entries.find((e) => e.status === "preview");
  if (!previewEntry) return null;
  return {
    number: previewEntry.puzzleNumber,
    slug: previewEntry.slug,
    expectedDate: formatDisplayDate(previewEntry.publishDate),
    isoDate: previewEntry.publishDate,
    clues: previewEntry.clues,
    shortSummary: previewEntry.shortSummary,
  };
}

export async function getSitemapDetailEntries() {
  const entries = await getDetailEntries();
  return entries.map((e) => ({ slug: e.slug, updatedAt: e.updatedAt }));
}
