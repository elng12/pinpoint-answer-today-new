import type {
  FaqItem,
  LessonItem,
  PuzzleClueRowRecord,
  PuzzleDifficultyBand,
  PuzzleEvidenceFaqItemRecord,
  PuzzleDetailState,
  PuzzlePageExperienceMode,
  PuzzleQuestionType,
  PuzzleSolvePathRecord,
  PuzzleTurningPointRecord,
  PuzzleUniquenessSignalsRecord,
  PuzzleStatus,
} from "@/lib/puzzles/schema";

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
  pageExperienceMode: PuzzlePageExperienceMode;
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

export type PuzzleQueryOptions = {
  allowLiveWorkerFallback?: boolean;
};
