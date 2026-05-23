import {
  runAnswerFirstEnrichmentWorkerTick,
  type RunAnswerFirstEnrichmentWorkerTickInput,
  type RunAnswerFirstEnrichmentWorkerTickResult,
} from "./enrichment-job";
import type { AnswerFirstEnrichmentJob } from "./types";

export type AnswerFirstEnrichmentJobStore = {
  listAnswerFirstEnrichmentJobs: () => Promise<AnswerFirstEnrichmentJob[]>;
  upsertAnswerFirstEnrichmentJobs: (jobs: AnswerFirstEnrichmentJob[]) => Promise<void>;
};

export type InMemoryAnswerFirstEnrichmentJobStore = AnswerFirstEnrichmentJobStore & {
  snapshot: () => AnswerFirstEnrichmentJob[];
};

export type RunAnswerFirstEnrichmentWorkerTickFromStoreInput = Omit<
  RunAnswerFirstEnrichmentWorkerTickInput,
  "jobs"
> & {
  store: AnswerFirstEnrichmentJobStore;
};

function cloneAnswerFirstEnrichmentJob(job: AnswerFirstEnrichmentJob): AnswerFirstEnrichmentJob {
  return {
    ...job,
    failureReasonCodes: [...job.failureReasonCodes],
  };
}

export function createInMemoryAnswerFirstEnrichmentJobStore(
  initialJobs: AnswerFirstEnrichmentJob[] = [],
): InMemoryAnswerFirstEnrichmentJobStore {
  const jobsById = new Map<string, AnswerFirstEnrichmentJob>();

  for (const job of initialJobs) {
    jobsById.set(job.jobId, cloneAnswerFirstEnrichmentJob(job));
  }

  const snapshot = (): AnswerFirstEnrichmentJob[] => {
    return [...jobsById.values()].map(cloneAnswerFirstEnrichmentJob);
  };

  return {
    async listAnswerFirstEnrichmentJobs() {
      return snapshot();
    },
    async upsertAnswerFirstEnrichmentJobs(jobs) {
      for (const job of jobs) {
        jobsById.set(job.jobId, cloneAnswerFirstEnrichmentJob(job));
      }
    },
    snapshot,
  };
}

export async function runAnswerFirstEnrichmentWorkerTickFromStore(
  input: RunAnswerFirstEnrichmentWorkerTickFromStoreInput,
): Promise<RunAnswerFirstEnrichmentWorkerTickResult> {
  const jobs = await input.store.listAnswerFirstEnrichmentJobs();
  const tick = runAnswerFirstEnrichmentWorkerTick({
    jobs,
    now: input.now,
    workerId: input.workerId,
    limit: input.limit,
    lockMinutes: input.lockMinutes,
  });

  await input.store.upsertAnswerFirstEnrichmentJobs(tick.updatedJobs);
  return tick;
}
