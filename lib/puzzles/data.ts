import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cache } from "react";
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

// ── Constants ──────────────────────────────────────────────────────────────

const GITHUB_RAW_BASE =
  process.env.GITHUB_RAW_BASE ??
  "https://raw.githubusercontent.com/elng12/pinpoint-answer-today-new/main";

// Used only for generateStaticParams (build-time pre-rendering of known slugs)
const bundledRegistryEntries = registrySchema
  .parse(registryJson)
  .slice()
  .sort((a, b) => b.puzzleNumber - a.puzzleNumber);

// ── Helpers ────────────────────────────────────────────────────────────────

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

function isDetailEntry(
  entry: PuzzleRegistryEntryRecord,
): entry is PuzzleRegistryEntryRecord & {
  mainAnswer: string;
  category: string;
  status: "live" | "archived";
} {
  return (
    (entry.status === "live" || entry.status === "archived") &&
    !!entry.mainAnswer &&
    !!entry.category
  );
}

// ── Remote data fetching (ISR-aware) ──────────────────────────────────────
// In development: reads from the local filesystem.
// In production:  fetches from GitHub raw content URL so ISR revalidation
//                 picks up new puzzle JSON files without a full rebuild.

const fetchRegistry = cache(async (): Promise<PuzzleRegistryEntryRecord[]> => {
  if (process.env.NODE_ENV === "development") {
    return bundledRegistryEntries;
  }

  const res = await fetch(`${GITHUB_RAW_BASE}/data/puzzles/registry.json`, {
    next: { tags: ["registry"], revalidate: 3600 },
  });
  if (!res.ok) {
    // Fallback to bundled registry on fetch error
    return bundledRegistryEntries;
  }
  const json = await res.json();
  return registrySchema
    .parse(json)
    .slice()
    .sort((a, b) => b.puzzleNumber - a.puzzleNumber);
});

const fetchPuzzleContent = cache(
  async (slug: string): Promise<PuzzleDetailContentRecord> => {
    if (process.env.NODE_ENV === "development") {
      return loadDetailContentFromFilesystem(slug);
    }

    const res = await fetch(`${GITHUB_RAW_BASE}/data/puzzles/${slug}.json`, {
      next: { tags: [`puzzle:${slug}`], revalidate: 86400 },
    });
    if (!res.ok) {
      // Fallback to filesystem (works during build / current deployment)
      return loadDetailContentFromFilesystem(slug);
    }
    const json = await res.json();
    return puzzleDetailContentSchema.parse(json);
  },
);

function resolveDataDir(): string {
  const cwd = process.cwd();
  const directDir = resolve(cwd, "data", "puzzles");
  if (existsSync(resolve(directDir, "registry.json"))) return directDir;
  return resolve(cwd, "new-pinpoint-site", "data", "puzzles");
}

function loadDetailContentFromFilesystem(slug: string): PuzzleDetailContentRecord {
  const filePath = resolve(resolveDataDir(), `${slug}.json`);
  const raw = readFileSync(filePath, "utf8");
  return puzzleDetailContentSchema.parse(JSON.parse(raw));
}

// ── Transformers ───────────────────────────────────────────────────────────

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

async function toPuzzleDetail(
  entry: PuzzleRegistryEntryRecord & {
    mainAnswer: string;
    category: string;
    status: "live" | "archived";
  },
): Promise<PuzzleDetail> {
  const detailContent = await fetchPuzzleContent(entry.slug);
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

async function getDetailEntries() {
  const entries = await fetchRegistry();
  return entries.filter(isDetailEntry);
}

// ── Public API (async) ─────────────────────────────────────────────────────

/** Used only by generateStaticParams — reads bundled registry at build time. */
export function getAllDetailSlugs(): string[] {
  return bundledRegistryEntries.filter(isDetailEntry).map((e) => e.slug);
}

export async function getCurrentPuzzle(): Promise<PuzzleDetail> {
  const entries = await getDetailEntries();
  const current = entries.find((e) => e.status === "live");
  if (!current) throw new Error("Expected one live puzzle in the registry.");
  return toPuzzleDetail(current);
}

export async function getPuzzleBySlug(slug: string): Promise<PuzzleDetail | null> {
  const entries = await getDetailEntries();
  const entry = entries.find((e) => e.slug === slug);
  if (!entry) return null;
  return toPuzzleDetail(entry);
}

export async function getRecentEntries(
  limit: number,
  excludeSlug?: string,
): Promise<ArchiveEntry[]> {
  const entries = await getDetailEntries();
  return entries
    .filter((e) => e.slug !== excludeSlug)
    .slice(0, limit)
    .map(toArchiveEntry);
}

export async function getArchiveEntries(): Promise<ArchiveEntry[]> {
  const entries = await getDetailEntries();
  return entries.map(toArchiveEntry);
}

export async function getArchiveEntriesGrouped(): Promise<ArchiveGroup[]> {
  const archiveEntries = await getArchiveEntries();
  const grouped = new Map<string, ArchiveEntry[]>();
  for (const entry of archiveEntries) {
    const label = formatMonthLabel(entry.isoDate);
    const current = grouped.get(label) ?? [];
    current.push(entry);
    grouped.set(label, current);
  }
  return Array.from(grouped.entries()).map(([label, items]) => ({ label, items }));
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
