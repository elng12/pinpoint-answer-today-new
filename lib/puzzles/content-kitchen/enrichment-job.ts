import { DEFAULT_ANSWER_FIRST_SLA_CONFIG } from "./answer-first-sla";
import { normalizeIdentityMatch, normalizeIdentityText } from "./identity";
import type {
  AnswerFirstEnrichmentJob,
  ContentKitchenIssueCode,
  EnrichmentJobState,
  SiteIndexHealthGuard,
} from "./types";

export type CreateAnswerFirstEnrichmentJobInput = {
  puzzleId: string;
  sourceRevisionId: string;
  targetRevision: string;
  inputSnapshotHash: string;
  answerFirstPublishedAt: string;
  now: string;
  maxAttempts?: number;
  backoffStrategy?: AnswerFirstEnrichmentJob["backoffStrategy"];
  config?: Partial<SiteIndexHealthGuard>;
};

export type CanApplyEnrichmentJobResultInput = {
  job: AnswerFirstEnrichmentJob;
  currentPublishedRevisionId: string;
  currentInputSnapshotHash: string;
  resultTargetRevision: string;
};

export type ClaimAnswerFirstEnrichmentJobInput = {
  job: AnswerFirstEnrichmentJob;
  workerId: string;
  now: string;
  lockMinutes?: number;
};

export type FailAnswerFirstEnrichmentJobInput = {
  job: AnswerFirstEnrichmentJob;
  now: string;
  failureReasonCodes: ContentKitchenIssueCode[];
};

export type CompleteAnswerFirstEnrichmentJobInput = {
  job: AnswerFirstEnrichmentJob;
  now: string;
};

export type EnrichmentQueueSkipReason =
  | "not_due"
  | "lock_active"
  | "max_attempts_reached"
  | "terminal_state"
  | "over_limit";

export type ScanAnswerFirstEnrichmentQueueInput = {
  jobs: AnswerFirstEnrichmentJob[];
  now: string;
  limit?: number;
};

export type ScanAnswerFirstEnrichmentQueueResult = {
  runnableJobs: AnswerFirstEnrichmentJob[];
  skippedJobs: Array<{
    job: AnswerFirstEnrichmentJob;
    reason: EnrichmentQueueSkipReason;
  }>;
};

const ACTIVE_ENRICHMENT_JOB_STATES = new Set<EnrichmentJobState>([
  "queued",
  "running",
  "review_required",
]);
const DEFAULT_ENRICHMENT_LOCK_MINUTES = 15;
const BASE_RETRY_DELAY_MINUTES = 5;
const MAX_RETRY_DELAY_MINUTES = 60;

function parseTimestamp(value: string, fieldPath: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${fieldPath} must be a valid timestamp`);
  }
  return timestamp;
}

function addMinutes(timestamp: number, minutes: number): string {
  return new Date(timestamp + minutes * 60_000).toISOString();
}

function addMinutesNumber(timestamp: number, minutes: number): number {
  return timestamp + minutes * 60_000;
}

function safeId(value: string): string {
  return normalizeIdentityMatch(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function requireText(value: string, fieldPath: string): string {
  const normalized = normalizeIdentityText(value);
  if (!normalized) {
    throw new Error(`${fieldPath} is required`);
  }
  return normalized;
}

function clearLock(job: AnswerFirstEnrichmentJob): AnswerFirstEnrichmentJob {
  const { lockedBy: _lockedBy, lockedUntil: _lockedUntil, ...rest } = job;
  return rest;
}

function mergeFailureReasonCodes(
  existing: ContentKitchenIssueCode[],
  incoming: ContentKitchenIssueCode[],
): ContentKitchenIssueCode[] {
  return [...new Set([...existing, ...incoming])];
}

export function calculateEnrichmentRetryDelayMinutes(
  job: Pick<AnswerFirstEnrichmentJob, "attemptCount" | "backoffStrategy">,
): number {
  if (job.backoffStrategy === "fixed") {
    return BASE_RETRY_DELAY_MINUTES;
  }

  return Math.min(
    MAX_RETRY_DELAY_MINUTES,
    BASE_RETRY_DELAY_MINUTES * 2 ** Math.max(0, job.attemptCount - 1),
  );
}

export function buildEnrichmentJobIdempotencyKey(input: Pick<
  CreateAnswerFirstEnrichmentJobInput,
  "puzzleId" | "targetRevision"
>): string {
  return `content-kitchen:answer-first-enrichment:${safeId(input.puzzleId)}:${safeId(input.targetRevision)}`;
}

export function createAnswerFirstEnrichmentJob(
  input: CreateAnswerFirstEnrichmentJobInput,
): AnswerFirstEnrichmentJob {
  const puzzleId = requireText(input.puzzleId, "puzzleId");
  const sourceRevisionId = requireText(input.sourceRevisionId, "sourceRevisionId");
  const targetRevision = requireText(input.targetRevision, "targetRevision");
  const inputSnapshotHash = requireText(input.inputSnapshotHash, "inputSnapshotHash");
  const createdAt = new Date(parseTimestamp(input.now, "now")).toISOString();
  const publishedAt = parseTimestamp(input.answerFirstPublishedAt, "answerFirstPublishedAt");
  const config: SiteIndexHealthGuard = {
    ...DEFAULT_ANSWER_FIRST_SLA_CONFIG,
    ...input.config,
  };
  const highPriorityMinutes = config.highPriorityAlertAfterHours * 60;
  const targetFullAnalysisAt = addMinutes(publishedAt, config.targetFullAnalysisMinutes);
  const idempotencyKey = buildEnrichmentJobIdempotencyKey({ puzzleId, targetRevision });

  return {
    jobVersion: "answer-first-enrichment-job-v0",
    jobId: `job-${safeId(puzzleId)}-${safeId(targetRevision)}`,
    idempotencyKey,
    puzzleId,
    sourceRevisionId,
    targetRevision,
    inputSnapshotHash,
    state: "queued",
    createdAt,
    updatedAt: createdAt,
    nextAttemptAt: createdAt,
    attemptCount: 0,
    maxAttempts: input.maxAttempts ?? 3,
    backoffStrategy: input.backoffStrategy ?? "exponential",
    deadlineAt: targetFullAnalysisAt,
    targetFullAnalysisAt,
    firstAlertAt: addMinutes(publishedAt, config.firstAlertAfterMinutes),
    reviewRequiredAt: addMinutes(publishedAt, config.reviewAfterMinutes),
    thinPageNoindexAt: addMinutes(publishedAt, config.thinPageAutoNoindexAfterMinutes),
    highPriorityAlertAt: addMinutes(publishedAt, highPriorityMinutes),
    failureReasonCodes: [],
  };
}

export function isActiveEnrichmentJob(job: Pick<AnswerFirstEnrichmentJob, "state">): boolean {
  return ACTIVE_ENRICHMENT_JOB_STATES.has(job.state);
}

export function isEnrichmentJobLockExpired(
  job: Pick<AnswerFirstEnrichmentJob, "lockedUntil">,
  now: string,
): boolean {
  if (!job.lockedUntil) {
    return true;
  }

  return parseTimestamp(job.lockedUntil, "lockedUntil") <= parseTimestamp(now, "now");
}

export function canClaimAnswerFirstEnrichmentJob(
  job: AnswerFirstEnrichmentJob,
  now: string,
): boolean {
  return getEnrichmentQueueSkipReason(job, now) === null;
}

export function claimAnswerFirstEnrichmentJob(
  input: ClaimAnswerFirstEnrichmentJobInput,
): AnswerFirstEnrichmentJob | null {
  if (!canClaimAnswerFirstEnrichmentJob(input.job, input.now)) {
    return null;
  }

  const now = parseTimestamp(input.now, "now");
  const workerId = requireText(input.workerId, "workerId");
  const lockMinutes = input.lockMinutes ?? DEFAULT_ENRICHMENT_LOCK_MINUTES;

  return {
    ...input.job,
    state: "running",
    updatedAt: new Date(now).toISOString(),
    nextAttemptAt: new Date(now).toISOString(),
    attemptCount: input.job.attemptCount + 1,
    lockedBy: workerId,
    lockedUntil: new Date(addMinutesNumber(now, lockMinutes)).toISOString(),
  };
}

export function failAnswerFirstEnrichmentJob(
  input: FailAnswerFirstEnrichmentJobInput,
): AnswerFirstEnrichmentJob {
  const now = parseTimestamp(input.now, "now");
  const failed = {
    ...clearLock(input.job),
    updatedAt: new Date(now).toISOString(),
    failureReasonCodes: mergeFailureReasonCodes(input.job.failureReasonCodes, input.failureReasonCodes),
  };

  if (input.job.attemptCount >= input.job.maxAttempts) {
    return {
      ...failed,
      state: "dead_letter",
      nextAttemptAt: new Date(now).toISOString(),
      deadLetterAt: new Date(now).toISOString(),
    };
  }

  const delayMinutes = calculateEnrichmentRetryDelayMinutes(input.job);
  return {
    ...failed,
    state: "queued",
    nextAttemptAt: new Date(addMinutesNumber(now, delayMinutes)).toISOString(),
  };
}

export function completeAnswerFirstEnrichmentJob(
  input: CompleteAnswerFirstEnrichmentJobInput,
): AnswerFirstEnrichmentJob {
  const now = new Date(parseTimestamp(input.now, "now")).toISOString();
  return {
    ...clearLock(input.job),
    state: "completed",
    updatedAt: now,
    nextAttemptAt: now,
  };
}

export function getEnrichmentQueueSkipReason(
  job: AnswerFirstEnrichmentJob,
  now: string,
): EnrichmentQueueSkipReason | null {
  if (job.state === "completed" || job.state === "dead_letter" || job.state === "review_required") {
    return "terminal_state";
  }

  if (job.attemptCount >= job.maxAttempts) {
    return "max_attempts_reached";
  }

  if (job.state === "queued") {
    return parseTimestamp(job.nextAttemptAt, "nextAttemptAt") <= parseTimestamp(now, "now") ? null : "not_due";
  }

  if (job.state === "running") {
    return isEnrichmentJobLockExpired(job, now) ? null : "lock_active";
  }

  return "terminal_state";
}

export function scanAnswerFirstEnrichmentQueue(
  input: ScanAnswerFirstEnrichmentQueueInput,
): ScanAnswerFirstEnrichmentQueueResult {
  const runnableJobs: AnswerFirstEnrichmentJob[] = [];
  const skippedJobs: ScanAnswerFirstEnrichmentQueueResult["skippedJobs"] = [];
  const limit = input.limit ?? input.jobs.length;

  for (const job of input.jobs) {
    const reason = getEnrichmentQueueSkipReason(job, input.now);
    if (!reason && runnableJobs.length < limit) {
      runnableJobs.push(job);
      continue;
    }

    skippedJobs.push({
      job,
      reason: reason ?? "over_limit",
    });
  }

  return {
    runnableJobs,
    skippedJobs,
  };
}

export function findActiveEnrichmentJobForTarget(
  jobs: Pick<AnswerFirstEnrichmentJob, "puzzleId" | "targetRevision" | "state">[],
  target: Pick<AnswerFirstEnrichmentJob, "puzzleId" | "targetRevision">,
): Pick<AnswerFirstEnrichmentJob, "puzzleId" | "targetRevision" | "state"> | undefined {
  const puzzleId = normalizeIdentityMatch(target.puzzleId);
  const targetRevision = normalizeIdentityMatch(target.targetRevision);

  return jobs.find((job) => {
    return (
      isActiveEnrichmentJob(job) &&
      normalizeIdentityMatch(job.puzzleId) === puzzleId &&
      normalizeIdentityMatch(job.targetRevision) === targetRevision
    );
  });
}

export function canApplyEnrichmentJobResult(input: CanApplyEnrichmentJobResultInput): boolean {
  return (
    input.job.state === "running" &&
    normalizeIdentityText(input.currentPublishedRevisionId) === normalizeIdentityText(input.job.sourceRevisionId) &&
    normalizeIdentityText(input.currentInputSnapshotHash) === normalizeIdentityText(input.job.inputSnapshotHash) &&
    normalizeIdentityText(input.resultTargetRevision) === normalizeIdentityText(input.job.targetRevision)
  );
}
