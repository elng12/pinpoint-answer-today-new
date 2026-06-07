import { buildSharedFallbackLessons, buildSharedFallbackFaqs } from "@/lib/puzzles/fallback-copy";
import { buildLiveClueExplanation, detectLiveAnswerPattern, pickLiveTurningPoint } from "@/lib/puzzles/live-fallback";
import type { LessonItem } from "@/lib/puzzles/schema";
import type { PuzzleDetail } from "@/lib/puzzles/data/types";

type FaqItem = { question: string; answer: string };

const GENERIC_LESSON_TITLE_PATTERNS = [
  /\bBroad clues can create the wrong frame early\b/i,
  /\bThe narrowing clue matters more than the loudest clue\b/i,
  /\bPrefer exact phrase logic over loose category logic\b/i,
  /\bPrefer precise category fit over broad topic logic\b/i,
];

const GENERIC_FAQ_QUESTION_PATTERNS = [
  /^What is the answer to LinkedIn Pinpoint #\d+\?$/i,
  /^What is the connection in LinkedIn Pinpoint #\d+\?$/i,
  /^Which clue really unlocks LinkedIn Pinpoint #\d+\?$/i,
  /^Which clue is decisive in LinkedIn Pinpoint #\d+\?$/i,
  /^Which clue really sets the category in LinkedIn Pinpoint #\d+\?$/i,
  /^Which clue gives the strongest anchor in LinkedIn Pinpoint #\d+\?$/i,
  /^Which clue makes the visual set click in LinkedIn Pinpoint #\d+\?$/i,
];

const GENERIC_HINT_PATTERNS = [
  /\bfits the same shared connection\b/i,
  /\bsame shared connection that leads to\b/i,
  /\bpoints back to that same connection\b/i,
  /\bis a familiar phrase or term, which is why this clue fits once\b/,
  /\bTreat this as one member of a narrower category\b/i,
  /\bThis clue becomes useful once you stop reading it literally\b/i,
  /\bLook for the cleaner category fit instead of the first broad topic\b/i,
  /\bmakes the category specific enough to test instead of staying broad\b/i,
];

function lessonTitle(lesson: LessonItem): string {
  return typeof lesson === "string" ? lesson : lesson.title;
}

function hasGenericLessonTitle(lessons: LessonItem[]): boolean {
  return lessons.some((lesson) =>
    GENERIC_LESSON_TITLE_PATTERNS.some((pattern) => pattern.test(lessonTitle(lesson))),
  );
}

function hasGenericFaqQuestion(faqs: FaqItem[]): boolean {
  return faqs.some((faq) =>
    GENERIC_FAQ_QUESTION_PATTERNS.some((pattern) => pattern.test(faq.question)),
  );
}

function hasGenericHint(hints: Record<string, string>): boolean {
  return Object.values(hints).some((hint) =>
    GENERIC_HINT_PATTERNS.some((pattern) => pattern.test(hint)),
  );
}

export function enhancePuzzleDetail(detail: PuzzleDetail): PuzzleDetail {
  const { clues, answer, number, turningPoint } = detail;
  const pattern = detectLiveAnswerPattern(answer);
  const tp = turningPoint?.clue || pickLiveTurningPoint(clues, answer);
  let enhanced = false;

  let lessons = detail.lessons;
  if (hasGenericLessonTitle(lessons)) {
    lessons = buildSharedFallbackLessons({
      puzzleNumber: number,
      kind: pattern.kind,
      turningPoint: tp,
      clues,
      answer,
    });
    enhanced = true;
  }

  let faqs = detail.faqs;
  if (hasGenericFaqQuestion(faqs)) {
    const connectorSummary = detail.category || answer;
    faqs = buildSharedFallbackFaqs({
      puzzleNumber: number,
      kind: pattern.kind,
      answer,
      turningPoint: tp,
      connectorSummary,
      clues,
    });
    enhanced = true;
  }

  let spoilerHints = detail.spoilerHints;
  if (hasGenericHint(spoilerHints)) {
    const rebuilt: Record<string, string> = {};
    for (const [clue, hint] of Object.entries(spoilerHints)) {
      if (GENERIC_HINT_PATTERNS.some((p) => p.test(hint))) {
        const index = clues.indexOf(clue);
        rebuilt[clue] = buildLiveClueExplanation(clue, answer, index >= 0 ? index : 0, tp);
      } else {
        rebuilt[clue] = hint;
      }
    }
    spoilerHints = rebuilt;
    enhanced = true;
  }

  if (!enhanced) return detail;

  return {
    ...detail,
    lessons,
    faqs,
    spoilerHints,
  };
}
