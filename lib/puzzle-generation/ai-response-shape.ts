import { debugInfo } from "@/lib/puzzle-generation/debug";
import { validateZodShape } from "@/lib/puzzle-generation/response-parser";
import type {
  AIGeneratedSlots,
  ParsedAIResponse,
  PuzzleDataForAI,
} from "@/lib/puzzle-generation/types";
import { validateSlotContract } from "@/lib/puzzles/slot-contract";
import { z } from "zod";

const ParsedRejectedGuessSchema = z.object({
  guess: z.string().trim().min(1),
  explanation: z.string().trim().min(1),
});

const ParsedSlotClueDetailSchema = z.object({
  clue: z.string().trim().min(1),
  surfaceRead: z.string().trim().min(1),
  phrase: z.string().trim().min(1),
  whyItWorks: z.string().trim().min(1),
  etymology: z.string().trim().min(1).optional(),
});

const ParsedSlotsSchema = z.object({
  heroIntroSpoilerSafe: z.string().trim().min(1).optional(),
  connectorSummary: z.string().trim().min(1).optional(),
  turningPoint: z.string().trim().min(1).optional(),
  falseStarts: z.array(z.string().trim().min(1)).optional(),
  rejectedGuess: ParsedRejectedGuessSchema.optional(),
  clueDetails: z.array(ParsedSlotClueDetailSchema).optional(),
  difficultyReason: z.string().trim().min(1).optional(),
  portableTakeaway: z.string().trim().min(1).optional(),
});

const ParsedSectionsSchema = z
  .object({
    articleBlocks: z.array(z.string().trim().min(1)).optional(),
    overview: z.string().trim().min(1).optional(),
    solutionEmergence: z.string().trim().min(1).optional(),
    wrongGuesses: z
      .array(
        z.object({
          guess: z.string().trim().min(1),
          explanation: z.string().trim().min(1),
        }),
      )
      .optional(),
    clueDetails: z
      .array(
        z.object({
          clue: z.string().trim().min(1),
          phrase: z.string().trim().min(1),
          explanation: z.string().trim().min(1),
          etymology: z.string().trim().min(1).optional(),
        }),
      )
      .optional(),
    lessons: z
      .array(
        z.object({
          title: z.string().trim().min(1),
          body: z.string().trim().min(1),
        }),
      )
      .optional(),
    faqs: z
      .array(
        z.object({
          question: z.string().trim().min(1),
          answer: z.string().trim().min(1),
        }),
      )
      .optional(),
    trivia: z.string().trim().min(1).optional(),
  })
  .optional();

const ParsedAnalysisSchema = z
  .object({
    detailedBreakdown: z.string().trim().min(1).optional(),
    dailyDebrief: z.string().trim().min(1).optional(),
    heroSummary: z.string().trim().min(1).optional(),
    seoTitle: z.string().trim().min(1).optional(),
    seoDescription: z.string().trim().min(1).optional(),
    seoKeywords: z.array(z.string().trim().min(1)).optional(),
    tags: z.array(z.string().trim().min(1)).optional(),
    llmTemplateVersion: z.string().trim().min(1).optional(),
  })
  .optional();

const ParsedSolvePathSchema = z
  .object({
    firstRead: z.string().trim().min(1),
    falseStarts: z.array(z.string().trim().min(1)),
    whyFalseStartPlausible: z.array(z.string().trim().min(1)),
    breakingClue: z.string().trim().min(1).optional(),
    pivot: z.string().trim().min(1).optional(),
    fullBoardConfirmation: z.string().trim().min(1).optional(),
  })
  .optional();

const ParsedTurningPointSchema = z
  .object({
    clue: z.string().trim().min(1),
    whyDecisive: z.string().trim().min(1),
    whatChangedAfterIt: z.string().trim().min(1),
  })
  .optional();

const ParsedClueRowSchema = z.object({
  clue: z.string().trim().min(1),
  surfaceMisread: z.string().trim().min(1).optional(),
  resolvedPhraseOrMember: z.string().trim().min(1),
  nonObviousWhy: z.string().trim().min(1),
  searchableContext: z.string().trim().min(1).optional(),
});

const ParsedFaqItemSchema = z.object({
  intentType: z.enum([
    "definition",
    "clue_background",
    "comparison",
    "solve_strategy",
    "category_context",
  ]),
  question: z.string().trim().min(1),
  answer: z.string().trim().min(1),
  tiedClue: z.string().trim().min(1).nullable().optional(),
});

const ParsedUniquenessSignalsSchema = z
  .object({
    angle: z.string().trim().min(1),
    relatedEntities: z.array(z.string().trim().min(1)),
    doNotRepeatPatterns: z.array(z.string().trim().min(1)),
  })
  .optional();

const ParsedAIResponseSchema = z
  .object({
    questionType: z.enum(["phrase", "category", "association", "hybrid"]).optional(),
    difficultyBand: z.enum(["obvious", "medium", "hard"]).optional(),
    slots: ParsedSlotsSchema.optional(),
    sections: ParsedSectionsSchema,
    analysis: ParsedAnalysisSchema,
    solvePath: ParsedSolvePathSchema,
    turningPoint: ParsedTurningPointSchema,
    clueRows: z.array(ParsedClueRowSchema).optional(),
    faqItems: z.array(ParsedFaqItemSchema).optional(),
    uniquenessSignals: ParsedUniquenessSignalsSchema,
  })
  .refine((value) => Boolean(value.slots || value.sections), {
    message: 'AI response must include either "slots" or "sections".',
    path: ["slots"],
  });

function sanitizeOptionalEvidenceField<T>(value: unknown, schema: z.ZodType<T>): T | undefined {
  if (value === undefined) {
    return undefined;
  }
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}

function sanitizeParsedResponseEvidenceFields(parsed: ParsedAIResponse): ParsedAIResponse {
  return {
    ...parsed,
    questionType: sanitizeOptionalEvidenceField(
      parsed.questionType,
      z.enum(["phrase", "category", "association", "hybrid"]),
    ),
    difficultyBand: sanitizeOptionalEvidenceField(
      parsed.difficultyBand,
      z.enum(["obvious", "medium", "hard"]),
    ),
    solvePath: sanitizeOptionalEvidenceField(parsed.solvePath, ParsedSolvePathSchema),
    turningPoint: sanitizeOptionalEvidenceField(parsed.turningPoint, ParsedTurningPointSchema),
    clueRows: sanitizeOptionalEvidenceField(parsed.clueRows, z.array(ParsedClueRowSchema).optional()),
    faqItems: sanitizeOptionalEvidenceField(parsed.faqItems, z.array(ParsedFaqItemSchema).optional()),
    uniquenessSignals: sanitizeOptionalEvidenceField(parsed.uniquenessSignals, ParsedUniquenessSignalsSchema),
  };
}

export function validateParsedResponseShape(parsed: ParsedAIResponse): ParsedAIResponse {
  return validateZodShape(
    ParsedAIResponseSchema,
    sanitizeParsedResponseEvidenceFields(parsed),
    "AI response shape invalid",
  ) as ParsedAIResponse;
}

export function validateParsedSlotsContract(
  parsedSlots: Partial<AIGeneratedSlots>,
  puzzleData?: PuzzleDataForAI,
): Partial<AIGeneratedSlots> {
  const validatedSlots = validateZodShape(
    ParsedSlotsSchema,
    parsedSlots,
    "AI slots shape invalid",
  ) as Partial<AIGeneratedSlots>;

  if (!puzzleData) {
    return validatedSlots;
  }

  const slotIssues = validateSlotContract({
    rawWords: puzzleData.rawWords,
    mainAnswer: puzzleData.mainAnswer,
    slots: validatedSlots,
  });

  if (slotIssues.length > 0) {
    debugInfo("AI slots contract issues", {
      issues: slotIssues.map((issue) => `${issue.level}:${issue.code}:${issue.field ?? "root"}`),
      puzzleNumber: puzzleData.puzzleNumber,
    });
  }

  return validatedSlots;
}

