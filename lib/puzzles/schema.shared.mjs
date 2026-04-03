import { z } from "zod";

export const puzzleStatusSchema = z.enum(["draft", "preview", "live", "archived"]);
export const puzzleDetailStateSchema = z.enum([
  "draft",
  "generating",
  "validated",
  "publishing_placeholder",
  "fallback_full",
  "published",
  "failed",
]);
export const difficultyLevelSchema = z.enum(["Easy", "Moderate", "Hard"]);
export const puzzleQuestionTypeSchema = z.enum(["phrase", "category", "association", "hybrid"]);
export const puzzleDifficultyBandSchema = z.enum(["obvious", "medium", "hard"]);
export const puzzleDetailBodyModeSchema = z.enum(["short", "standard", "deep"]);
export const puzzlePageExperienceModeSchema = z.enum(["full-analysis", "light-explainer"]);

export const puzzleRegistryEntrySchema = z.object({
  puzzleNumber: z.number().int().positive(),
  slug: z.string().min(1),
  publishDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: puzzleStatusSchema,
  clues: z.array(z.string().min(1)).min(1),
  mainAnswer: z.string().min(1).nullable(),
  category: z.string().min(1).nullable(),
  difficultyLevel: difficultyLevelSchema.optional(),
  detailState: puzzleDetailStateSchema.optional(),
  shortSummary: z.string().min(1),
  updatedAt: z.string().datetime(),
});

export const registrySchema = z.array(puzzleRegistryEntrySchema);

export const faqItemSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

export const lessonItemSchema = z.union([
  z.string().min(1),
  z.object({ title: z.string().min(1), body: z.string().min(1) }),
]);

export const puzzleDetailDisplayRowSchema = z.object({
  clue: z.string().min(1),
  examplePhrase: z.string().min(1),
  connectionExplained: z.string().min(1),
});

export const puzzleDetailDisplaySchema = z.object({
  connectorSummary: z.string().min(1),
  fastStrategy: z.string().min(1).optional(),
  clueTableRows: z.array(puzzleDetailDisplayRowSchema).length(5).optional(),
});

export const puzzleSolvePathSchema = z.object({
  firstRead: z.string().min(1),
  falseStarts: z.array(z.string().min(1)),
  whyFalseStartPlausible: z.array(z.string().min(1)),
  breakingClue: z.string().min(1).optional(),
  pivot: z.string().min(1).optional(),
  fullBoardConfirmation: z.string().min(1).optional(),
});

export const puzzleTurningPointSchema = z.object({
  clue: z.string().min(1),
  whyDecisive: z.string().min(1),
  whatChangedAfterIt: z.string().min(1),
});

export const puzzleClueRowSchema = z.object({
  clue: z.string().min(1),
  surfaceMisread: z.string().min(1).optional(),
  resolvedPhraseOrMember: z.string().min(1),
  nonObviousWhy: z.string().min(1),
  searchableContext: z.string().min(1).optional(),
});

export const puzzleFaqIntentTypeSchema = z.enum([
  "definition",
  "clue_background",
  "comparison",
  "solve_strategy",
  "category_context",
]);

export const puzzleEvidenceFaqItemSchema = z.object({
  intentType: puzzleFaqIntentTypeSchema,
  question: z.string().min(1),
  answer: z.string().min(1),
  tiedClue: z.string().min(1).nullable().optional(),
});

export const puzzleUniquenessSignalsSchema = z.object({
  angle: z.string().min(1),
  relatedEntities: z.array(z.string().min(1)),
  doNotRepeatPatterns: z.array(z.string().min(1)),
});

export const puzzleDetailContentSchema = z.object({
  slug: z.string().min(1),
  detailState: puzzleDetailStateSchema.optional(),
  questionType: puzzleQuestionTypeSchema.optional(),
  difficultyBand: puzzleDifficultyBandSchema.optional(),
  bodyMode: puzzleDetailBodyModeSchema.optional(),
  pageExperienceMode: puzzlePageExperienceModeSchema.optional(),
  articleBlocks: z.array(z.string().min(1)).optional(),
  fullAnalysis: z.array(z.string().min(1)).min(1),
  solutionNarrative: z.array(z.string().min(1)).optional(),
  wordHints: z.record(z.string().min(1)),
  spoilerHints: z.record(z.string().min(1)).optional(),
  lessons: z.array(lessonItemSchema).min(1),
  faqs: z.array(faqItemSchema).min(1),
  solvePath: puzzleSolvePathSchema.optional(),
  turningPoint: puzzleTurningPointSchema.optional(),
  clueRows: z.array(puzzleClueRowSchema).optional(),
  faqItems: z.array(puzzleEvidenceFaqItemSchema).optional(),
  uniquenessSignals: puzzleUniquenessSignalsSchema.optional(),
  display: puzzleDetailDisplaySchema.optional(),
});
