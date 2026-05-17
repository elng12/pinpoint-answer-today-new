/**
 * Shared draft validation logic used by both:
 * - POST /api/admin/generate-draft  (LLM called on Vercel)
 * - POST /api/admin/validate-draft  (LLM called on Worker, validation only)
 *
 * Extracted from app/api/admin/generate-draft/route.ts to avoid duplication.
 */

import { defaultLocale } from "@/i18n.config";
import type { PuzzleDataForAI } from "@/lib/puzzle-generation";
import {
  promotePublishBlockingIssues,
  validateContentContract,
  type ContentContractInput,
  type ContentContractIssue,
} from "@/lib/puzzles/content-contract";
import {
  validateEvidenceContract,
} from "@/lib/puzzles/evidence-contract";
import {
  validateSlotContract,
  type SlotContractInput,
} from "@/lib/puzzles/slot-contract";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DISALLOWED_LANGUAGE_PATTERN = /[㐀-鿿豈-﫿぀-ヿ가-힯]/;

type DraftRecord = Record<string, unknown>;

function asRecord(value: unknown): DraftRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as DraftRecord;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === "string");
}

function readDraftParts(ai: unknown): {
  sections: DraftRecord;
  analysis: DraftRecord;
} {
  const root = asRecord(ai) ?? {};
  return {
    sections: asRecord(root.sections) ?? {},
    analysis: asRecord(root.analysis) ?? {},
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function toContractInput(
  puzzleData: PuzzleDataForAI,
  ai: unknown,
  locale: string | null = defaultLocale,
): ContentContractInput {
  const { sections, analysis } = readDraftParts(ai);
  const articleBlocks = Array.isArray(sections.articleBlocks)
    ? sections.articleBlocks.map((item) => asString(item) ?? "").filter(Boolean)
    : [];
  const bodyMode: ContentContractInput["bodyMode"] =
    articleBlocks.length > 0 && articleBlocks.length <= 6 ? "short" : "standard";
  return {
    puzzleNumber: Number(puzzleData.puzzleNumber),
    bodyMode,
    locale,
    rawWords: puzzleData.rawWords,
    mainAnswer: puzzleData.mainAnswer,
    summary: asString(analysis.heroSummary) ?? asString(analysis.dailyDebrief) ?? null,
    seoTitle: asString(analysis.seoTitle),
    seoDescription: asString(analysis.seoDescription),
    overview: asString(sections.overview),
    solutionEmergence: asString(sections.solutionEmergence),
    articleBlocks: articleBlocks.length > 0 ? articleBlocks : null,
    wrongGuesses: Array.isArray(sections.wrongGuesses)
      ? sections.wrongGuesses.map((item) => {
          const row = asRecord(item);
          return { guess: asString(row?.guess), explanation: asString(row?.explanation) };
        })
      : null,
    clueDetails: Array.isArray(sections.clueDetails)
      ? sections.clueDetails.map((item) => {
          const row = asRecord(item);
          return {
            clue: asString(row?.clue),
            phrase: asString(row?.phrase),
            explanation: asString(row?.explanation),
          };
        })
      : null,
    lessons: Array.isArray(sections.lessons)
      ? sections.lessons.map((item) => {
          const row = asRecord(item);
          return { title: asString(row?.title), body: asString(row?.body) };
        })
      : null,
    faqs: Array.isArray(sections.faqs)
      ? sections.faqs.map((item) => {
          const row = asRecord(item);
          return { question: asString(row?.question), answer: asString(row?.answer) };
        })
      : null,
    trivia: asString(sections.trivia),
    llmTemplateVersion: asString(analysis.llmTemplateVersion),
  };
}

function toEvidenceContractInput(puzzleData: PuzzleDataForAI, ai: unknown) {
  const root = asRecord(ai) ?? {};
  const solvePath = asRecord(root.solvePath);
  const turningPoint = asRecord(root.turningPoint);
  const uniquenessSignals = asRecord(root.uniquenessSignals);

  return {
    rawWords: puzzleData.rawWords,
    mainAnswer: puzzleData.mainAnswer,
    questionType: asString(root.questionType),
    difficultyBand: asString(root.difficultyBand),
    solvePath: solvePath
      ? {
          firstRead: asString(solvePath.firstRead),
          falseStarts: toStringArray(solvePath.falseStarts),
          whyFalseStartPlausible: toStringArray(solvePath.whyFalseStartPlausible),
          breakingClue: asString(solvePath.breakingClue),
          pivot: asString(solvePath.pivot),
          fullBoardConfirmation: asString(solvePath.fullBoardConfirmation),
        }
      : null,
    turningPoint: turningPoint
      ? {
          clue: asString(turningPoint.clue),
          whyDecisive: asString(turningPoint.whyDecisive),
          whatChangedAfterIt: asString(turningPoint.whatChangedAfterIt),
        }
      : null,
    clueRows: Array.isArray(root.clueRows)
      ? root.clueRows.map((item) => {
          const row = asRecord(item);
          return {
            clue: asString(row?.clue),
            surfaceMisread: asString(row?.surfaceMisread),
            resolvedPhraseOrMember: asString(row?.resolvedPhraseOrMember),
            nonObviousWhy: asString(row?.nonObviousWhy),
            searchableContext: asString(row?.searchableContext),
          };
        })
      : null,
    faqItems: Array.isArray(root.faqItems)
      ? root.faqItems.map((item) => {
          const row = asRecord(item);
          return {
            intentType: asString(row?.intentType),
            question: asString(row?.question),
            answer: asString(row?.answer),
            tiedClue: asString(row?.tiedClue),
          };
        })
      : null,
    uniquenessSignals: uniquenessSignals
      ? {
          angle: asString(uniquenessSignals.angle),
          relatedEntities: toStringArray(uniquenessSignals.relatedEntities),
          doNotRepeatPatterns: toStringArray(uniquenessSignals.doNotRepeatPatterns),
        }
      : null,
  };
}

function toSlotContractInput(
  puzzleData: PuzzleDataForAI,
  ai: unknown,
): SlotContractInput {
  const root = asRecord(ai) ?? {};
  const slots = asRecord(root.slots);
  return {
    rawWords: puzzleData.rawWords,
    mainAnswer: puzzleData.mainAnswer,
    slots: slots
      ? {
          heroIntroSpoilerSafe: asString(slots.heroIntroSpoilerSafe) ?? undefined,
          connectorSummary: asString(slots.connectorSummary) ?? undefined,
          turningPoint: asString(slots.turningPoint) ?? undefined,
          falseStarts: Array.isArray(slots.falseStarts)
            ? slots.falseStarts.filter((item): item is string => typeof item === "string")
            : undefined,
          rejectedGuess: asRecord(slots.rejectedGuess)
            ? {
                guess: asString(asRecord(slots.rejectedGuess)?.guess) ?? "",
                explanation: asString(asRecord(slots.rejectedGuess)?.explanation) ?? "",
              }
            : undefined,
          clueDetails: Array.isArray(slots.clueDetails)
            ? slots.clueDetails.map((item) => {
                const row = asRecord(item);
                return {
                  clue: asString(row?.clue) ?? "",
                  surfaceRead: asString(row?.surfaceRead) ?? "",
                  phrase: asString(row?.phrase) ?? "",
                  whyItWorks: asString(row?.whyItWorks) ?? "",
                  etymology: asString(row?.etymology) ?? undefined,
                };
              })
            : undefined,
          difficultyReason: asString(slots.difficultyReason) ?? undefined,
          portableTakeaway: asString(slots.portableTakeaway) ?? undefined,
        }
      : null,
  };
}

function validateStructuredPublishIssues(ai: unknown): ContentContractIssue[] {
  const root = asRecord(ai) ?? {};
  const issues: ContentContractIssue[] = [];
  const pageExperienceMode = asString(root.pageExperienceMode);
  const difficultyBand = asString(root.difficultyBand);
  const wrongGuessCandidates = Array.isArray(root.wrongGuessCandidates) ? root.wrongGuessCandidates : [];
  const requiredWrongGuessCount = difficultyBand === "obvious" ? 1 : 2;

  if (pageExperienceMode !== "full-analysis" && pageExperienceMode !== "light-explainer") {
    issues.push({
      level: "error",
      code: "structured.pageExperienceMode.missing",
      message: "Structured publish payload is missing pageExperienceMode",
      field: "pageExperienceMode",
    });
  }

  if (!difficultyBand || !["obvious", "medium", "hard"].includes(difficultyBand)) {
    issues.push({
      level: "error",
      code: "structured.difficultyBand.missing",
      message: "Structured publish payload is missing difficultyBand",
      field: "difficultyBand",
    });
    return issues;
  }

  if (pageExperienceMode === "full-analysis") {
    if (wrongGuessCandidates.length < requiredWrongGuessCount) {
      issues.push({
        level: "error",
        code: "structured.wrongGuessCandidates.count",
        message: `Structured publish payload needs at least ${requiredWrongGuessCount} wrongGuessCandidates for ${difficultyBand} full-analysis mode`,
        field: "wrongGuessCandidates",
      });
    }

    wrongGuessCandidates.forEach((item, index) => {
      const row = asRecord(item);
      if (!asString(row?.label) || !asString(row?.whyPlausible)) {
        issues.push({
          level: "error",
          code: "structured.wrongGuessCandidates.fields",
          message: `wrongGuessCandidates[${index}] must include label and whyPlausible`,
          field: `wrongGuessCandidates[${index}]`,
        });
      }
    });

    if (!asString(root.setValidationSummary)) {
      issues.push({
        level: "error",
        code: "structured.setValidationSummary.missing",
        message: "Structured publish payload is missing setValidationSummary",
        field: "setValidationSummary",
      });
    }

    if (!asString(root.categoryPrecisionNote)) {
      issues.push({
        level: "error",
        code: "structured.categoryPrecisionNote.missing",
        message: "Structured publish payload is missing categoryPrecisionNote",
        field: "categoryPrecisionNote",
      });
    }
  }

  return issues;
}

function hasDisallowedLanguage(value: string | null | undefined): boolean {
  return Boolean(value && DISALLOWED_LANGUAGE_PATTERN.test(value));
}

function pushDraftLanguageIssue(
  issues: ContentContractIssue[],
  field: string,
  value: string | null | undefined,
): void {
  if (hasDisallowedLanguage(value)) {
    issues.push({
      level: "error",
      code: "language.disallowed",
      message: `Disallowed non-English characters detected in ${field}`,
      field,
    });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type { ContentContractIssue };

export function validateDraftStructure(
  puzzleData: PuzzleDataForAI,
  ai: unknown,
  locale: string | null = defaultLocale,
): ContentContractIssue[] {
  return [
    ...promotePublishBlockingIssues(validateContentContract(toContractInput(puzzleData, ai, locale))),
    ...validateEvidenceContract(toEvidenceContractInput(puzzleData, ai), { requireEvidenceFields: true }),
    ...validateStructuredPublishIssues(ai),
    ...validateSlotContract(toSlotContractInput(puzzleData, ai)),
  ];
}

export function validateDraftLanguage(ai: unknown): ContentContractIssue[] {
  const { sections, analysis } = readDraftParts(ai);
  const issues: ContentContractIssue[] = [];

  const fieldsToCheck: Array<[string, string | null | undefined]> = [
    ["analysis.heroSummary", asString(analysis.heroSummary)],
    ["analysis.dailyDebrief", asString(analysis.dailyDebrief)],
    ["analysis.detailedBreakdown", asString(analysis.detailedBreakdown)],
    ["analysis.seoTitle", asString(analysis.seoTitle)],
    ["analysis.seoDescription", asString(analysis.seoDescription)],
    ["sections.overview", asString(sections.overview)],
    ["sections.solutionEmergence", asString(sections.solutionEmergence)],
    ["sections.trivia", asString(sections.trivia)],
  ];

  for (const [field, value] of fieldsToCheck) {
    pushDraftLanguageIssue(issues, field, value);
  }

  const articleBlocks = Array.isArray(sections.articleBlocks) ? sections.articleBlocks : [];
  articleBlocks.forEach((item, index) => {
    pushDraftLanguageIssue(issues, `sections.articleBlocks[${index}]`, asString(item));
  });

  const wrongGuesses = Array.isArray(sections.wrongGuesses) ? sections.wrongGuesses : [];
  wrongGuesses.forEach((item, index) => {
    const row = asRecord(item);
    pushDraftLanguageIssue(issues, `sections.wrongGuesses[${index}].guess`, asString(row?.guess));
    pushDraftLanguageIssue(issues, `sections.wrongGuesses[${index}].explanation`, asString(row?.explanation));
  });

  const clueDetails = Array.isArray(sections.clueDetails) ? sections.clueDetails : [];
  clueDetails.forEach((item, index) => {
    const row = asRecord(item);
    pushDraftLanguageIssue(issues, `sections.clueDetails[${index}].clue`, asString(row?.clue));
    pushDraftLanguageIssue(issues, `sections.clueDetails[${index}].phrase`, asString(row?.phrase));
    pushDraftLanguageIssue(issues, `sections.clueDetails[${index}].explanation`, asString(row?.explanation));
    pushDraftLanguageIssue(issues, `sections.clueDetails[${index}].etymology`, asString(row?.etymology));
  });

  const lessons = Array.isArray(sections.lessons) ? sections.lessons : [];
  lessons.forEach((item, index) => {
    const row = asRecord(item);
    pushDraftLanguageIssue(issues, `sections.lessons[${index}].title`, asString(row?.title));
    pushDraftLanguageIssue(issues, `sections.lessons[${index}].body`, asString(row?.body));
  });

  const faqs = Array.isArray(sections.faqs) ? sections.faqs : [];
  faqs.forEach((item, index) => {
    const row = asRecord(item);
    pushDraftLanguageIssue(issues, `sections.faqs[${index}].question`, asString(row?.question));
    pushDraftLanguageIssue(issues, `sections.faqs[${index}].answer`, asString(row?.answer));
  });

  return issues;
}

/** Check puzzle input data for disallowed language (non-English chars). */
export function validateDraftInputLanguage(puzzleData: PuzzleDataForAI): ContentContractIssue[] {
  const issues: ContentContractIssue[] = [];

  if (hasDisallowedLanguage(puzzleData.mainAnswer)) {
    issues.push({
      level: "error",
      code: "language.disallowed",
      message: "Disallowed non-English characters detected in mainAnswer",
      field: "mainAnswer",
    });
  }

  puzzleData.rawWords.forEach((word, index) => {
    if (hasDisallowedLanguage(word)) {
      issues.push({
        level: "error",
        code: "language.disallowed",
        message: `Disallowed non-English characters detected in rawWords[${index}]`,
        field: `rawWords[${index}]`,
      });
    }
  });

  return issues;
}
