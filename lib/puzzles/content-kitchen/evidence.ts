import { normalizeIdentityMatch, normalizeIdentityText } from "./identity";
import type {
  ContentCandidate,
  ContentKitchenEvidenceRecord,
  ContentKitchenIssueCode,
  EvidenceConfidence,
  EvidenceSourceLevel,
  EvidenceSourceType,
  FullAnalysisClueRowCandidate,
  L1PuzzleInput,
  ValidationIssue,
} from "./types";

type EvidenceCoverageInput = {
  candidate: Partial<ContentCandidate>;
  l1Input: L1PuzzleInput;
  evidenceRecords?: Partial<ContentKitchenEvidenceRecord>[];
};

type IssueOptions = {
  severity?: "P0" | "P1" | "P2";
  blocking?: boolean;
  candidateRevisionId?: string;
};

export const L2_SOURCE_ALLOWLIST: EvidenceSourceType[] = [
  "category_membership",
  "alias_dictionary",
  "deterministic_lookup",
];

export const PROHIBITED_EVIDENCE_SOURCE_TYPES: EvidenceSourceType[] = [
  "competitor_answer_page",
  "answer_aggregator",
  "ai_summary",
  "search_snippet",
  "generated_page",
];

const L2_SOURCE_ALLOWLIST_SET = new Set<EvidenceSourceType>(L2_SOURCE_ALLOWLIST);
const PROHIBITED_EVIDENCE_SOURCE_TYPE_SET = new Set<EvidenceSourceType>(PROHIBITED_EVIDENCE_SOURCE_TYPES);
const SOURCE_LEVELS = new Set<EvidenceSourceLevel>(["L1", "L2", "L3", "L4", "L5"]);
const CONFIDENCE_LEVELS = new Set<EvidenceConfidence>(["high", "medium", "low"]);

function makeIssue(
  issueCode: ContentKitchenIssueCode,
  fieldPath: string,
  message: string,
  suggestedAction: string,
  options: IssueOptions = {},
): ValidationIssue {
  return {
    issueCode,
    severity: options.severity ?? "P1",
    fieldPath,
    message,
    suggestedAction,
    blocking: options.blocking ?? false,
    ...(options.candidateRevisionId ? { candidateRevisionId: options.candidateRevisionId } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isIsoUtc(value: unknown): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(normalizeIdentityText(value));
}

function evidenceById(records: Partial<ContentKitchenEvidenceRecord>[]): Map<string, Partial<ContentKitchenEvidenceRecord>> {
  const byId = new Map<string, Partial<ContentKitchenEvidenceRecord>>();
  for (const record of records) {
    const evidenceId = normalizeIdentityText(record.evidenceId);
    if (evidenceId) {
      byId.set(evidenceId, record);
    }
  }
  return byId;
}

function sourceLevel(record: Partial<ContentKitchenEvidenceRecord>): EvidenceSourceLevel | "" {
  return SOURCE_LEVELS.has(record.sourceLevel as EvidenceSourceLevel) ? record.sourceLevel as EvidenceSourceLevel : "";
}

function confidence(record: Partial<ContentKitchenEvidenceRecord>): EvidenceConfidence | "" {
  return CONFIDENCE_LEVELS.has(record.confidence as EvidenceConfidence) ? record.confidence as EvidenceConfidence : "";
}

function sourceType(record: Partial<ContentKitchenEvidenceRecord>): EvidenceSourceType | "" {
  return normalizeIdentityText(record.sourceType) as EvidenceSourceType | "";
}

function referencesClue(record: Partial<ContentKitchenEvidenceRecord>, row: FullAnalysisClueRowCandidate): boolean {
  return normalizeIdentityMatch(record.clueId) === normalizeIdentityMatch(row.clueId);
}

function supportsFit(record: Partial<ContentKitchenEvidenceRecord>): boolean {
  return record.supportKind === "fit";
}

function hasRequiredRecordShape(record: Partial<ContentKitchenEvidenceRecord>): boolean {
  return Boolean(
    normalizeIdentityText(record.evidenceId) &&
      sourceLevel(record) &&
      sourceType(record) &&
      record.supportKind &&
      normalizeIdentityText(record.claim) &&
      confidence(record),
  );
}

function hasUnresolvedConflict(record: Partial<ContentKitchenEvidenceRecord>): boolean {
  return record.conflictStatus === "unresolved";
}

function hasProhibitedSource(record: Partial<ContentKitchenEvidenceRecord>): boolean {
  return PROHIBITED_EVIDENCE_SOURCE_TYPE_SET.has(sourceType(record) as EvidenceSourceType);
}

function hasStrongL2Fit(record: Partial<ContentKitchenEvidenceRecord>): boolean {
  return (
    sourceLevel(record) === "L2" &&
    L2_SOURCE_ALLOWLIST_SET.has(sourceType(record) as EvidenceSourceType) &&
    normalizeIdentityText(record.lookupVersion) !== "" &&
    confidence(record) !== "low"
  );
}

function hasStrongL5Fit(record: Partial<ContentKitchenEvidenceRecord>): boolean {
  return (
    sourceLevel(record) === "L5" &&
    sourceType(record) === "human_review" &&
    normalizeIdentityText(record.humanVerifiedBy) !== "" &&
    isIsoUtc(record.humanVerifiedAt) &&
    confidence(record) !== "low"
  );
}

function isStrongFitEvidence(record: Partial<ContentKitchenEvidenceRecord>): boolean {
  return (
    hasRequiredRecordShape(record) &&
    supportsFit(record) &&
    !hasUnresolvedConflict(record) &&
    !hasProhibitedSource(record) &&
    (hasStrongL2Fit(record) || hasStrongL5Fit(record))
  );
}

function issueForWeakRow(
  fieldPath: string,
  rowEvidence: Partial<ContentKitchenEvidenceRecord>[],
  candidateRevisionId: string,
): ValidationIssue {
  if (rowEvidence.some(hasProhibitedSource)) {
    return makeIssue(
      "PROHIBITED_EVIDENCE_SOURCE",
      fieldPath,
      "A full-analysis clue row cites a prohibited evidence source.",
      "Remove competitor, aggregator, AI summary, search-snippet, or generated-page evidence.",
      { severity: "P0", candidateRevisionId },
    );
  }

  if (rowEvidence.some(hasUnresolvedConflict)) {
    return makeIssue(
      "EVIDENCE_SOURCE_CONFLICT",
      fieldPath,
      "A full-analysis clue row has an unresolved evidence conflict.",
      "Resolve the conflict or send this candidate to human review.",
      { candidateRevisionId },
    );
  }

  if (rowEvidence.length > 0 && rowEvidence.every((record) => sourceLevel(record) === "L4")) {
    return makeIssue(
      "L4_ONLY_EVIDENCE",
      fieldPath,
      "A full-analysis clue row only has L4 model-consensus evidence.",
      "Add reviewed L2 evidence or human-reviewed L5 evidence.",
      { candidateRevisionId },
    );
  }

  if (rowEvidence.length > 0 && rowEvidence.every((record) => confidence(record) === "low")) {
    return makeIssue(
      "FULL_ANALYSIS_WITH_LOW_CONFIDENCE",
      fieldPath,
      "A full-analysis clue row only has low-confidence evidence.",
      "Add stronger fit evidence or send this candidate to review.",
      { candidateRevisionId },
    );
  }

  return makeIssue(
    "WEAK_FIT_EVIDENCE",
    fieldPath,
    "A full-analysis clue row does not have strong reviewed fit evidence.",
    "Add L2 lookup evidence with lookupVersion or L5 human-reviewed evidence.",
    { candidateRevisionId },
  );
}

export function validateFullAnalysisEvidence(input: EvidenceCoverageInput): ValidationIssue[] {
  const candidateRevisionId = normalizeIdentityText(input.candidate.revisionId);
  const rows = Array.isArray(input.candidate.clueRows)
    ? input.candidate.clueRows as FullAnalysisClueRowCandidate[]
    : [];
  const records = Array.isArray(input.evidenceRecords) ? input.evidenceRecords : [];

  if (records.length === 0) {
    return [
      makeIssue(
        "WEAK_FIT_EVIDENCE",
        "evidenceRecords",
        "Full-analysis needs evidence records before it can auto-pass.",
        "Attach L2 dictionary evidence or L5 human-reviewed evidence.",
        { candidateRevisionId },
      ),
    ];
  }

  const byId = evidenceById(records);
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const fieldPath = `candidate.clueRows[${index}].evidenceRefs`;
    const linked = row.evidenceRefs.map((evidenceRef) => byId.get(normalizeIdentityText(evidenceRef))).filter(isRecord);
    const rowFitEvidence = linked.filter((record) => referencesClue(record, row) && supportsFit(record));

    if (rowFitEvidence.length === 0) {
      return [
        makeIssue(
          "UNSUPPORTED_CLUE_FIT",
          fieldPath,
          "A full-analysis clue row has no matching clue-fit evidence record.",
          "Make the row evidenceRefs point to fit evidence for the same L1 clue id.",
          { severity: "P0", candidateRevisionId },
        ),
      ];
    }

    if (
      rowFitEvidence.some(hasProhibitedSource) ||
      rowFitEvidence.some(hasUnresolvedConflict) ||
      !rowFitEvidence.some(isStrongFitEvidence)
    ) {
      return [issueForWeakRow(fieldPath, rowFitEvidence, candidateRevisionId)];
    }
  }

  return [];
}
