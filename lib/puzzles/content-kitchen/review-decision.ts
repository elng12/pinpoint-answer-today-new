import { getIssueDefinition } from "./issue-registry";
import type {
  ContentKitchenIssueCode,
  ReviewArtifactV0,
  ReviewDecisionV0,
  ReviewDecisionEffectPlanV0,
  ReviewDecisionValidationResult,
  ReviewNotificationDraftV0,
  ReviewQueueDraftReason,
  ReviewQueueDraftV0,
  ReviewUiActionButtonV0,
  ReviewUiInputV0,
  ReviewUiIssueGroupV0,
  ReviewUiPuzzleSnapshotV0,
  ReviewRouteResult,
} from "./types";

export const REVIEW_DECISION_VERSION = "content-kitchen-review-decision-v0";
export const REVIEW_DECISION_EFFECT_PLAN_VERSION = "content-kitchen-review-decision-effect-plan-v0";
export const REVIEW_QUEUE_DRAFT_VERSION = "content-kitchen-review-queue-draft-v0";
export const REVIEW_NOTIFICATION_DRAFT_VERSION = "content-kitchen-review-notification-draft-v0";
export const REVIEW_UI_INPUT_VERSION = "content-kitchen-review-ui-input-v0";
export const MODEL_REVIEW_MIN_CONFIDENCE = 0.75;

const HARD_RULE_AUTO_REJECT_ISSUES = new Set<ContentKitchenIssueCode>([
  "MISSING_L1_INPUT",
  "INVALID_L1_INPUT",
  "INVALID_CANDIDATE_METADATA",
  "CANDIDATE_L1_MISMATCH",
  "CANONICAL_URL_MISMATCH",
  "NOINDEX_REQUIRED_BUT_MISSING",
  "MISSING_CLUE_ROW",
  "DUPLICATE_CLUE_ROW",
  "MISSING_EVIDENCE_REF",
  "MISSING_REASONING_PATTERN",
  "UNSUPPORTED_REASONING_PATTERN",
  "FAQ_SCHEMA_WITHOUT_VISIBLE_FAQ",
  "INVALID_FAQ_STRUCTURE",
]);

const MODEL_REVIEW_ISSUES = new Set<ContentKitchenIssueCode>([
  "GENERIC_REASONING_PATTERN",
  "WEAK_FIT_EVIDENCE",
  "L4_ONLY_EVIDENCE",
  "FULL_ANALYSIS_WITH_LOW_CONFIDENCE",
  "INTERNAL_LINK_BROKEN",
  "INDEXED_ANSWER_FIRST_STALE",
]);

const HUMAN_REVIEW_ISSUES = new Set<ContentKitchenIssueCode>([
  "ANSWER_HIDDEN_FROM_RENDERED_HTML",
  "FULL_ANALYSIS_STRUCTURE_NOT_VALIDATED",
  "UNSUPPORTED_CLUE_FIT",
  "PROHIBITED_EVIDENCE_SOURCE",
  "EVIDENCE_SOURCE_CONFLICT",
  "ANSWER_FIRST_OVER_SLA",
  "ANSWER_FIRST_REVIEW_REQUIRED",
  "ANSWER_FIRST_HIGH_PRIORITY_ALERT",
]);

function uniqueIssueCodes(issueCodes: ContentKitchenIssueCode[]): ContentKitchenIssueCode[] {
  return [...new Set(issueCodes)];
}

function registeredIssueCodes(artifact: ReviewArtifactV0): ContentKitchenIssueCode[] {
  const issueCodes = uniqueIssueCodes([
    ...artifact.validation.issueCodes,
    ...artifact.issueCodesRequiringDecision,
  ]);

  for (const issueCode of issueCodes) {
    getIssueDefinition(issueCode);
  }

  return issueCodes;
}

function partitionIssueCodes(issueCodes: ContentKitchenIssueCode[]) {
  const hardRuleIssueCodes = issueCodes.filter((issueCode) => HARD_RULE_AUTO_REJECT_ISSUES.has(issueCode));
  const modelReviewIssueCodes = issueCodes.filter((issueCode) => MODEL_REVIEW_ISSUES.has(issueCode));
  const humanReviewIssueCodes = issueCodes.filter((issueCode) => HUMAN_REVIEW_ISSUES.has(issueCode));

  return {
    hardRuleIssueCodes,
    modelReviewIssueCodes,
    humanReviewIssueCodes,
  };
}

export function deriveReviewRoute(
  artifact: ReviewArtifactV0,
  options: {
    modelConfidence?: number;
    modelConfidenceThreshold?: number;
  } = {},
): ReviewRouteResult {
  const issueCodes = registeredIssueCodes(artifact);
  const {
    hardRuleIssueCodes,
    modelReviewIssueCodes,
    humanReviewIssueCodes,
  } = partitionIssueCodes(issueCodes);
  const threshold = options.modelConfidenceThreshold ?? MODEL_REVIEW_MIN_CONFIDENCE;

  if (issueCodes.length === 0) {
    return {
      route: "auto_approve",
      reason: "no_review_issues",
      issueCodes,
      hardRuleIssueCodes,
      modelReviewIssueCodes,
      humanReviewIssueCodes,
    };
  }

  if (artifact.validation.outcome === "block_publish" || hardRuleIssueCodes.length > 0) {
    return {
      route: "auto_reject",
      reason: "hard_rule_failure",
      issueCodes,
      hardRuleIssueCodes,
      modelReviewIssueCodes,
      humanReviewIssueCodes,
    };
  }

  if (options.modelConfidence !== undefined && options.modelConfidence < threshold) {
    return {
      route: "human_review",
      reason: "model_low_confidence",
      issueCodes,
      hardRuleIssueCodes,
      modelReviewIssueCodes,
      humanReviewIssueCodes,
    };
  }

  if (humanReviewIssueCodes.length > 0) {
    return {
      route: "human_review",
      reason: "human_review_required_issue",
      issueCodes,
      hardRuleIssueCodes,
      modelReviewIssueCodes,
      humanReviewIssueCodes,
    };
  }

  if (modelReviewIssueCodes.length === issueCodes.length) {
    return {
      route: "model_review",
      reason: "soft_quality_review",
      issueCodes,
      hardRuleIssueCodes,
      modelReviewIssueCodes,
      humanReviewIssueCodes,
    };
  }

  return {
    route: "human_review",
    reason: "unclassified_review_issue",
    issueCodes,
    hardRuleIssueCodes,
    modelReviewIssueCodes,
    humanReviewIssueCodes,
  };
}

function nonEmptyText(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidIsoTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export function validateReviewDecision(input: {
  artifact: ReviewArtifactV0;
  decision: ReviewDecisionV0;
  modelConfidenceThreshold?: number;
}): ReviewDecisionValidationResult {
  const { artifact, decision } = input;
  const derivedRoute = deriveReviewRoute(artifact, {
    modelConfidence: decision.reviewerType === "model" ? decision.confidence : undefined,
    modelConfidenceThreshold: input.modelConfidenceThreshold,
  });
  const errors: string[] = [];
  const artifactIssueCodes = new Set(artifact.validation.issueCodes);

  if (decision.decisionVersion !== REVIEW_DECISION_VERSION) {
    errors.push("decisionVersion is unsupported");
  }
  if (!nonEmptyText(decision.artifactId)) {
    errors.push("artifactId is required");
  } else if (decision.artifactId !== artifact.artifactId) {
    errors.push("artifactId must match the review artifact");
  }
  if (!nonEmptyText(artifact.puzzleId)) {
    errors.push("artifact puzzleId is required");
  } else if (!nonEmptyText(decision.puzzleId)) {
    errors.push("puzzleId is required");
  } else if (decision.puzzleId !== artifact.puzzleId) {
    errors.push("puzzleId must match the review artifact");
  }
  if (!nonEmptyText(artifact.candidateRevisionId)) {
    errors.push("artifact candidateRevisionId is required");
  } else if (!nonEmptyText(decision.candidateRevisionId)) {
    errors.push("candidateRevisionId is required");
  } else if (decision.candidateRevisionId !== artifact.candidateRevisionId) {
    errors.push("candidateRevisionId must match the review artifact");
  }
  if (decision.route !== derivedRoute.route) {
    errors.push(`route must be ${derivedRoute.route}`);
  }
  if (!nonEmptyText(decision.reviewerId)) {
    errors.push("reviewerId is required");
  }
  if (!nonEmptyText(decision.note)) {
    errors.push("note is required");
  }
  if (!nonEmptyText(decision.reviewedAt) || !isValidIsoTimestamp(decision.reviewedAt)) {
    errors.push("reviewedAt must be a valid timestamp");
  }
  if (
    decision.confidence !== undefined &&
    (!Number.isFinite(decision.confidence) || decision.confidence < 0 || decision.confidence > 1)
  ) {
    errors.push("confidence must be between 0 and 1");
  }

  if (artifactIssueCodes.size > 0 && decision.issueCodes.length === 0) {
    errors.push("issueCodes are required when the artifact has issues");
  }
  for (const issueCode of decision.issueCodes) {
    getIssueDefinition(issueCode);
    if (!artifactIssueCodes.has(issueCode)) {
      errors.push(`issueCodes contains ${issueCode}, which is not in the review artifact`);
    }
  }

  if (decision.reviewerType === "rule_engine") {
    if (derivedRoute.route === "auto_approve" && decision.action !== "approve") {
      errors.push("rule_engine can only approve auto_approve routes");
    }
    if (derivedRoute.route === "auto_reject" && decision.action !== "reject") {
      errors.push("rule_engine can only reject auto_reject routes");
    }
    if (derivedRoute.route !== "auto_approve" && derivedRoute.route !== "auto_reject") {
      errors.push("rule_engine cannot decide model_review or human_review routes");
    }
  }

  if (decision.reviewerType === "model") {
    if (!nonEmptyText(decision.modelName)) {
      errors.push("modelName is required for model decisions");
    }
    if (!nonEmptyText(decision.modelVersion)) {
      errors.push("modelVersion is required for model decisions");
    }
    if (decision.confidence === undefined) {
      errors.push("confidence is required for model decisions");
    }
    if (decision.action === "override_issue") {
      errors.push("model reviewers cannot override issues");
    }
    if (decision.action === "force_answer_first") {
      errors.push("model reviewers cannot force answer-first");
    }
    if (derivedRoute.route === "human_review" && decision.action !== "escalate_to_human") {
      errors.push("low-confidence or high-risk model decisions must escalate to human");
    }
    if (derivedRoute.route === "auto_reject" && decision.action !== "escalate_to_human") {
      errors.push("model reviewers cannot approve or reject hard-rule failures");
    }
  }

  if (decision.reviewerType === "human" && decision.action === "override_issue" && decision.issueCodes.length === 0) {
    errors.push("human override decisions must name at least one issue code");
  }

  if (decision.action === "override_issue" && decision.reviewerType !== "human") {
    errors.push("only human reviewers can override issues");
  }

  return {
    valid: errors.length === 0,
    errors,
    derivedRoute,
  };
}

function remainingIssueCodesAfterOverride(artifact: ReviewArtifactV0, decision: ReviewDecisionV0): ContentKitchenIssueCode[] {
  const overriddenIssueCodes = new Set(decision.issueCodes);
  return artifact.validation.issueCodes.filter((issueCode) => !overriddenIssueCodes.has(issueCode));
}

function safeQueueIdPart(value: string | undefined): string {
  const normalized = value?.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized && normalized.length > 0 ? normalized : "unknown";
}

function reviewQueuePriority(issueCodes: ContentKitchenIssueCode[]): ReviewQueueDraftV0["priority"] {
  return issueCodes.includes("ANSWER_FIRST_HIGH_PRIORITY_ALERT") ? "high_priority" : "normal";
}

function maxIssueSeverity(issueCodes: ContentKitchenIssueCode[]): ReviewNotificationDraftV0["issueSeverity"] {
  const severities = issueCodes.map((issueCode) => getIssueDefinition(issueCode).defaultSeverity);

  if (severities.includes("P0")) {
    return "P0";
  }
  if (severities.includes("P1")) {
    return "P1";
  }

  return "P2";
}

function logicalDateFromPuzzleId(puzzleId: string): string | undefined {
  return puzzleId.match(/\d{4}-\d{2}-\d{2}$/)?.[0];
}

function puzzleNumberFromPuzzleId(puzzleId: string): number | undefined {
  const parsed = Number(puzzleId.match(/pinpoint-(\d+)/)?.[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function reviewQueueReason(input: {
  route: ReviewRouteResult;
  effectPlan?: ReviewDecisionEffectPlanV0;
}): ReviewQueueDraftReason | null {
  if (input.effectPlan) {
    if (input.effectPlan.effect === "human_escalation_required") {
      return "decision_escalated_to_human";
    }

    if (
      input.effectPlan.valid &&
      input.effectPlan.artifactStatus === "open" &&
      input.effectPlan.remainingIssueCodes.length > 0
    ) {
      return "remaining_issue_review_required";
    }

    return null;
  }

  if (input.route.route === "model_review") {
    return "model_review_required";
  }

  if (input.route.route === "human_review") {
    return "human_review_required";
  }

  return null;
}

function reviewQueueRecommendedAction(input: {
  artifact: ReviewArtifactV0;
  effectPlan?: ReviewDecisionEffectPlanV0;
}): ReviewQueueDraftV0["recommendedAction"] {
  if (!input.effectPlan) {
    return input.artifact.recommendedAction;
  }

  if (input.effectPlan.nextRequiredAction === "none") {
    return input.artifact.recommendedAction;
  }

  return input.effectPlan.nextRequiredAction;
}

export function buildReviewQueueDraft(input: {
  artifact: ReviewArtifactV0;
  route?: ReviewRouteResult;
  effectPlan?: ReviewDecisionEffectPlanV0;
  createdAt?: string;
}): ReviewQueueDraftV0 | null {
  const route = input.route ?? input.effectPlan?.decisionValidation.derivedRoute ?? deriveReviewRoute(input.artifact);
  const reason = reviewQueueReason({ route, effectPlan: input.effectPlan });

  if (!reason) {
    return null;
  }

  const issueCodes =
    input.effectPlan && input.effectPlan.remainingIssueCodes.length > 0
      ? input.effectPlan.remainingIssueCodes
      : route.issueCodes;
  const createdAt = input.createdAt ?? new Date().toISOString();
  const artifactId = input.artifact.artifactId;
  const puzzleId = input.artifact.puzzleId ?? "unknown";
  const candidateRevisionId = input.artifact.candidateRevisionId ?? "unknown";
  const recommendedAction = reviewQueueRecommendedAction({
    artifact: input.artifact,
    effectPlan: input.effectPlan,
  });

  return {
    queueDraftVersion: REVIEW_QUEUE_DRAFT_VERSION,
    draftId: `review-queue:${safeQueueIdPart(artifactId)}:${safeQueueIdPart(candidateRevisionId)}:${route.route}`,
    draftOnly: true,
    persistenceStatus: "not_persisted",
    queueName: "content-kitchen-review",
    artifactId,
    puzzleId,
    candidateRevisionId,
    route: route.route,
    routeReason: route.reason,
    priority: reviewQueuePriority(issueCodes),
    reason,
    issueCodes: [...issueCodes],
    recommendedAction,
    ...(input.effectPlan
      ? {
        effect: input.effectPlan.effect,
        effectPlanVersion: input.effectPlan.effectPlanVersion,
        effectPlanValid: input.effectPlan.valid,
      }
      : {}),
    publishAllowed: false,
    ...(input.artifact.canonicalUrl ? { publicUrl: input.artifact.canonicalUrl } : {}),
    ...(input.artifact.renderedPreviewUrl ? { renderedPreviewUrl: input.artifact.renderedPreviewUrl } : {}),
    createdAt,
    lines: [
      `Artifact: ${artifactId}`,
      `Puzzle: ${puzzleId}`,
      `Revision: ${candidateRevisionId}`,
      `Route: ${route.route} (${route.reason})`,
      `Priority: ${reviewQueuePriority(issueCodes)}`,
      `Issue codes: ${issueCodes.length > 0 ? issueCodes.join(", ") : "none"}`,
      `Recommended action: ${recommendedAction}`,
      "Draft only: not written to review queue storage.",
      "Publish allowed: false.",
    ],
  };
}

export function buildReviewNotificationDraft(input: {
  artifact: ReviewArtifactV0;
  queueDraft: ReviewQueueDraftV0;
  reviewUrl?: string;
  createdAt?: string;
}): ReviewNotificationDraftV0 {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const title =
    input.queueDraft.priority === "high_priority"
      ? "Content Kitchen high-priority review alert"
      : "Content Kitchen review alert";
  const issueSeverity = maxIssueSeverity(input.queueDraft.issueCodes);
  const logicalDate = logicalDateFromPuzzleId(input.queueDraft.puzzleId);
  const lines = [
    title,
    `Artifact: ${input.queueDraft.artifactId}`,
    `Puzzle: ${input.queueDraft.puzzleId}`,
    `Logical date: ${logicalDate ?? "unknown"}`,
    `Mode: ${input.artifact.contentMode ?? "unknown"}`,
    `Severity: ${issueSeverity}`,
    `Route: ${input.queueDraft.route} (${input.queueDraft.routeReason})`,
    `Priority: ${input.queueDraft.priority}`,
    `Issue codes: ${input.queueDraft.issueCodes.length > 0 ? input.queueDraft.issueCodes.join(", ") : "none"}`,
    `Recommended action: ${input.queueDraft.recommendedAction}`,
    `Public URL: ${input.queueDraft.publicUrl ?? "unavailable"}`,
    `Review URL: ${input.reviewUrl ?? "unavailable"}`,
    "Draft only: not sent to Feishu.",
  ];

  return {
    notificationDraftVersion: REVIEW_NOTIFICATION_DRAFT_VERSION,
    draftId: `feishu:${safeQueueIdPart(input.queueDraft.draftId)}`,
    draftOnly: true,
    dispatchStatus: "not_sent",
    channel: "feishu",
    priority: input.queueDraft.priority,
    reason: input.queueDraft.reason,
    title,
    artifactId: input.queueDraft.artifactId,
    puzzleId: input.queueDraft.puzzleId,
    candidateRevisionId: input.queueDraft.candidateRevisionId,
    ...(input.artifact.contentMode ? { contentMode: input.artifact.contentMode } : {}),
    ...(logicalDate ? { logicalDate } : {}),
    issueSeverity,
    route: input.queueDraft.route,
    issueCodes: [...input.queueDraft.issueCodes],
    recommendedAction: input.queueDraft.recommendedAction,
    ...(input.queueDraft.publicUrl ? { publicUrl: input.queueDraft.publicUrl } : {}),
    ...(input.reviewUrl ? { reviewUrl: input.reviewUrl } : {}),
    dedupeKey: [
      "content-kitchen",
      "review-notification",
      input.queueDraft.priority,
      input.queueDraft.artifactId,
      input.queueDraft.candidateRevisionId,
      input.queueDraft.reason,
    ].join(":"),
    createdAt,
    lines,
    payload: {
      msg_type: "text",
      content: {
        text: lines.join("\n"),
      },
    },
  };
}

function issueGroupsForUi(artifact: ReviewArtifactV0): ReviewUiIssueGroupV0[] {
  const severities = ["P0", "P1", "P2"] as const;

  return severities.flatMap((severity) => {
    const issues = artifact.validation.issues.filter((issue) => issue.severity === severity);
    if (issues.length === 0) {
      return [];
    }

    return [{
      severity,
      issueCodes: [...new Set(issues.map((issue) => issue.issueCode))],
      issues,
    }];
  });
}

function actionButtonsForUi(artifact: ReviewArtifactV0, queueDraft: ReviewQueueDraftV0): ReviewUiActionButtonV0[] {
  const allowed = new Set(artifact.allowedReviewerActions);
  const isHumanReview = queueDraft.route === "human_review";

  return [
    {
      action: "approve",
      enabled: allowed.has("approve_candidate") || allowed.has("approve_downgrade"),
      reason: "Allowed when the artifact permits candidate or downgrade approval.",
    },
    {
      action: "reject",
      enabled: allowed.has("reject_candidate"),
      reason: "Allowed when the artifact permits candidate rejection.",
    },
    {
      action: "request_regeneration",
      enabled: allowed.has("request_full_analysis_fix") || queueDraft.recommendedAction === "enrich",
      reason: "Allowed when full-analysis repair or enrichment is the next local action.",
    },
    {
      action: "force_answer_first",
      enabled: isHumanReview && artifact.contentMode === "full-analysis",
      reason: "Only human review can request answer-first fallback for a full-analysis candidate.",
    },
    {
      action: "override_issue",
      enabled: isHumanReview && queueDraft.issueCodes.length > 0,
      reason: "Only human review can override specific issue codes on this artifact.",
    },
    {
      action: "add_human_note",
      enabled: isHumanReview || queueDraft.route === "model_review",
      reason: "Reviewers can add notes while an artifact remains in review.",
    },
  ];
}

function puzzleSnapshotForUi(input: {
  artifact: ReviewArtifactV0;
  puzzleSnapshot?: Omit<ReviewUiPuzzleSnapshotV0, "snapshotStatus" | "clueCount">;
}): ReviewUiPuzzleSnapshotV0 {
  const puzzleId = input.puzzleSnapshot?.puzzleId ?? input.artifact.puzzleId ?? "unknown";
  const clues = input.puzzleSnapshot?.clues ?? [];

  return {
    snapshotStatus: input.puzzleSnapshot ? "provided" : "missing",
    puzzleId,
    ...(input.puzzleSnapshot?.puzzleNumber ?? puzzleNumberFromPuzzleId(puzzleId)
      ? { puzzleNumber: input.puzzleSnapshot?.puzzleNumber ?? puzzleNumberFromPuzzleId(puzzleId) }
      : {}),
    ...(input.puzzleSnapshot?.logicalDate ?? logicalDateFromPuzzleId(puzzleId)
      ? { logicalDate: input.puzzleSnapshot?.logicalDate ?? logicalDateFromPuzzleId(puzzleId) }
      : {}),
    ...(input.puzzleSnapshot?.answer ? { answer: input.puzzleSnapshot.answer } : {}),
    clues: [...clues],
    clueCount: clues.length,
  };
}

export function buildReviewUiInput(input: {
  artifact: ReviewArtifactV0;
  queueDraft: ReviewQueueDraftV0;
  route?: ReviewRouteResult;
  notificationDraft?: ReviewNotificationDraftV0;
  effectPlan?: ReviewDecisionEffectPlanV0;
  puzzleSnapshot?: Omit<ReviewUiPuzzleSnapshotV0, "snapshotStatus" | "clueCount">;
  reviewUrl?: string;
  createdAt?: string;
}): ReviewUiInputV0 {
  const route = input.route ?? input.effectPlan?.decisionValidation.derivedRoute ?? deriveReviewRoute(input.artifact);
  const createdAt = input.createdAt ?? new Date().toISOString();

  return {
    reviewUiInputVersion: REVIEW_UI_INPUT_VERSION,
    inputId: `review-ui:${safeQueueIdPart(input.queueDraft.draftId)}`,
    localOnly: true,
    renderStatus: "not_rendered",
    createdAt,
    artifact: {
      artifactId: input.artifact.artifactId,
      artifactType: input.artifact.artifactType,
      artifactCreatedAt: input.artifact.createdAt,
    },
    puzzle: puzzleSnapshotForUi({
      artifact: input.artifact,
      puzzleSnapshot: input.puzzleSnapshot,
    }),
    revisions: {
      ...(input.artifact.contentMode ? { candidateAttemptedMode: input.artifact.contentMode } : {}),
      ...(input.artifact.publishedRevisionId ? { publishedRevisionId: input.artifact.publishedRevisionId } : {}),
      candidateRevisionId: input.queueDraft.candidateRevisionId,
    },
    validation: {
      outcome: input.artifact.validation.outcome,
      policies: input.artifact.validation.policies,
      issueCodes: [...input.artifact.validation.issueCodes],
      issueGroups: issueGroupsForUi(input.artifact),
    },
    route,
    queueDraft: input.queueDraft,
    ...(input.notificationDraft ? { notificationDraft: input.notificationDraft } : {}),
    ...(input.effectPlan ? { effectPlan: input.effectPlan } : {}),
    ...(input.artifact.evidenceSummary ? { evidenceSummary: input.artifact.evidenceSummary } : {}),
    ...(input.artifact.canonicalUrl ? { publicUrl: input.artifact.canonicalUrl } : {}),
    ...(input.artifact.renderedPreviewUrl ? { renderedPreviewUrl: input.artifact.renderedPreviewUrl } : {}),
    ...(input.reviewUrl ? { reviewUrl: input.reviewUrl } : {}),
    recommendedAction: input.queueDraft.recommendedAction,
    allowedActions: actionButtonsForUi(input.artifact, input.queueDraft),
    safety: {
      rawRenderedHtmlIncluded: false,
      modelPromptIncluded: false,
      secretsIncluded: false,
      publishAllowed: false,
    },
  };
}

export function buildReviewDecisionEffectPlan(input: {
  artifact: ReviewArtifactV0;
  decision: ReviewDecisionV0;
  modelConfidenceThreshold?: number;
}): ReviewDecisionEffectPlanV0 {
  const decisionValidation = validateReviewDecision(input);
  if (!decisionValidation.valid) {
    return {
      effectPlanVersion: REVIEW_DECISION_EFFECT_PLAN_VERSION,
      valid: false,
      effect: "invalid_decision",
      publishAllowed: false,
      artifactStatus: "open",
      nextRequiredAction: "review",
      overriddenIssueCodes: [],
      remainingIssueCodes: [...input.artifact.validation.issueCodes],
      notes: [
        "Decision is invalid; no downstream action is allowed.",
        ...decisionValidation.errors,
      ],
      decisionValidation,
    };
  }

  if (input.decision.action === "approve") {
    return {
      effectPlanVersion: REVIEW_DECISION_EFFECT_PLAN_VERSION,
      valid: true,
      effect: "approved",
      publishAllowed: false,
      artifactStatus: "decided",
      nextRequiredAction: "none",
      overriddenIssueCodes: [],
      remainingIssueCodes: [],
      notes: [
        "Review decision approves this candidate revision.",
        "PR10 v0 never publishes content; downstream publish gates must still run.",
      ],
      decisionValidation,
    };
  }

  if (input.decision.action === "reject") {
    return {
      effectPlanVersion: REVIEW_DECISION_EFFECT_PLAN_VERSION,
      valid: true,
      effect: "rejected",
      publishAllowed: false,
      artifactStatus: "decided",
      nextRequiredAction: "block_publish",
      overriddenIssueCodes: [],
      remainingIssueCodes: [...input.artifact.validation.issueCodes],
      notes: [
        "Review decision rejects this candidate revision.",
        "The same candidate revision must not publish without a new review decision.",
      ],
      decisionValidation,
    };
  }

  if (input.decision.action === "request_regeneration") {
    return {
      effectPlanVersion: REVIEW_DECISION_EFFECT_PLAN_VERSION,
      valid: true,
      effect: "regeneration_requested",
      publishAllowed: false,
      artifactStatus: "decided",
      nextRequiredAction: "enrich",
      overriddenIssueCodes: [],
      remainingIssueCodes: [...input.artifact.validation.issueCodes],
      notes: [
        "Review decision requests a regenerated candidate.",
        "The current candidate revision remains unpublished.",
      ],
      decisionValidation,
    };
  }

  if (input.decision.action === "force_answer_first") {
    return {
      effectPlanVersion: REVIEW_DECISION_EFFECT_PLAN_VERSION,
      valid: true,
      effect: "answer_first_forced",
      publishAllowed: false,
      artifactStatus: "decided",
      nextRequiredAction: "degrade",
      overriddenIssueCodes: [],
      remainingIssueCodes: [...input.artifact.validation.issueCodes],
      notes: [
        "Review decision requests answer-first fallback.",
        "PR10 v0 records the requested effect only; it does not change production rendering.",
      ],
      decisionValidation,
    };
  }

  if (input.decision.action === "override_issue") {
    const remainingIssueCodes = remainingIssueCodesAfterOverride(input.artifact, input.decision);
    return {
      effectPlanVersion: REVIEW_DECISION_EFFECT_PLAN_VERSION,
      valid: true,
      effect: "issue_override_recorded",
      publishAllowed: false,
      artifactStatus: remainingIssueCodes.length > 0 ? "open" : "decided",
      nextRequiredAction: remainingIssueCodes.length > 0 ? "review" : "none",
      overriddenIssueCodes: [...input.decision.issueCodes],
      remainingIssueCodes,
      notes: [
        "Human override is scoped to the named issue codes on this artifact only.",
        "PR10 v0 records the override; it does not publish content.",
      ],
      decisionValidation,
    };
  }

  return {
    effectPlanVersion: REVIEW_DECISION_EFFECT_PLAN_VERSION,
    valid: true,
    effect: "human_escalation_required",
    publishAllowed: false,
    artifactStatus: "open",
    nextRequiredAction: "review",
    overriddenIssueCodes: [],
    remainingIssueCodes: [...input.artifact.validation.issueCodes],
    notes: [
      "Decision escalates this artifact to human review.",
      "No publish, regeneration, downgrade, or override action is applied in PR10 v0.",
    ],
    decisionValidation,
  };
}
