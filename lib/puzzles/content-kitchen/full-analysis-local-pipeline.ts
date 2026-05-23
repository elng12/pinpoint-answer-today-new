import { generateFullAnalysisClueFits } from "./clue-fit-generator";
import { generateFullAnalysisFaqItems } from "./faq-generator";
import { generateFullAnalysisFalseStart } from "./false-start-generator";
import { assembleFullAnalysisSlotPlan } from "./full-analysis-assembler";
import { buildFullAnalysisRepairPlan, type RepairableIssue } from "./local-repair-loop";
import { classifyFullAnalysisPuzzleType } from "./puzzle-type-classifier";
import { generateFullAnalysisReasoning } from "./reasoning-generator";
import type {
  ContentKitchenDictionaries,
  FullAnalysisAssemblyResult,
  FullAnalysisClueFitGenerationResult,
  FullAnalysisFalseStartGenerationResult,
  FullAnalysisFaqGenerationResult,
  FullAnalysisPuzzleTypeClassification,
  FullAnalysisReasoningGenerationResult,
  FullAnalysisRepairPlan,
  L1PuzzleInput,
} from "./types";

export type GenerateFullAnalysisLocalPipelineInput = {
  l1Input: L1PuzzleInput;
  dictionaries?: ContentKitchenDictionaries;
  answerCategoryHint?: string;
  evidenceIdPrefix?: string;
};

export type FullAnalysisLocalPipelineFailureStage =
  | "clue_fits"
  | "reasoning"
  | "faq"
  | "assembly";

export type FullAnalysisLocalPipelineResult =
  | {
      ok: true;
      stage: "complete";
      classification: FullAnalysisPuzzleTypeClassification;
      clueFitResult: Extract<FullAnalysisClueFitGenerationResult, { ok: true }>;
      reasoningResult: Extract<FullAnalysisReasoningGenerationResult, { ok: true }>;
      falseStartResult: FullAnalysisFalseStartGenerationResult;
      faqResult: Extract<FullAnalysisFaqGenerationResult, { ok: true }>;
      assemblyResult: Extract<FullAnalysisAssemblyResult, { ok: true }>;
      repairPlan: FullAnalysisRepairPlan;
    }
  | {
      ok: false;
      stage: FullAnalysisLocalPipelineFailureStage;
      classification: FullAnalysisPuzzleTypeClassification;
      clueFitResult?: FullAnalysisClueFitGenerationResult;
      reasoningResult?: FullAnalysisReasoningGenerationResult;
      falseStartResult?: FullAnalysisFalseStartGenerationResult;
      faqResult?: FullAnalysisFaqGenerationResult;
      assemblyResult?: FullAnalysisAssemblyResult;
      issues: RepairableIssue[];
      repairPlan: FullAnalysisRepairPlan;
    };

function makeRepairPlan(issues: RepairableIssue[]): FullAnalysisRepairPlan {
  return buildFullAnalysisRepairPlan({ issues });
}

export function generateFullAnalysisLocalPipeline(
  input: GenerateFullAnalysisLocalPipelineInput,
): FullAnalysisLocalPipelineResult {
  const classification = classifyFullAnalysisPuzzleType({
    l1Input: input.l1Input,
    dictionaries: input.dictionaries,
    answerCategoryHint: input.answerCategoryHint,
  });

  if (!input.dictionaries) {
    const issues: RepairableIssue[] = [
      {
        issueCode: "MISSING_REVIEWED_DICTIONARIES",
        fieldPath: "dictionaries",
        suggestedAction: "Load reviewed dictionaries before local full-analysis generation.",
      },
    ];

    return {
      ok: false,
      stage: "clue_fits",
      classification,
      issues,
      repairPlan: makeRepairPlan(issues),
    };
  }

  const clueFitResult = generateFullAnalysisClueFits({
    l1Input: input.l1Input,
    classification,
    dictionaries: input.dictionaries,
    evidenceIdPrefix: input.evidenceIdPrefix,
  });

  if (!clueFitResult.ok) {
    return {
      ok: false,
      stage: "clue_fits",
      classification,
      clueFitResult,
      issues: clueFitResult.issues,
      repairPlan: makeRepairPlan(clueFitResult.issues),
    };
  }

  const reasoningResult = generateFullAnalysisReasoning({
    l1Input: input.l1Input,
    classification,
    clueFits: clueFitResult.clueFits,
  });

  if (!reasoningResult.ok) {
    return {
      ok: false,
      stage: "reasoning",
      classification,
      clueFitResult,
      reasoningResult,
      issues: reasoningResult.issues,
      repairPlan: makeRepairPlan(reasoningResult.issues),
    };
  }

  const falseStartResult = generateFullAnalysisFalseStart();
  const faqResult = generateFullAnalysisFaqItems({
    l1Input: input.l1Input,
    classification,
    clueFits: clueFitResult.clueFits,
  });

  if (!faqResult.ok) {
    return {
      ok: false,
      stage: "faq",
      classification,
      clueFitResult,
      reasoningResult,
      falseStartResult,
      faqResult,
      issues: faqResult.issues,
      repairPlan: makeRepairPlan(faqResult.issues),
    };
  }

  const assemblyResult = assembleFullAnalysisSlotPlan({
    l1Input: input.l1Input,
    classification,
    clueFits: clueFitResult.clueFits,
    reasoning: reasoningResult.reasoning,
    falseStart: falseStartResult.falseStart,
    faqItems: faqResult.faqItems,
  });

  if (!assemblyResult.ok) {
    const issues = [...assemblyResult.issues, ...assemblyResult.slotIssues];
    return {
      ok: false,
      stage: "assembly",
      classification,
      clueFitResult,
      reasoningResult,
      falseStartResult,
      faqResult,
      assemblyResult,
      issues,
      repairPlan: makeRepairPlan(issues),
    };
  }

  return {
    ok: true,
    stage: "complete",
    classification,
    clueFitResult,
    reasoningResult,
    falseStartResult,
    faqResult,
    assemblyResult,
    repairPlan: makeRepairPlan([]),
  };
}
