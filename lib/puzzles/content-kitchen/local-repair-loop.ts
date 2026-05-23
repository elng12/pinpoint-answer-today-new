import { normalizeIdentityText } from "./identity";
import type {
  FullAnalysisRepairAction,
  FullAnalysisRepairActionCode,
  FullAnalysisRepairPlan,
} from "./types";

export type RepairableIssue = {
  issueCode: string;
  fieldPath?: string;
  suggestedAction?: string;
};

export type BuildFullAnalysisRepairPlanInput = {
  issues: RepairableIssue[];
};

type ActionTemplate = {
  actionCode: FullAnalysisRepairActionCode;
  target: string;
  reason: string;
  canAutoRepair: boolean;
};

const ISSUE_REPAIR_ACTIONS: Record<string, ActionTemplate> = {
  MISSING_ANSWER_CATEGORY: {
    actionCode: "rerun_puzzle_type_classifier",
    target: "classification.answerCategory",
    reason: "Answer category is missing before clue-fit generation.",
    canAutoRepair: true,
  },
  MISSING_ASSEMBLY_ANSWER_CATEGORY: {
    actionCode: "rerun_puzzle_type_classifier",
    target: "classification.answerCategory",
    reason: "Answer category is missing before assembly.",
    canAutoRepair: true,
  },
  MISSING_FAQ_ANSWER_CATEGORY: {
    actionCode: "rerun_puzzle_type_classifier",
    target: "classification.answerCategory",
    reason: "Answer category is missing before FAQ generation.",
    canAutoRepair: true,
  },
  MISSING_REASONING_ANSWER_CATEGORY: {
    actionCode: "rerun_puzzle_type_classifier",
    target: "classification.answerCategory",
    reason: "Answer category is missing before reasoning generation.",
    canAutoRepair: true,
  },
  UNSUPPORTED_PUZZLE_TYPE: {
    actionCode: "rerun_puzzle_type_classifier",
    target: "classification.puzzleType",
    reason: "The local clue-fit generator does not support this puzzle type.",
    canAutoRepair: false,
  },
  UNSUPPORTED_REASONING_PUZZLE_TYPE: {
    actionCode: "rerun_puzzle_type_classifier",
    target: "classification.puzzleType",
    reason: "The local reasoning generator does not support this puzzle type.",
    canAutoRepair: false,
  },
  UNSUPPORTED_FAQ_PUZZLE_TYPE: {
    actionCode: "rerun_puzzle_type_classifier",
    target: "classification.puzzleType",
    reason: "The local FAQ generator does not support this puzzle type.",
    canAutoRepair: false,
  },
  MISSING_REVIEWED_DICTIONARIES: {
    actionCode: "load_reviewed_dictionaries",
    target: "dictionaries",
    reason: "Reviewed dictionaries are required for local generation.",
    canAutoRepair: true,
  },
  MISSING_REVIEWED_CATEGORY_MEMBER: {
    actionCode: "repair_dictionary_coverage",
    target: "dictionaries.categoryMembership",
    reason: "A clue/category pair is missing from reviewed dictionary coverage.",
    canAutoRepair: false,
  },
  INCOMPLETE_CLUE_FIT_COVERAGE: {
    actionCode: "regenerate_clue_fits",
    target: "clueFits",
    reason: "Clue-fit generation did not produce complete 5/5 coverage.",
    canAutoRepair: true,
  },
  MISSING_SLOT_CLUE_FIT: {
    actionCode: "regenerate_clue_fits",
    target: "clueFits",
    reason: "The slot contract is missing one or more clue-fit rows.",
    canAutoRepair: true,
  },
  DUPLICATE_SLOT_CLUE_FIT: {
    actionCode: "regenerate_clue_fits",
    target: "clueFits",
    reason: "The slot contract found duplicate clue-fit rows.",
    canAutoRepair: true,
  },
  UNKNOWN_SLOT_CLUE: {
    actionCode: "regenerate_clue_fits",
    target: "clueFits",
    reason: "A clue-fit row points to an unknown L1 clue.",
    canAutoRepair: true,
  },
  MISSING_SLOT_EVIDENCE_REF: {
    actionCode: "regenerate_clue_fits",
    target: "clueFits",
    reason: "One or more clue-fit rows are missing evidence refs.",
    canAutoRepair: true,
  },
  INVALID_SLOT_PLAN_VERSION: {
    actionCode: "rerun_assembler",
    target: "slotPlan",
    reason: "The slot plan version is invalid.",
    canAutoRepair: true,
  },
  MISSING_SLOT_PUZZLE_TYPE: {
    actionCode: "rerun_puzzle_type_classifier",
    target: "classification.puzzleType",
    reason: "The slot plan is missing puzzle type classification.",
    canAutoRepair: true,
  },
  INCOMPLETE_REASONING_CLUE_FIT_COVERAGE: {
    actionCode: "regenerate_clue_fits",
    target: "clueFits",
    reason: "Reasoning needs complete clue-fit coverage first.",
    canAutoRepair: true,
  },
  MISSING_REASONING_EVIDENCE_REF: {
    actionCode: "regenerate_clue_fits",
    target: "clueFits",
    reason: "Reasoning needs clue-fit evidence refs first.",
    canAutoRepair: true,
  },
  MISSING_REASONING_PATTERN: {
    actionCode: "regenerate_reasoning",
    target: "reasoning",
    reason: "The slot contract is missing reasoning.",
    canAutoRepair: true,
  },
  UNSUPPORTED_REASONING_PATTERN: {
    actionCode: "regenerate_reasoning",
    target: "reasoning",
    reason: "The slot contract found unsupported reasoning.",
    canAutoRepair: true,
  },
  INCOMPLETE_FAQ_CLUE_FIT_COVERAGE: {
    actionCode: "regenerate_clue_fits",
    target: "clueFits",
    reason: "FAQ generation needs complete clue-fit coverage first.",
    canAutoRepair: true,
  },
  MISSING_FAQ_EVIDENCE_REF: {
    actionCode: "regenerate_clue_fits",
    target: "clueFits",
    reason: "FAQ generation needs clue-fit evidence refs first.",
    canAutoRepair: true,
  },
  MISSING_SLOT_FAQ: {
    actionCode: "regenerate_faq",
    target: "faqItems",
    reason: "The slot contract is missing valid FAQ items.",
    canAutoRepair: true,
  },
  INVALID_FALSE_START_SLOT: {
    actionCode: "keep_false_start_omitted",
    target: "falseStart",
    reason: "Unsupported false starts should stay omitted.",
    canAutoRepair: true,
  },
  INVALID_ASSEMBLED_SLOT_PLAN: {
    actionCode: "rerun_assembler",
    target: "slotPlan",
    reason: "The assembled slot plan must be rebuilt after upstream fixes.",
    canAutoRepair: true,
  },
};

function fallbackAction(issue: RepairableIssue): FullAnalysisRepairAction {
  const issueCode = normalizeIdentityText(issue.issueCode) || "UNKNOWN";
  return {
    actionCode: "rerun_assembler",
    target: "slotPlan",
    reason: normalizeIdentityText(issue.suggestedAction) || "Rerun assembly after fixing this issue.",
    issueCodes: [issueCode],
  };
}

function actionKey(action: FullAnalysisRepairAction): string {
  return `${action.actionCode}:${action.target}`;
}

export function buildFullAnalysisRepairPlan(input: BuildFullAnalysisRepairPlanInput): FullAnalysisRepairPlan {
  const actionsByKey = new Map<string, FullAnalysisRepairAction>();
  let canAutoRepair = true;

  for (const issue of input.issues) {
    const issueCode = normalizeIdentityText(issue.issueCode);
    if (!issueCode) {
      continue;
    }

    const template = ISSUE_REPAIR_ACTIONS[issueCode];
    const action = template
      ? {
          actionCode: template.actionCode,
          target: template.target,
          reason: template.reason,
          issueCodes: [issueCode],
        }
      : fallbackAction(issue);

    if (template && !template.canAutoRepair) {
      canAutoRepair = false;
    }

    if (!template) {
      canAutoRepair = false;
    }

    const key = actionKey(action);
    const existing = actionsByKey.get(key);
    if (existing) {
      actionsByKey.set(key, {
        ...existing,
        issueCodes: [...new Set([...existing.issueCodes, ...action.issueCodes])],
      });
    } else {
      actionsByKey.set(key, action);
    }
  }

  return {
    canAutoRepair,
    actions: [...actionsByKey.values()],
  };
}
