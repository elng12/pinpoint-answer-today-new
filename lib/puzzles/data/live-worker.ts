import { cache } from "react";
import { warnRemoteFallback } from "@/lib/puzzles/data-sources";
import { formatDisplayDate, inferPuzzleNumberFromDate, isIsoDate } from "@/lib/puzzles/data/date";
import type { PuzzleDetail, PuzzleDetailDisplay } from "@/lib/puzzles/data/types";
import {
  findMentionedClue,
  inferFaqIntentType,
  inferPuzzleDifficultyBand,
  inferPuzzleQuestionType,
  parseLesson,
} from "@/lib/puzzles/data/detail";
import {
  buildLiveArticleBreakdown,
  buildLiveClueExplanation,
  buildLiveConnectorSummary,
  buildLiveFallbackPhrase,
  buildLiveFaqs,
  buildLiveLessons,
  buildLiveWordHints,
  detectLiveAnswerPattern,
  pickLiveTurningPoint,
} from "@/lib/puzzles/live-fallback";
import { buildSharedFallbackSolutionNarrative } from "@/lib/puzzles/fallback-copy";
import { parseAndValidateUrl } from "@/lib/security/url-allowlist";

type LiveWorkerPuzzleRecord = {
  puzzleDate: string;
  fetchedAt: string;
  clues: string[];
  answer: string;
};

const DEFAULT_PINPOINT_WORKER_HEALTH_URL = "https://pinpoint-worker.2296744453m.workers.dev/health";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function getPinpointWorkerHealthUrl(): string {
  const raw = (process.env.PINPOINT_WORKER_HEALTH_URL ?? DEFAULT_PINPOINT_WORKER_HEALTH_URL).trim();
  try {
    return parseAndValidateUrl(
      raw,
      {
        allowedSchemes: ["https:"],
        allowedHosts: ["pinpoint-worker.2296744453m.workers.dev"],
        allowedHostSuffixes: [".workers.dev"],
        allowLocalhost: process.env.NODE_ENV !== "production",
      },
      "PINPOINT_WORKER_HEALTH_URL",
    ).toString();
  } catch {
    return DEFAULT_PINPOINT_WORKER_HEALTH_URL;
  }
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
  const lessons = buildLiveLessons(answer, turningPoint, record.clues);
  const wordHints = buildLiveWordHints(record.clues, answer);
  const faqs = buildLiveFaqs(puzzleNumber, answer, turningPoint, record.clues);
  const wrongGuessCandidates = [
    {
      label:
        pattern.kind === "before" || pattern.kind === "after"
          ? "loose phrase guesses"
          : pattern.kind === "association"
            ? "a literal category guess"
            : "a broader category guess",
      whyPlausible:
        pattern.kind === "before" || pattern.kind === "after"
          ? "The opening clues can support more than one shared-word read before one clue locks the missing word into place."
          : "The first two clues are broad enough to suggest a wider topic before the turning clue sharpens the board.",
      whyRejected:
        `Once ${turningPoint} lands, the solved answer explains the full board more cleanly than that earlier surface read.`,
    },
  ];
  const categoryPrecisionNote =
    pattern.kind === "before"
      ? "one shared ending word placed after each clue, not a loose topic grouping"
      : pattern.kind === "after"
        ? "one shared opening word placed before each clue, not a loose topic grouping"
        : pattern.kind === "association"
          ? "one shared subject viewed from multiple angles rather than a literal category label"
          : "one concrete category with clues that stay at the same level of specificity";
  const articleBlocks = buildLiveArticleBreakdown(puzzleNumber, record.clues, answer, turningPoint, {
    wrongGuessCandidates,
    categoryPrecisionNote,
  });
  const setValidationSummary =
    articleBlocks[4] ??
    `${record.clues.slice(-3).join(", ")} keep confirming the same answer, so the full board behaves like one coherent set instead of a few lucky matches.`;
  const solutionNarrative = buildSharedFallbackSolutionNarrative({
    kind: pattern.kind,
    wrongGuess: wrongGuessCandidates[0].label,
    turningPoint,
    clues: record.clues,
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
  const turningPointRecord = {
    clue: turningPoint,
    whyDecisive: `${turningPoint} is the clue that makes the shared answer concrete enough to test across all five clues.`,
    whatChangedAfterIt: `Once ${turningPoint} lands, the earlier clues start reading under the same answer instead of as loose guesses.`,
  };
  const solvePath = {
    firstRead:
      articleBlocks[0] ?? `At first, ${record.clues.slice(0, 2).join(" and ")} pointed in more than one direction.`,
    falseStarts:
      pattern.kind === "before" || pattern.kind === "after"
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
  const uniquenessSignals = {
    angle: connectorSummary,
    relatedEntities: clueRows.map((row) => row.resolvedPhraseOrMember).slice(0, 5),
    doNotRepeatPatterns: Array.from(
      new Set([connectorSummary, ...clueRows.map((row) => row.searchableContext || row.resolvedPhraseOrMember)]),
    ).slice(0, 5),
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
    wrongGuessCandidates,
    setValidationSummary,
    categoryPrecisionNote,
    display,
    status: "live",
    detailState: "publishing_placeholder",
    updatedAt: record.fetchedAt,
    detailMode: "short",
    detailSource: "fallback",
    pageExperienceMode: "light-explainer",
  };
}

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

export async function getLiveWorkerPuzzle(
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
