import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createInMemoryAnswerFirstEnrichmentJobStore,
  runAnswerFirstEnrichmentWorkerTickFromStore,
} from "../lib/puzzles/content-kitchen/enrichment-job-store";
import type { AnswerFirstEnrichmentJob } from "../lib/puzzles/content-kitchen/types";

export const ENRICHMENT_WORKER_DRY_RUN_INPUT_VERSION = "content-kitchen-enrichment-worker-dry-run-v0";
export const ENRICHMENT_WORKER_DRY_RUN_RESULT_VERSION = "content-kitchen-enrichment-worker-dry-run-result-v0";

export type AnswerFirstEnrichmentWorkerDryRunInput = {
  schemaVersion?: typeof ENRICHMENT_WORKER_DRY_RUN_INPUT_VERSION;
  jobs: AnswerFirstEnrichmentJob[];
  now: string;
  workerId: string;
  limit?: number;
  lockMinutes?: number;
};

export type AnswerFirstEnrichmentWorkerDryRunJobSummary = Pick<
  AnswerFirstEnrichmentJob,
  | "jobId"
  | "puzzleId"
  | "targetRevision"
  | "state"
  | "attemptCount"
  | "nextAttemptAt"
  | "failureReasonCodes"
> & {
  lockedBy?: string;
  lockedUntil?: string;
};

export type AnswerFirstEnrichmentWorkerDryRunResult = {
  schemaVersion: typeof ENRICHMENT_WORKER_DRY_RUN_RESULT_VERSION;
  dryRun: true;
  now: string;
  workerId: string;
  summary: {
    inputJobs: number;
    outputJobs: number;
    claimedJobs: number;
    skippedJobs: number;
    stateAdvancements: number;
  };
  claimedJobs: AnswerFirstEnrichmentWorkerDryRunJobSummary[];
  skippedJobs: Array<{
    job: AnswerFirstEnrichmentWorkerDryRunJobSummary;
    reason: string;
  }>;
  stateAdvancements: Array<{
    job: AnswerFirstEnrichmentWorkerDryRunJobSummary;
    transition: string;
    issueCodesAdded: string[];
  }>;
  outputJobs: AnswerFirstEnrichmentJob[];
};

type ParsedArgs = {
  inputPath: string;
  pretty: boolean;
};

function requireObject(value: unknown, fieldPath: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldPath} must be an object`);
  }

  return value as Record<string, unknown>;
}

function readRequiredText(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} must be a non-empty string`);
  }

  return value;
}

function readOptionalInteger(record: Record<string, unknown>, key: string, minimum: number): number | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum) {
    throw new Error(`${key} must be an integer greater than or equal to ${minimum}`);
  }

  return value;
}

function parseDryRunInput(value: unknown): AnswerFirstEnrichmentWorkerDryRunInput {
  const record = requireObject(value, "input");
  const schemaVersion = record.schemaVersion;
  if (schemaVersion !== undefined && schemaVersion !== ENRICHMENT_WORKER_DRY_RUN_INPUT_VERSION) {
    throw new Error(`schemaVersion must be ${ENRICHMENT_WORKER_DRY_RUN_INPUT_VERSION}`);
  }

  if (!Array.isArray(record.jobs)) {
    throw new Error("jobs must be an array");
  }

  const now = readRequiredText(record, "now");
  if (!Number.isFinite(Date.parse(now))) {
    throw new Error("now must be a valid timestamp");
  }

  return {
    schemaVersion: schemaVersion as typeof ENRICHMENT_WORKER_DRY_RUN_INPUT_VERSION | undefined,
    jobs: record.jobs as AnswerFirstEnrichmentJob[],
    now,
    workerId: readRequiredText(record, "workerId"),
    limit: readOptionalInteger(record, "limit", 0),
    lockMinutes: readOptionalInteger(record, "lockMinutes", 1),
  };
}

function summarizeJob(job: AnswerFirstEnrichmentJob): AnswerFirstEnrichmentWorkerDryRunJobSummary {
  return {
    jobId: job.jobId,
    puzzleId: job.puzzleId,
    targetRevision: job.targetRevision,
    state: job.state,
    attemptCount: job.attemptCount,
    nextAttemptAt: job.nextAttemptAt,
    lockedBy: job.lockedBy,
    lockedUntil: job.lockedUntil,
    failureReasonCodes: [...job.failureReasonCodes],
  };
}

export async function runAnswerFirstEnrichmentWorkerJsonDryRun(
  input: AnswerFirstEnrichmentWorkerDryRunInput,
): Promise<AnswerFirstEnrichmentWorkerDryRunResult> {
  const store = createInMemoryAnswerFirstEnrichmentJobStore(input.jobs);
  const tick = await runAnswerFirstEnrichmentWorkerTickFromStore({
    store,
    now: input.now,
    workerId: input.workerId,
    limit: input.limit,
    lockMinutes: input.lockMinutes,
  });
  const outputJobs = store.snapshot();

  return {
    schemaVersion: ENRICHMENT_WORKER_DRY_RUN_RESULT_VERSION,
    dryRun: true,
    now: input.now,
    workerId: input.workerId,
    summary: {
      inputJobs: input.jobs.length,
      outputJobs: outputJobs.length,
      claimedJobs: tick.claimedJobs.length,
      skippedJobs: tick.skippedJobs.length,
      stateAdvancements: tick.stateAdvancements.filter((result) => result.transition !== "unchanged").length,
    },
    claimedJobs: tick.claimedJobs.map(summarizeJob),
    skippedJobs: tick.skippedJobs.map((entry) => ({
      job: summarizeJob(entry.job),
      reason: entry.reason,
    })),
    stateAdvancements: tick.stateAdvancements.map((result) => ({
      job: summarizeJob(result.job),
      transition: result.transition,
      issueCodesAdded: [...result.issueCodesAdded],
    })),
    outputJobs,
  };
}

function parseArgs(argv: string[]): ParsedArgs {
  let inputPath = "";
  let pretty = true;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      inputPath = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg === "--compact") {
      pretty = false;
      continue;
    }

    if (arg === "--pretty") {
      pretty = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new Error(
        "Usage: npm run content-kitchen:enrichment-dry-run -- --input <path> [--pretty|--compact]",
      );
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!inputPath) {
    throw new Error("Missing required --input <path>");
  }

  return {
    inputPath: resolve(inputPath),
    pretty,
  };
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const raw = await readFile(args.inputPath, "utf8");
  const input = parseDryRunInput(JSON.parse(raw));
  const result = await runAnswerFirstEnrichmentWorkerJsonDryRun(input);
  console.log(JSON.stringify(result, null, args.pretty ? 2 : 0));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
