import type { ContentKitchenIssueCode, IssueCodeDefinition } from "./types";

export const CONTENT_KITCHEN_ISSUE_REGISTRY: IssueCodeDefinition[] = [
  {
    code: "MISSING_L1_INPUT",
    phaseOwner: "PR6A",
    defaultSeverity: "P0",
    defaultOutcome: "block_publish",
    defaultRequiredAction: "block_publish",
    description: "L1 input object is absent or cannot be loaded.",
  },
  {
    code: "INVALID_L1_INPUT",
    phaseOwner: "PR6A",
    defaultSeverity: "P0",
    defaultOutcome: "block_publish",
    defaultRequiredAction: "block_publish",
    description: "L1 exists but required answer, clue, or identity fields are invalid.",
  },
  {
    code: "INVALID_CANDIDATE_METADATA",
    phaseOwner: "PR6A",
    defaultSeverity: "P0",
    defaultOutcome: "block_publish",
    defaultRequiredAction: "block_publish",
    description: "Candidate metadata is missing or unsupported.",
  },
  {
    code: "CANDIDATE_L1_MISMATCH",
    phaseOwner: "PR6A",
    defaultSeverity: "P0",
    defaultOutcome: "block_publish",
    defaultRequiredAction: "block_publish",
    description: "Candidate identity or clue data does not match L1.",
  },
  {
    code: "CANONICAL_URL_MISMATCH",
    phaseOwner: "PR6A",
    defaultSeverity: "P0",
    defaultOutcome: "block_publish",
    defaultRequiredAction: "block_publish",
    description: "Candidate slug or canonical URL does not match the L1-derived canonical identity.",
  },
  {
    code: "ANSWER_HIDDEN_FROM_RENDERED_HTML",
    phaseOwner: "PR6A",
    defaultSeverity: "P0",
    defaultOutcome: "requires_review",
    defaultRequiredAction: "review",
    description: "Indexable candidate lacks rendered proof that answer and L1 clues are visible.",
  },
  {
    code: "NOINDEX_REQUIRED_BUT_MISSING",
    phaseOwner: "PR6C",
    defaultSeverity: "P0",
    defaultOutcome: "block_publish",
    defaultRequiredAction: "block_publish",
    description: "A noindex policy is required, but rendered HTML proof does not contain a noindex marker.",
  },
  {
    code: "FULL_ANALYSIS_STRUCTURE_NOT_VALIDATED",
    phaseOwner: "PR6A",
    defaultSeverity: "P1",
    defaultOutcome: "requires_review",
    defaultRequiredAction: "review",
    description: "Full-analysis identity passed before PR6B structural validation exists.",
  },
  {
    code: "MISSING_CLUE_ROW",
    phaseOwner: "PR6B",
    defaultSeverity: "P0",
    defaultOutcome: "downgrade_to_answer_first",
    defaultRequiredAction: "enrich",
    description: "Full-analysis clue rows are missing, unknown, or structurally incomplete.",
  },
  {
    code: "DUPLICATE_CLUE_ROW",
    phaseOwner: "PR6B",
    defaultSeverity: "P0",
    defaultOutcome: "downgrade_to_answer_first",
    defaultRequiredAction: "enrich",
    description: "Full-analysis contains duplicate clue-row coverage.",
  },
  {
    code: "MISSING_EVIDENCE_REF",
    phaseOwner: "PR6B",
    defaultSeverity: "P0",
    defaultOutcome: "downgrade_to_answer_first",
    defaultRequiredAction: "enrich",
    description: "A full-analysis clue row lacks an evidence ref string.",
  },
  {
    code: "MISSING_REASONING_PATTERN",
    phaseOwner: "PR6B",
    defaultSeverity: "P0",
    defaultOutcome: "downgrade_to_answer_first",
    defaultRequiredAction: "enrich",
    description: "Full-analysis reasoning is missing.",
  },
  {
    code: "UNSUPPORTED_REASONING_PATTERN",
    phaseOwner: "PR6B",
    defaultSeverity: "P0",
    defaultOutcome: "downgrade_to_answer_first",
    defaultRequiredAction: "enrich",
    description: "Full-analysis reasoning pattern or required reasoning fields are unsupported.",
  },
  {
    code: "GENERIC_REASONING_PATTERN",
    phaseOwner: "PR6B",
    defaultSeverity: "P1",
    defaultOutcome: "downgrade_to_answer_first",
    defaultRequiredAction: "enrich",
    description: "Full-analysis reasoning is too generic to trust as a solve path.",
  },
  {
    code: "FAQ_SCHEMA_WITHOUT_VISIBLE_FAQ",
    phaseOwner: "PR6B",
    defaultSeverity: "P0",
    defaultOutcome: "downgrade_to_answer_first",
    defaultRequiredAction: "enrich",
    description: "FAQPage schema exists without matching visible FAQ content.",
  },
  {
    code: "INVALID_FAQ_STRUCTURE",
    phaseOwner: "PR6B",
    defaultSeverity: "P1",
    defaultOutcome: "downgrade_to_answer_first",
    defaultRequiredAction: "enrich",
    description: "Full-analysis FAQ item count or shape is invalid.",
  },
  {
    code: "INTERNAL_LINK_BROKEN",
    phaseOwner: "PR6B",
    defaultSeverity: "P1",
    defaultOutcome: "downgrade_to_answer_first",
    defaultRequiredAction: "enrich",
    description: "Internal link is not route-shaped or is absent from the provided route index.",
  },
];

export const CONTENT_KITCHEN_ISSUE_DEFINITIONS = new Map<ContentKitchenIssueCode, IssueCodeDefinition>(
  CONTENT_KITCHEN_ISSUE_REGISTRY.map((definition) => [definition.code, definition]),
);

export function getIssueDefinition(code: ContentKitchenIssueCode): IssueCodeDefinition {
  const definition = CONTENT_KITCHEN_ISSUE_DEFINITIONS.get(code);
  if (!definition) {
    throw new Error(`Unknown content kitchen issue code: ${code}`);
  }
  return definition;
}

export function getPr6P0IssueCodes(): ContentKitchenIssueCode[] {
  return CONTENT_KITCHEN_ISSUE_REGISTRY
    .filter((definition) => {
      return definition.defaultSeverity === "P0" && definition.phaseOwner.startsWith("PR6");
    })
    .map((definition) => definition.code);
}
