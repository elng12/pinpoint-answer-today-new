import { validateFullAnalysisSlotPlan } from "./full-analysis-slots";
import { normalizeIdentityText } from "./identity";
import type {
  FullAnalysisAssemblyIssue,
  FullAnalysisAssemblyIssueCode,
  FullAnalysisAssemblyResult,
  FullAnalysisClueFitSlot,
  FullAnalysisFalseStartSlot,
  FullAnalysisFaqSlot,
  FullAnalysisPuzzleTypeClassification,
  FullAnalysisReasoning,
  FullAnalysisSlotPlanV0,
  L1PuzzleInput,
} from "./types";

export type AssembleFullAnalysisSlotPlanInput = {
  l1Input: L1PuzzleInput;
  classification: FullAnalysisPuzzleTypeClassification;
  clueFits: FullAnalysisClueFitSlot[];
  reasoning: FullAnalysisReasoning;
  falseStart: FullAnalysisFalseStartSlot;
  faqItems: FullAnalysisFaqSlot[];
};

function makeIssue(
  issueCode: FullAnalysisAssemblyIssueCode,
  fieldPath: string,
  message: string,
  suggestedAction: string,
): FullAnalysisAssemblyIssue {
  return {
    issueCode,
    fieldPath,
    message,
    suggestedAction,
  };
}

export function assembleFullAnalysisSlotPlan(
  input: AssembleFullAnalysisSlotPlanInput,
): FullAnalysisAssemblyResult {
  const answerCategory = normalizeIdentityText(input.classification.answerCategory);
  const slotPlan: FullAnalysisSlotPlanV0 = {
    slotVersion: "full-analysis-slot-plan-v0",
    puzzleType: input.classification.puzzleType,
    ...(answerCategory ? { answerCategory } : {}),
    clueFits: input.clueFits,
    reasoning: input.reasoning,
    falseStart: input.falseStart,
    faqItems: input.faqItems,
  };
  const issues: FullAnalysisAssemblyIssue[] = [];

  if (!answerCategory) {
    issues.push(
      makeIssue(
        "MISSING_ASSEMBLY_ANSWER_CATEGORY",
        "classification.answerCategory",
        "Full-analysis assembly needs an answer category.",
        "Run puzzle type classification before assembling the slot plan.",
      ),
    );
  }

  const slotIssues = validateFullAnalysisSlotPlan({
    l1Input: input.l1Input,
    slotPlan,
  });

  if (slotIssues.length > 0) {
    issues.push(
      makeIssue(
        "INVALID_ASSEMBLED_SLOT_PLAN",
        "slotPlan",
        "Assembled full-analysis slot plan did not pass the slot contract.",
        "Fix the upstream slots before assembling.",
      ),
    );
  }

  if (issues.length > 0) {
    return {
      ok: false,
      slotPlan,
      issues,
      slotIssues,
    };
  }

  return {
    ok: true,
    slotPlan,
  };
}
