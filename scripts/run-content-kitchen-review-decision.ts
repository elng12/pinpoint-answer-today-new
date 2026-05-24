import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildReviewUiInput,
  buildReviewNotificationDraft,
  buildReviewQueueDraft,
  buildReviewDecisionEffectPlan,
  deriveReviewRoute,
  validateReviewDecision,
} from "../lib/puzzles/content-kitchen/review-decision";
import type {
  ReviewArtifactV0,
  ReviewDecisionEffectPlanV0,
  ReviewDecisionV0,
  ReviewDecisionValidationResult,
  ReviewNotificationDraftV0,
  ReviewQueueDraftV0,
  ReviewUiInputV0,
  ReviewRouteResult,
} from "../lib/puzzles/content-kitchen/types";

export const REVIEW_DECISION_RUNNER_RESULT_VERSION =
  "content-kitchen-review-decision-runner-result-v0";

export type ContentKitchenReviewDecisionRunnerResult = {
  schemaVersion: typeof REVIEW_DECISION_RUNNER_RESULT_VERSION;
  dryRunOnly: true;
  sourceArtifactPath: string;
  sourceDecisionPath?: string;
  outputPath?: string;
  route: ReviewRouteResult;
  decision?: ReviewDecisionV0;
  decisionValidation?: ReviewDecisionValidationResult;
  effectPlan?: ReviewDecisionEffectPlanV0;
  reviewQueueDraft?: ReviewQueueDraftV0;
  reviewNotificationDraft?: ReviewNotificationDraftV0;
  reviewUiInput?: ReviewUiInputV0;
};

type ParsedArgs = {
  artifactPath: string;
  decisionPath?: string;
  outputPath?: string;
  modelConfidence?: number;
  reviewUrl?: string;
  pretty: boolean;
};

function readArgValue(argv: string[], index: number, name: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }

  return value;
}

function parseNumberArg(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${name} must be a number between 0 and 1`);
  }

  return parsed;
}

function parseArgs(argv: string[]): ParsedArgs {
  let artifactPath = "";
  let decisionPath: string | undefined;
  let outputPath: string | undefined;
  let modelConfidence: number | undefined;
  let reviewUrl: string | undefined;
  let pretty = true;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--artifact") {
      artifactPath = resolve(readArgValue(argv, index, "--artifact"));
      index += 1;
      continue;
    }

    if (arg === "--decision") {
      decisionPath = resolve(readArgValue(argv, index, "--decision"));
      index += 1;
      continue;
    }

    if (arg === "--output") {
      outputPath = resolve(readArgValue(argv, index, "--output"));
      index += 1;
      continue;
    }

    if (arg === "--model-confidence") {
      modelConfidence = parseNumberArg(readArgValue(argv, index, "--model-confidence"), "--model-confidence");
      index += 1;
      continue;
    }

    if (arg === "--review-url") {
      reviewUrl = readArgValue(argv, index, "--review-url");
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
        "Usage: npm run content-kitchen:review-decision -- --artifact <path> [--decision <path>] [--output <path>] [--model-confidence <0..1>] [--review-url <url>] [--pretty|--compact]",
      );
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!artifactPath) {
    throw new Error("Missing required --artifact <path>");
  }
  if (outputPath === artifactPath) {
    throw new Error("--output must be different from --artifact");
  }
  if (outputPath && decisionPath === outputPath) {
    throw new Error("--output must be different from --decision");
  }

  return {
    artifactPath,
    decisionPath,
    outputPath,
    modelConfidence,
    reviewUrl,
    pretty,
  };
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

export async function runContentKitchenReviewDecisionFromFiles(input: {
  artifactPath: string;
  decisionPath?: string;
  outputPath?: string;
  modelConfidence?: number;
  reviewUrl?: string;
}): Promise<ContentKitchenReviewDecisionRunnerResult> {
  const artifactPath = resolve(input.artifactPath);
  const decisionPath = input.decisionPath ? resolve(input.decisionPath) : undefined;
  const outputPath = input.outputPath ? resolve(input.outputPath) : undefined;
  const artifact = await readJsonFile<ReviewArtifactV0>(artifactPath);
  const decision = decisionPath ? await readJsonFile<ReviewDecisionV0>(decisionPath) : undefined;
  const routeModelConfidence =
    input.modelConfidence ?? (decision?.reviewerType === "model" ? decision.confidence : undefined);
  const route = deriveReviewRoute(artifact, {
    modelConfidence: routeModelConfidence,
  });
  const decisionValidation = decision
    ? validateReviewDecision({ artifact, decision })
    : undefined;
  const effectPlan = decision
    ? buildReviewDecisionEffectPlan({ artifact, decision })
    : undefined;
  const reviewQueueDraft = buildReviewQueueDraft({
    artifact,
    route,
    ...(effectPlan ? { effectPlan } : {}),
  });
  const reviewNotificationDraft = reviewQueueDraft
    ? buildReviewNotificationDraft({
      artifact,
      queueDraft: reviewQueueDraft,
      ...(input.reviewUrl ? { reviewUrl: input.reviewUrl } : {}),
    })
    : undefined;
  const reviewUiInput = reviewQueueDraft
    ? buildReviewUiInput({
      artifact,
      queueDraft: reviewQueueDraft,
      route,
      ...(effectPlan ? { effectPlan } : {}),
      ...(reviewNotificationDraft ? { notificationDraft: reviewNotificationDraft } : {}),
      ...(input.reviewUrl ? { reviewUrl: input.reviewUrl } : {}),
    })
    : undefined;
  const result: ContentKitchenReviewDecisionRunnerResult = {
    schemaVersion: REVIEW_DECISION_RUNNER_RESULT_VERSION,
    dryRunOnly: true,
    sourceArtifactPath: artifactPath,
    ...(decisionPath ? { sourceDecisionPath: decisionPath } : {}),
    ...(outputPath ? { outputPath } : {}),
    route,
    ...(decision ? { decision } : {}),
    ...(decisionValidation ? { decisionValidation } : {}),
    ...(effectPlan ? { effectPlan } : {}),
    ...(reviewQueueDraft ? { reviewQueueDraft } : {}),
    ...(reviewNotificationDraft ? { reviewNotificationDraft } : {}),
    ...(reviewUiInput ? { reviewUiInput } : {}),
  };

  if (outputPath) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }

  return result;
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const result = await runContentKitchenReviewDecisionFromFiles(args);
  console.log(JSON.stringify(result, null, args.pretty ? 2 : 0));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
