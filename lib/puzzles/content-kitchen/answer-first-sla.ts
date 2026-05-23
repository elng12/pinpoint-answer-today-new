import type {
  AnswerFirstSlaDecision,
  AnswerFirstSlaNotificationLevel,
  AnswerFirstSlaStatus,
  ContentKitchenIssueCode,
  ContentMode,
  SiteIndexHealthGuard,
  ValidationPolicies,
} from "./types";

export const DEFAULT_ANSWER_FIRST_SLA_CONFIG: SiteIndexHealthGuard = {
  maxIndexedAnswerFirstRatio: 0,
  targetFullAnalysisMinutes: 30,
  firstAlertAfterMinutes: 30,
  reviewAfterMinutes: 60,
  thinPageAutoNoindexAfterMinutes: 120,
  highPriorityAlertAfterHours: 6,
  autoNoindexIfOverSLA: true,
  excludeFromRecentIfNoindex: true,
  notificationChannel: "feishu",
};

export type EvaluateAnswerFirstSlaInput = {
  contentMode: ContentMode;
  answerFirstPublishedAt: string;
  now: string;
  hasSafeFullAnalysisUpgrade?: boolean;
  isIndexedAnswerFirst?: boolean;
  config?: Partial<SiteIndexHealthGuard>;
};

const KEEP_CURRENT_POLICIES: ValidationPolicies = {
  indexPolicy: "index",
  sitemapPolicy: "include",
  schemaPolicy: "article_only",
  internalLinkPolicy: "normal",
  requiredAction: "keep_current",
};

const ANSWER_FIRST_DEFAULT_POLICIES: ValidationPolicies = {
  indexPolicy: "noindex",
  sitemapPolicy: "exclude",
  schemaPolicy: "none",
  internalLinkPolicy: "hidden_from_recent",
  requiredAction: "enrich",
};

const ANSWER_FIRST_UPGRADE_POLICIES: ValidationPolicies = {
  indexPolicy: "noindex",
  sitemapPolicy: "exclude",
  schemaPolicy: "none",
  internalLinkPolicy: "deemphasized",
  requiredAction: "upgrade",
};

const ANSWER_FIRST_REVIEW_POLICIES: ValidationPolicies = {
  indexPolicy: "review_required",
  sitemapPolicy: "remove_on_next_build",
  schemaPolicy: "none",
  internalLinkPolicy: "hidden_from_recent",
  requiredAction: "review",
};

const INDEXED_ANSWER_FIRST_DEGRADE_POLICIES: ValidationPolicies = {
  indexPolicy: "noindex",
  sitemapPolicy: "exclude",
  schemaPolicy: "none",
  internalLinkPolicy: "hidden_from_recent",
  requiredAction: "degrade",
  degradationActions: ["apply_noindex", "remove_from_sitemap", "hide_from_recent"],
};

function parseTimestamp(value: string, fieldPath: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${fieldPath} must be a valid timestamp`);
  }
  return timestamp;
}

function addMinutes(timestamp: number, minutes: number): number {
  return timestamp + minutes * 60_000;
}

function toIso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function notificationLevel(
  status: AnswerFirstSlaStatus,
  config: SiteIndexHealthGuard,
): AnswerFirstSlaNotificationLevel {
  if (config.notificationChannel === "none") {
    return "none";
  }

  if (status === "high_priority_alert_due") {
    return "high_priority";
  }

  if (status === "normal_alert_due") {
    return "normal";
  }

  return "none";
}

function buildDecision(input: {
  status: AnswerFirstSlaStatus;
  publishedAt: number;
  now: number;
  config: SiteIndexHealthGuard;
  issueCodes: ContentKitchenIssueCode[];
  policies: ValidationPolicies;
}): AnswerFirstSlaDecision {
  const highPriorityMinutes = input.config.highPriorityAlertAfterHours * 60;

  return {
    status: input.status,
    elapsedMinutes: Math.max(0, Math.floor((input.now - input.publishedAt) / 60_000)),
    targetFullAnalysisAt: toIso(addMinutes(input.publishedAt, input.config.targetFullAnalysisMinutes)),
    firstAlertAt: toIso(addMinutes(input.publishedAt, input.config.firstAlertAfterMinutes)),
    reviewRequiredAt: toIso(addMinutes(input.publishedAt, input.config.reviewAfterMinutes)),
    thinPageNoindexAt: toIso(addMinutes(input.publishedAt, input.config.thinPageAutoNoindexAfterMinutes)),
    highPriorityAlertAt: toIso(addMinutes(input.publishedAt, highPriorityMinutes)),
    notificationLevel: notificationLevel(input.status, input.config),
    issueCodes: input.issueCodes,
    policies: input.policies,
  };
}

export function evaluateAnswerFirstSla(input: EvaluateAnswerFirstSlaInput): AnswerFirstSlaDecision {
  const config: SiteIndexHealthGuard = {
    ...DEFAULT_ANSWER_FIRST_SLA_CONFIG,
    ...input.config,
  };
  const publishedAt = parseTimestamp(input.answerFirstPublishedAt, "answerFirstPublishedAt");
  const now = parseTimestamp(input.now, "now");
  const targetAt = addMinutes(publishedAt, config.targetFullAnalysisMinutes);
  const firstAlertAt = addMinutes(publishedAt, config.firstAlertAfterMinutes);
  const reviewAt = addMinutes(publishedAt, config.reviewAfterMinutes);
  const thinNoindexAt = addMinutes(publishedAt, config.thinPageAutoNoindexAfterMinutes);
  const highPriorityAt = addMinutes(publishedAt, config.highPriorityAlertAfterHours * 60);

  if (input.contentMode !== "answer-first") {
    return buildDecision({
      status: "not_applicable",
      publishedAt,
      now,
      config,
      issueCodes: [],
      policies: KEEP_CURRENT_POLICIES,
    });
  }

  if (input.hasSafeFullAnalysisUpgrade) {
    return buildDecision({
      status: "upgrade_ready",
      publishedAt,
      now,
      config,
      issueCodes: [],
      policies: ANSWER_FIRST_UPGRADE_POLICIES,
    });
  }

  const issueCodes: ContentKitchenIssueCode[] = [];
  if (now >= targetAt) {
    issueCodes.push("ANSWER_FIRST_OVER_SLA");
  }

  const staleIndexedAnswerFirst =
    Boolean(input.isIndexedAnswerFirst) &&
    config.autoNoindexIfOverSLA &&
    now >= thinNoindexAt;
  if (staleIndexedAnswerFirst) {
    issueCodes.push("INDEXED_ANSWER_FIRST_STALE");
  }

  if (now >= reviewAt) {
    issueCodes.push("ANSWER_FIRST_REVIEW_REQUIRED");
  }

  if (now >= highPriorityAt) {
    issueCodes.push("ANSWER_FIRST_HIGH_PRIORITY_ALERT");
  }

  if (now >= highPriorityAt) {
    return buildDecision({
      status: "high_priority_alert_due",
      publishedAt,
      now,
      config,
      issueCodes,
      policies: staleIndexedAnswerFirst ? INDEXED_ANSWER_FIRST_DEGRADE_POLICIES : ANSWER_FIRST_REVIEW_POLICIES,
    });
  }

  if (staleIndexedAnswerFirst) {
    return buildDecision({
      status: "thin_page_noindex_required",
      publishedAt,
      now,
      config,
      issueCodes,
      policies: INDEXED_ANSWER_FIRST_DEGRADE_POLICIES,
    });
  }

  if (now >= reviewAt) {
    return buildDecision({
      status: "review_required",
      publishedAt,
      now,
      config,
      issueCodes,
      policies: ANSWER_FIRST_REVIEW_POLICIES,
    });
  }

  if (now >= firstAlertAt) {
    return buildDecision({
      status: "normal_alert_due",
      publishedAt,
      now,
      config,
      issueCodes,
      policies: ANSWER_FIRST_DEFAULT_POLICIES,
    });
  }

  return buildDecision({
    status: "within_sla",
    publishedAt,
    now,
    config,
    issueCodes,
    policies: ANSWER_FIRST_DEFAULT_POLICIES,
  });
}
