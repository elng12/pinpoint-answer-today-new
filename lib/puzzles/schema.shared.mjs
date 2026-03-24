import { z } from "zod";

export const puzzleStatusSchema = z.enum(["draft", "preview", "live", "archived"]);
export const difficultyLevelSchema = z.enum(["Easy", "Moderate", "Hard"]);
export const puzzleDetailBodyModeSchema = z.enum(["short", "standard", "deep"]);

export const puzzleRegistryEntrySchema = z.object({
  puzzleNumber: z.number().int().positive(),
  slug: z.string().min(1),
  publishDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: puzzleStatusSchema,
  clues: z.array(z.string().min(1)).min(1),
  mainAnswer: z.string().min(1).nullable(),
  category: z.string().min(1).nullable(),
  difficultyLevel: difficultyLevelSchema.optional(),
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

export const puzzleDetailContentSchema = z.object({
  slug: z.string().min(1),
  bodyMode: puzzleDetailBodyModeSchema.optional(),
  articleBlocks: z.array(z.string().min(1)).optional(),
  fullAnalysis: z.array(z.string().min(1)).min(1),
  solutionNarrative: z.array(z.string().min(1)).optional(),
  wordHints: z.record(z.string().min(1)),
  spoilerHints: z.record(z.string().min(1)).optional(),
  lessons: z.array(lessonItemSchema).min(1),
  faqs: z.array(faqItemSchema).min(1),
  display: puzzleDetailDisplaySchema.optional(),
});
