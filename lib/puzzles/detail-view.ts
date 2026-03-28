import type {
  FaqItem,
  PuzzleDifficultyBand,
  PuzzleEvidenceFaqItemRecord,
  PuzzleQuestionType,
} from "@/lib/puzzles/schema";

export function getVisibleDetailFaqs(
  faqs: FaqItem[],
  detailMode: "full" | "short",
): FaqItem[] {
  return detailMode === "short" ? faqs.slice(0, 2) : faqs;
}

export type VisibleDetailFaqEntry = {
  question: string;
  answer: string;
  tiedClue: string | null;
  intentType: PuzzleEvidenceFaqItemRecord["intentType"] | null;
};

export function getVisibleDetailFaqEntries(
  faqItems: PuzzleEvidenceFaqItemRecord[],
  faqs: FaqItem[],
  detailMode: "full" | "short",
): VisibleDetailFaqEntry[] {
  const source: VisibleDetailFaqEntry[] =
    faqItems.length > 0
      ? faqItems.map((item) => ({
          question: item.question,
          answer: item.answer,
          tiedClue: item.tiedClue ?? null,
          intentType: item.intentType,
        }))
      : faqs.map((item) => ({
          question: item.question,
          answer: item.answer,
          tiedClue: null,
          intentType: null,
        }));

  return detailMode === "short" ? source.slice(0, 2) : source;
}

export function formatPuzzleQuestionTypeLabel(questionType: PuzzleQuestionType): string {
  if (questionType === "phrase") return "Phrase board";
  if (questionType === "association") return "Association board";
  if (questionType === "hybrid") return "Hybrid board";
  return "Category board";
}

export function formatPuzzleDifficultyBandLabel(difficultyBand: PuzzleDifficultyBand): string {
  if (difficultyBand === "obvious") return "Obvious";
  if (difficultyBand === "hard") return "Hard";
  return "Medium";
}
