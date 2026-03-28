import type {
  PuzzleClueRowRecord,
  PuzzleDifficultyBand,
  PuzzleEvidenceFaqItemRecord,
  PuzzleQuestionType,
  PuzzleSolvePathRecord,
  PuzzleTurningPointRecord,
  PuzzleUniquenessSignalsRecord,
} from "@/lib/puzzles/schema";
import type { PuzzleSlotContractData } from "@/lib/puzzles/slot-contract";

export interface PuzzleDataForAI {
  puzzleNumber: number;
  rawWords: string[];
  mainAnswer: string;
}

export type AIGeneratedSlots = PuzzleSlotContractData;

export interface AIGeneratedContent {
  questionType?: PuzzleQuestionType;
  difficultyBand?: PuzzleDifficultyBand;
  sections: {
    articleBlocks?: string[];
    overview: string;
    solutionEmergence: string;
    wrongGuesses: Array<{ guess: string; explanation: string }>;
    clueDetails: Array<{ clue: string; phrase: string; explanation: string; etymology?: string }>;
    lessons: Array<{ title: string; body: string }>;
    faqs: Array<{ question: string; answer: string }>;
    trivia?: string;
  };
  analysis: {
    detailedBreakdown: string;
    dailyDebrief: string;
    heroSummary: string;
    seoTitle: string;
    seoDescription: string;
    seoKeywords: string[];
    tags: string[];
    llmTemplateVersion: string;
  };
  solvePath?: PuzzleSolvePathRecord;
  turningPoint?: PuzzleTurningPointRecord;
  clueRows?: PuzzleClueRowRecord[];
  faqItems?: PuzzleEvidenceFaqItemRecord[];
  uniquenessSignals?: PuzzleUniquenessSignalsRecord;
  slots?: AIGeneratedSlots;
}

export type ParsedAIResponse = Partial<Omit<AIGeneratedContent, "slots">> & {
  slots?: Partial<AIGeneratedSlots>;
};

export type PuzzleProvider = "openai" | "anthropic" | "zhipu" | "azure";

export type PuzzleGenerationOptions = {
  model?: string;
  apiEndpoint?: string;
  provider?: PuzzleProvider;
  apiVersion?: string;
};
