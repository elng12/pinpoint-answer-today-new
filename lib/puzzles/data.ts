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
  spoilerHints: Record<string, string>;
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
  status: "live" | "archived";
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

type LiveWorkerPuzzleRecord = {
  puzzleDate: string;
  fetchedAt: string;
  clues: string[];
  answer: string;
};

// ── Constants ──────────────────────────────────────────────────────────────

const GITHUB_RAW_BASE =
  process.env.GITHUB_RAW_BASE ??
  "https://raw.githubusercontent.com/elng12/pinpoint-answer-today-new/main";
const PINPOINT_WORKER_HEALTH_URL =
  process.env.PINPOINT_WORKER_HEALTH_URL ??
  "https://pinpoint-worker.2296744453m.workers.dev/health";
const BASELINE_NUMBER = 536;
const BASELINE_DATE_UTC = Date.UTC(2025, 9, 18); // 2025-10-18
const MS_IN_DAY = 86_400_000;

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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function inferPuzzleNumberFromDate(isoDate: string): number | null {
  if (!isIsoDate(isoDate)) return null;

  const parsedDate = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime())) return null;

  const utc = Date.UTC(parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), parsedDate.getUTCDate());
  const diffDays = Math.floor((utc - BASELINE_DATE_UTC) / MS_IN_DAY);
  if (diffDays < 0) return null;

  return BASELINE_NUMBER + diffDays;
}

function buildLiveWordHints(clues: string[], answer: string): Record<string, string> {
  return Object.fromEntries(
    clues.map((clue) => [clue, `${clue} fits the same shared connection that leads to ${answer}.`]),
  );
}

function buildLiveLessons(answer: string): LessonItem[] {
  return [
    {
      title: "Test one connector across all five clues",
      body: `The quickest way to validate ${answer} is to see whether every clue still feels natural under the same pattern or category.`,
    },
    {
      title: "Favor the cleanest explanation",
      body: "If one answer explains all five clues without stretching any of them, that is usually the strongest Pinpoint read.",
    },
    {
      title: "Use the archive for confirmation",
      body: "A richer editorial walkthrough will replace this quick version after the daily archive sync finishes.",
    },
  ];
}

function buildLiveFaqs(puzzleNumber: number, clues: string[], answer: string): FaqItem[] {
  const clueLabel = clues.join(", ");
  return [
    {
      question: `What is the answer to LinkedIn Pinpoint #${puzzleNumber}?`,
      answer: `The answer is ${answer}. The clues ${clueLabel} all point back to that same connection.`,
    },
    {
      question: "Why does this page look shorter than older walkthroughs?",
      answer: "This is the live version generated before the full editorial archive update finishes. The complete long-form walkthrough lands shortly after.",
    },
    {
      question: "Are the clues already verified?",
      answer: "Yes. The answer and clue set come from the live daily feed, then the archive version adds the fuller explanation layer.",
    },
  ];
}

function toLivePuzzleDetail(record: LiveWorkerPuzzleRecord): PuzzleDetail | null {
  const puzzleNumber = inferPuzzleNumberFromDate(record.puzzleDate);
  if (!puzzleNumber) return null;

  const slug = `pinpoint-answer-${puzzleNumber}`;
  const clueLabel = record.clues.join(", ");
  const answer = record.answer;
  const shortSummary = `Pinpoint #${puzzleNumber}: ${clueLabel}.`;

  return {
    number: puzzleNumber,
    slug,
    title: `Pinpoint #${puzzleNumber}`,
    date: formatDisplayDate(record.puzzleDate),
    isoDate: record.puzzleDate,
    answer,
    category: answer,
    clues: record.clues,
    difficulty: "Moderate",
    shortSummary,
    fullAnalysis: [
      `Pinpoint #${puzzleNumber} is already live with the clues ${clueLabel}. The shared connection is ${answer}. This quick page keeps today's answer available while the full archived walkthrough is still finishing.`,
    ],
    solutionNarrative: [
      `I checked whether ${clueLabel} could all resolve under the same phrase pattern or category. ${answer} is the first clean fit that explains the full set without forcing any clue.`,
    ],
    wordHints: buildLiveWordHints(record.clues, answer),
    spoilerHints: {},
    lessons: buildLiveLessons(answer),
    faqs: buildLiveFaqs(puzzleNumber, record.clues, answer),
    status: "live",
    updatedAt: record.fetchedAt,
  };
}

function parseLiveWorkerPuzzleRecord(raw: unknown): LiveWorkerPuzzleRecord | null {
  const json = asRecord(raw);
  if (!json) return null;

  const puzzleDate = typeof json.puzzleDate === "string" ? json.puzzleDate.trim() : "";
  if (!isIsoDate(puzzleDate)) return null;

  const answers = Array.isArray(json.answers)
    ? json.answers
        .map((item) => {
          const row = asRecord(item);
          const word = typeof row?.word === "string" ? row.word.trim() : "";
          return word;
        })
        .filter((word) => word.length > 0)
        .slice(0, 5)
    : [];

  const answer = typeof json.mainAnswer === "string"
    ? json.mainAnswer.trim()
    : typeof json.theme === "string"
      ? json.theme.trim()
      : "";

  if (answers.length !== 5 || !answer) return null;

  const fetchedAtRaw = typeof json.fetchedAt === "string" ? json.fetchedAt.trim() : "";
  const fetchedAt = fetchedAtRaw || `${puzzleDate}T00:00:00.000Z`;

  return {
    puzzleDate,
    fetchedAt,
    clues: answers,
    answer,
  };
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

// ── Data fetching (ISR-aware) ─────────────────────────────────────────────
// Strategy: filesystem first (fast, works at build time and for deployed files),
// fall back to GitHub raw fetch for new puzzles added after the last deployment.

const fetchRegistry = cache(async (): Promise<PuzzleRegistryEntryRecord[]> => {
  // Try local filesystem first (available during build and for existing deployments)
  try {
    const filePath = resolve(resolveDataDir(), "registry.json");
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, "utf8");
      return registrySchema
        .parse(JSON.parse(raw))
        .slice()
        .sort((a, b) => b.puzzleNumber - a.puzzleNumber);
    }
  } catch {
    // fall through to GitHub fetch
  }

  // Filesystem unavailable (e.g. serverless runtime after ISR) — fetch from GitHub
  try {
    const res = await fetch(`${GITHUB_RAW_BASE}/data/puzzles/registry.json`, {
      next: { tags: ["registry"], revalidate: 3600 },
    });
    if (!res.ok) {
      throw new Error(`registry fetch failed with status ${res.status}`);
    }
    const json = await res.json();
    return registrySchema
      .parse(json)
      .slice()
      .sort((a, b) => b.puzzleNumber - a.puzzleNumber);
  } catch (error) {
    warnRemoteFallback("Falling back to bundled registry", error);
    return bundledRegistryEntries;
  }
});

const fetchPuzzleContent = cache(
  async (slug: string): Promise<PuzzleDetailContentRecord> => {
    // Try local filesystem first (fast, works during build and for deployed files)
    try {
      const filePath = resolve(resolveDataDir(), `${slug}.json`);
      if (existsSync(filePath)) {
        return loadDetailContentFromFilesystem(slug);
      }
    } catch {
      // fall through to GitHub fetch
    }

    // File not in current deployment (new puzzle added after build) — fetch from GitHub
    try {
      const res = await fetch(`${GITHUB_RAW_BASE}/data/puzzles/${slug}.json`, {
        next: { tags: [`puzzle:${slug}`], revalidate: 86400 },
      });
      if (!res.ok) {
        throw new Error(`detail fetch failed with status ${res.status}`);
      }
      const json = await res.json();
      return puzzleDetailContentSchema.parse(json);
    } catch (error) {
      warnRemoteFallback(`Falling back to local detail JSON for ${slug}`, error);
      return loadDetailContentFromFilesystem(slug);
    }
  },
);

const fetchLiveWorkerPuzzle = cache(async (): Promise<PuzzleDetail | null> => {
  const workerHealthUrl = PINPOINT_WORKER_HEALTH_URL.trim();
  if (!workerHealthUrl) return null;

  try {
    const res = await fetch(workerHealthUrl, {
      next: { tags: ["worker-live"], revalidate: 300 },
    });
    if (!res.ok) {
      throw new Error(`worker live fetch failed with status ${res.status}`);
    }

    const json = await res.json();
    const liveRecord = parseLiveWorkerPuzzleRecord(json);
    if (!liveRecord) {
      throw new Error("worker live payload was incomplete");
    }

    return toLivePuzzleDetail(liveRecord);
  } catch (error) {
    warnRemoteFallback("Worker live puzzle unavailable", error);
    return null;
  }
});

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

function warnRemoteFallback(message: string, error: unknown) {
  const detail =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  console.warn(`[puzzles] ${message}${detail ? `: ${detail}` : ""}`);
}

function resolveDetailClues(
  registryClues: string[],
  detailContent: PuzzleDetailContentRecord,
): string[] {
  const detailClues = Object.keys(detailContent.wordHints);

  if (
    detailClues.length === registryClues.length &&
    detailClues.every((clue) => registryClues.includes(clue))
  ) {
    return detailClues;
  }

  return registryClues;
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
    status: entry.status as "live" | "archived",
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
  const detailClues = resolveDetailClues(entry.clues, detailContent);

  return {
    number: entry.puzzleNumber,
    slug: entry.slug,
    title: buildTitle(entry),
    date: formatDisplayDate(entry.publishDate),
    isoDate: entry.publishDate,
    answer: entry.mainAnswer,
    category: entry.category,
    clues: detailClues,
    difficulty: entry.difficultyLevel ?? "Moderate",
    shortSummary: entry.shortSummary,
    fullAnalysis: detailContent.fullAnalysis,
    solutionNarrative: detailContent.solutionNarrative ?? [],
    wordHints: detailContent.wordHints,
    spoilerHints: detailContent.spoilerHints ?? {},
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

async function getLiveWorkerPuzzle(
  entries?: Array<{
    slug: string;
  }>,
): Promise<PuzzleDetail | null> {
  const livePuzzle = await fetchLiveWorkerPuzzle();
  if (!livePuzzle) return null;

  if (entries?.some((entry) => entry.slug === livePuzzle.slug)) {
    return null;
  }

  return livePuzzle;
}

// ── Public API (async) ─────────────────────────────────────────────────────

/** Used only by generateStaticParams — reads bundled registry at build time. */
export function getAllDetailSlugs(): string[] {
  return bundledRegistryEntries.filter(isDetailEntry).map((e) => e.slug);
}

export async function getCurrentPuzzle(): Promise<PuzzleDetail> {
  const entries = await getDetailEntries();
  const livePuzzle = await getLiveWorkerPuzzle(entries);
  if (livePuzzle) {
    return livePuzzle;
  }

  const current = entries.find((e) => e.status === "live");
  if (!current) throw new Error("Expected one live puzzle in the registry.");
  return toPuzzleDetail(current);
}

export async function getPuzzleBySlug(slug: string): Promise<PuzzleDetail | null> {
  const entries = await getDetailEntries();
  const entry = entries.find((e) => e.slug === slug);
  if (entry) {
    return toPuzzleDetail(entry);
  }

  const livePuzzle = await getLiveWorkerPuzzle(entries);
  return livePuzzle?.slug === slug ? livePuzzle : null;
}

export async function getPuzzleSlugByNumber(number: number): Promise<string | null> {
  const entries = await getDetailEntries();
  const entry = entries.find((e) => e.puzzleNumber === number);
  if (entry) return entry.slug;

  const livePuzzle = await getLiveWorkerPuzzle(entries);
  return livePuzzle?.number === number ? livePuzzle.slug : null;
}

export async function getPuzzleSlugByPublishDate(isoDate: string): Promise<string | null> {
  const entries = await getDetailEntries();
  const entry = entries.find((e) => e.publishDate === isoDate);
  if (entry) return entry.slug;

  const livePuzzle = await getLiveWorkerPuzzle(entries);
  return livePuzzle?.isoDate === isoDate ? livePuzzle.slug : null;
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

export async function getAdjacentEntries(slug: string): Promise<{
  prev: ArchiveEntry | null;
  next: ArchiveEntry | null;
}> {
  const entries = await getDetailEntries();
  const idx = entries.findIndex((e) => e.slug === slug);
  if (idx === -1) {
    const livePuzzle = await getLiveWorkerPuzzle(entries);
    if (livePuzzle?.slug === slug) {
      const previousEntry = entries[0] ? toArchiveEntry(entries[0]) : null;
      return { prev: previousEntry, next: null };
    }
    return { prev: null, next: null };
  }
  // entries sorted newest-first: idx-1 = newer, idx+1 = older
  const next = idx > 0 ? toArchiveEntry(entries[idx - 1]) : null;
  const prev = idx < entries.length - 1 ? toArchiveEntry(entries[idx + 1]) : null;
  return { prev, next };
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
