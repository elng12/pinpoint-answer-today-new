import { buildCategoryMembershipEvidenceRecords } from "./dictionary";
import { normalizeIdentityMatch, normalizeIdentityText } from "./identity";
import {
  CONTENT_KITCHEN_CLUE_COUNT,
  type ContentKitchenDictionaries,
  type ContentKitchenEvidenceRecord,
  type FullAnalysisClueFitGenerationIssue,
  type FullAnalysisClueFitGenerationIssueCode,
  type FullAnalysisClueFitGenerationResult,
  type FullAnalysisClueFitSlot,
  type FullAnalysisPuzzleTypeClassification,
  type L1PuzzleInput,
} from "./types";

export type GenerateFullAnalysisClueFitsInput = {
  l1Input: L1PuzzleInput;
  classification: FullAnalysisPuzzleTypeClassification;
  dictionaries?: ContentKitchenDictionaries;
  evidenceIdPrefix?: string;
};

function makeIssue(
  issueCode: FullAnalysisClueFitGenerationIssueCode,
  fieldPath: string,
  message: string,
  suggestedAction: string,
): FullAnalysisClueFitGenerationIssue {
  return {
    issueCode,
    fieldPath,
    message,
    suggestedAction,
  };
}

function evidenceByClueId(records: ContentKitchenEvidenceRecord[]): Map<string, ContentKitchenEvidenceRecord> {
  const byClueId = new Map<string, ContentKitchenEvidenceRecord>();

  for (const record of records) {
    const clueId = normalizeIdentityMatch(record.clueId);
    if (clueId) {
      byClueId.set(clueId, record);
    }
  }

  return byClueId;
}

function buildClueFit(clue: L1PuzzleInput["clues"][number], category: string, evidenceId: string): FullAnalysisClueFitSlot {
  const clueText = normalizeIdentityText(clue.text);

  return {
    clueId: clue.clueId,
    clueText,
    fit: `${clueText} is a member of ${category}.`,
    whyItSupportsAnswer: `The reviewed dictionary links ${clueText} to ${category}, so this clue supports the shared answer category.`,
    evidenceRefs: [evidenceId],
  };
}

export function generateFullAnalysisClueFits(
  input: GenerateFullAnalysisClueFitsInput,
): FullAnalysisClueFitGenerationResult {
  const issues: FullAnalysisClueFitGenerationIssue[] = [];
  const answerCategory = normalizeIdentityText(input.classification.answerCategory);

  if (input.classification.puzzleType !== "category_membership") {
    return {
      ok: false,
      clueFits: [],
      evidenceRecords: [],
      issues: [
        makeIssue(
          "UNSUPPORTED_PUZZLE_TYPE",
          "classification.puzzleType",
          "The local clue-fit generator only supports category_membership in this PR8 slice.",
          "Keep this candidate out of local clue-fit generation until a later generator supports its puzzle type.",
        ),
      ],
    };
  }

  if (!answerCategory) {
    return {
      ok: false,
      clueFits: [],
      evidenceRecords: [],
      issues: [
        makeIssue(
          "MISSING_ANSWER_CATEGORY",
          "classification.answerCategory",
          "Category-membership clue-fit generation needs an answer category.",
          "Run puzzle type classification with reviewed dictionary coverage first.",
        ),
      ],
    };
  }

  if (!input.dictionaries) {
    return {
      ok: false,
      clueFits: [],
      evidenceRecords: [],
      issues: [
        makeIssue(
          "MISSING_REVIEWED_DICTIONARIES",
          "dictionaries",
          "Local clue-fit generation needs reviewed content-kitchen dictionaries.",
          "Load reviewed dictionaries before generating clue-fit slots.",
        ),
      ],
    };
  }

  const evidenceRecords = buildCategoryMembershipEvidenceRecords({
    l1Input: input.l1Input,
    category: answerCategory,
    dictionary: input.dictionaries.categoryMembership,
    evidenceIdPrefix: input.evidenceIdPrefix ?? "slot",
  });
  const evidence = evidenceByClueId(evidenceRecords);
  const clueFits: FullAnalysisClueFitSlot[] = [];

  for (const clue of input.l1Input.clues) {
    const record = evidence.get(normalizeIdentityMatch(clue.clueId));
    if (!record) {
      issues.push(
        makeIssue(
          "MISSING_REVIEWED_CATEGORY_MEMBER",
          `l1Input.clues[${clue.position - 1}]`,
          "A clue does not have reviewed category-membership evidence.",
          "Add the clue/category pair to the reviewed dictionary or send the candidate to review.",
        ),
      );
      continue;
    }

    clueFits.push(buildClueFit(clue, answerCategory, record.evidenceId));
  }

  if (clueFits.length !== CONTENT_KITCHEN_CLUE_COUNT || evidenceRecords.length !== CONTENT_KITCHEN_CLUE_COUNT) {
    issues.push(
      makeIssue(
        "INCOMPLETE_CLUE_FIT_COVERAGE",
        "clueFits",
        "Local clue-fit generation did not produce exactly five clue-fit slots with evidence.",
        "Require 5/5 reviewed dictionary coverage before assembling full-analysis content.",
      ),
    );
  }

  if (issues.length > 0) {
    return {
      ok: false,
      clueFits,
      evidenceRecords,
      issues,
    };
  }

  return {
    ok: true,
    clueFits,
    evidenceRecords,
  };
}
