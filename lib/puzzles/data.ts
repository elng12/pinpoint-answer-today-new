import { cache } from "react";
import {
  type FaqItem,
  type LessonItem,
  type PuzzleClueRowRecord,
  type PuzzleDifficultyBand,
  type PuzzleEvidenceFaqItemRecord,
  type PuzzleDetailState,
  type PuzzleDetailContentRecord,
  type PuzzleQuestionType,
  type PuzzleRegistryEntryRecord,
  type PuzzleSolvePathRecord,
  type PuzzleStatus,
  type PuzzleTurningPointRecord,
  type PuzzleUniquenessSignalsRecord,
} from "@/lib/puzzles/schema";
import { fetchPuzzleContent, fetchRegistry, warnRemoteFallback } from "@/lib/puzzles/data-sources";
import { buildSharedFallbackSolutionNarrative } from "@/lib/puzzles/fallback-copy";
import { getBundledRegistryEntries } from "@/lib/puzzles/registry-bundled";
import {
  buildLiveArticleBreakdown,
  buildLiveClueExplanation,
  buildLiveConnectorSummary,
  buildLiveFallbackPhrase,
  buildLiveFaqs,
  buildLiveLessons,
  buildLiveWordHints,
  detectLiveAnswerPattern,
  normalizeLooseLiveText,
  pickLiveTurningPoint,
  singularizeTrailingWord,
} from "@/lib/puzzles/live-fallback";

export type PuzzleDetailDisplay = {
  connectorSummary: string;
  fastStrategy: string;
  clueTableRows: Array<{
    clue: string;
    examplePhrase: string;
    connectionExplained: string;
  }>;
};

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
  questionType: PuzzleQuestionType;
  difficultyBand: PuzzleDifficultyBand;
  shortSummary: string;
  articleBlocks: string[];
  fullAnalysis: string[];
  solutionNarrative: string[];
  wordHints: Record<string, string>;
  spoilerHints: Record<string, string>;
  lessons: LessonItem[];
  faqs: FaqItem[];
  solvePath: PuzzleSolvePathRecord | null;
  turningPoint: PuzzleTurningPointRecord | null;
  clueRows: PuzzleClueRowRecord[];
  faqItems: PuzzleEvidenceFaqItemRecord[];
  uniquenessSignals: PuzzleUniquenessSignalsRecord | null;
  display: PuzzleDetailDisplay;
  status: Exclude<PuzzleStatus, "draft" | "preview">;
  detailState: PuzzleDetailState;
  updatedAt: string;
  detailMode: "full" | "short";
  detailSource: "formal" | "fallback";
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

type PuzzleQueryOptions = {
  allowLiveWorkerFallback?: boolean;
};

type LiveWorkerPuzzleRecord = {
  puzzleDate: string;
  fetchedAt: string;
  clues: string[];
  answer: string;
};

// ── Constants ──────────────────────────────────────────────────────────────

const DETAIL_PUBLIC_FORMAL_ONLY =
  (process.env.DETAIL_PUBLIC_FORMAL_ONLY ?? "true").trim().toLowerCase() !== "false";
const DEFAULT_PINPOINT_WORKER_HEALTH_URL = "https://pinpoint-worker.2296744453m.workers.dev/health";
const BASELINE_NUMBER = 536;
const BASELINE_DATE_UTC = Date.UTC(2025, 9, 18); // 2025-10-18
const MS_IN_DAY = 86_400_000;

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

function getPinpointWorkerHealthUrl(): string {
  return (process.env.PINPOINT_WORKER_HEALTH_URL ?? DEFAULT_PINPOINT_WORKER_HEALTH_URL).trim();
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

function parseLesson(lesson: LessonItem): { title: string | null; body: string } {
  if (typeof lesson === "object") {
    return { title: lesson.title, body: lesson.body };
  }
  const dotIdx = lesson.indexOf(". ");
  if (dotIdx > 0 && dotIdx <= 55) {
    return { title: lesson.slice(0, dotIdx), body: lesson.slice(dotIdx + 2) };
  }
  return { title: null, body: lesson };
}

function extractConnectorTerm(source: string, markers: string[]): string | null {
  const lowerSource = source.toLowerCase();

  for (const marker of markers) {
    const markerIndex = lowerSource.indexOf(marker);
    if (markerIndex === -1) continue;

    const remainder = source.slice(markerIndex + marker.length).trim();
    if (!remainder) continue;

    const quoted = remainder.match(/^[“"'`]?(.+?)[”"'`]/);
    if (quoted?.[1]) {
      return quoted[1].trim();
    }

    return remainder
      .split(/\s+[—-]\s+/)[0]
      .split(/\s+in\s+/i)[0]
      .split(/[.!?]/)[0]
      .trim()
      .replace(/^[“"'`]+|[”"'`]+$/g, "");
  }

  return null;
}

function buildArchiveConnectorSummary(answer: string, category: string): string {
  const beforeTarget =
    extractConnectorTerm(answer, ["words that come before "]) ??
    extractConnectorTerm(category, ["words that come before "]);
  const afterTarget =
    extractConnectorTerm(answer, ["words that follow ", "words after "]) ??
    extractConnectorTerm(category, ["words that follow ", "words after "]);

  if (beforeTarget) {
    return "familiar phrases completed by one shared ending word";
  }

  if (afterTarget) {
    return "familiar phrases and everyday terms built with one shared opening word";
  }

  const pattern = detectLiveAnswerPattern(answer);
  if (pattern.kind === "typed-category" || pattern.kind === "association" || pattern.kind === "category") {
    return buildLiveConnectorSummary(answer);
  }

  return answer;
}

function buildArchiveExamplePhrase(clue: string, answer: string, category: string): string {
  const answerLower = answer.toLowerCase();
  const beforeTarget =
    extractConnectorTerm(answer, ["words that come before "]) ??
    extractConnectorTerm(category, ["words that come before "]);
  const afterTarget =
    extractConnectorTerm(answer, ["words that follow ", "words after "]) ??
    extractConnectorTerm(category, ["words that follow ", "words after "]);

  if (afterTarget) {
    return `${afterTarget} ${clue}`.trim();
  }

  if (beforeTarget) {
    if (clue.includes("(🌹🌹🌹)")) {
      return clue.replace("(🌹🌹🌹)", beforeTarget);
    }
    return `${clue} ${singularizeTrailingWord(beforeTarget)}`.trim();
  }

  if (answerLower.startsWith("shades of ")) {
    const suffix = answer.slice(answerLower.indexOf("shades of ") + "shades of ".length).trim();
    return `${clue} ${suffix}`.trim();
  }

  return buildLiveFallbackPhrase(clue, answer);
}

function buildPuzzleDisplay(
  clues: string[],
  answer: string,
  category: string,
  detailContent: PuzzleDetailContentRecord,
  lessons: LessonItem[],
  wordHints: Record<string, string>,
): PuzzleDetailDisplay {
  const storedDisplay = detailContent.display;
  const firstLesson = lessons[0];
  const fastStrategy = storedDisplay?.fastStrategy
    ? storedDisplay.fastStrategy
    : detailContent.turningPoint?.whyDecisive
      ? detailContent.turningPoint.whyDecisive
    : firstLesson
      ? parseLesson(firstLesson).body
      : "Start with two clues, test one connector, then verify every clue against it.";

  const clueTableRows =
    storedDisplay?.clueTableRows && storedDisplay.clueTableRows.length === clues.length
      ? storedDisplay.clueTableRows
      : detailContent.clueRows && detailContent.clueRows.length === clues.length
        ? detailContent.clueRows.map((row) => ({
            clue: row.clue,
            examplePhrase: row.resolvedPhraseOrMember,
            connectionExplained: row.nonObviousWhy,
          }))
      : clues.map((clue) => ({
          clue,
          examplePhrase: buildArchiveExamplePhrase(clue, answer, category),
          connectionExplained:
            wordHints[clue] ?? `${clue} fits the same shared rule that leads to ${answer}.`,
        }));

  return {
    connectorSummary: storedDisplay?.connectorSummary ?? buildArchiveConnectorSummary(answer, category),
    fastStrategy,
    clueTableRows,
  };
}

function inferPuzzleQuestionType(answer: string): PuzzleQuestionType {
  const pattern = detectLiveAnswerPattern(answer);
  if (pattern.kind === "before" || pattern.kind === "after") {
    return "phrase";
  }
  if (pattern.kind === "association") {
    return "association";
  }
  return "category";
}

function inferPuzzleDifficultyBand(input: {
  explicit?: PuzzleDifficultyBand;
  difficultyLevel?: string;
  bodyMode?: string;
}): PuzzleDifficultyBand {
  if (input.explicit) {
    return input.explicit;
  }

  const bodyMode = String(input.bodyMode || "").trim().toLowerCase();
  if (bodyMode === "short") return "obvious";
  if (bodyMode === "deep") return "hard";

  const difficultyLevel = String(input.difficultyLevel || "").trim().toLowerCase();
  if (difficultyLevel === "easy") return "obvious";
  if (difficultyLevel === "hard") return "hard";

  return "medium";
}

function inferFaqIntentType(
  question: string,
  answer: string,
): PuzzleEvidenceFaqItemRecord["intentType"] {
  const normalized = normalizeLooseLiveText(question);
  if (normalized.includes("what is the answer")) {
    return "definition";
  }
  if (normalized.includes("what is the connection")) {
    return "category_context";
  }
  if (normalized.includes("which clue") || normalized.startsWith("why is")) {
    return "clue_background";
  }
  if (normalized.includes("compare") || normalized.includes("difference")) {
    return "comparison";
  }
  if (normalized.includes("strategy") || normalized.includes("how ")) {
    return "solve_strategy";
  }

  return inferPuzzleQuestionType(answer) === "association" ? "category_context" : "solve_strategy";
}

function findMentionedClue(text: string, clues: string[]): string | null {
  const normalizedText = normalizeLooseLiveText(text);
  let bestMatch: { clue: string; index: number } | null = null;
  for (const clue of clues) {
    const normalizedClue = normalizeLooseLiveText(clue);
    if (!normalizedClue) continue;
    const matchIndex = normalizedText.indexOf(normalizedClue);
    if (matchIndex === -1) continue;
    if (!bestMatch || matchIndex < bestMatch.index) {
      bestMatch = { clue, index: matchIndex };
    }
  }
  return bestMatch?.clue ?? null;
}

function resolveEvidenceClueRows(
  clues: string[],
  detailContent: PuzzleDetailContentRecord,
  display: PuzzleDetailDisplay,
  wordHints: Record<string, string>,
): PuzzleClueRowRecord[] {
  if (detailContent.clueRows?.length === clues.length) {
    return detailContent.clueRows;
  }

  return display.clueTableRows.map((row) => ({
    clue: row.clue,
    resolvedPhraseOrMember: row.examplePhrase,
    nonObviousWhy: row.connectionExplained || wordHints[row.clue] || `${row.clue} fits the same answer.`,
    searchableContext: row.examplePhrase,
  }));
}

function resolveEvidenceFaqItems(
  detailContent: PuzzleDetailContentRecord,
  clues: string[],
  answer: string,
): PuzzleEvidenceFaqItemRecord[] {
  if (detailContent.faqItems?.length) {
    return detailContent.faqItems;
  }

  return detailContent.faqs.map((faq) => ({
    intentType: inferFaqIntentType(faq.question, answer),
    question: faq.question,
    answer: faq.answer,
    tiedClue: findMentionedClue(`${faq.question} ${faq.answer}`, clues),
  }));
}

function resolveEvidenceTurningPoint(
  detailContent: PuzzleDetailContentRecord,
  clueRows: PuzzleClueRowRecord[],
  faqItems: PuzzleEvidenceFaqItemRecord[],
): PuzzleTurningPointRecord | null {
  if (detailContent.turningPoint) {
    return detailContent.turningPoint;
  }

  const faqCandidate = faqItems.find((item) => item.intentType === "clue_background" && item.tiedClue);
  const rowCandidate = clueRows.find((row) =>
    /(turning point|key clue|strongest clue|locks the answer|locks the frame|makes the answer concrete|giveaway)/i.test(
      row.nonObviousWhy,
    ),
  );
  const clue = faqCandidate?.tiedClue ?? rowCandidate?.clue ?? null;
  if (!clue) {
    return null;
  }

  const whyDecisive =
    faqCandidate?.answer ||
    rowCandidate?.nonObviousWhy ||
    `${clue} is the clue that makes the shared answer precise enough to test across the full board.`;

  return {
    clue,
    whyDecisive,
    whatChangedAfterIt: `Once ${clue} lands, the earlier clues stop feeling broad and start reading under the same answer.`,
  };
}

function resolveEvidenceSolvePath(
  detailContent: PuzzleDetailContentRecord,
  articleBlocks: string[],
  fullAnalysis: string[],
  solutionNarrative: string[],
  turningPoint: PuzzleTurningPointRecord | null,
): PuzzleSolvePathRecord | null {
  if (detailContent.solvePath) {
    return detailContent.solvePath;
  }

  const sourceParagraphs = [
    ...solutionNarrative,
    ...articleBlocks,
    ...fullAnalysis,
  ].map((paragraph) => paragraph.trim()).filter(Boolean);
  const firstRead = sourceParagraphs[0];
  if (!firstRead) {
    return null;
  }

  const fullBoardConfirmation =
    sourceParagraphs.find((paragraph, index) => index > 0 && /the answer (?:is|was)|once /i.test(paragraph)) ??
    turningPoint?.whatChangedAfterIt;

  return {
    firstRead,
    falseStarts: [],
    whyFalseStartPlausible: [],
    ...(turningPoint?.clue ? { breakingClue: turningPoint.clue } : {}),
    ...(turningPoint?.whyDecisive ? { pivot: turningPoint.whyDecisive } : {}),
    ...(fullBoardConfirmation ? { fullBoardConfirmation } : {}),
  };
}

function resolveEvidenceUniquenessSignals(
  detailContent: PuzzleDetailContentRecord,
  display: PuzzleDetailDisplay,
  clueRows: PuzzleClueRowRecord[],
): PuzzleUniquenessSignalsRecord | null {
  if (detailContent.uniquenessSignals) {
    return detailContent.uniquenessSignals;
  }

  return {
    angle: display.connectorSummary,
    relatedEntities: clueRows.map((row) => row.resolvedPhraseOrMember).filter(Boolean).slice(0, 5),
    doNotRepeatPatterns: Array.from(
      new Set(
        [display.connectorSummary, ...clueRows.map((row) => row.searchableContext || row.resolvedPhraseOrMember)]
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ).slice(0, 5),
  };
}

function toLivePuzzleDetail(record: LiveWorkerPuzzleRecord): PuzzleDetail | null {
  const puzzleNumber = inferPuzzleNumberFromDate(record.puzzleDate);
  if (!puzzleNumber) return null;

  const slug = `pinpoint-answer-${puzzleNumber}`;
  const clueLabel = record.clues.join(", ");
  const answer = record.answer;
  const shortSummary = `Pinpoint #${puzzleNumber}: ${clueLabel}.`;
  const pattern = detectLiveAnswerPattern(answer);
  const turningPoint = pickLiveTurningPoint(record.clues, answer);
  const connectorSummary = buildLiveConnectorSummary(answer);
  const lessons = buildLiveLessons(answer, turningPoint);
  const wordHints = buildLiveWordHints(record.clues, answer);
  const faqs = buildLiveFaqs(puzzleNumber, answer, turningPoint);
  const fullAnalysis = buildLiveArticleBreakdown(puzzleNumber, record.clues, answer, turningPoint);
  const articleBlocks = fullAnalysis;
  const solutionNarrative = buildSharedFallbackSolutionNarrative({
    kind: pattern.kind,
    wrongGuess: pattern.kind === "before" || pattern.kind === "after"
      ? "loose phrase guesses"
      : "a broader category guess",
    turningPoint,
  });
  const display: PuzzleDetailDisplay = {
    connectorSummary,
    fastStrategy: parseLesson(lessons[0]!).body,
    clueTableRows: record.clues.map((clue, index) => ({
      clue,
      examplePhrase: buildLiveFallbackPhrase(clue, answer),
      connectionExplained: wordHints[clue] ?? buildLiveClueExplanation(clue, answer, index, turningPoint),
    })),
  };
  const questionType = inferPuzzleQuestionType(answer);
  const difficultyBand = inferPuzzleDifficultyBand({ difficultyLevel: "Moderate" });
  const clueRows = display.clueTableRows.map((row) => ({
    clue: row.clue,
    surfaceMisread: row.clue,
    resolvedPhraseOrMember: row.examplePhrase,
    nonObviousWhy: row.connectionExplained,
    searchableContext: row.examplePhrase,
  }));
  const faqItems = faqs.map((faq) => ({
    intentType: inferFaqIntentType(faq.question, answer),
    question: faq.question,
    answer: faq.answer,
    tiedClue: findMentionedClue(`${faq.question} ${faq.answer}`, record.clues),
  }));
  const turningPointRecord: PuzzleTurningPointRecord = {
    clue: turningPoint,
    whyDecisive: `${turningPoint} is the clue that makes the shared answer concrete enough to test across all five clues.`,
    whatChangedAfterIt: `Once ${turningPoint} lands, the earlier clues start reading under the same answer instead of as loose guesses.`,
  };
  const solvePath: PuzzleSolvePathRecord = {
    firstRead: articleBlocks[0] ?? `At first, ${record.clues.slice(0, 2).join(" and ")} pointed in more than one direction.`,
    falseStarts: pattern.kind === "before" || pattern.kind === "after"
      ? ["loose phrase guesses"]
      : ["a broader category guess"],
    whyFalseStartPlausible: [
      pattern.kind === "before" || pattern.kind === "after"
        ? "The opening clues support more than one shared-word read until a later clue narrows the pattern."
        : "The earliest clues are broad enough to resemble a wider category before one clue makes the exact set visible.",
    ],
    breakingClue: turningPoint,
    pivot: turningPointRecord.whyDecisive,
    fullBoardConfirmation:
      articleBlocks.find((paragraph, index) => index > 1 && /the answer (?:is|was)|once /i.test(paragraph)) ??
      turningPointRecord.whatChangedAfterIt,
  };
  const uniquenessSignals: PuzzleUniquenessSignalsRecord = {
    angle: connectorSummary,
    relatedEntities: clueRows.map((row) => row.resolvedPhraseOrMember).slice(0, 5),
    doNotRepeatPatterns: Array.from(new Set([connectorSummary, ...clueRows.map((row) => row.searchableContext || row.resolvedPhraseOrMember)])).slice(0, 5),
  };

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
    questionType,
    difficultyBand,
    shortSummary,
    articleBlocks,
    fullAnalysis,
    solutionNarrative,
    wordHints,
    spoilerHints: {},
    lessons,
    faqs,
    solvePath,
    turningPoint: turningPointRecord,
    clueRows,
    faqItems,
    uniquenessSignals,
    display,
    status: "live",
    detailState: "publishing_placeholder",
    updatedAt: record.fetchedAt,
    detailMode: "short",
    detailSource: "fallback",
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

function resolveRegistryDetailState(entry: Pick<PuzzleRegistryEntryRecord, "status" | "detailState">): PuzzleDetailState {
  if (entry.detailState) {
    return entry.detailState;
  }

  return entry.status === "draft" || entry.status === "preview" ? "draft" : "published";
}

function resolveFormalDetailState(
  entry: Pick<PuzzleRegistryEntryRecord, "status" | "detailState">,
  detailContent: Pick<PuzzleDetailContentRecord, "detailState">,
): PuzzleDetailState {
  return detailContent.detailState ?? resolveRegistryDetailState(entry);
}

function isPublicDetailState(detailState: PuzzleDetailState): boolean {
  return detailState === "published" || detailState === "fallback_full";
}

function isPublicDetailEntry(
  entry: PuzzleRegistryEntryRecord,
): entry is PuzzleRegistryEntryRecord & {
  mainAnswer: string;
  category: string;
  status: "live" | "archived";
} {
  return isDetailEntry(entry) && isPublicDetailState(resolveRegistryDetailState(entry));
}

// ── Data fetching (ISR-aware) ─────────────────────────────────────────────
// Registry + detail JSON loading lives in `data-sources.ts`.
// Live worker fetch stays here because it composes a fallback PuzzleDetail payload.

const fetchLiveWorkerPuzzle = cache(async (): Promise<PuzzleDetail | null> => {
  const workerHealthUrl = getPinpointWorkerHealthUrl();
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

function normalizeLegacyLookupValue(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u2018\u2019\u201C\u201D]/g, "")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function addLegacyRedirectCandidate(
  map: Map<string, string | null>,
  key: string,
  slug: string,
) {
  if (!key) return;

  const existing = map.get(key);
  if (!existing) {
    map.set(key, slug);
    return;
  }

  if (existing !== slug) {
    map.set(key, null);
  }
}

function extractLegacyConnectorKeys(value: string): string[] {
  const patterns = [
    /\b(?:words|terms)\s+that\s+come\s+before\s*[“"']([^”"']+)[”"']/i,
    /\b(?:words|terms)\s+that\s+come\s+after\s*[“"']([^”"']+)[”"']/i,
    /\bwords\s+that\s+precede\s*[“"']([^”"']+)[”"']/i,
    /\bwords\s+that\s+follow\s*[“"']([^”"']+)[”"']/i,
    /\bphrases\s+formed\s+with\s*[“"']([^”"']+)[”"']/i,
    /\b(?:words|terms)\s+that\s+come\s+before\s+([a-z0-9-]+)/i,
    /\b(?:words|terms)\s+that\s+come\s+after\s+([a-z0-9-]+)/i,
    /\bwords\s+that\s+precede\s+([a-z0-9-]+)/i,
    /\bwords\s+that\s+follow\s+([a-z0-9-]+)/i,
    /\bphrases\s+formed\s+with\s+([a-z0-9-]+)/i,
  ];

  const keys = new Set<string>();
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (!match) continue;

    const key = normalizeLegacyLookupValue(match[1] ?? "");
    if (key) {
      keys.add(key);
    }
  }

  return Array.from(keys);
}

const getLegacyThemeRedirectMap = cache(async (): Promise<Map<string, string | null>> => {
  const map = new Map<string, string | null>();
  const entries = (await fetchRegistry()).filter(isDetailEntry);

  for (const entry of entries) {
    for (const candidate of [entry.category, entry.mainAnswer]) {
      addLegacyRedirectCandidate(
        map,
        normalizeLegacyLookupValue(candidate),
        entry.slug,
      );
    }
  }

  return map;
});

const getLegacyConnectorRedirectMap = cache(async (): Promise<Map<string, string | null>> => {
  const map = new Map<string, string | null>();
  const entries = (await fetchRegistry()).filter(isDetailEntry);

  for (const entry of entries) {
    for (const candidate of [entry.category, entry.mainAnswer]) {
      for (const key of extractLegacyConnectorKeys(candidate)) {
        addLegacyRedirectCandidate(map, key, entry.slug);
      }
    }
  }

  return map;
});

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

function toArchiveEntryFromDetail(puzzle: PuzzleDetail): ArchiveEntry {
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

async function toPuzzleDetail(
  entry: PuzzleRegistryEntryRecord & {
    mainAnswer: string;
    category: string;
    status: "live" | "archived";
  },
): Promise<PuzzleDetail> {
  const detailContent = await fetchPuzzleContent(entry.slug);
  const detailClues = resolveDetailClues(entry.clues, detailContent);
  const detailState = resolveFormalDetailState(entry, detailContent);
  const display = buildPuzzleDisplay(
    detailClues,
    entry.mainAnswer,
    entry.category,
    detailContent,
    detailContent.lessons,
    detailContent.wordHints,
  );
  const articleBlocks = detailContent.articleBlocks ?? detailContent.fullAnalysis;
  const fullAnalysis = detailContent.fullAnalysis;
  const solutionNarrative = detailContent.solutionNarrative ?? [];
  const questionType = detailContent.questionType ?? inferPuzzleQuestionType(entry.mainAnswer);
  const difficultyBand = inferPuzzleDifficultyBand({
    explicit: detailContent.difficultyBand,
    difficultyLevel: entry.difficultyLevel,
    bodyMode: detailContent.bodyMode,
  });
  const clueRows = resolveEvidenceClueRows(detailClues, detailContent, display, detailContent.wordHints);
  const faqItems = resolveEvidenceFaqItems(detailContent, detailClues, entry.mainAnswer);
  const turningPoint = resolveEvidenceTurningPoint(detailContent, clueRows, faqItems);
  const solvePath = resolveEvidenceSolvePath(
    detailContent,
    articleBlocks,
    fullAnalysis,
    solutionNarrative,
    turningPoint,
  );
  const uniquenessSignals = resolveEvidenceUniquenessSignals(detailContent, display, clueRows);

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
    questionType,
    difficultyBand,
    shortSummary: entry.shortSummary,
    articleBlocks,
    fullAnalysis,
    solutionNarrative,
    wordHints: detailContent.wordHints,
    spoilerHints: detailContent.spoilerHints ?? {},
    lessons: detailContent.lessons,
    faqs: detailContent.faqs,
    solvePath,
    turningPoint,
    clueRows,
    faqItems,
    uniquenessSignals,
    display,
    status: entry.status,
    detailState,
    updatedAt: entry.updatedAt,
    detailMode: detailContent.bodyMode === "short" ? "short" : "full",
    detailSource: "formal",
  };
}

async function getDetailEntries() {
  const entries = await fetchRegistry();
  return entries.filter(isPublicDetailEntry);
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

function allowLiveWorkerFallback(options?: PuzzleQueryOptions): boolean {
  if (typeof options?.allowLiveWorkerFallback === "boolean") {
    return options.allowLiveWorkerFallback;
  }

  return !DETAIL_PUBLIC_FORMAL_ONLY;
}

// ── Public API (async) ─────────────────────────────────────────────────────

/** Used only by generateStaticParams — reads bundled registry at build time. */
export function getAllDetailSlugs(): string[] {
  return getBundledRegistryEntries()
    .filter(isPublicDetailEntry)
    .map((e) => e.slug);
}

export async function getCurrentPuzzle(
  options?: PuzzleQueryOptions,
): Promise<PuzzleDetail> {
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

export async function getLegacyThemeRedirectSlug(legacySlug: string): Promise<string | null> {
  const map = await getLegacyThemeRedirectMap();
  return map.get(normalizeLegacyLookupValue(legacySlug)) ?? null;
}

export async function getLegacyConnectorRedirectSlug(
  legacySlug: string,
): Promise<string | null> {
  const map = await getLegacyConnectorRedirectMap();
  return map.get(normalizeLegacyLookupValue(legacySlug)) ?? null;
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
  const archiveEntries = await getArchiveEntries(options);
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
