import { z } from "zod";

export declare const puzzleStatusSchema: z.ZodEnum<["draft", "preview", "live", "archived"]>;
export declare const difficultyLevelSchema: z.ZodEnum<["Easy", "Moderate", "Hard"]>;
export declare const puzzleDetailBodyModeSchema: z.ZodEnum<["short", "standard", "deep"]>;

export declare const puzzleRegistryEntrySchema: z.ZodObject<{
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

export declare const registrySchema: z.ZodArray<typeof puzzleRegistryEntrySchema>;

export declare const faqItemSchema: z.ZodObject<{
  question: z.ZodString;
  answer: z.ZodString;
}>;

export declare const lessonItemSchema: z.ZodUnion<
  [z.ZodString, z.ZodObject<{ title: z.ZodString; body: z.ZodString }>]
>;

export declare const puzzleDetailDisplayRowSchema: z.ZodObject<{
  clue: z.ZodString;
  examplePhrase: z.ZodString;
  connectionExplained: z.ZodString;
}>;

export declare const puzzleDetailDisplaySchema: z.ZodObject<{
  connectorSummary: z.ZodString;
  fastStrategy: z.ZodOptional<z.ZodString>;
  clueTableRows: z.ZodOptional<z.ZodArray<typeof puzzleDetailDisplayRowSchema, "many">>;
}>;

export declare const puzzleDetailContentSchema: z.ZodObject<{
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
