import { normalizeIdentityMatch, normalizeIdentityText } from "./identity";
import {
  CONTENT_KITCHEN_CLUE_COUNT,
  type FullAnalysisClueFitSlot,
  type FullAnalysisReasoning,
  type FullAnalysisSlotIssue,
  type FullAnalysisSlotIssueCode,
  type FullAnalysisSlotPlanV0,
  type L1PuzzleInput,
} from "./types";

export type ValidateFullAnalysisSlotPlanInput = {
  l1Input: L1PuzzleInput;
  slotPlan?: Partial<FullAnalysisSlotPlanV0> | null;
};

const SUPPORTED_PUZZLE_TYPES = new Set([
  "category_membership",
  "phrase_pattern",
  "wordplay",
  "entity_set",
  "unknown",
]);

function makeIssue(
  issueCode: FullAnalysisSlotIssueCode,
  fieldPath: string,
  message: string,
  suggestedAction: string,
): FullAnalysisSlotIssue {
  return {
    issueCode,
    fieldPath,
    message,
    suggestedAction,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasText(value: unknown): boolean {
  return Boolean(normalizeIdentityText(value));
}

function hasStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(hasText);
}

function getKnownL1ClueIds(l1Input: L1PuzzleInput): Set<string> {
  return new Set(l1Input.clues.map((clue) => normalizeIdentityMatch(clue.clueId)));
}

function validatePuzzleType(slotPlan: Partial<FullAnalysisSlotPlanV0>, issues: FullAnalysisSlotIssue[]) {
  if (slotPlan.slotVersion !== "full-analysis-slot-plan-v0") {
    issues.push(
      makeIssue(
        "INVALID_SLOT_PLAN_VERSION",
        "slotPlan.slotVersion",
        "Full-analysis slot plan must use the v0 slot version.",
        "Set slotVersion to full-analysis-slot-plan-v0.",
      ),
    );
  }

  if (!hasText(slotPlan.puzzleType) || !SUPPORTED_PUZZLE_TYPES.has(String(slotPlan.puzzleType))) {
    issues.push(
      makeIssue(
        "MISSING_SLOT_PUZZLE_TYPE",
        "slotPlan.puzzleType",
        "Full-analysis slot plan needs one supported puzzle type.",
        "Set puzzleType before generating clue-fit slots.",
      ),
    );
  }
}

function validateClueFits(input: ValidateFullAnalysisSlotPlanInput, issues: FullAnalysisSlotIssue[]) {
  const clueFits = input.slotPlan?.clueFits;
  const clueFitList = Array.isArray(clueFits) ? clueFits : [];
  const knownClueIds = getKnownL1ClueIds(input.l1Input);
  const seenClueIds = new Set<string>();

  if (!Array.isArray(clueFits) || clueFits.length !== CONTENT_KITCHEN_CLUE_COUNT) {
    issues.push(
      makeIssue(
        "MISSING_SLOT_CLUE_FIT",
        "slotPlan.clueFits",
        "Full-analysis slot plan must include exactly five clue-fit slots.",
        "Add one clue-fit slot for every L1 clue.",
      ),
    );
  }

  for (let index = 0; index < clueFitList.length; index += 1) {
    const clueFit = clueFitList[index] as Partial<FullAnalysisClueFitSlot> | undefined;
    const fieldPath = `slotPlan.clueFits[${index}]`;

    if (!isRecord(clueFit)) {
      issues.push(
        makeIssue(
          "MISSING_SLOT_CLUE_FIT",
          fieldPath,
          "Each clue-fit slot must be an object.",
          "Regenerate this clue-fit slot.",
        ),
      );
      continue;
    }

    const clueId = normalizeIdentityText(clueFit.clueId);
    const normalizedClueId = normalizeIdentityMatch(clueId);
    if (!clueId || !knownClueIds.has(normalizedClueId)) {
      issues.push(
        makeIssue(
          "UNKNOWN_SLOT_CLUE",
          `${fieldPath}.clueId`,
          "Clue-fit slot must point to one known L1 clue id.",
          "Use the exact L1 clue id for this slot.",
        ),
      );
    } else if (seenClueIds.has(normalizedClueId)) {
      issues.push(
        makeIssue(
          "DUPLICATE_SLOT_CLUE_FIT",
          `${fieldPath}.clueId`,
          "A clue id appears in more than one clue-fit slot.",
          "Keep exactly one clue-fit slot per L1 clue.",
        ),
      );
    } else {
      seenClueIds.add(normalizedClueId);
    }

    if (!hasText(clueFit.fit) || !hasText(clueFit.whyItSupportsAnswer)) {
      issues.push(
        makeIssue(
          "MISSING_SLOT_CLUE_FIT",
          fieldPath,
          "Each clue-fit slot needs fit and whyItSupportsAnswer.",
          "Add specific fit text before assembling full-analysis content.",
        ),
      );
    }

    if (!hasStringArray(clueFit.evidenceRefs)) {
      issues.push(
        makeIssue(
          "MISSING_SLOT_EVIDENCE_REF",
          `${fieldPath}.evidenceRefs`,
          "Each clue-fit slot needs at least one evidence ref.",
          "Attach evidence refs before assembling full-analysis content.",
        ),
      );
    }
  }

  for (const clue of input.l1Input.clues) {
    if (!seenClueIds.has(normalizeIdentityMatch(clue.clueId))) {
      issues.push(
        makeIssue(
          "MISSING_SLOT_CLUE_FIT",
          "slotPlan.clueFits",
          "Full-analysis slot plan is missing an L1 clue fit.",
          "Add one clue-fit slot for every L1 clue.",
        ),
      );
    }
  }
}

function validateReasoning(input: ValidateFullAnalysisSlotPlanInput, issues: FullAnalysisSlotIssue[]) {
  const reasoning = input.slotPlan?.reasoning as Partial<FullAnalysisReasoning> | undefined;
  const knownClueIds = getKnownL1ClueIds(input.l1Input);

  if (!isRecord(reasoning)) {
    issues.push(
      makeIssue(
        "MISSING_SLOT_REASONING",
        "slotPlan.reasoning",
        "Full-analysis slot plan needs one reasoning slot.",
        "Add turning_point or cumulative_confirmation reasoning.",
      ),
    );
    return;
  }

  if (!hasText(reasoning.text)) {
    issues.push(
      makeIssue(
        "MISSING_SLOT_REASONING",
        "slotPlan.reasoning.text",
        "Reasoning slot needs non-empty text.",
        "Explain the clue path before assembling full-analysis content.",
      ),
    );
  }

  if (reasoning.pattern === "turning_point") {
    const clueId = normalizeIdentityText(reasoning.clueId);
    if (!clueId || !knownClueIds.has(normalizeIdentityMatch(clueId))) {
      issues.push(
        makeIssue(
          "UNSUPPORTED_SLOT_REASONING",
          "slotPlan.reasoning.clueId",
          "Turning-point reasoning must name one known L1 clue id.",
          "Use one L1 clue id as the turning point.",
        ),
      );
    }

    if (!hasText(reasoning.brokenTheory) || !hasText(reasoning.supportedTheory)) {
      issues.push(
        makeIssue(
          "UNSUPPORTED_SLOT_REASONING",
          "slotPlan.reasoning",
          "Turning-point reasoning needs brokenTheory and supportedTheory.",
          "Add both theory fields.",
        ),
      );
    }
    return;
  }

  if (reasoning.pattern === "cumulative_confirmation") {
    const clueIds = Array.isArray(reasoning.clueIds) ? reasoning.clueIds.map(normalizeIdentityText).filter(Boolean) : [];
    const knownUniqueIds = new Set(clueIds.map(normalizeIdentityMatch).filter((clueId) => knownClueIds.has(clueId)));
    if (knownUniqueIds.size < 2) {
      issues.push(
        makeIssue(
          "UNSUPPORTED_SLOT_REASONING",
          "slotPlan.reasoning.clueIds",
          "Cumulative-confirmation reasoning needs at least two known L1 clue ids.",
          "Reference at least two exact L1 clue ids.",
        ),
      );
    }
    return;
  }

  issues.push(
    makeIssue(
      "UNSUPPORTED_SLOT_REASONING",
      "slotPlan.reasoning.pattern",
      "Reasoning slot must use turning_point or cumulative_confirmation.",
      "Use one supported reasoning pattern.",
    ),
  );
}

function validateFalseStart(slotPlan: Partial<FullAnalysisSlotPlanV0>, issues: FullAnalysisSlotIssue[]) {
  const falseStart = slotPlan.falseStart;

  if (!isRecord(falseStart)) {
    issues.push(
      makeIssue(
        "INVALID_FALSE_START_SLOT",
        "slotPlan.falseStart",
        "Full-analysis slot plan needs a false-start slot, even when omitted.",
        "Set falseStart.status to omitted or included.",
      ),
    );
    return;
  }

  if (falseStart.status === "omitted") {
    return;
  }

  if (falseStart.status !== "included") {
    issues.push(
      makeIssue(
        "INVALID_FALSE_START_SLOT",
        "slotPlan.falseStart.status",
        "False-start slot status must be omitted or included.",
        "Use omitted when there is no supported false start.",
      ),
    );
    return;
  }

  if (!hasText(falseStart.rejectedTheory) || !hasText(falseStart.whyRejected)) {
    issues.push(
      makeIssue(
        "INVALID_FALSE_START_SLOT",
        "slotPlan.falseStart",
        "Included false-start slot needs rejectedTheory and whyRejected.",
        "Fill both fields or mark the false-start slot as omitted.",
      ),
    );
  }
}

function validateFaq(slotPlan: Partial<FullAnalysisSlotPlanV0>, issues: FullAnalysisSlotIssue[]) {
  const faqItems = slotPlan.faqItems;

  if (!Array.isArray(faqItems) || faqItems.length < 2 || faqItems.length > 4) {
    issues.push(
      makeIssue(
        "MISSING_SLOT_FAQ",
        "slotPlan.faqItems",
        "Full-analysis slot plan needs two to four FAQ items.",
        "Generate specific FAQ items or keep the plan out of assembly.",
      ),
    );
    return;
  }

  for (let index = 0; index < faqItems.length; index += 1) {
    const faqItem = faqItems[index];
    if (!hasText(faqItem?.question) || !hasText(faqItem?.answer)) {
      issues.push(
        makeIssue(
          "MISSING_SLOT_FAQ",
          `slotPlan.faqItems[${index}]`,
          "FAQ slot needs question and answer text.",
          "Regenerate this FAQ item.",
        ),
      );
    }
  }
}

export function validateFullAnalysisSlotPlan(input: ValidateFullAnalysisSlotPlanInput): FullAnalysisSlotIssue[] {
  const slotPlan = input.slotPlan;
  const issues: FullAnalysisSlotIssue[] = [];

  if (!isRecord(slotPlan)) {
    return [
      makeIssue(
        "INVALID_SLOT_PLAN_VERSION",
        "slotPlan",
        "Full-analysis slot plan must be an object.",
        "Create a full-analysis-slot-plan-v0 object.",
      ),
    ];
  }

  validatePuzzleType(slotPlan, issues);
  validateClueFits(input, issues);
  validateReasoning(input, issues);
  validateFalseStart(slotPlan, issues);
  validateFaq(slotPlan, issues);

  return issues;
}
