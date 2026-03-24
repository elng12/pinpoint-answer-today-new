import { z } from "zod";
import {
  puzzleDetailBodyModeSchema as sharedPuzzleDetailBodyModeSchema,
  difficultyLevelSchema as sharedDifficultyLevelSchema,
  faqItemSchema as sharedFaqItemSchema,
  lessonItemSchema as sharedLessonItemSchema,
  puzzleDetailContentSchema as sharedPuzzleDetailContentSchema,
  puzzleDetailDisplayRowSchema as sharedPuzzleDetailDisplayRowSchema,
  puzzleDetailDisplaySchema as sharedPuzzleDetailDisplaySchema,
  puzzleRegistryEntrySchema as sharedPuzzleRegistryEntrySchema,
  puzzleStatusSchema as sharedPuzzleStatusSchema,
  registrySchema as sharedRegistrySchema,
} from "./schema.shared.mjs";

export const puzzleStatusSchema =
  sharedPuzzleStatusSchema as z.ZodEnum<["draft", "preview", "live", "archived"]>;
export const difficultyLevelSchema =
  sharedDifficultyLevelSchema as z.ZodEnum<["Easy", "Moderate", "Hard"]>;
export const puzzleDetailBodyModeSchema =
  sharedPuzzleDetailBodyModeSchema as z.ZodEnum<["short", "standard", "deep"]>;
export const puzzleRegistryEntrySchema = sharedPuzzleRegistryEntrySchema as z.ZodObject<{
  puzzleNumber: z.ZodNumber;
  slug: z.ZodString;
  publishDate: z.ZodString;
  status: typeof puzzleStatusSchema;
  clues: z.ZodArray<z.ZodString, "many">;
  mainAnswer: z.ZodNullable<z.ZodString>;
  category: z.ZodNullable<z.ZodString>;
  difficultyLevel: z.ZodOptional<typeof difficultyLevelSchema>;
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
export const puzzleDetailContentSchema = sharedPuzzleDetailContentSchema as z.ZodObject<{
  slug: z.ZodString;
  bodyMode: z.ZodOptional<typeof puzzleDetailBodyModeSchema>;
  articleBlocks: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
  fullAnalysis: z.ZodArray<z.ZodString, "many">;
  solutionNarrative: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
  wordHints: z.ZodRecord<z.ZodString, z.ZodString>;
  spoilerHints: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
  lessons: z.ZodArray<typeof lessonItemSchema, "many">;
  faqs: z.ZodArray<typeof faqItemSchema, "many">;
  display: z.ZodOptional<typeof puzzleDetailDisplaySchema>;
}>;

export type PuzzleStatus = z.infer<typeof puzzleStatusSchema>;
export type PuzzleRegistryEntryRecord = z.infer<typeof puzzleRegistryEntrySchema>;
export type PuzzleDetailContentRecord = z.infer<typeof puzzleDetailContentSchema>;
export type PuzzleDetailDisplayRecord = z.infer<typeof puzzleDetailDisplaySchema>;
export type FaqItem = z.infer<typeof faqItemSchema>;
export type LessonItem = z.infer<typeof lessonItemSchema>;
