import { z } from "zod";
import type { PuzzleDetail } from "@/lib/puzzles/data";

export const REASONING_ARTICLE_DRAFT_VERSION = "reasoning-article-v1";

export const reasoningArticleBlockSchema = z.object({
  bullets: z.array(z.string().min(1)).optional(),
  body: z.array(z.string().min(1)).min(1),
  key: z.string().min(1),
  title: z.string().min(1).optional(),
  variant: z.literal("answer").optional(),
});

export const reasoningArticleDraftSchema = z.object({
  blocks: z.array(reasoningArticleBlockSchema).min(1),
  slug: z.string().min(1),
  version: z.literal(REASONING_ARTICLE_DRAFT_VERSION),
});

export type ReasoningArticleBlock = z.infer<typeof reasoningArticleBlockSchema>;
export type ReasoningArticleDraft = z.infer<typeof reasoningArticleDraftSchema>;

export type ReasoningArticleQualityIssue = {
  code: string;
  message: string;
  severity: "hard" | "warn";
};

function normalizeParagraphKey(paragraph: string): string {
  return paragraph.toLowerCase().replace(/\s+/g, " ").trim();
}

function formatCluePath(clues: string[]): string {
  return clues.join(", ");
}

function formatPlainCluePath(clues: string[]): string {
  return clues.join(" ");
}

function formatSeries(items: string[]): string {
  if (items.length <= 1) {
    return items.join("");
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function normalizePhraseTokens(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc\u2032'"]/g, "")
    .replace(/[‐‑‒–—-]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanReasoningText(value: string): string {
  return value
    .replace(/\s*Use the clue table[^.]*\./gi, "")
    .replace(/\s*Use the table below[^.]*\./gi, "")
    .replace(/\s*then skim the compact FAQ[^.]*\./gi, "")
    .replace(/\s*and the compact FAQ below[^.]*\./gi, "")
    .replace(/\bThe same shared word\b/g, "One connector")
    .replace(/\bthe same shared word\b/g, "one connector")
    .replace(/\bThe same missing word\b/g, "One missing connector")
    .replace(/\bthe same missing word\b/g, "one missing connector")
    .replace(/\bThe same word\b/g, "One connector")
    .replace(/\bthe same word\b/g, "one connector")
    .replace(/\bThe shared word\b/g, "One connector")
    .replace(/\bthe shared word\b/g, "one connector")
    .replace(/\bThe shared answer\b/g, "One answer")
    .replace(/\bthe shared answer\b/g, "one answer")
    .replace(/\bmakes one answer concrete enough to test across the full board\b/gi, "makes the missing word easier to test across the full board")
    .replace(/\bstart reading under the same answer\b/gi, "start pointing to the repeated word")
    .replace(/\.\.+/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

function firstSentences(value: string | null | undefined, count = 1): string {
  const cleaned = cleanReasoningText(value ?? "");
  if (!cleaned) {
    return "";
  }

  const sentences = cleaned.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((sentence) => sentence.trim()).filter(Boolean);
  return sentences && sentences.length > 0 ? sentences.slice(0, count).join(" ") : cleaned;
}

function safeFirstSentences(value: string | null | undefined, answer: string, count = 1): string {
  const sentence = firstSentences(value, count);
  return sentence && !paragraphMentionsAnswer(sentence, answer) ? sentence : "";
}

function dedupeParagraphs(paragraphs: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const paragraph of paragraphs.map(cleanReasoningText).filter(Boolean)) {
    const key = normalizeParagraphKey(paragraph);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(paragraph);
  }

  return unique;
}

function cleanEvidencePhrase(value: string | null | undefined): string {
  const cleaned = cleanReasoningText(value ?? "")
    .replace(/\s+[—–-]\s+.*$/, "")
    .replace(/\s*\.$/, "")
    .trim();

  return cleaned && wordCount(cleaned) <= 8 ? cleaned : "";
}

function buildResolvedPhraseSeries(puzzle: PuzzleDetail): string {
  const phrases = puzzle.display.clueTableRows
    .map((row) => cleanEvidencePhrase(row.examplePhrase))
    .filter(Boolean);

  if (phrases.length > 0) {
    return formatSeries(phrases);
  }

  const clueRowPhrases = puzzle.clueRows
    .map((row) => cleanEvidencePhrase(row.resolvedPhraseOrMember))
    .filter(Boolean);

  return formatSeries(clueRowPhrases);
}

function phraseAlreadyExplained({
  confirmation,
  guess,
  why,
}: {
  confirmation?: string;
  guess: string;
  why?: string;
}): boolean {
  if (!confirmation) {
    return false;
  }

  const normalizedConfirmation = normalizeParagraphKey(confirmation);
  const normalizedGuess = normalizeParagraphKey(guess);
  const normalizedWhy = why ? normalizeParagraphKey(why) : "";

  return (
    (normalizedGuess.length > 0 && normalizedConfirmation.includes(normalizedGuess)) ||
    (normalizedWhy.length > 24 && normalizedConfirmation.includes(normalizedWhy))
  );
}

function paragraphMentionsAnswer(paragraph: string, answer: string): boolean {
  const normalizedParagraph = normalizePhraseTokens(paragraph);
  const normalizedAnswer = normalizePhraseTokens(answer);
  return (
    (normalizedAnswer.length > 0 && normalizedParagraph.includes(normalizedAnswer)) ||
    /\bthe answer (?:is|was)\b/i.test(paragraph)
  );
}

function polishConnectorSummary(value: string): string {
  return cleanReasoningText(value).replace(/^a category board focused on\s+/i, "");
}

function getSafeConnectorSummary(puzzle: PuzzleDetail): string {
  const candidates = [puzzle.display.connectorSummary, puzzle.categoryPrecisionNote]
    .map((candidate) => polishConnectorSummary(candidate ?? ""))
    .filter(Boolean);

  const safeCandidate = candidates.find((candidate) => !paragraphMentionsAnswer(candidate, puzzle.answer));
  if (safeCandidate) {
    return safeCandidate;
  }

  if (puzzle.questionType === "phrase") {
    return "one familiar phrase pattern";
  }

  if (puzzle.questionType === "category") {
    return "one exact category";
  }

  if (puzzle.questionType === "association") {
    return "one shared association";
  }

  return "one clean connection";
}

function formatAnswerTitle(answer: string): string {
  return answer.length > 58 ? "Answer" : `Answer: ${answer}`;
}

function buildBoardCheckFitText(puzzle: PuzzleDetail): string {
  if (puzzle.questionType === "phrase") {
    return "all use the repeated word after each clue";
  }

  if (puzzle.questionType === "category") {
    return "all land in the same category";
  }

  if (puzzle.questionType === "association") {
    return "all point to the same connection";
  }

  return "all point to the same answer";
}

function buildAnswerBody(puzzle: PuzzleDetail, title: string): string[] {
  const summary = "This is the cleanest reading because it explains the full board, not just one or two clues.";

  if (title === "Answer") {
    return [`The answer was "${puzzle.answer}".`, summary];
  }

  return [summary];
}

function keepAnswerNearEnd(paragraphs: string[], answer: string): string[] {
  if (paragraphs.length <= 1) {
    return paragraphs;
  }

  const answerParagraphs = paragraphs.filter((paragraph) => paragraphMentionsAnswer(paragraph, answer));
  const setupParagraphs = paragraphs.filter((paragraph) => !paragraphMentionsAnswer(paragraph, answer));

  if (setupParagraphs.length === 0 || answerParagraphs.length === 0) {
    return paragraphs;
  }

  return [...setupParagraphs, ...answerParagraphs];
}

function buildCluePathLead(puzzle: PuzzleDetail): string {
  const [firstClue, secondClue, thirdClue, fourthClue, fifthClue] = puzzle.clues;
  const cluePath = formatPlainCluePath(puzzle.clues);

  if (firstClue && secondClue && thirdClue && fourthClue && fifthClue) {
    return `In LinkedIn Pinpoint, ${cluePath} is the clue path to test before the reveal. This Pinpoint answer works because ${firstClue} ${secondClue} ${thirdClue}, ${secondClue} ${thirdClue} ${fourthClue}, and ${thirdClue} ${fourthClue} ${fifthClue} all start pointing toward the same slot. The order matters in Pinpoint. LinkedIn players should wait until one connector explains every clue.`;
  }

  return `In LinkedIn Pinpoint, ${cluePath} points to one shared pattern; the notes below follow the clue order before explaining why the final connection holds.`;
}

function shouldPrependCluePath(paragraphs: string[], clues: string[]): boolean {
  if (clues.length < 3) {
    return false;
  }

  const cluePath = normalizePhraseTokens(formatCluePath(clues));
  return !paragraphs.some((paragraph) => normalizePhraseTokens(paragraph).includes(cluePath));
}

function buildSolvePathParagraphs(puzzle: PuzzleDetail): string[] {
  const paragraphs: string[] = [];

  if (puzzle.solvePath?.firstRead) {
    paragraphs.push(puzzle.solvePath.firstRead);
  }

  puzzle.solvePath?.falseStarts.forEach((guess, index) => {
    const why = puzzle.solvePath?.whyFalseStartPlausible[index];
    paragraphs.push(why ? `A first guess was "${guess}". ${why}` : `A first guess was "${guess}".`);
  });

  if (puzzle.turningPoint?.clue) {
    paragraphs.push(`${puzzle.turningPoint.clue} was the turning clue. ${puzzle.turningPoint.whyDecisive}`);
  } else if (puzzle.solvePath?.breakingClue) {
    paragraphs.push(`${puzzle.solvePath.breakingClue} was the clue that narrowed the board.`);
  }

  if (puzzle.turningPoint?.whatChangedAfterIt) {
    paragraphs.push(puzzle.turningPoint.whatChangedAfterIt);
  }

  if (puzzle.solvePath?.fullBoardConfirmation) {
    paragraphs.push(puzzle.solvePath.fullBoardConfirmation);
  }

  return paragraphs;
}

function buildGeneratedJourneyParagraphs(puzzle: PuzzleDetail): string[] {
  if (!puzzle.solvePath) {
    return [];
  }

  const paragraphs: string[] = [buildCluePathLead(puzzle)];
  const [firstGuess, ...otherGuesses] = puzzle.solvePath.falseStarts;
  const [firstWhy, ...otherWhys] = puzzle.solvePath.whyFalseStartPlausible;

  if (puzzle.solvePath.firstRead || firstGuess) {
    const firstRead = puzzle.solvePath.firstRead ? `${puzzle.solvePath.firstRead} ` : "";
    const guessText = firstGuess
      ? `My first read drifted toward "${firstGuess}". ${firstWhy ?? ""}`
      : "";
    paragraphs.push(
      `${firstRead}${guessText} That trap is common in Pinpoint. LinkedIn solvers can avoid it by waiting for a clue that forces one exact slot.`.trim(),
    );
  }

  otherGuesses.forEach((guess, index) => {
    const why = otherWhys[index];
    if (
      phraseAlreadyExplained({
        confirmation: puzzle.solvePath?.fullBoardConfirmation,
        guess,
        why,
      })
    ) {
      return;
    }
    paragraphs.push(why ? `Another tempting read was "${guess}". ${why}` : `Another tempting read was "${guess}".`);
  });

  if (puzzle.turningPoint?.clue) {
    paragraphs.push(
      `${puzzle.turningPoint.clue} changed the shape of the solve. ${puzzle.turningPoint.whyDecisive} ${puzzle.turningPoint.whatChangedAfterIt}`,
    );
  } else if (puzzle.solvePath.breakingClue) {
    paragraphs.push(`${puzzle.solvePath.breakingClue} changed the shape of the solve.`);
  }

  if (puzzle.solvePath.fullBoardConfirmation) {
    paragraphs.push(`${puzzle.solvePath.fullBoardConfirmation} That is the clean check in Pinpoint. LinkedIn solvers can trust the answer only after every clue lands.`);
  }

  paragraphs.push(`The answer was "${puzzle.answer}".`);

  return dedupeParagraphs(paragraphs);
}

function buildJourneyParagraphs(puzzle: PuzzleDetail): string[] {
  const generatedParagraphs = buildGeneratedJourneyParagraphs(puzzle);
  const solvePathParagraphs = buildSolvePathParagraphs(puzzle);
  const sourceParagraphs =
    generatedParagraphs.length > 0
      ? generatedParagraphs
      : puzzle.solutionNarrative.length > 0
        ? puzzle.solutionNarrative
        : solvePathParagraphs.length > 0
          ? solvePathParagraphs
          : puzzle.articleBlocks.length > 0
            ? puzzle.articleBlocks
            : [puzzle.shortSummary];

  const orderedParagraphs = keepAnswerNearEnd(dedupeParagraphs(sourceParagraphs), puzzle.answer);
  const paragraphs = shouldPrependCluePath(orderedParagraphs, puzzle.clues)
    ? [buildCluePathLead(puzzle), ...orderedParagraphs]
    : orderedParagraphs;
  const hasAnswer = paragraphs.some((paragraph) => paragraphMentionsAnswer(paragraph, puzzle.answer));
  return hasAnswer ? paragraphs : [...paragraphs, `The answer was ${puzzle.answer}.`];
}

function buildFalseStartBullets(puzzle: PuzzleDetail): string[] {
  return (puzzle.solvePath?.falseStarts ?? []).map((guess) => cleanReasoningText(guess)).filter(Boolean);
}

function buildPhraseEvidenceBullets(puzzle: PuzzleDetail): string[] {
  const displayRows = puzzle.display.clueTableRows
    .map((row) => cleanEvidencePhrase(row.examplePhrase))
    .filter(Boolean);

  if (displayRows.length > 0) {
    return displayRows;
  }

  return puzzle.clueRows
    .map((row) => cleanEvidencePhrase(row.resolvedPhraseOrMember))
    .filter(Boolean);
}

export function buildReasoningArticleDraft(puzzle: PuzzleDetail): ReasoningArticleDraft {
  const blocks: ReasoningArticleBlock[] = [];
  const cluePath = formatPlainCluePath(puzzle.clues);
  const connectorSummary = getSafeConnectorSummary(puzzle);

  blocks.push({
    body: [
      "Today's puzzle looked simple at first.",
      `The clue path was ${cluePath}, and the solve had to make every clue read under ${connectorSummary}.`,
    ],
    key: "clue-path",
  });

  if (puzzle.solvePath?.firstRead || puzzle.solvePath?.falseStarts[0]) {
    const firstRead = firstSentences(puzzle.solvePath?.firstRead, 1);
    const firstGuess = puzzle.solvePath?.falseStarts[0];
    const firstWhy = safeFirstSentences(puzzle.solvePath?.whyFalseStartPlausible[0], puzzle.answer, 1);
    const falseStartBullets = buildFalseStartBullets(puzzle);
    const body = [
      firstGuess
        ? `My first read drifted toward "${firstGuess}"${firstWhy ? ` because ${firstWhy}` : "."}`
        : firstRead,
      "That was the trap: the early clues were readable on their own, but they did not prove one exact phrase slot yet.",
    ].filter(Boolean);

    blocks.push({
      body,
      bullets: falseStartBullets.length > 1 ? falseStartBullets : undefined,
      key: "first-read",
      title: "The First Guess (And the Trap)",
    });
  }

  if (puzzle.turningPoint?.clue) {
    const turnBody = [
      safeFirstSentences(puzzle.turningPoint.whyDecisive, puzzle.answer, 1),
      safeFirstSentences(puzzle.turningPoint.whatChangedAfterIt, puzzle.answer, 1),
    ].filter(Boolean);

    blocks.push({
      body: [
        `Next up: ${puzzle.turningPoint.clue}.`,
        ...(turnBody.length > 0
          ? turnBody
          : [`${puzzle.turningPoint.clue} made the earlier ideas easier to test against the full board.`]),
      ],
      key: "turning-clue",
      title: `${puzzle.turningPoint.clue} Changes Everything`,
    });
  } else if (puzzle.solvePath?.breakingClue) {
    blocks.push({
      body: [
        `Next up: ${puzzle.solvePath.breakingClue}.`,
        `${puzzle.solvePath.breakingClue} narrowed the board and gave the earlier clues a cleaner reading.`,
      ],
      key: "turning-clue",
      title: `${puzzle.solvePath.breakingClue} Changes Everything`,
    });
  }

  const resolvedPhraseSeries = buildResolvedPhraseSeries(puzzle);
  const phraseEvidenceBullets = buildPhraseEvidenceBullets(puzzle);
  if (resolvedPhraseSeries) {
    blocks.push({
      body: [
        "Once the pattern was clear, the whole board checked cleanly.",
        `${resolvedPhraseSeries} ${buildBoardCheckFitText(puzzle)}, so the solve is stronger than a loose topic match.`,
      ],
      bullets: phraseEvidenceBullets,
      key: "board-check",
      title: "The Revealed Clues (And Why They Seal It)",
    });
  } else if (puzzle.setValidationSummary) {
    blocks.push({
      body: [firstSentences(puzzle.setValidationSummary, 2)],
      key: "board-check",
      title: "The Revealed Clues (And Why They Seal It)",
    });
  }

  const answerTitle = formatAnswerTitle(puzzle.answer);

  blocks.push({
    body: buildAnswerBody(puzzle, answerTitle),
    key: "answer",
    title: answerTitle,
    variant: "answer",
  });

  const fallbackParagraphs = buildJourneyParagraphs(puzzle);
  const storyBlocks =
    blocks.length > 1
      ? blocks.filter((block) => block.body.length > 0 || (block.bullets?.length ?? 0) > 0)
      : [
          {
            body: fallbackParagraphs,
            key: "fallback",
          },
        ];

  return reasoningArticleDraftSchema.parse({
    blocks: storyBlocks.map(compactBlock),
    slug: puzzle.slug,
    version: REASONING_ARTICLE_DRAFT_VERSION,
  });
}

function wordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

function compactParagraph(value: string, maxWords = 66): string {
  const cleaned = cleanReasoningText(value);
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return cleaned;
  }

  return `${words
    .slice(0, maxWords)
    .join(" ")
    .replace(/[,:;]+$/, "")}.`;
}

function compactBlock(block: ReasoningArticleBlock): ReasoningArticleBlock {
  return {
    ...block,
    body: block.body.map((paragraph) => compactParagraph(paragraph)).filter(Boolean),
    bullets: block.bullets?.map(cleanReasoningText).filter(Boolean),
  };
}

function pushIssue(
  issues: ReasoningArticleQualityIssue[],
  severity: ReasoningArticleQualityIssue["severity"],
  code: string,
  message: string,
) {
  issues.push({ code, message, severity });
}

export function validateReasoningArticleDraft(
  draft: ReasoningArticleDraft,
  puzzle: Pick<PuzzleDetail, "answer" | "slug">,
): ReasoningArticleQualityIssue[] {
  const issues: ReasoningArticleQualityIssue[] = [];
  const answerIndex = draft.blocks.findIndex((block) => block.variant === "answer" || block.key === "answer");

  if (answerIndex === -1) {
    pushIssue(issues, "hard", "answer-block-missing", "Reasoning article needs a final answer block.");
  } else if (answerIndex !== draft.blocks.length - 1) {
    pushIssue(issues, "hard", "answer-block-not-last", "The answer block should stay at the end.");
  }

  if (!draft.blocks.some((block) => block.key === "clue-path")) {
    pushIssue(issues, "hard", "clue-path-missing", "Reasoning article needs a clue-path lead block.");
  }

  for (const block of draft.blocks) {
    if (block.title && /\bstep\s*\d+\b/i.test(block.title)) {
      pushIssue(issues, "hard", "step-title", `Step-style title found: ${block.title}`);
    }

    if (block.title && block.title.length > 82) {
      pushIssue(issues, "warn", "long-title", `Title is long in ${block.key}: ${block.title}`);
    }

    for (const paragraph of block.body) {
      const words = wordCount(paragraph);
      if (words > 70) {
        pushIssue(issues, "hard", "paragraph-too-long", `${block.key} paragraph has ${words} words.`);
      } else if (words > 48) {
        pushIssue(issues, "warn", "paragraph-long", `${block.key} paragraph has ${words} words.`);
      }
    }

    for (const item of block.bullets ?? []) {
      const words = wordCount(item);
      if (words > 16) {
        pushIssue(issues, "warn", "bullet-long", `${block.key} bullet is long: ${item}`);
      }
    }
  }

  const nonAnswerBlocks = answerIndex > 0 ? draft.blocks.slice(0, answerIndex) : draft.blocks;
  const nonAnswerText = nonAnswerBlocks
    .flatMap((block) => [block.title ?? "", ...block.body, ...(block.bullets ?? [])])
    .join(" ");
  const normalizedNonAnswerText = normalizePhraseTokens(nonAnswerText);
  const normalizedAnswer = normalizePhraseTokens(puzzle.answer);
  if (normalizedAnswer && normalizedNonAnswerText.includes(normalizedAnswer)) {
    pushIssue(issues, "warn", "early-answer-mention", `${puzzle.slug} mentions the exact answer before the final block.`);
  }

  const abstractTerms = ["connector", "category", "pattern", "board", "frame"];
  for (const term of abstractTerms) {
    const count = (nonAnswerText.match(new RegExp(`\\b${term}\\b`, "gi")) ?? []).length;
    if (count >= 5) {
      pushIssue(issues, "warn", "abstract-term-repeat", `${puzzle.slug} repeats "${term}" ${count} times.`);
    }
  }

  return issues;
}
