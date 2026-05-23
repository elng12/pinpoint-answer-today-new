import { DEFAULT_ANSWER_FIRST_SLA_CONFIG } from "./answer-first-sla";
import { normalizeIdentityMatch, normalizeIdentityText } from "./identity";
import type {
  AnswerFirstEnrichmentJob,
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

const ACTIVE_ENRICHMENT_JOB_STATES = new Set<EnrichmentJobState>([
  "queued",
  "running",
  "review_required",
]);

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
