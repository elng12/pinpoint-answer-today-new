import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { AnswerFirstEnrichmentJobStore } from "../lib/puzzles/content-kitchen/enrichment-job-store";
import type { AnswerFirstEnrichmentJob } from "../lib/puzzles/content-kitchen/types";

export const ENRICHMENT_WORKER_FILE_STORE_OUTPUT_VERSION =
  "content-kitchen-enrichment-worker-file-store-output-v0";

export type AnswerFirstEnrichmentWorkerFileStoreOutput = {
  schemaVersion: typeof ENRICHMENT_WORKER_FILE_STORE_OUTPUT_VERSION;
  sourcePath: string;
  writtenAt: string;
  jobs: AnswerFirstEnrichmentJob[];
};

function cloneAnswerFirstEnrichmentJob(job: AnswerFirstEnrichmentJob): AnswerFirstEnrichmentJob {
  return {
    ...job,
    failureReasonCodes: [...job.failureReasonCodes],
  };
}

function parseJobsFile(value: unknown, fieldPath: string): AnswerFirstEnrichmentJob[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldPath} must be an object`);
  }

  const jobs = (value as { jobs?: unknown }).jobs;
  if (!Array.isArray(jobs)) {
    throw new Error(`${fieldPath}.jobs must be an array`);
  }

  return jobs.map((job) => cloneAnswerFirstEnrichmentJob(job as AnswerFirstEnrichmentJob));
}

export function mergeAnswerFirstEnrichmentJobsById(
  existingJobs: AnswerFirstEnrichmentJob[],
  updatedJobs: AnswerFirstEnrichmentJob[],
): AnswerFirstEnrichmentJob[] {
  const updatedByJobId = new Map(updatedJobs.map((job) => [job.jobId, cloneAnswerFirstEnrichmentJob(job)]));
  const merged: AnswerFirstEnrichmentJob[] = [];
  const seenJobIds = new Set<string>();

  for (const job of existingJobs) {
    const updated = updatedByJobId.get(job.jobId);
    merged.push(updated ?? cloneAnswerFirstEnrichmentJob(job));
    seenJobIds.add(job.jobId);
  }

  for (const job of updatedJobs) {
    if (!seenJobIds.has(job.jobId)) {
      merged.push(cloneAnswerFirstEnrichmentJob(job));
    }
  }

  return merged;
}

export type JsonFileAnswerFirstEnrichmentJobStoreInput = {
  inputPath: string;
  outputPath: string;
  writtenAt: string;
};

export function createJsonFileAnswerFirstEnrichmentJobStore(
  input: JsonFileAnswerFirstEnrichmentJobStoreInput,
): AnswerFirstEnrichmentJobStore {
  const inputPath = resolve(input.inputPath);
  const outputPath = resolve(input.outputPath);
  let loadedJobs: AnswerFirstEnrichmentJob[] | null = null;

  return {
    async listAnswerFirstEnrichmentJobs() {
      const raw = await readFile(inputPath, "utf8");
      loadedJobs = parseJobsFile(JSON.parse(raw), "input").map(cloneAnswerFirstEnrichmentJob);
      return loadedJobs.map(cloneAnswerFirstEnrichmentJob);
    },
    async upsertAnswerFirstEnrichmentJobs(jobs) {
      const baseJobs = loadedJobs ?? [];
      const output: AnswerFirstEnrichmentWorkerFileStoreOutput = {
        schemaVersion: ENRICHMENT_WORKER_FILE_STORE_OUTPUT_VERSION,
        sourcePath: inputPath,
        writtenAt: new Date(Date.parse(input.writtenAt)).toISOString(),
        jobs: mergeAnswerFirstEnrichmentJobsById(baseJobs, jobs),
      };

      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    },
  };
}
