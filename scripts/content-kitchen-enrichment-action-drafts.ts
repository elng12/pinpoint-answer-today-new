import type { AnswerFirstEnrichmentWorkerRunSummary } from "./content-kitchen-enrichment-run-summary";
import type {
  AnswerFirstEnrichmentJob,
  ContentKitchenIssueCode,
  EnrichmentJobState,
} from "../lib/puzzles/content-kitchen/types";

export const ENRICHMENT_WORKER_ACTION_DRAFTS_VERSION =
  "content-kitchen-enrichment-worker-action-drafts-v0";

export type AnswerFirstEnrichmentWorkerNotificationDraft = {
  draftVersion: typeof ENRICHMENT_WORKER_ACTION_DRAFTS_VERSION;
  draftId: string;
  draftOnly: true;
  dispatchStatus: "not_sent";
  channel: "feishu";
  priority: "normal" | "high_priority";
  reason: "answer_first_sla_alert" | "answer_first_high_priority_alert";
  title: string;
  lines: string[];
  jobIds: string[];
  puzzleIds: string[];
  issueCodes: ContentKitchenIssueCode[];
  dedupeKey: string;
};

export type AnswerFirstEnrichmentWorkerReviewQueueDraft = {
  draftVersion: typeof ENRICHMENT_WORKER_ACTION_DRAFTS_VERSION;
  draftId: string;
  draftOnly: true;
  persistenceStatus: "not_persisted";
  queueName: "content-kitchen-review";
  priority: "normal" | "high_priority";
  reason: "answer_first_review_required" | "answer_first_dead_letter";
  jobId: string;
  puzzleId: string;
  sourceRevisionId: string;
  targetRevision: string;
  inputSnapshotHash: string;
  state: Extract<EnrichmentJobState, "review_required" | "dead_letter">;
  issueCodes: ContentKitchenIssueCode[];
  recommendedAction: "review";
  createdAt: string;
  deadlineAt: string;
  reviewRequiredAt: string;
  highPriorityAlertAt: string;
};

export type AnswerFirstEnrichmentWorkerActionDrafts = {
  schemaVersion: typeof ENRICHMENT_WORKER_ACTION_DRAFTS_VERSION;
  dryRunOnly: true;
  createdAt: string;
  workerId: string;
  notificationDrafts: AnswerFirstEnrichmentWorkerNotificationDraft[];
  reviewQueueDrafts: AnswerFirstEnrichmentWorkerReviewQueueDraft[];
};

export type BuildAnswerFirstEnrichmentWorkerActionDraftsInput = {
  now: string;
  workerId: string;
  runSummary: AnswerFirstEnrichmentWorkerRunSummary;
  outputJobs: AnswerFirstEnrichmentJob[];
};

function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort();
}

function hasIssue(job: AnswerFirstEnrichmentJob, issueCode: ContentKitchenIssueCode): boolean {
  return job.failureReasonCodes.includes(issueCode);
}

function summarizeJobIds(jobs: AnswerFirstEnrichmentJob[]): string {
  if (jobs.length === 0) {
    return "none";
  }

  return jobs.map((job) => job.jobId).join(", ");
}

function buildNotificationDraft(input: {
  now: string;
  workerId: string;
  priority: AnswerFirstEnrichmentWorkerNotificationDraft["priority"];
  jobs: AnswerFirstEnrichmentJob[];
  runSummary: AnswerFirstEnrichmentWorkerRunSummary;
}): AnswerFirstEnrichmentWorkerNotificationDraft {
  const issueCodes = uniqueSorted(input.jobs.flatMap((job) => job.failureReasonCodes));
  const reason =
    input.priority === "high_priority" ? "answer_first_high_priority_alert" : "answer_first_sla_alert";
  const title =
    input.priority === "high_priority"
      ? "Content Kitchen high-priority enrichment alert"
      : "Content Kitchen enrichment SLA alert";

  return {
    draftVersion: ENRICHMENT_WORKER_ACTION_DRAFTS_VERSION,
    draftId: `notification:${input.priority}:${input.workerId}:${input.now}`,
    draftOnly: true,
    dispatchStatus: "not_sent",
    channel: "feishu",
    priority: input.priority,
    reason,
    title,
    lines: [
      input.runSummary.headline,
      `Jobs: ${summarizeJobIds(input.jobs)}`,
      `Issue codes: ${issueCodes.length > 0 ? issueCodes.join(", ") : "none"}`,
      "Dry run only: not sent to Feishu.",
    ],
    jobIds: input.jobs.map((job) => job.jobId),
    puzzleIds: uniqueSorted(input.jobs.map((job) => job.puzzleId)),
    issueCodes,
    dedupeKey: `content-kitchen:${input.priority}:${input.jobs.map((job) => job.jobId).join("|")}`,
  };
}

function buildReviewQueueDraft(
  job: AnswerFirstEnrichmentJob,
  now: string,
): AnswerFirstEnrichmentWorkerReviewQueueDraft | null {
  if (job.state !== "review_required" && job.state !== "dead_letter") {
    return null;
  }

  const priority =
    job.state === "dead_letter" || hasIssue(job, "ANSWER_FIRST_HIGH_PRIORITY_ALERT")
      ? "high_priority"
      : "normal";

  return {
    draftVersion: ENRICHMENT_WORKER_ACTION_DRAFTS_VERSION,
    draftId: `review:${job.jobId}:${job.state}`,
    draftOnly: true,
    persistenceStatus: "not_persisted",
    queueName: "content-kitchen-review",
    priority,
    reason: job.state === "dead_letter" ? "answer_first_dead_letter" : "answer_first_review_required",
    jobId: job.jobId,
    puzzleId: job.puzzleId,
    sourceRevisionId: job.sourceRevisionId,
    targetRevision: job.targetRevision,
    inputSnapshotHash: job.inputSnapshotHash,
    state: job.state,
    issueCodes: [...job.failureReasonCodes],
    recommendedAction: "review",
    createdAt: now,
    deadlineAt: job.deadlineAt,
    reviewRequiredAt: job.reviewRequiredAt,
    highPriorityAlertAt: job.highPriorityAlertAt,
  };
}

export function buildAnswerFirstEnrichmentWorkerActionDrafts(
  input: BuildAnswerFirstEnrichmentWorkerActionDraftsInput,
): AnswerFirstEnrichmentWorkerActionDrafts {
  const highPriorityJobs = input.outputJobs.filter((job) => hasIssue(job, "ANSWER_FIRST_HIGH_PRIORITY_ALERT"));
  const normalAlertJobs = input.outputJobs.filter((job) => {
    if (hasIssue(job, "ANSWER_FIRST_HIGH_PRIORITY_ALERT")) {
      return false;
    }

    return hasIssue(job, "ANSWER_FIRST_OVER_SLA") || hasIssue(job, "ANSWER_FIRST_REVIEW_REQUIRED");
  });

  const notificationDrafts: AnswerFirstEnrichmentWorkerNotificationDraft[] = [];
  if (normalAlertJobs.length > 0) {
    notificationDrafts.push(buildNotificationDraft({
      now: input.now,
      workerId: input.workerId,
      priority: "normal",
      jobs: normalAlertJobs,
      runSummary: input.runSummary,
    }));
  }
  if (highPriorityJobs.length > 0) {
    notificationDrafts.push(buildNotificationDraft({
      now: input.now,
      workerId: input.workerId,
      priority: "high_priority",
      jobs: highPriorityJobs,
      runSummary: input.runSummary,
    }));
  }

  return {
    schemaVersion: ENRICHMENT_WORKER_ACTION_DRAFTS_VERSION,
    dryRunOnly: true,
    createdAt: input.now,
    workerId: input.workerId,
    notificationDrafts,
    reviewQueueDrafts: input.outputJobs.flatMap((job) => {
      const draft = buildReviewQueueDraft(job, input.now);
      return draft ? [draft] : [];
    }),
  };
}
