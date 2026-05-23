export const CONTENT_KITCHEN_CLUE_COUNT = 5;

export type ContentMode = "answer-first" | "full-analysis";

export type ValidationOutcome =
  | "pass_full_analysis"
  | "pass_answer_first"
  | "downgrade_to_answer_first"
  | "requires_review"
  | "block_publish";

export type IndexPolicy = "index" | "noindex" | "review_required" | "block_publish";
export type SitemapPolicy = "include" | "exclude" | "include_after_audit";
export type SchemaPolicy = "none" | "article_only";
export type InternalLinkPolicy = "normal" | "deemphasized" | "hidden_from_recent";

export type RequiredAction =
  | "none"
  | "enrich"
  | "review"
  | "block_publish"
  | "degrade"
  | "create_fix_task";

export type DegradationAction =
  | "remove_faq_schema"
  | "apply_noindex"
  | "remove_from_sitemap"
  | "hide_from_recent"
  | "create_fix_task";

export type ContentKitchenIssueCode =
  | "MISSING_L1_INPUT"
  | "INVALID_L1_INPUT"
  | "INVALID_CANDIDATE_METADATA"
  | "CANDIDATE_L1_MISMATCH"
  | "CANONICAL_URL_MISMATCH"
  | "ANSWER_HIDDEN_FROM_RENDERED_HTML"
  | "NOINDEX_REQUIRED_BUT_MISSING"
  | "FULL_ANALYSIS_STRUCTURE_NOT_VALIDATED"
  | "MISSING_CLUE_ROW"
  | "DUPLICATE_CLUE_ROW"
  | "MISSING_EVIDENCE_REF"
  | "MISSING_REASONING_PATTERN"
  | "UNSUPPORTED_REASONING_PATTERN"
  | "GENERIC_REASONING_PATTERN"
  | "FAQ_SCHEMA_WITHOUT_VISIBLE_FAQ"
  | "INVALID_FAQ_STRUCTURE"
  | "INTERNAL_LINK_BROKEN"
  | "UNSUPPORTED_CLUE_FIT"
  | "WEAK_FIT_EVIDENCE"
  | "L4_ONLY_EVIDENCE"
  | "FULL_ANALYSIS_WITH_LOW_CONFIDENCE"
  | "PROHIBITED_EVIDENCE_SOURCE"
  | "EVIDENCE_SOURCE_CONFLICT";

export type Pr6aIssueCode = ContentKitchenIssueCode;

export type ContentKitchenIssueSeverity = "P0" | "P1" | "P2";

export type CanonicalConfig = {
  siteBaseUrl: string;
  detailRoutePrefix: "/linkedin-pinpoint-answers";
  trailingSlash: true;
};

export type L1PuzzleClue = {
  clueId: string;
  text: string;
  position: number;
};

export type L1PuzzleInput = {
  puzzleId: string;
  puzzleNumber?: number;
  logicalGameDate: string;
  source: string;
  capturedAt?: string;
  inputSnapshotHash?: string;
  answer: string;
  clues: L1PuzzleClue[];
};

export type ContentCandidateClue = {
  clueId: string;
  text: string;
  position: number;
};

export type FullAnalysisClueRowCandidate = {
  clueId: string;
  clueText?: string;
  fit: string;
  whyItSupportsAnswer: string;
  evidenceRefs: string[];
};

export type TurningPointReasoning = {
  pattern: "turning_point";
  clueId: string;
  brokenTheory: string;
  supportedTheory: string;
  text: string;
  evidenceRefs?: string[];
};

export type CumulativeConfirmationReasoning = {
  pattern: "cumulative_confirmation";
  clueIds: string[];
  text: string;
  evidenceRefs?: string[];
};

export type FullAnalysisReasoning =
  | TurningPointReasoning
  | CumulativeConfirmationReasoning;

export type EvidenceSourceLevel = "L1" | "L2" | "L3" | "L4" | "L5";

export type EvidenceSourceType =
  | "official_capture"
  | "category_membership"
  | "alias_dictionary"
  | "deterministic_lookup"
  | "retrievable_source"
  | "wikidata"
  | "wikipedia"
  | "dictionary_source"
  | "official_source"
  | "multi_model_consensus"
  | "human_review"
  | "competitor_answer_page"
  | "answer_aggregator"
  | "ai_summary"
  | "search_snippet"
  | "generated_page"
  | "unknown";

export type EvidenceSupportKind = "fact" | "fit";

export type EvidenceConfidence = "high" | "medium" | "low";

export type EvidenceConflictStatus = "none" | "unresolved" | "resolved";

export type ContentKitchenEvidenceRecord = {
  evidenceId: string;
  clueId?: string;
  sourceLevel: EvidenceSourceLevel;
  sourceType: EvidenceSourceType;
  supportKind: EvidenceSupportKind;
  claim: string;
  confidence: EvidenceConfidence;
  lookupVersion?: string;
  retrievedAt?: string;
  humanVerifiedBy?: string;
  humanVerifiedAt?: string;
  conflictStatus?: EvidenceConflictStatus;
  notes?: string;
};

export type FaqCandidate = {
  question: string;
  answer: string;
};

export type InternalLinkCandidate = {
  href: string;
  label?: string;
};

export type ContentCandidate = {
  puzzleId: string;
  slug: string;
  canonicalUrl: string;
  contentMode: ContentMode;
  revisionId: string;
  inputSnapshotHash: string;
  contentHash: string;
  answer: string;
  clues: ContentCandidateClue[];
  summary?: string;
  clueRows?: FullAnalysisClueRowCandidate[];
  reasoning?: FullAnalysisReasoning;
  faqItems?: FaqCandidate[];
  internalLinks?: InternalLinkCandidate[];
  schemaTypes?: string[];
};

export type ValidationIssue = {
  issueCode: ContentKitchenIssueCode;
  severity: ContentKitchenIssueSeverity;
  fieldPath: string;
  message: string;
  suggestedAction: string;
  blocking: boolean;
  candidateRevisionId?: string;
};

export type ValidationPolicies = {
  indexPolicy: IndexPolicy;
  sitemapPolicy: SitemapPolicy;
  schemaPolicy: SchemaPolicy;
  internalLinkPolicy: InternalLinkPolicy;
  requiredAction: RequiredAction;
  degradationActions?: DegradationAction[];
};

export type ValidateCandidateInput = {
  l1Input?: Partial<L1PuzzleInput> | null;
  candidate?: Partial<ContentCandidate> | null;
  canonicalConfig: CanonicalConfig;
  renderedHtml?: string;
  allowAnswerFirstIndex?: boolean;
  existingRoutes?: string[];
  evidenceRecords?: Partial<ContentKitchenEvidenceRecord>[];
};

export type ValidateCandidateOutput = {
  outcome: ValidationOutcome;
  policies: ValidationPolicies;
  issues: ValidationIssue[];
};

export type IssuePhaseOwner =
  | "PR6A"
  | "PR6B"
  | "PR6C"
  | "PR7"
  | "PR8"
  | "PR10"
  | "PR11";

export type IssueCodeDefinition = {
  code: ContentKitchenIssueCode;
  phaseOwner: IssuePhaseOwner;
  defaultSeverity: ContentKitchenIssueSeverity;
  defaultOutcome: ValidationOutcome;
  defaultRequiredAction: RequiredAction;
  description: string;
};

export type FixtureExpectation = {
  name: string;
  expectedOutcome: ValidationOutcome;
  expectedPolicies?: Partial<ValidationPolicies>;
  expectedIssueCodes: ContentKitchenIssueCode[];
  mustCreateArtifact?: boolean;
};

export type ReviewArtifactType = "review";

export type ReviewArtifactReviewerAction =
  | "approve_candidate"
  | "approve_downgrade"
  | "reject_candidate"
  | "request_full_analysis_fix"
  | "create_fix_task";

export type ReviewArtifactEvidenceSummary = {
  evidenceRefCount?: number;
  sourceLevels?: string[];
  notes?: string[];
};

export type ReviewArtifactV0 = {
  artifactVersion: "content-kitchen-review-artifact-v0";
  artifactId: string;
  artifactType: ReviewArtifactType;
  createdAt: string;
  puzzleId?: string;
  canonicalUrl?: string;
  contentMode?: ContentMode;
  candidateRevisionId?: string;
  publishedRevisionId?: string;
  validation: {
    outcome: ValidationOutcome;
    policies: ValidationPolicies;
    issueCodes: ContentKitchenIssueCode[];
    issues: ValidationIssue[];
  };
  issueCodesRequiringDecision: ContentKitchenIssueCode[];
  recommendedAction: RequiredAction;
  allowedReviewerActions: ReviewArtifactReviewerAction[];
  evidenceSummary?: ReviewArtifactEvidenceSummary;
  renderedPreviewUrl?: string;
};
