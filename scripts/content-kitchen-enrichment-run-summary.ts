import type {
  EnrichmentJobStateAdvanceTransition,
  EnrichmentQueueSkipReason,
} from "../lib/puzzles/content-kitchen/enrichment-job";
import type {
  AnswerFirstEnrichmentJob,
  ContentKitchenIssueCode,
  EnrichmentJobState,
} from "../lib/puzzles/content-kitchen/types";

export const ENRICHMENT_WORKER_RUN_SUMMARY_VERSION =
  "content-kitchen-enrichment-worker-run-summary-v0";

export type AnswerFirstEnrichmentWorkerRunSummaryInput = {
  now: string;
  workerId: string;
  inputJobs: number;
  outputJobs: AnswerFirstEnrichmentJob[];
  claimedJobs: AnswerFirstEnrichmentJob[];
  skippedJobs: Array<{
    job: AnswerFirstEnrichmentJob;
    reason: EnrichmentQueueSkipReason;
  }>;
  stateAdvancements: Array<{
    job: AnswerFirstEnrichmentJob;
    transition: EnrichmentJobStateAdvanceTransition;
    issueCodesAdded: ContentKitchenIssueCode[];
  }>;
};

export type AnswerFirstEnrichmentWorkerRunSummary = {
  schemaVersion: typeof ENRICHMENT_WORKER_RUN_SUMMARY_VERSION;
  headline: string;
  lines: string[];
  counts: {
    inputJobs: number;
    outputJobs: number;
    claimedJobs: number;
    skippedJobs: number;
    stateChanges: number;
    reviewRequiredJobs: number;
    deadLetterJobs: number;
    overSlaJobs: number;
    highPriorityJobs: number;
  };
  byOutputState: Partial<Record<EnrichmentJobState, number>>;
  bySkipReason: Partial<Record<EnrichmentQueueSkipReason, number>>;
  byTransition: Partial<Record<EnrichmentJobStateAdvanceTransition, number>>;
  claimedJobIds: string[];
  reviewRequiredJobIds: string[];
  deadLetterJobIds: string[];
  issueCodesAdded: ContentKitchenIssueCode[];
  activeIssueCodes: ContentKitchenIssueCode[];
};

function increment<T extends string>(counts: Partial<Record<T, number>>, key: T) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort();
}

function plural(count: number, singular: string, pluralValue = `${singular}s`): string {
  return count === 1 ? singular : pluralValue;
}

function summarizeIds(ids: string[]): string {
  if (ids.length === 0) {
    return "none";
  }

  return ids.join(", ");
}

function summarizeCounts<T extends string>(counts: Partial<Record<T, number>>): string {
  const entries = Object.entries(counts)
    .filter((entry): entry is [T, number] => typeof entry[1] === "number")
    .sort(([left], [right]) => left.localeCompare(right));

  if (entries.length === 0) {
    return "none";
  }

  return entries.map(([key, count]) => `${key}=${count}`).join(", ");
}

export function buildAnswerFirstEnrichmentWorkerRunSummary(
  input: AnswerFirstEnrichmentWorkerRunSummaryInput,
): AnswerFirstEnrichmentWorkerRunSummary {
  const byOutputState: Partial<Record<EnrichmentJobState, number>> = {};
  const bySkipReason: Partial<Record<EnrichmentQueueSkipReason, number>> = {};
  const byTransition: Partial<Record<EnrichmentJobStateAdvanceTransition, number>> = {};

  for (const job of input.outputJobs) {
    increment(byOutputState, job.state);
  }

  for (const entry of input.skippedJobs) {
    increment(bySkipReason, entry.reason);
  }

  for (const entry of input.stateAdvancements) {
    increment(byTransition, entry.transition);
  }

  const claimedJobIds = input.claimedJobs.map((job) => job.jobId);
  const reviewRequiredJobIds = input.outputJobs
    .filter((job) => job.state === "review_required")
    .map((job) => job.jobId);
  const deadLetterJobIds = input.outputJobs
    .filter((job) => job.state === "dead_letter")
    .map((job) => job.jobId);
  const overSlaJobs = input.outputJobs.filter((job) => job.failureReasonCodes.includes("ANSWER_FIRST_OVER_SLA"));
  const highPriorityJobs = input.outputJobs.filter((job) =>
    job.failureReasonCodes.includes("ANSWER_FIRST_HIGH_PRIORITY_ALERT"),
  );
  const stateChanges = input.stateAdvancements.filter((entry) => entry.transition !== "unchanged").length;
  const issueCodesAdded = uniqueSorted(input.stateAdvancements.flatMap((entry) => entry.issueCodesAdded));
  const activeIssueCodes = uniqueSorted(input.outputJobs.flatMap((job) => job.failureReasonCodes));

  const headline = [
    `${input.workerId} @ ${input.now}`,
    `${input.claimedJobs.length} ${plural(input.claimedJobs.length, "claimed job")}`,
    `${input.skippedJobs.length} ${plural(input.skippedJobs.length, "skipped job")}`,
    `${stateChanges} state ${plural(stateChanges, "change")}`,
    `${reviewRequiredJobIds.length} review`,
    `${deadLetterJobIds.length} dead-letter`,
  ].join("; ");

  return {
    schemaVersion: ENRICHMENT_WORKER_RUN_SUMMARY_VERSION,
    headline,
    lines: [
      `Claimed: ${summarizeIds(claimedJobIds)}`,
      `Skipped: ${summarizeCounts(bySkipReason)}`,
      `State changes: ${summarizeCounts(byTransition)}`,
      `Review required: ${summarizeIds(reviewRequiredJobIds)}`,
      `Dead letter: ${summarizeIds(deadLetterJobIds)}`,
      `Active issue codes: ${summarizeIds(activeIssueCodes)}`,
    ],
    counts: {
      inputJobs: input.inputJobs,
      outputJobs: input.outputJobs.length,
      claimedJobs: input.claimedJobs.length,
      skippedJobs: input.skippedJobs.length,
      stateChanges,
      reviewRequiredJobs: reviewRequiredJobIds.length,
      deadLetterJobs: deadLetterJobIds.length,
      overSlaJobs: overSlaJobs.length,
      highPriorityJobs: highPriorityJobs.length,
    },
    byOutputState,
    bySkipReason,
    byTransition,
    claimedJobIds,
    reviewRequiredJobIds,
    deadLetterJobIds,
    issueCodesAdded,
    activeIssueCodes,
  };
}
