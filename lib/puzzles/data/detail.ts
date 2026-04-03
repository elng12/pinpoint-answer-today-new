import type {
  LessonItem,
  PuzzleClueRowRecord,
  PuzzleDifficultyBand,
  PuzzleEvidenceFaqItemRecord,
  PuzzleDetailContentRecord,
  PuzzleQuestionType,
  PuzzleRegistryEntryRecord,
  PuzzleSolvePathRecord,
  PuzzleTurningPointRecord,
  PuzzleUniquenessSignalsRecord,
} from "@/lib/puzzles/schema";
import { fetchPuzzleContent } from "@/lib/puzzles/data-sources";
import { formatDisplayDate } from "@/lib/puzzles/data/date";
import type { PuzzleDetail, PuzzleDetailDisplay } from "@/lib/puzzles/data/types";
import { resolveFormalDetailState } from "@/lib/puzzles/data/registry";
import {
  buildLiveConnectorSummary,
  buildLiveFallbackPhrase,
  detectLiveAnswerPattern,
  normalizeLooseLiveText,
  singularizeTrailingWord,
} from "@/lib/puzzles/live-fallback";

function buildTitle(entry: Pick<PuzzleRegistryEntryRecord, "puzzleNumber">): string {
  return `Pinpoint #${entry.puzzleNumber}`;
}

export function parseLesson(lesson: LessonItem): { title: string | null; body: string } {
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

export function inferPuzzleQuestionType(answer: string): PuzzleQuestionType {
  const pattern = detectLiveAnswerPattern(answer);
  if (pattern.kind === "before" || pattern.kind === "after") {
    return "phrase";
  }
  if (pattern.kind === "association") {
    return "association";
  }
  return "category";
}

export function inferPuzzleDifficultyBand(input: {
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

export function inferFaqIntentType(
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

export function findMentionedClue(text: string, clues: string[]): string | null {
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

  const sourceParagraphs = [...solutionNarrative, ...articleBlocks, ...fullAnalysis]
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
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

export async function toPuzzleDetail(
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
  const pageExperienceMode =
    detailContent.pageExperienceMode === "light-explainer" || detailContent.bodyMode === "short"
      ? "light-explainer"
      : "full-analysis";

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
    wrongGuessCandidates: detailContent.wrongGuessCandidates ?? [],
    setValidationSummary: detailContent.setValidationSummary ?? null,
    categoryPrecisionNote: detailContent.categoryPrecisionNote ?? null,
    display,
    status: entry.status,
    detailState,
    updatedAt: entry.updatedAt,
    detailMode: detailContent.bodyMode === "short" ? "short" : "full",
    detailSource: "formal",
    pageExperienceMode,
  };
}
