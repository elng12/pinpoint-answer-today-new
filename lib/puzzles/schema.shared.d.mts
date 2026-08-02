import { z } from "zod";

export declare const puzzleStatusSchema: z.ZodEnum<["draft", "preview", "live", "archived"]>;
export declare const puzzleDetailStateSchema: z.ZodEnum<[
  "draft",
  "generating",
  "validated",
  "publishing_placeholder",
  "fallback_full",
  "published",
  "failed"
]>;
export declare const difficultyLevelSchema: z.ZodEnum<["Easy", "Moderate", "Hard"]>;
export declare const puzzleQuestionTypeSchema: z.ZodEnum<["phrase", "category", "association", "hybrid"]>;
export declare const puzzleDifficultyBandSchema: z.ZodEnum<["obvious", "medium", "hard"]>;
export declare const puzzleDetailBodyModeSchema: z.ZodEnum<["short", "standard", "deep"]>;
export declare const puzzlePageExperienceModeSchema: z.ZodEnum<["full-analysis", "light-explainer"]>;
export declare const puzzlePublishModeSchema: z.ZodEnum<["answer-first", "full-analysis", "failed"]>;
export declare const puzzleSeoTemplateVersionSchema: z.ZodEnum<["serp-v1", "serp-v2"]>;

export declare const puzzleRegistryEntrySchema: z.ZodObject<{
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
  seoTemplateVersion: z.ZodOptional<typeof puzzleSeoTemplateVersionSchema>;
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

export declare const puzzleSolvePathSchema: z.ZodObject<{
  firstRead: z.ZodString;
  falseStarts: z.ZodArray<z.ZodString, "many">;
  whyFalseStartPlausible: z.ZodArray<z.ZodString, "many">;
  breakingClue: z.ZodOptional<z.ZodString>;
  pivot: z.ZodOptional<z.ZodString>;
  fullBoardConfirmation: z.ZodOptional<z.ZodString>;
}>;

export declare const puzzleTurningPointSchema: z.ZodObject<{
  clue: z.ZodString;
  whyDecisive: z.ZodString;
  whatChangedAfterIt: z.ZodString;
}>;

export declare const puzzleClueRowSchema: z.ZodObject<{
  clue: z.ZodString;
  surfaceMisread: z.ZodOptional<z.ZodString>;
  resolvedPhraseOrMember: z.ZodString;
  nonObviousWhy: z.ZodString;
  searchableContext: z.ZodOptional<z.ZodString>;
  evidenceRef: z.ZodOptional<z.ZodString>;
  phraseExample: z.ZodOptional<z.ZodString>;
  fitConfidence: z.ZodOptional<z.ZodEnum<["confirmed", "manual", "weak"]>>;
}>;

export declare const puzzleFaqIntentTypeSchema: z.ZodEnum<
  ["definition", "clue_background", "comparison", "solve_strategy", "category_context"]
>;

export declare const puzzleEvidenceFaqItemSchema: z.ZodObject<{
  intentType: typeof puzzleFaqIntentTypeSchema;
  question: z.ZodString;
  answer: z.ZodString;
  tiedClue: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}>;

export declare const puzzleUniquenessSignalsSchema: z.ZodObject<{
  angle: z.ZodString;
  relatedEntities: z.ZodArray<z.ZodString, "many">;
  doNotRepeatPatterns: z.ZodArray<z.ZodString, "many">;
}>;
export declare const puzzleWrongGuessCandidateSchema: z.ZodObject<{
  label: z.ZodString;
  whyPlausible: z.ZodString;
  whyRejected: z.ZodOptional<z.ZodString>;
}>;

export declare const puzzleDetailContentSchema: z.ZodObject<{
  slug: z.ZodString;
  detailState: z.ZodOptional<typeof puzzleDetailStateSchema>;
  publishMode: z.ZodOptional<typeof puzzlePublishModeSchema>;
  questionType: z.ZodOptional<typeof puzzleQuestionTypeSchema>;
  difficultyBand: z.ZodOptional<typeof puzzleDifficultyBandSchema>;
  bodyMode: z.ZodOptional<typeof puzzleDetailBodyModeSchema>;
  pageExperienceMode: z.ZodOptional<typeof puzzlePageExperienceModeSchema>;
  articleBlocks: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
  fullAnalysis: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
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
