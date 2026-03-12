import { z } from "zod";

export const puzzleStatusSchema: z.ZodEnum<["draft", "preview", "live", "archived"]>;
export const difficultyLevelSchema: z.ZodEnum<["Easy", "Moderate", "Hard"]>;

export const puzzleRegistryEntrySchema: z.ZodObject<{
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

export const registrySchema: z.ZodArray<typeof puzzleRegistryEntrySchema>;

export const faqItemSchema: z.ZodObject<{
  question: z.ZodString;
  answer: z.ZodString;
}>;

export const lessonItemSchema: z.ZodUnion<
  [z.ZodString, z.ZodObject<{ title: z.ZodString; body: z.ZodString }>]
>;

export const puzzleDetailContentSchema: z.ZodObject<{
  slug: z.ZodString;
  fullAnalysis: z.ZodArray<z.ZodString, "many">;
  solutionNarrative: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
  wordHints: z.ZodRecord<z.ZodString, z.ZodString>;
  lessons: z.ZodArray<typeof lessonItemSchema, "many">;
  faqs: z.ZodArray<typeof faqItemSchema, "many">;
}>;
