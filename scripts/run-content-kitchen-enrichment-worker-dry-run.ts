import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createInMemoryAnswerFirstEnrichmentJobStore,
  runAnswerFirstEnrichmentWorkerTickFromStore,
} from "../lib/puzzles/content-kitchen/enrichment-job-store";
import type { AnswerFirstEnrichmentJob } from "../lib/puzzles/content-kitchen/types";
import {
  ENRICHMENT_WORKER_FILE_STORE_OUTPUT_VERSION,
  createJsonFileAnswerFirstEnrichmentJobStore,
} from "./content-kitchen-enrichment-file-store";
import {
  buildAnswerFirstEnrichmentWorkerActionDrafts,
  type AnswerFirstEnrichmentWorkerActionDrafts,
} from "./content-kitchen-enrichment-action-drafts";
import {
  buildAnswerFirstEnrichmentWorkerHealthReport,
  type AnswerFirstEnrichmentWorkerHealthReport,
} from "./content-kitchen-enrichment-health-report";
import {
  buildAnswerFirstEnrichmentWorkerRunSummary,
  type AnswerFirstEnrichmentWorkerRunSummary,
} from "./content-kitchen-enrichment-run-summary";

export const ENRICHMENT_WORKER_DRY_RUN_INPUT_VERSION = "content-kitchen-enrichment-worker-dry-run-v0";
export const ENRICHMENT_WORKER_DRY_RUN_RESULT_VERSION = "content-kitchen-enrichment-worker-dry-run-result-v0";

export type AnswerFirstEnrichmentWorkerDryRunInput = {
  schemaVersion?:
    | typeof ENRICHMENT_WORKER_DRY_RUN_INPUT_VERSION
    | typeof ENRICHMENT_WORKER_FILE_STORE_OUTPUT_VERSION;
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
  runSummary: AnswerFirstEnrichmentWorkerRunSummary;
  actionDrafts: AnswerFirstEnrichmentWorkerActionDrafts;
  healthReport: AnswerFirstEnrichmentWorkerHealthReport;
  outputPath?: string;
  actionOutputPath?: string;
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
  outputPath?: string;
  actionOutputPath?: string;
  now?: string;
  workerId?: string;
  limit?: number;
  lockMinutes?: number;
  pretty: boolean;
};

type DryRunInputOverrides = {
  now?: string;
  workerId?: string;
  limit?: number;
  lockMinutes?: number;
};

export type AnswerFirstEnrichmentWorkerActionDraftsFileOutput = AnswerFirstEnrichmentWorkerActionDrafts & {
  sourcePath: string;
  writtenAt: string;
};

function requireObject(value: unknown, fieldPath: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldPath} must be an object`);
  }

  return value as Record<string, unknown>;
}

function readOptionalText(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }

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

export function parseAnswerFirstEnrichmentWorkerDryRunInput(
  value: unknown,
  overrides: DryRunInputOverrides = {},
): AnswerFirstEnrichmentWorkerDryRunInput {
  const record = requireObject(value, "input");
  const schemaVersion = record.schemaVersion;
  if (
    schemaVersion !== undefined &&
    schemaVersion !== ENRICHMENT_WORKER_DRY_RUN_INPUT_VERSION &&
    schemaVersion !== ENRICHMENT_WORKER_FILE_STORE_OUTPUT_VERSION
  ) {
    throw new Error(
      `schemaVersion must be ${ENRICHMENT_WORKER_DRY_RUN_INPUT_VERSION} or ${ENRICHMENT_WORKER_FILE_STORE_OUTPUT_VERSION}`,
    );
  }

  if (!Array.isArray(record.jobs)) {
    throw new Error("jobs must be an array");
  }

  const now = overrides.now ?? readOptionalText(record, "now") ?? readOptionalText(record, "writtenAt");
  if (!now) {
    throw new Error("now must be provided in the input file, as writtenAt, or with --now");
  }
  if (!Number.isFinite(Date.parse(now))) {
    throw new Error("now must be a valid timestamp");
  }
  const workerId = overrides.workerId ?? readOptionalText(record, "workerId");
  if (!workerId) {
    throw new Error("workerId must be provided in the input file or with --worker-id");
  }

  return {
    schemaVersion: schemaVersion as AnswerFirstEnrichmentWorkerDryRunInput["schemaVersion"],
    jobs: record.jobs as AnswerFirstEnrichmentJob[],
    now,
    workerId,
    limit: overrides.limit ?? readOptionalInteger(record, "limit", 0),
    lockMinutes: overrides.lockMinutes ?? readOptionalInteger(record, "lockMinutes", 1),
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

  return buildDryRunResult({
    input,
    outputJobs,
    claimedJobs: tick.claimedJobs,
    skippedJobs: tick.skippedJobs,
    stateAdvancements: tick.stateAdvancements,
  });
}

type BuildDryRunResultInput = {
  input: AnswerFirstEnrichmentWorkerDryRunInput;
  outputJobs: AnswerFirstEnrichmentJob[];
  outputPath?: string;
  claimedJobs: Awaited<ReturnType<typeof runAnswerFirstEnrichmentWorkerTickFromStore>>["claimedJobs"];
  skippedJobs: Awaited<ReturnType<typeof runAnswerFirstEnrichmentWorkerTickFromStore>>["skippedJobs"];
  stateAdvancements: Awaited<ReturnType<typeof runAnswerFirstEnrichmentWorkerTickFromStore>>["stateAdvancements"];
};

function buildDryRunResult(input: BuildDryRunResultInput): AnswerFirstEnrichmentWorkerDryRunResult {
  const runSummary = buildAnswerFirstEnrichmentWorkerRunSummary({
    now: input.input.now,
    workerId: input.input.workerId,
    inputJobs: input.input.jobs.length,
    outputJobs: input.outputJobs,
    claimedJobs: input.claimedJobs,
    skippedJobs: input.skippedJobs,
    stateAdvancements: input.stateAdvancements,
  });
  const actionDrafts = buildAnswerFirstEnrichmentWorkerActionDrafts({
    now: input.input.now,
    workerId: input.input.workerId,
    runSummary,
    outputJobs: input.outputJobs,
  });

  return {
    schemaVersion: ENRICHMENT_WORKER_DRY_RUN_RESULT_VERSION,
    dryRun: true,
    now: input.input.now,
    workerId: input.input.workerId,
    summary: {
      inputJobs: input.input.jobs.length,
      outputJobs: input.outputJobs.length,
      claimedJobs: input.claimedJobs.length,
      skippedJobs: input.skippedJobs.length,
      stateAdvancements: input.stateAdvancements.filter((result) => result.transition !== "unchanged").length,
    },
    runSummary,
    actionDrafts,
    healthReport: buildAnswerFirstEnrichmentWorkerHealthReport({
      runSummary,
      actionDrafts,
    }),
    outputPath: input.outputPath,
    claimedJobs: input.claimedJobs.map(summarizeJob),
    skippedJobs: input.skippedJobs.map((entry) => ({
      job: summarizeJob(entry.job),
      reason: entry.reason,
    })),
    stateAdvancements: input.stateAdvancements.map((result) => ({
      job: summarizeJob(result.job),
      transition: result.transition,
      issueCodesAdded: [...result.issueCodesAdded],
    })),
    outputJobs: input.outputJobs,
  };
}

function parseArgs(argv: string[]): ParsedArgs {
  let inputPath = "";
  let outputPath: string | undefined;
  let actionOutputPath: string | undefined;
  let now: string | undefined;
  let workerId: string | undefined;
  let limit: number | undefined;
  let lockMinutes: number | undefined;
  let pretty = true;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      inputPath = readArgValue(argv, index, "--input");
      index += 1;
      continue;
    }

    if (arg === "--output") {
      outputPath = resolve(readArgValue(argv, index, "--output"));
      index += 1;
      continue;
    }

    if (arg === "--action-output") {
      actionOutputPath = resolve(readArgValue(argv, index, "--action-output"));
      index += 1;
      continue;
    }

    if (arg === "--now") {
      now = readArgValue(argv, index, "--now");
      index += 1;
      continue;
    }

    if (arg === "--worker-id") {
      workerId = readArgValue(argv, index, "--worker-id");
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      limit = parseIntegerArg(readArgValue(argv, index, "--limit"), "--limit", 0);
      index += 1;
      continue;
    }

    if (arg === "--lock-minutes") {
      lockMinutes = parseIntegerArg(readArgValue(argv, index, "--lock-minutes"), "--lock-minutes", 1);
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
        "Usage: npm run content-kitchen:enrichment-dry-run -- --input <path> [--output <path>] [--action-output <path>] [--now <timestamp>] [--worker-id <id>] [--limit <n>] [--lock-minutes <n>] [--pretty|--compact]",
      );
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!inputPath) {
    throw new Error("Missing required --input <path>");
  }

  const resolvedInputPath = resolve(inputPath);
  if (outputPath === resolvedInputPath) {
    throw new Error("--output must be different from --input");
  }
  if (actionOutputPath === resolvedInputPath) {
    throw new Error("--action-output must be different from --input");
  }
  if (actionOutputPath && outputPath === actionOutputPath) {
    throw new Error("--action-output must be different from --output");
  }

  return {
    inputPath: resolvedInputPath,
    outputPath,
    actionOutputPath,
    now,
    workerId,
    limit,
    lockMinutes,
    pretty,
  };
}

function readArgValue(argv: string[], index: number, name: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }

  return value;
}

function parseIntegerArg(value: string, name: string, minimum: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}`);
  }

  return parsed;
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const raw = await readFile(args.inputPath, "utf8");
  const input = parseAnswerFirstEnrichmentWorkerDryRunInput(JSON.parse(raw), {
    now: args.now,
    workerId: args.workerId,
    limit: args.limit,
    lockMinutes: args.lockMinutes,
  });
  const result = args.outputPath
    ? await runAnswerFirstEnrichmentWorkerJsonDryRunToFile({
      input,
      inputPath: args.inputPath,
      outputPath: args.outputPath,
      actionOutputPath: args.actionOutputPath,
    })
    : await runAnswerFirstEnrichmentWorkerJsonDryRun(input);
  const outputResult = args.actionOutputPath && !args.outputPath
    ? { ...result, actionOutputPath: args.actionOutputPath }
    : result;

  if (args.actionOutputPath && !args.outputPath) {
    await writeAnswerFirstEnrichmentWorkerActionDraftsFile({
      actionDrafts: result.actionDrafts,
      inputPath: args.inputPath,
      actionOutputPath: args.actionOutputPath,
      writtenAt: input.now,
    });
  }

  console.log(JSON.stringify(outputResult, null, args.pretty ? 2 : 0));
}

export async function runAnswerFirstEnrichmentWorkerJsonDryRunToFile(input: {
  input: AnswerFirstEnrichmentWorkerDryRunInput;
  inputPath: string;
  outputPath: string;
  actionOutputPath?: string;
}): Promise<AnswerFirstEnrichmentWorkerDryRunResult> {
  const store = createJsonFileAnswerFirstEnrichmentJobStore({
    inputPath: input.inputPath,
    outputPath: input.outputPath,
    writtenAt: input.input.now,
  });
  const tick = await runAnswerFirstEnrichmentWorkerTickFromStore({
    store,
    now: input.input.now,
    workerId: input.input.workerId,
    limit: input.input.limit,
    lockMinutes: input.input.lockMinutes,
  });

  const result = buildDryRunResult({
    input: input.input,
    outputPath: input.outputPath,
    outputJobs: tick.updatedJobs,
    claimedJobs: tick.claimedJobs,
    skippedJobs: tick.skippedJobs,
    stateAdvancements: tick.stateAdvancements,
  });

  if (input.actionOutputPath) {
    await writeAnswerFirstEnrichmentWorkerActionDraftsFile({
      actionDrafts: result.actionDrafts,
      inputPath: input.inputPath,
      actionOutputPath: input.actionOutputPath,
      writtenAt: input.input.now,
    });
  }

  return {
    ...result,
    actionOutputPath: input.actionOutputPath,
  };
}

export async function writeAnswerFirstEnrichmentWorkerActionDraftsFile(input: {
  actionDrafts: AnswerFirstEnrichmentWorkerActionDrafts;
  inputPath: string;
  actionOutputPath: string;
  writtenAt: string;
}): Promise<AnswerFirstEnrichmentWorkerActionDraftsFileOutput> {
  const output: AnswerFirstEnrichmentWorkerActionDraftsFileOutput = {
    ...input.actionDrafts,
    sourcePath: resolve(input.inputPath),
    writtenAt: new Date(Date.parse(input.writtenAt)).toISOString(),
  };

  await mkdir(dirname(input.actionOutputPath), { recursive: true });
  await writeFile(input.actionOutputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
