import { normalizeIdentityMatch, normalizeIdentityText } from "./identity";
import {
  CONTENT_KITCHEN_CLUE_COUNT,
  type FullAnalysisClueFitSlot,
  type FullAnalysisPuzzleTypeClassification,
  type FullAnalysisReasoningGenerationIssue,
  type FullAnalysisReasoningGenerationIssueCode,
  type FullAnalysisReasoningGenerationResult,
  type L1PuzzleInput,
} from "./types";

export type GenerateFullAnalysisReasoningInput = {
  l1Input: L1PuzzleInput;
  classification: FullAnalysisPuzzleTypeClassification;
  clueFits: FullAnalysisClueFitSlot[];
};

function makeIssue(
  issueCode: FullAnalysisReasoningGenerationIssueCode,
  fieldPath: string,
  message: string,
  suggestedAction: string,
): FullAnalysisReasoningGenerationIssue {
  return {
    issueCode,
    fieldPath,
    message,
    suggestedAction,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(normalizeIdentityText).filter(Boolean))];
}

function clueFitById(clueFits: FullAnalysisClueFitSlot[]): Map<string, FullAnalysisClueFitSlot> {
  const byId = new Map<string, FullAnalysisClueFitSlot>();
  for (const clueFit of clueFits) {
    const clueId = normalizeIdentityMatch(clueFit.clueId);
    if (clueId) {
      byId.set(clueId, clueFit);
    }
  }
  return byId;
}

function formatClueList(clueTexts: string[]): string {
  if (clueTexts.length <= 2) {
    return clueTexts.join(" and ");
  }

  return `${clueTexts.slice(0, -1).join(", ")}, and ${clueTexts[clueTexts.length - 1]}`;
}

export function generateFullAnalysisReasoning(
  input: GenerateFullAnalysisReasoningInput,
): FullAnalysisReasoningGenerationResult {
  if (input.classification.puzzleType !== "category_membership") {
    return {
      ok: false,
      issues: [
        makeIssue(
          "UNSUPPORTED_REASONING_PUZZLE_TYPE",
          "classification.puzzleType",
          "The local reasoning generator only supports category_membership in this PR8 slice.",
          "Keep this candidate out of local reasoning generation until a later generator supports its puzzle type.",
        ),
      ],
    };
  }

  const answerCategory = normalizeIdentityText(input.classification.answerCategory);
  if (!answerCategory) {
    return {
      ok: false,
      issues: [
        makeIssue(
          "MISSING_REASONING_ANSWER_CATEGORY",
          "classification.answerCategory",
          "Category-membership reasoning needs an answer category.",
          "Run puzzle type classification before generating reasoning.",
        ),
      ],
    };
  }

  const issues: FullAnalysisReasoningGenerationIssue[] = [];
  const fitsById = clueFitById(input.clueFits);
  const clueIds = input.l1Input.clues.map((clue) => clue.clueId);
  const orderedFits = input.l1Input.clues.flatMap((clue) => {
    const fit = fitsById.get(normalizeIdentityMatch(clue.clueId));
    return fit ? [fit] : [];
  });

  if (input.clueFits.length !== CONTENT_KITCHEN_CLUE_COUNT || orderedFits.length !== CONTENT_KITCHEN_CLUE_COUNT) {
    issues.push(
      makeIssue(
        "INCOMPLETE_REASONING_CLUE_FIT_COVERAGE",
        "clueFits",
        "Reasoning generation needs exactly five clue-fit slots, one per L1 clue.",
        "Generate complete 5/5 clue-fit coverage before reasoning.",
      ),
    );
  }

  for (let index = 0; index < orderedFits.length; index += 1) {
    const fit = orderedFits[index];
    if (!Array.isArray(fit.evidenceRefs) || fit.evidenceRefs.length === 0 || fit.evidenceRefs.some((ref) => !normalizeIdentityText(ref))) {
      issues.push(
        makeIssue(
          "MISSING_REASONING_EVIDENCE_REF",
          `clueFits[${index}].evidenceRefs`,
          "Reasoning generation needs evidence refs from every clue-fit slot.",
          "Attach evidence refs to every clue-fit slot before reasoning.",
        ),
      );
    }
  }

  if (issues.length > 0) {
    return {
      ok: false,
      issues,
    };
  }

  const clueTexts = input.l1Input.clues.map((clue) => normalizeIdentityText(clue.text));
  const evidenceRefs = unique(orderedFits.flatMap((fit) => fit.evidenceRefs));
  return {
    ok: true,
    reasoning: {
      pattern: "cumulative_confirmation",
      clueIds,
      text: `Reviewed dictionary evidence links ${formatClueList(clueTexts)} to ${answerCategory}; that five-clue pattern confirms ${answerCategory} as the answer.`,
      evidenceRefs,
    },
  };
}
