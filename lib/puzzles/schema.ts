import { z } from "zod";
import {
  puzzleDetailBodyModeSchema as sharedPuzzleDetailBodyModeSchema,
  puzzleDetailStateSchema as sharedPuzzleDetailStateSchema,
  difficultyLevelSchema as sharedDifficultyLevelSchema,
  puzzleQuestionTypeSchema as sharedPuzzleQuestionTypeSchema,
  puzzleDifficultyBandSchema as sharedPuzzleDifficultyBandSchema,
  faqItemSchema as sharedFaqItemSchema,
  lessonItemSchema as sharedLessonItemSchema,
  puzzlePageExperienceModeSchema as sharedPuzzlePageExperienceModeSchema,
  puzzlePublishModeSchema as sharedPuzzlePublishModeSchema,
  puzzleSolvePathSchema as sharedPuzzleSolvePathSchema,
  puzzleTurningPointSchema as sharedPuzzleTurningPointSchema,
  puzzleClueRowSchema as sharedPuzzleClueRowSchema,
  puzzleFaqIntentTypeSchema as sharedPuzzleFaqIntentTypeSchema,
  puzzleEvidenceFaqItemSchema as sharedPuzzleEvidenceFaqItemSchema,
  puzzleUniquenessSignalsSchema as sharedPuzzleUniquenessSignalsSchema,
  puzzleWrongGuessCandidateSchema as sharedPuzzleWrongGuessCandidateSchema,
  puzzleDetailContentSchema as sharedPuzzleDetailContentSchema,
  puzzleDetailDisplayRowSchema as sharedPuzzleDetailDisplayRowSchema,
  puzzleDetailDisplaySchema as sharedPuzzleDetailDisplaySchema,
  puzzleRegistryEntrySchema as sharedPuzzleRegistryEntrySchema,
  puzzleStatusSchema as sharedPuzzleStatusSchema,
  registrySchema as sharedRegistrySchema,
} from "./schema.shared.mjs";

export const puzzleStatusSchema =
  sharedPuzzleStatusSchema as z.ZodEnum<["draft", "preview", "live", "archived"]>;
export const puzzleDetailStateSchema =
  sharedPuzzleDetailStateSchema as z.ZodEnum<
    ["draft", "generating", "validated", "publishing_placeholder", "fallback_full", "published", "failed"]
  >;
export const difficultyLevelSchema =
  sharedDifficultyLevelSchema as z.ZodEnum<["Easy", "Moderate", "Hard"]>;
export const puzzleQuestionTypeSchema =
  sharedPuzzleQuestionTypeSchema as z.ZodEnum<["phrase", "category", "association", "hybrid"]>;
export const puzzleDifficultyBandSchema =
  sharedPuzzleDifficultyBandSchema as z.ZodEnum<["obvious", "medium", "hard"]>;
export const puzzleDetailBodyModeSchema =
  sharedPuzzleDetailBodyModeSchema as z.ZodEnum<["short", "standard", "deep"]>;
export const puzzlePageExperienceModeSchema =
  sharedPuzzlePageExperienceModeSchema as z.ZodEnum<["full-analysis", "light-explainer"]>;
export const puzzlePublishModeSchema =
  sharedPuzzlePublishModeSchema as z.ZodEnum<["answer-first", "full-analysis", "failed"]>;
export const puzzleRegistryEntrySchema = sharedPuzzleRegistryEntrySchema as z.ZodObject<{
  puzzleNumber: z.ZodNumber;
  slug: z.ZodString;
  publishDate: z.ZodString;
  status: typeof puzzleStatusSchema;
  clues: z.ZodArray<z.ZodString, "many">;
  mainAnswer: z.ZodNullable<z.ZodString>;
  category: z.ZodNullable<z.ZodString>;
  difficultyLevel: z.ZodOptional<typeof difficultyLevelSchema>;
  detailState: z.ZodOptional<typeof puzzleDetailStateSchema>;
  publishMode: z.ZodOptional<typeof puzzlePublishModeSchema>;
  shortSummary: z.ZodString;
  updatedAt: z.ZodString;
}>;
export const registrySchema = sharedRegistrySchema as z.ZodArray<typeof puzzleRegistryEntrySchema>;
export const faqItemSchema = sharedFaqItemSchema as z.ZodObject<{
  question: z.ZodString;
  answer: z.ZodString;
}>;
export const lessonItemSchema = sharedLessonItemSchema as z.ZodUnion<
  [z.ZodString, z.ZodObject<{ title: z.ZodString; body: z.ZodString }>]
>;
export const puzzleDetailDisplayRowSchema = sharedPuzzleDetailDisplayRowSchema as z.ZodObject<{
  clue: z.ZodString;
  examplePhrase: z.ZodString;
  connectionExplained: z.ZodString;
}>;
export const puzzleDetailDisplaySchema = sharedPuzzleDetailDisplaySchema as z.ZodObject<{
  connectorSummary: z.ZodString;
  fastStrategy: z.ZodOptional<z.ZodString>;
  clueTableRows: z.ZodOptional<z.ZodArray<typeof puzzleDetailDisplayRowSchema, "many">>;
}>;
export const puzzleSolvePathSchema = sharedPuzzleSolvePathSchema as z.ZodObject<{
  firstRead: z.ZodString;
  falseStarts: z.ZodArray<z.ZodString, "many">;
  whyFalseStartPlausible: z.ZodArray<z.ZodString, "many">;
  breakingClue: z.ZodOptional<z.ZodString>;
  pivot: z.ZodOptional<z.ZodString>;
  fullBoardConfirmation: z.ZodOptional<z.ZodString>;
}>;
export const puzzleTurningPointSchema = sharedPuzzleTurningPointSchema as z.ZodObject<{
  clue: z.ZodString;
  whyDecisive: z.ZodString;
  whatChangedAfterIt: z.ZodString;
}>;
export const puzzleClueRowSchema = sharedPuzzleClueRowSchema as z.ZodObject<{
  clue: z.ZodString;
  surfaceMisread: z.ZodOptional<z.ZodString>;
  resolvedPhraseOrMember: z.ZodString;
  nonObviousWhy: z.ZodString;
  searchableContext: z.ZodOptional<z.ZodString>;
  evidenceRef: z.ZodOptional<z.ZodString>;
  phraseExample: z.ZodOptional<z.ZodString>;
  fitConfidence: z.ZodOptional<z.ZodEnum<["confirmed", "manual", "weak"]>>;
}>;
export const puzzleFaqIntentTypeSchema = sharedPuzzleFaqIntentTypeSchema as z.ZodEnum<
  ["definition", "clue_background", "comparison", "solve_strategy", "category_context"]
>;
export const puzzleEvidenceFaqItemSchema = sharedPuzzleEvidenceFaqItemSchema as z.ZodObject<{
  intentType: typeof puzzleFaqIntentTypeSchema;
  question: z.ZodString;
  answer: z.ZodString;
  tiedClue: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}>;
export const puzzleUniquenessSignalsSchema = sharedPuzzleUniquenessSignalsSchema as z.ZodObject<{
  angle: z.ZodString;
  relatedEntities: z.ZodArray<z.ZodString, "many">;
  doNotRepeatPatterns: z.ZodArray<z.ZodString, "many">;
}>;
export const puzzleWrongGuessCandidateSchema = sharedPuzzleWrongGuessCandidateSchema as z.ZodObject<{
  label: z.ZodString;
  whyPlausible: z.ZodString;
  whyRejected: z.ZodOptional<z.ZodString>;
}>;
export const puzzleDetailContentSchema = sharedPuzzleDetailContentSchema as z.ZodObject<{
  slug: z.ZodString;
  detailState: z.ZodOptional<typeof puzzleDetailStateSchema>;
  publishMode: z.ZodOptional<typeof puzzlePublishModeSchema>;
  questionType: z.ZodOptional<typeof puzzleQuestionTypeSchema>;
  difficultyBand: z.ZodOptional<typeof puzzleDifficultyBandSchema>;
  bodyMode: z.ZodOptional<typeof puzzleDetailBodyModeSchema>;
  pageExperienceMode: z.ZodOptional<typeof puzzlePageExperienceModeSchema>;
  articleBlocks: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
  solutionNarrative: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
  wordHints: z.ZodRecord<z.ZodString, z.ZodString>;
  spoilerHints: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
  lessons: z.ZodArray<typeof lessonItemSchema, "many">;
  faqs: z.ZodArray<typeof faqItemSchema, "many">;
  solvePath: z.ZodOptional<typeof puzzleSolvePathSchema>;
  turningPoint: z.ZodOptional<typeof puzzleTurningPointSchema>;
  clueRows: z.ZodOptional<z.ZodArray<typeof puzzleClueRowSchema, "many">>;
  faqItems: z.ZodOptional<z.ZodArray<typeof puzzleEvidenceFaqItemSchema, "many">>;
  uniquenessSignals: z.ZodOptional<typeof puzzleUniquenessSignalsSchema>;
  wrongGuessCandidates: z.ZodOptional<z.ZodArray<typeof puzzleWrongGuessCandidateSchema, "many">>;
  setValidationSummary: z.ZodOptional<z.ZodString>;
  categoryPrecisionNote: z.ZodOptional<z.ZodString>;
  display: z.ZodOptional<typeof puzzleDetailDisplaySchema>;
}>;

export type PuzzleStatus = z.infer<typeof puzzleStatusSchema>;
export type PuzzleDetailState = z.infer<typeof puzzleDetailStateSchema>;
export type PuzzleQuestionType = z.infer<typeof puzzleQuestionTypeSchema>;
export type PuzzleDifficultyBand = z.infer<typeof puzzleDifficultyBandSchema>;
export type PuzzlePageExperienceMode = z.infer<typeof puzzlePageExperienceModeSchema>;
export type PuzzlePublishMode = z.infer<typeof puzzlePublishModeSchema>;
export type PuzzleRegistryEntryRecord = z.infer<typeof puzzleRegistryEntrySchema>;
export type PuzzleDetailContentRecord = z.infer<typeof puzzleDetailContentSchema>;
export type PuzzleDetailDisplayRecord = z.infer<typeof puzzleDetailDisplaySchema>;
export type PuzzleSolvePathRecord = z.infer<typeof puzzleSolvePathSchema>;
export type PuzzleTurningPointRecord = z.infer<typeof puzzleTurningPointSchema>;
export type PuzzleClueRowRecord = z.infer<typeof puzzleClueRowSchema>;
export type PuzzleEvidenceFaqItemRecord = z.infer<typeof puzzleEvidenceFaqItemSchema>;
export type PuzzleUniquenessSignalsRecord = z.infer<typeof puzzleUniquenessSignalsSchema>;
export type PuzzleWrongGuessCandidateRecord = z.infer<typeof puzzleWrongGuessCandidateSchema>;
export type FaqItem = z.infer<typeof faqItemSchema>;
export type LessonItem = z.infer<typeof lessonItemSchema>;
