import type { FaqItem, LessonItem } from "@/lib/puzzles/schema";
import {
  buildSharedFallbackArticleBlocks,
  buildSharedFallbackFaqs,
  buildSharedFallbackLessons,
} from "@/lib/puzzles/fallback-copy";

export type LiveAnswerPattern =
  | { kind: "before"; token: string }
  | { kind: "after"; token: string }
  | { kind: "typed-category"; noun: string; singularNoun: string }
  | { kind: "association"; subject: string }
  | { kind: "category"; label: string };

export function normalizeLooseLiveText(value: string): string {
  return value
    .toLowerCase()
    .replace(/["“”'`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripStraightAndCurlyQuotes(value: string): string {
  return value.replace(/["“”]/g, "");
}

export function singularizeTrailingWord(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const words = trimmed.split(/\s+/);
  const lastWord = words[words.length - 1] || trimmed;
  const lowerLastWord = lastWord.toLowerCase();

  const irregularSingulars: Record<string, string> = {
    mice: "mouse",
    geese: "goose",
    teeth: "tooth",
    feet: "foot",
    men: "man",
    women: "woman",
    people: "person",
    children: "child",
  };

  let singularLastWord = lastWord;
  if (irregularSingulars[lowerLastWord]) {
    singularLastWord = irregularSingulars[lowerLastWord];
  } else if (/ies$/i.test(lastWord)) {
    singularLastWord = `${lastWord.slice(0, -3)}y`;
  } else if (/(ches|shes|xes|zes)$/i.test(lastWord)) {
    singularLastWord = lastWord.slice(0, -2);
  } else if (/s$/i.test(lastWord) && !/ss$/i.test(lastWord)) {
    singularLastWord = lastWord.slice(0, -1);
  }

  return [...words.slice(0, -1), singularLastWord].join(" ").trim() || trimmed;
}

export function detectLiveAnswerPattern(answer: string): LiveAnswerPattern {
  const text = answer.trim();

  const before = text.match(/^Words that come before\s+["“]?(.+?)["”]?$/i);
  if (before?.[1]) return { kind: "before", token: before[1].trim() };

  const after = text.match(/^Words that come after\s+["“]?(.+?)["”]?$/i);
  if (after?.[1]) return { kind: "after", token: after[1].trim() };

  const typedCategory = text.match(/^(Types|Kinds)\s+of\s+(.+)$/i);
  if (typedCategory?.[2]) {
    const noun = typedCategory[2].trim();
    return {
      kind: "typed-category",
      noun,
      singularNoun: singularizeTrailingWord(noun),
    };
  }

  const association = text.match(/^Things associated with\s+(.+)$/i);
  if (association?.[1]) {
    return { kind: "association", subject: association[1].trim() };
  }

  return {
    kind: "category",
    label: text || "shared category",
  };
}

export function buildLiveConnectorSummary(answer: string): string {
  const pattern = detectLiveAnswerPattern(answer);
  if (pattern.kind === "before") {
    return `familiar phrases that end with "${pattern.token}"`;
  }
  if (pattern.kind === "after") {
    return `familiar phrases and common terms that begin with "${pattern.token}"`;
  }
  if (pattern.kind === "typed-category") {
    return `a category board focused on ${pattern.noun.toLowerCase()}`;
  }
  if (pattern.kind === "association") {
    return `a board centered on the theme of ${pattern.subject}`;
  }
  const cleanedLabel = pattern.label.replace(/\s+/g, " ").trim();
  if (cleanedLabel) {
    return `a category board focused on ${cleanedLabel}`;
  }
  return "a shared category board with one connector";
}

function buildLiveSpecialPhrase(clue: string, answer: string): string {
  const pattern = detectLiveAnswerPattern(answer);
  if (pattern.kind !== "before" && pattern.kind !== "after") return "";

  const symbolGroupPattern = /\(\s*[^\p{L}\p{N}]+\s*\)|[^\p{L}\p{N}\s()'"&,-]+/gu;
  const replaced = clue.replace(symbolGroupPattern, ` ${pattern.token} `).replace(/\s+/g, " ").trim();
  if (replaced === clue) return "";

  return stripStraightAndCurlyQuotes(replaced.replace(/\(\s*\)/g, "").replace(/\s+/g, " ").trim());
}

export function buildLiveFallbackPhrase(clue: string, answer: string): string {
  const pattern = detectLiveAnswerPattern(answer);
  if (pattern.kind === "before") {
    return buildLiveSpecialPhrase(clue, answer) || `${clue} ${pattern.token}`.trim();
  }
  if (pattern.kind === "after") {
    return buildLiveSpecialPhrase(clue, answer) || `${pattern.token} ${clue}`.trim();
  }
  if (pattern.kind === "typed-category") {
    const baseClue = clue.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
    const normalizedBase = baseClue || clue;
    if (normalizeLooseLiveText(normalizedBase).includes(normalizeLooseLiveText(pattern.singularNoun))) {
      return normalizedBase;
    }
    return `${normalizedBase} ${pattern.singularNoun}`.trim();
  }
  return clue.trim();
}

function scoreLiveClueSpecificity(clue: string): number {
  const text = clue.trim();
  if (!text) return 0;
  const words = text.split(/\s+/).filter(Boolean);
  let score = text.length;
  score += words.length * 5;
  score += (text.match(/-/g)?.length || 0) * 6;
  score += (text.match(/\(/g)?.length || 0) * 4;
  score += /\b(the|island|bridge|square|park|museum|tower|center|bay)\b/i.test(text) ? 8 : 0;
  return score;
}

export function pickLiveTurningPoint(clues: string[], answer: string): string {
  let bestClue = clues[0] || "the key clue";
  let bestScore = -1;
  const pattern = detectLiveAnswerPattern(answer);

  for (let index = 0; index < clues.length; index += 1) {
    const clue = clues[index] || "";
    let score = scoreLiveClueSpecificity(clue) + index;
    if (
      pattern.kind === "association" &&
      /\b(square|island|bridge|park|museum|tower|center|bay)\b/i.test(clue)
    ) {
      score += 10;
    }
    if (score > bestScore) {
      bestScore = score;
      bestClue = clue;
    }
  }

  return bestClue;
}

export function buildLiveClueExplanation(clue: string, answer: string, index: number, turningPoint: string): string {
  const pattern = detectLiveAnswerPattern(answer);
  const phrase = buildLiveFallbackPhrase(clue, answer);
  const clueCount = 5; // standard Pinpoint boards
  const isTurning = clue === turningPoint;
  const isFirst = index === 0;
  const isLast = index >= clueCount - 1;

  if (pattern.kind === "before" || pattern.kind === "after") {
    if (isTurning) {
      return `"${phrase}" is the clue that makes the missing word visible, because it produces the clearest phrase once "${pattern.token}" is in place.`;
    }
    if (isFirst) {
      return `"${phrase}" can work in more than one phrase frame, so the first clue alone is not enough to lock in the answer.`;
    }
    if (isLast) {
      return `"${phrase}" is the final confirmation that the same word fits every clue naturally.`;
    }
    return `"${phrase}" is a familiar phrase or term, which is why this clue fits once "${pattern.token}" is in place.`;
  }

  if (pattern.kind === "typed-category") {
    const noun = pattern.singularNoun.toLowerCase();
    if (isTurning) {
      return `"${phrase}" is where the board starts to turn, because this clue fits ${noun} more cleanly than the earlier broad guess.`;
    }
    if (isFirst) {
      return `The first clue, "${phrase}", can feel broad because it sits in more than one category before the answer sharpens.`;
    }
    if (isLast) {
      return `"${phrase}" is the last proof that every clue names a specific kind of ${noun}.`;
    }
    return `Once the board is read as ${pattern.noun.toLowerCase()}, "${phrase}" stops feeling broad and becomes an exact fit.`;
  }

  if (pattern.kind === "association") {
    const subject = pattern.subject;
    if (isTurning) {
      return `"${clue}" is one of the clearest anchors for a ${subject} reading, which is why it helps lock the board into place.`;
    }
    if (isFirst) {
      return `"${clue}" is the opening clue and can point in several directions until the ${subject} frame becomes visible.`;
    }
    if (isLast) {
      return `"${clue}" is the final clue that confirms the ${subject} reading holds across the whole board.`;
    }
    return `"${clue}" fits naturally once the board is read through ${subject} rather than as a loose general-interest category.`;
  }

  const categoryLabel = pattern.label;
  if (isTurning) {
    return `"${clue}" is the clue that turns the board toward ${categoryLabel}, because it gives the broad clue set a concrete category to test.`;
  }
  if (isFirst) {
    return `"${clue}" can fit several broad reads at first, but it later works as part of ${categoryLabel}.`;
  }
  if (isLast) {
    return `"${clue}" is the final confirmation that ${categoryLabel} holds across all five clues without forcing any of them.`;
  }
  return `"${clue}" fits once the board is read as ${categoryLabel}, so test it against the same category as the other clues.`;
}

export function buildLiveWordHints(clues: string[], answer: string): Record<string, string> {
  const turningPoint = pickLiveTurningPoint(clues, answer);
  return Object.fromEntries(
    clues.map((clue, index) => [clue, buildLiveClueExplanation(clue, answer, index, turningPoint)]),
  );
}

export function buildLiveLessons(answer: string, turningPoint: string, clues: string[] = []): LessonItem[] {
  const pattern = detectLiveAnswerPattern(answer);
  return buildSharedFallbackLessons({ kind: pattern.kind, turningPoint, clues, answer });
}

export function buildLiveFaqs(
  puzzleNumber: number,
  answer: string,
  turningPoint: string,
  clues: string[] = [],
): FaqItem[] {
  const pattern = detectLiveAnswerPattern(answer);
  const connectorSummary = buildLiveConnectorSummary(answer);
  return buildSharedFallbackFaqs({
    puzzleNumber,
    kind: pattern.kind,
    answer,
    turningPoint,
    connectorSummary,
    clues,
  });
}

export function buildLiveArticleBreakdown(
  puzzleNumber: number,
  clues: string[],
  answer: string,
  turningPoint: string,
  options?: {
    wrongGuessCandidates?: Array<{ label: string; whyPlausible: string; whyRejected?: string }>;
    setValidationSummary?: string;
    categoryPrecisionNote?: string;
  },
): string[] {
  const pattern = detectLiveAnswerPattern(answer);
  const connectorSummary = buildLiveConnectorSummary(answer);
  const sampleReads = clues
    .slice(0, 2)
    .map((clue) => buildLiveFallbackPhrase(clue, answer));
  const finalChecks = clues.slice(-2);

  return buildSharedFallbackArticleBlocks({
    kind: pattern.kind,
    clues,
    answer,
    turningPoint,
    connectorSummary,
    sampleReads,
    finalChecks,
    wrongGuessCandidates: options?.wrongGuessCandidates,
    setValidationSummary: options?.setValidationSummary,
    categoryPrecisionNote: options?.categoryPrecisionNote,
  });
}
