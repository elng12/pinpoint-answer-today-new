import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import registryJson from "@/data/puzzles/registry.json";
import {
  puzzleDetailContentSchema,
  type FaqItem,
  type LessonItem,
  type PuzzleDetailContentRecord,
  type PuzzleRegistryEntryRecord,
  type PuzzleStatus,
  registrySchema,
} from "@/lib/puzzles/schema";

export type PuzzleDetail = {
  number: number;
  slug: string;
  title: string;
  date: string;
  isoDate: string;
  answer: string;
  category: string;
  clues: string[];
  difficulty: string;
  shortSummary: string;
  fullAnalysis: string[];
  solutionNarrative: string[];
  wordHints: Record<string, string>;
  lessons: LessonItem[];
  faqs: FaqItem[];
  status: Exclude<PuzzleStatus, "draft" | "preview">;
  updatedAt: string;
};

export type ArchiveEntry = {
  number: number;
  slug: string;
  title: string;
  date: string;
  isoDate: string;
  clues: string[];
  shortSummary: string;
  answer: string;
  category: string;
  difficulty: string;
  updatedAt: string;
};

export type ArchiveGroup = {
  label: string;
  items: ArchiveEntry[];
};

export type NextPreview = {
  number: number;
  slug: string;
  expectedDate: string;
  isoDate: string;
  clues: string[];
  shortSummary: string;
};

const registryEntries = registrySchema
  .parse(registryJson)
  .slice()
  .sort((left, right) => right.puzzleNumber - left.puzzleNumber);

function resolveDataDir(): string {
  const cwd = process.cwd();
  const directDir = resolve(cwd, "data", "puzzles");
  if (existsSync(resolve(directDir, "registry.json"))) {
    return directDir;
  }
  return resolve(cwd, "new-pinpoint-site", "data", "puzzles");
}

function formatDisplayDate(input: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${input}T00:00:00Z`));
}

function formatMonthLabel(input: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${input}T00:00:00Z`));
}

function buildTitle(entry: PuzzleRegistryEntryRecord): string {
  return `Pinpoint #${entry.puzzleNumber}`;
}

function formatClueList(clues: string[]): string {
  if (clues.length <= 1) {
    return clues.join("");
  }
  if (clues.length === 2) {
    return `${clues[0]} and ${clues[1]}`;
  }
  return `${clues.slice(0, -1).join(", ")}, and ${clues[clues.length - 1]}`;
}


function isDetailEntry(
  entry: PuzzleRegistryEntryRecord,
): entry is PuzzleRegistryEntryRecord & {
  mainAnswer: string;
  category: string;
  status: "live" | "archived";
} {
  return (entry.status === "live" || entry.status === "archived") && !!entry.mainAnswer && !!entry.category;
}

function loadDetailContent(slug: string): PuzzleDetailContentRecord {
  const filePath = resolve(resolveDataDir(), `${slug}.json`);
  const raw = readFileSync(filePath, "utf8");
  return puzzleDetailContentSchema.parse(JSON.parse(raw));
}

function toArchiveEntry(entry: PuzzleRegistryEntryRecord): ArchiveEntry {
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
  };
}

function toPuzzleDetail(
  entry: PuzzleRegistryEntryRecord & {
    mainAnswer: string;
    category: string;
    status: "live" | "archived";
  },
): PuzzleDetail {
  const detailContent = loadDetailContent(entry.slug);
  return {
    number: entry.puzzleNumber,
    slug: entry.slug,
    title: buildTitle(entry),
    date: formatDisplayDate(entry.publishDate),
    isoDate: entry.publishDate,
    answer: entry.mainAnswer,
    category: entry.category,
    clues: entry.clues,
    difficulty: entry.difficultyLevel ?? "Moderate",
    shortSummary: entry.shortSummary,
    fullAnalysis: detailContent.fullAnalysis,
    solutionNarrative: detailContent.solutionNarrative ?? [],
    wordHints: detailContent.wordHints,
    lessons: detailContent.lessons,
    faqs: detailContent.faqs,
    status: entry.status,
    updatedAt: entry.updatedAt,
  };
}

function getDetailEntries(): Array<
  PuzzleRegistryEntryRecord & {
    mainAnswer: string;
    category: string;
    status: "live" | "archived";
  }
> {
  return registryEntries.filter(isDetailEntry);
}

export function getAllDetailSlugs(): string[] {
  return getDetailEntries().map((entry) => entry.slug);
}

export function getCurrentPuzzle(): PuzzleDetail {
  const current = getDetailEntries().find((entry) => entry.status === "live");
  if (!current) {
    throw new Error("Expected one live puzzle in the registry.");
  }
  return toPuzzleDetail(current);
}

export function getPuzzleBySlug(slug: string): PuzzleDetail | null {
  const entry = getDetailEntries().find((item) => item.slug === slug);
  if (!entry) {
    return null;
  }
  return toPuzzleDetail(entry);
}

export function getRecentEntries(limit: number, excludeSlug?: string): ArchiveEntry[] {
  return getDetailEntries()
    .filter((entry) => entry.slug !== excludeSlug)
    .slice(0, limit)
    .map(toArchiveEntry);
}

export function getArchiveEntries(): ArchiveEntry[] {
  return getDetailEntries().map(toArchiveEntry);
}

export function getArchiveEntriesGrouped(): ArchiveGroup[] {
  const grouped = new Map<string, ArchiveEntry[]>();

  getArchiveEntries().forEach((entry) => {
    const label = formatMonthLabel(entry.isoDate);
    const current = grouped.get(label) ?? [];
    current.push(entry);
    grouped.set(label, current);
  });

  return Array.from(grouped.entries()).map(([label, items]) => ({
    label,
    items,
  }));
}

export function getNextPreview(): NextPreview | null {
  const previewEntry = registryEntries.find((entry) => entry.status === "preview");
  if (!previewEntry) {
    return null;
  }

  return {
    number: previewEntry.puzzleNumber,
    slug: previewEntry.slug,
    expectedDate: formatDisplayDate(previewEntry.publishDate),
    isoDate: previewEntry.publishDate,
    clues: previewEntry.clues,
    shortSummary: previewEntry.shortSummary,
  };
}

export function getSitemapDetailEntries() {
  return getDetailEntries().map((entry) => ({
    slug: entry.slug,
    updatedAt: entry.updatedAt,
  }));
}
