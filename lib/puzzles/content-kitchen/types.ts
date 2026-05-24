export const CONTENT_KITCHEN_CLUE_COUNT = 5;

export type ContentMode = "answer-first" | "full-analysis";

export type ValidationOutcome =
  | "pass_full_analysis"
  | "pass_answer_first"
  | "downgrade_to_answer_first"
  | "requires_review"
  | "block_publish";

export type IndexPolicy = "index" | "noindex" | "review_required" | "block_publish";
export type SitemapPolicy = "include" | "exclude" | "remove_on_next_build" | "include_after_audit";
export type SchemaPolicy = "none" | "article_only" | "faq_allowed" | "block_schema";
export type InternalLinkPolicy = "normal" | "deemphasized" | "hidden_from_recent";

export type RequiredAction =
  | "none"
  | "enrich"
  | "review"
  | "block_publish"
  | "upgrade"
  | "rollback"
  | "degrade"
  | "create_fix_task"
  | "dead_letter"
  | "keep_current";

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
  | "EVIDENCE_SOURCE_CONFLICT"
  | "ANSWER_FIRST_OVER_SLA"
  | "ANSWER_FIRST_REVIEW_REQUIRED"
  | "INDEXED_ANSWER_FIRST_STALE"
  | "ANSWER_FIRST_HIGH_PRIORITY_ALERT";

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
  dictionaryName?: DictionaryName;
  dictionaryCategory?: string;
  normalizedDictionaryCategory?: string;
  dictionaryMember?: string;
  normalizedDictionaryMember?: string;
  notes?: string;
};

export type DictionaryReviewStatus = "draft" | "shadow" | "reviewed";
export type DictionaryRisk = "low" | "medium" | "high";
export type DictionaryName = "category_membership" | "alias_dictionary";
export type DictionaryChangeType = "add" | "update" | "delete";

export type ContentKitchenDictionaryBase = {
  dictionaryName: string;
  schemaVersion: string;
  versionId: string;
  owner: string;
  reviewedBy: string;
  reviewedAt: string;
  reviewStatus: DictionaryReviewStatus;
};

export type CategoryMembershipEntry = {
  category: string;
  normalizedCategory: string;
  member: string;
  normalizedMember: string;
  sourceNote: string;
  reviewer: string;
  risk: DictionaryRisk;
  createdAt: string;
  updatedAt: string;
};

export type CategoryMembershipDictionary = ContentKitchenDictionaryBase & {
  dictionaryName: "category_membership";
  schemaVersion: "content-kitchen-category-membership-v0";
  entries: CategoryMembershipEntry[];
};

export type AliasDictionaryEntry = {
  aliasType: "answer" | "category" | "clue" | "phrase";
  canonicalValue: string;
  normalizedCanonicalValue: string;
  alias: string;
  normalizedAlias: string;
  sourceNote: string;
  reviewer: string;
  risk: DictionaryRisk;
  createdAt: string;
  updatedAt: string;
};

export type AliasDictionary = ContentKitchenDictionaryBase & {
  dictionaryName: "alias_dictionary";
  schemaVersion: "content-kitchen-alias-dictionary-v0";
  entries: AliasDictionaryEntry[];
};

export type ContentKitchenDictionaries = {
  categoryMembership: CategoryMembershipDictionary;
  aliasDictionary: AliasDictionary;
};

export type DictionaryDiffChange = {
  type: DictionaryChangeType;
  category?: string;
  normalizedCategory?: string;
  member?: string;
  normalizedMember?: string;
  aliasType?: AliasDictionaryEntry["aliasType"];
  canonicalValue?: string;
  normalizedCanonicalValue?: string;
  alias?: string;
  normalizedAlias?: string;
  sourceNote: string;
  reviewer: string;
  risk: DictionaryRisk;
};

export type DictionaryDiffAffectedPage = {
  slug: string;
  canonicalUrl?: string;
  revisionId?: string;
  lookupVersion?: string;
  reason: string;
  needsReview: boolean;
};

export type ContentKitchenDictionaryDiff = {
  schemaVersion: "content-kitchen-dictionary-diff-v0";
  dictionaryName: DictionaryName;
  fromVersion: string;
  toVersion: string;
  createdAt: string;
  reviewedBy: string;
  reviewedAt: string;
  changes: DictionaryDiffChange[];
  affectedPublishedPages: DictionaryDiffAffectedPage[];
};

export type PublishedEvidenceUsageRecord = {
  slug: string;
  canonicalUrl?: string;
  revisionId: string;
  contentMode?: ContentMode;
  evidenceId: string;
  clueId?: string;
  lookupVersion?: string;
  dictionaryName?: DictionaryName;
  dictionaryCategory?: string;
  normalizedDictionaryCategory?: string;
  dictionaryMember?: string;
  normalizedDictionaryMember?: string;
};

export type DictionaryAffectedPageQuery = {
  lookupVersion?: string;
  dictionaryName?: DictionaryName;
  category?: string;
  member?: string;
};

export type FaqCandidate = {
  question: string;
  answer: string;
};

export type FullAnalysisPuzzleType =
  | "category_membership"
  | "phrase_pattern"
  | "wordplay"
  | "entity_set"
  | "unknown";

export type FullAnalysisPuzzleTypeClassificationReason =
  | "ANSWER_CATEGORY_HINT_MATCHED"
  | "ANSWER_ALIAS_MATCHED_CATEGORY"
  | "ALL_CLUES_MATCH_REVIEWED_CATEGORY"
  | "PARTIAL_REVIEWED_CATEGORY_COVERAGE"
  | "AMBIGUOUS_REVIEWED_CATEGORY_COVERAGE"
  | "NO_REVIEWED_CATEGORY_COVERAGE";

export type FullAnalysisPuzzleTypeCandidateCategory = {
  category: string;
  matchedClueCount: number;
  matchedClueIds: string[];
  lookupVersion: string;
};

export type FullAnalysisPuzzleTypeClassification = {
  puzzleType: FullAnalysisPuzzleType;
  confidence: EvidenceConfidence;
  answerCategory?: string;
  matchedClueCount: number;
  matchedClueIds: string[];
  unmatchedClueIds: string[];
  candidateCategories: FullAnalysisPuzzleTypeCandidateCategory[];
  reasonCodes: FullAnalysisPuzzleTypeClassificationReason[];
};

export type FullAnalysisSlotInput = {
  l1Input: L1PuzzleInput;
  answerCategory?: string;
  evidenceRecords?: Partial<ContentKitchenEvidenceRecord>[];
};

export type FullAnalysisClueFitSlot = FullAnalysisClueRowCandidate;

export type FullAnalysisFalseStartSlot =
  | {
      status: "omitted";
      rejectedTheory?: string;
      whyRejected?: string;
      evidenceRefs?: string[];
    }
  | {
      status: "included";
      rejectedTheory: string;
      whyRejected: string;
      evidenceRefs?: string[];
    };

export type FullAnalysisFaqSlot = FaqCandidate & {
  evidenceRefs?: string[];
};

export type FullAnalysisSlotPlanV0 = {
  slotVersion: "full-analysis-slot-plan-v0";
  puzzleType: FullAnalysisPuzzleType;
  answerCategory?: string;
  clueFits: FullAnalysisClueFitSlot[];
  reasoning: FullAnalysisReasoning;
  falseStart: FullAnalysisFalseStartSlot;
  faqItems: FullAnalysisFaqSlot[];
};

export type FullAnalysisSlotIssueCode =
  | "INVALID_SLOT_PLAN_VERSION"
  | "MISSING_SLOT_PUZZLE_TYPE"
  | "MISSING_SLOT_CLUE_FIT"
  | "DUPLICATE_SLOT_CLUE_FIT"
  | "UNKNOWN_SLOT_CLUE"
  | "MISSING_SLOT_EVIDENCE_REF"
  | "MISSING_SLOT_REASONING"
  | "UNSUPPORTED_SLOT_REASONING"
  | "INVALID_FALSE_START_SLOT"
  | "MISSING_SLOT_FAQ";

export type FullAnalysisSlotIssue = {
  issueCode: FullAnalysisSlotIssueCode;
  fieldPath: string;
  message: string;
  suggestedAction: string;
};

export type FullAnalysisClueFitGenerationIssueCode =
  | "UNSUPPORTED_PUZZLE_TYPE"
  | "MISSING_ANSWER_CATEGORY"
  | "MISSING_REVIEWED_DICTIONARIES"
  | "MISSING_REVIEWED_CATEGORY_MEMBER"
  | "INCOMPLETE_CLUE_FIT_COVERAGE";

export type FullAnalysisClueFitGenerationIssue = {
  issueCode: FullAnalysisClueFitGenerationIssueCode;
  fieldPath: string;
  message: string;
  suggestedAction: string;
};

export type FullAnalysisClueFitGenerationResult =
  | {
      ok: true;
      clueFits: FullAnalysisClueFitSlot[];
      evidenceRecords: ContentKitchenEvidenceRecord[];
    }
  | {
      ok: false;
      clueFits: FullAnalysisClueFitSlot[];
      evidenceRecords: ContentKitchenEvidenceRecord[];
      issues: FullAnalysisClueFitGenerationIssue[];
    };

export type FullAnalysisReasoningGenerationIssueCode =
  | "UNSUPPORTED_REASONING_PUZZLE_TYPE"
  | "MISSING_REASONING_ANSWER_CATEGORY"
  | "INCOMPLETE_REASONING_CLUE_FIT_COVERAGE"
  | "MISSING_REASONING_EVIDENCE_REF";

export type FullAnalysisReasoningGenerationIssue = {
  issueCode: FullAnalysisReasoningGenerationIssueCode;
  fieldPath: string;
  message: string;
  suggestedAction: string;
};

export type FullAnalysisReasoningGenerationResult =
  | {
      ok: true;
      reasoning: FullAnalysisReasoning;
    }
  | {
      ok: false;
      issues: FullAnalysisReasoningGenerationIssue[];
    };

export type FullAnalysisFalseStartGenerationReasonCode =
  | "NO_SUPPORTED_FALSE_START_EVIDENCE";

export type FullAnalysisFalseStartGenerationResult = {
  falseStart: FullAnalysisFalseStartSlot;
  reasonCodes: FullAnalysisFalseStartGenerationReasonCode[];
};

export type FullAnalysisFaqGenerationIssueCode =
  | "UNSUPPORTED_FAQ_PUZZLE_TYPE"
  | "MISSING_FAQ_ANSWER_CATEGORY"
  | "INCOMPLETE_FAQ_CLUE_FIT_COVERAGE"
  | "MISSING_FAQ_EVIDENCE_REF";

export type FullAnalysisFaqGenerationIssue = {
  issueCode: FullAnalysisFaqGenerationIssueCode;
  fieldPath: string;
  message: string;
  suggestedAction: string;
};

export type FullAnalysisFaqGenerationResult =
  | {
      ok: true;
      faqItems: FullAnalysisFaqSlot[];
    }
  | {
      ok: false;
      faqItems: FullAnalysisFaqSlot[];
      issues: FullAnalysisFaqGenerationIssue[];
    };

export type FullAnalysisAssemblyIssueCode =
  | "MISSING_ASSEMBLY_ANSWER_CATEGORY"
  | "INVALID_ASSEMBLED_SLOT_PLAN";

export type FullAnalysisAssemblyIssue = {
  issueCode: FullAnalysisAssemblyIssueCode;
  fieldPath: string;
  message: string;
  suggestedAction: string;
};

export type FullAnalysisAssemblyResult =
  | {
      ok: true;
      slotPlan: FullAnalysisSlotPlanV0;
    }
  | {
      ok: false;
      slotPlan: Partial<FullAnalysisSlotPlanV0>;
      issues: FullAnalysisAssemblyIssue[];
      slotIssues: FullAnalysisSlotIssue[];
    };

export type FullAnalysisRepairActionCode =
  | "rerun_puzzle_type_classifier"
  | "load_reviewed_dictionaries"
  | "repair_dictionary_coverage"
  | "regenerate_clue_fits"
  | "regenerate_reasoning"
  | "regenerate_faq"
  | "keep_false_start_omitted"
  | "rerun_assembler";

export type FullAnalysisRepairAction = {
  actionCode: FullAnalysisRepairActionCode;
  target: string;
  reason: string;
  issueCodes: string[];
};

export type FullAnalysisRepairPlan = {
  canAutoRepair: boolean;
  actions: FullAnalysisRepairAction[];
};

export type SiteIndexHealthGuard = {
  maxIndexedAnswerFirstRatio: number;
  targetFullAnalysisMinutes: number;
  firstAlertAfterMinutes: number;
  reviewAfterMinutes: number;
  thinPageAutoNoindexAfterMinutes: number;
  highPriorityAlertAfterHours: number;
  autoNoindexIfOverSLA: boolean;
  excludeFromRecentIfNoindex: boolean;
  notificationChannel: "feishu" | "none" | "custom";
};

export type AnswerFirstSlaStatus =
  | "not_applicable"
  | "within_sla"
  | "upgrade_ready"
  | "normal_alert_due"
  | "review_required"
  | "thin_page_noindex_required"
  | "high_priority_alert_due";

export type AnswerFirstSlaNotificationLevel = "none" | "normal" | "high_priority";

export type AnswerFirstSlaDecision = {
  status: AnswerFirstSlaStatus;
  elapsedMinutes: number;
  targetFullAnalysisAt: string;
  firstAlertAt: string;
  reviewRequiredAt: string;
  thinPageNoindexAt: string;
  highPriorityAlertAt: string;
  notificationLevel: AnswerFirstSlaNotificationLevel;
  issueCodes: ContentKitchenIssueCode[];
  policies: ValidationPolicies;
};

export type EnrichmentJobState =
  | "queued"
  | "running"
  | "review_required"
  | "dead_letter"
  | "completed";

export type EnrichmentBackoffStrategy = "fixed" | "exponential";

export type AnswerFirstEnrichmentJob = {
  jobVersion: "answer-first-enrichment-job-v0";
  jobId: string;
  idempotencyKey: string;
  puzzleId: string;
  sourceRevisionId: string;
  targetRevision: string;
  inputSnapshotHash: string;
  state: EnrichmentJobState;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string;
  attemptCount: number;
  maxAttempts: number;
  backoffStrategy: EnrichmentBackoffStrategy;
  deadlineAt: string;
  targetFullAnalysisAt: string;
  firstAlertAt: string;
  reviewRequiredAt: string;
  thinPageNoindexAt: string;
  highPriorityAlertAt: string;
  lockedBy?: string;
  lockedUntil?: string;
  failureReasonCodes: ContentKitchenIssueCode[];
  deadLetterAt?: string;
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
  answerCategory?: string;
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
  dictionaries?: ContentKitchenDictionaries;
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
  | "PR9"
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

export type ReviewRoute =
  | "auto_approve"
  | "auto_reject"
  | "model_review"
  | "human_review";

export type ReviewDecisionAction =
  | "approve"
  | "reject"
  | "request_regeneration"
  | "force_answer_first"
  | "override_issue"
  | "escalate_to_human";

export type ReviewDecisionReviewerType =
  | "rule_engine"
  | "model"
  | "human";

export type ReviewRouteResult = {
  route: ReviewRoute;
  reason: string;
  issueCodes: ContentKitchenIssueCode[];
  hardRuleIssueCodes: ContentKitchenIssueCode[];
  modelReviewIssueCodes: ContentKitchenIssueCode[];
  humanReviewIssueCodes: ContentKitchenIssueCode[];
};

export type ReviewDecisionV0 = {
  decisionVersion: "content-kitchen-review-decision-v0";
  artifactId: string;
  puzzleId: string;
  candidateRevisionId: string;
  issueCodes: ContentKitchenIssueCode[];
  route: ReviewRoute;
  action: ReviewDecisionAction;
  reviewerType: ReviewDecisionReviewerType;
  reviewerId: string;
  reviewedAt: string;
  confidence?: number;
  modelName?: string;
  modelVersion?: string;
  note: string;
};

export type ReviewDecisionValidationResult = {
  valid: boolean;
  errors: string[];
  derivedRoute: ReviewRouteResult;
};

export type ReviewDecisionEffect =
  | "approved"
  | "rejected"
  | "regeneration_requested"
  | "answer_first_forced"
  | "issue_override_recorded"
  | "human_escalation_required"
  | "invalid_decision";

export type ReviewDecisionEffectArtifactStatus =
  | "open"
  | "decided";

export type ReviewDecisionEffectPlanV0 = {
  effectPlanVersion: "content-kitchen-review-decision-effect-plan-v0";
  valid: boolean;
  effect: ReviewDecisionEffect;
  publishAllowed: false;
  artifactStatus: ReviewDecisionEffectArtifactStatus;
  nextRequiredAction: RequiredAction;
  overriddenIssueCodes: ContentKitchenIssueCode[];
  remainingIssueCodes: ContentKitchenIssueCode[];
  notes: string[];
  decisionValidation: ReviewDecisionValidationResult;
};

export type ReviewQueueDraftPriority =
  | "normal"
  | "high_priority";

export type ReviewQueueDraftReason =
  | "model_review_required"
  | "human_review_required"
  | "decision_escalated_to_human"
  | "remaining_issue_review_required";

export type ReviewQueueDraftV0 = {
  queueDraftVersion: "content-kitchen-review-queue-draft-v0";
  draftId: string;
  draftOnly: true;
  persistenceStatus: "not_persisted";
  queueName: "content-kitchen-review";
  artifactId: string;
  puzzleId: string;
  candidateRevisionId: string;
  route: ReviewRoute;
  routeReason: string;
  priority: ReviewQueueDraftPriority;
  reason: ReviewQueueDraftReason;
  issueCodes: ContentKitchenIssueCode[];
  recommendedAction: RequiredAction;
  effect?: ReviewDecisionEffect;
  effectPlanVersion?: "content-kitchen-review-decision-effect-plan-v0";
  effectPlanValid?: boolean;
  publishAllowed: false;
  publicUrl?: string;
  renderedPreviewUrl?: string;
  createdAt: string;
  lines: string[];
};
