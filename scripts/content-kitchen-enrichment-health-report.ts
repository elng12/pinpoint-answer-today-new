import type { EnrichmentQueueSkipReason } from "../lib/puzzles/content-kitchen/enrichment-job";
import type { ContentKitchenIssueCode } from "../lib/puzzles/content-kitchen/types";
import type { AnswerFirstEnrichmentWorkerActionDrafts } from "./content-kitchen-enrichment-action-drafts";
import type { AnswerFirstEnrichmentWorkerRunSummary } from "./content-kitchen-enrichment-run-summary";

export const ENRICHMENT_WORKER_HEALTH_REPORT_VERSION =
  "content-kitchen-enrichment-worker-health-report-v0";

export type AnswerFirstEnrichmentWorkerHealthStatus =
  | "ok"
  | "needs_review"
  | "high_priority"
  | "blocked";

export type AnswerFirstEnrichmentWorkerHealthReport = {
  schemaVersion: typeof ENRICHMENT_WORKER_HEALTH_REPORT_VERSION;
  status: AnswerFirstEnrichmentWorkerHealthStatus;
  headline: string;
  recommendation: string;
  counts: {
    inputJobs: number;
    claimedJobs: number;
    skippedJobs: number;
    reviewRequiredJobs: number;
    deadLetterJobs: number;
    highPriorityJobs: number;
    notificationDrafts: number;
    reviewQueueDrafts: number;
  };
  jobIds: {
    claimed: string[];
    reviewRequired: string[];
    deadLetter: string[];
    highPriority: string[];
  };
  activeIssueCodes: ContentKitchenIssueCode[];
  skipReasons: Partial<Record<EnrichmentQueueSkipReason, number>>;
};

export type BuildAnswerFirstEnrichmentWorkerHealthReportInput = {
  runSummary: AnswerFirstEnrichmentWorkerRunSummary;
  actionDrafts: AnswerFirstEnrichmentWorkerActionDrafts;
};

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function buildStatus(
  input: BuildAnswerFirstEnrichmentWorkerHealthReportInput,
): AnswerFirstEnrichmentWorkerHealthStatus {
  const highPriorityDrafts =
    input.actionDrafts.notificationDrafts.some((draft) => draft.priority === "high_priority") ||
    input.actionDrafts.reviewQueueDrafts.some((draft) => draft.priority === "high_priority");

  if (input.runSummary.counts.highPriorityJobs > 0 || highPriorityDrafts) {
    return "high_priority";
  }

  if (
    input.runSummary.counts.deadLetterJobs > 0 ||
    (input.runSummary.bySkipReason.max_attempts_reached ?? 0) > 0
  ) {
    return "blocked";
  }

  if (
    input.runSummary.counts.reviewRequiredJobs > 0 ||
    input.actionDrafts.notificationDrafts.length > 0 ||
    input.actionDrafts.reviewQueueDrafts.length > 0
  ) {
    return "needs_review";
  }

  return "ok";
}

function recommendationFor(status: AnswerFirstEnrichmentWorkerHealthStatus): string {
  if (status === "high_priority") {
    return "Inspect high-priority action drafts before any future publish automation.";
  }

  if (status === "blocked") {
    return "Inspect dead-letter or max-attempt jobs before retrying the queue.";
  }

  if (status === "needs_review") {
    return "Inspect review queue drafts before allowing automatic enrichment to continue.";
  }

  return "No review action is needed for this dry run.";
}

function headlineFor(
  status: AnswerFirstEnrichmentWorkerHealthStatus,
  runSummary: AnswerFirstEnrichmentWorkerRunSummary,
): string {
  return `${status}: ${runSummary.headline}`;
}

export function buildAnswerFirstEnrichmentWorkerHealthReport(
  input: BuildAnswerFirstEnrichmentWorkerHealthReportInput,
): AnswerFirstEnrichmentWorkerHealthReport {
  const status = buildStatus(input);
  const highPriorityJobIds = uniqueSorted([
    ...input.actionDrafts.notificationDrafts
      .filter((draft) => draft.priority === "high_priority")
      .flatMap((draft) => draft.jobIds),
    ...input.actionDrafts.reviewQueueDrafts
      .filter((draft) => draft.priority === "high_priority")
      .map((draft) => draft.jobId),
  ]);

  return {
    schemaVersion: ENRICHMENT_WORKER_HEALTH_REPORT_VERSION,
    status,
    headline: headlineFor(status, input.runSummary),
    recommendation: recommendationFor(status),
    counts: {
      inputJobs: input.runSummary.counts.inputJobs,
      claimedJobs: input.runSummary.counts.claimedJobs,
      skippedJobs: input.runSummary.counts.skippedJobs,
      reviewRequiredJobs: input.runSummary.counts.reviewRequiredJobs,
      deadLetterJobs: input.runSummary.counts.deadLetterJobs,
      highPriorityJobs: input.runSummary.counts.highPriorityJobs,
      notificationDrafts: input.actionDrafts.notificationDrafts.length,
      reviewQueueDrafts: input.actionDrafts.reviewQueueDrafts.length,
    },
    jobIds: {
      claimed: [...input.runSummary.claimedJobIds],
      reviewRequired: [...input.runSummary.reviewRequiredJobIds],
      deadLetter: [...input.runSummary.deadLetterJobIds],
      highPriority: highPriorityJobIds,
    },
    activeIssueCodes: [...input.runSummary.activeIssueCodes],
    skipReasons: { ...input.runSummary.bySkipReason },
  };
}
