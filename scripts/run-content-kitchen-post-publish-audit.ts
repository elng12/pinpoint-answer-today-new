import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildPostPublishAudit,
  type BuildPostPublishAuditInput,
} from "../lib/puzzles/content-kitchen/post-publish-audit";
import type {
  ContentMode,
  IndexPolicy,
  InternalLinkPolicy,
  PostPublishAuditArtifactV0,
  PostPublishAuditExpectedStateV0,
  PostPublishAuditObservedStateV0,
  RequiredAction,
  SchemaPolicy,
  SitemapPolicy,
  ValidationPolicies,
} from "../lib/puzzles/content-kitchen/types";

export const POST_PUBLISH_AUDIT_RUNNER_INPUT_VERSION =
  "content-kitchen-post-publish-audit-runner-input-v0";
export const POST_PUBLISH_AUDIT_RUNNER_RESULT_VERSION =
  "content-kitchen-post-publish-audit-runner-result-v0";

export type PostPublishAuditRunnerInput = {
  schemaVersion?: typeof POST_PUBLISH_AUDIT_RUNNER_INPUT_VERSION;
  artifactId: string;
  checkedAt: string;
  expected: PostPublishAuditExpectedStateV0;
  observed: PostPublishAuditObservedStateV0;
};

export type ContentKitchenPostPublishAuditRunnerResult = {
  schemaVersion: typeof POST_PUBLISH_AUDIT_RUNNER_RESULT_VERSION;
  dryRunOnly: true;
  sourcePath: string;
  outputPath?: string;
  auditArtifact: PostPublishAuditArtifactV0;
};

type ParsedArgs = {
  inputPath: string;
  outputPath?: string;
  pretty: boolean;
};

function readArgValue(argv: string[], index: number, name: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }

  return value;
}

function parseArgs(argv: string[]): ParsedArgs {
  let inputPath = "";
  let outputPath: string | undefined;
  let pretty = true;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      inputPath = resolve(readArgValue(argv, index, "--input"));
      index += 1;
      continue;
    }

    if (arg === "--output") {
      outputPath = resolve(readArgValue(argv, index, "--output"));
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
        "Usage: npm run content-kitchen:post-publish-audit -- --input <path> [--output <path>] [--pretty|--compact]",
      );
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!inputPath) {
    throw new Error("Missing required --input <path>");
  }
  if (outputPath === inputPath) {
    throw new Error("--output must be different from --input");
  }

  return {
    inputPath,
    outputPath,
    pretty,
  };
}

function requireObject(value: unknown, fieldPath: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldPath} must be an object`);
  }

  return value as Record<string, unknown>;
}

function requireText(record: Record<string, unknown>, key: string, fieldPath: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldPath}.${key} must be a non-empty string`);
  }

  return value;
}

function optionalText(record: Record<string, unknown>, key: string, fieldPath: string): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldPath}.${key} must be a non-empty string`);
  }

  return value;
}

function optionalNumber(record: Record<string, unknown>, key: string, fieldPath: string): number | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${fieldPath}.${key} must be a finite number`);
  }

  return value;
}

function optionalBoolean(record: Record<string, unknown>, key: string, fieldPath: string): boolean | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new Error(`${fieldPath}.${key} must be a boolean`);
  }

  return value;
}

function requireBoolean(record: Record<string, unknown>, key: string, fieldPath: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new Error(`${fieldPath}.${key} must be a boolean`);
  }

  return value;
}

function optionalTextArray(record: Record<string, unknown>, key: string, fieldPath: string): string[] | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${fieldPath}.${key} must be an array of non-empty strings`);
  }

  return [...value];
}

function requireTextArray(record: Record<string, unknown>, key: string, fieldPath: string): string[] {
  const value = optionalTextArray(record, key, fieldPath);
  if (!value) {
    throw new Error(`${fieldPath}.${key} must be an array of non-empty strings`);
  }

  return value;
}

function requireEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  fieldPath: string,
  values: readonly T[],
): T {
  const value = record[key];
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new Error(`${fieldPath}.${key} must be one of: ${values.join(", ")}`);
  }

  return value as T;
}

function parsePolicies(value: unknown): ValidationPolicies {
  const policies = requireObject(value, "expected.policies");
  return {
    indexPolicy: requireEnum<IndexPolicy>(policies, "indexPolicy", "expected.policies", [
      "index",
      "noindex",
      "review_required",
      "block_publish",
    ]),
    sitemapPolicy: requireEnum<SitemapPolicy>(policies, "sitemapPolicy", "expected.policies", [
      "include",
      "exclude",
      "remove_on_next_build",
      "include_after_audit",
    ]),
    schemaPolicy: requireEnum<SchemaPolicy>(policies, "schemaPolicy", "expected.policies", [
      "none",
      "article_only",
      "faq_allowed",
      "block_schema",
    ]),
    internalLinkPolicy: requireEnum<InternalLinkPolicy>(policies, "internalLinkPolicy", "expected.policies", [
      "normal",
      "deemphasized",
      "hidden_from_recent",
    ]),
    requiredAction: requireEnum<RequiredAction>(policies, "requiredAction", "expected.policies", [
      "none",
      "enrich",
      "review",
      "block_publish",
      "upgrade",
      "rollback",
      "degrade",
      "create_fix_task",
      "dead_letter",
      "keep_current",
    ]),
  };
}

function parseExpected(value: unknown): PostPublishAuditExpectedStateV0 {
  const expected = requireObject(value, "expected");
  return {
    puzzleId: requireText(expected, "puzzleId", "expected"),
    canonicalUrl: requireText(expected, "canonicalUrl", "expected"),
    revisionId: requireText(expected, "revisionId", "expected"),
    contentMode: requireEnum<ContentMode>(expected, "contentMode", "expected", ["answer-first", "full-analysis"]),
    answer: requireText(expected, "answer", "expected"),
    clues: requireTextArray(expected, "clues", "expected"),
    policies: parsePolicies(expected.policies),
    ...(optionalTextArray(expected, "schemaTypes", "expected") ? { schemaTypes: optionalTextArray(expected, "schemaTypes", "expected") } : {}),
    ...(optionalText(expected, "sitemapLastmod", "expected") ? { sitemapLastmod: optionalText(expected, "sitemapLastmod", "expected") } : {}),
    ...(optionalText(expected, "schemaDateModified", "expected") ? { schemaDateModified: optionalText(expected, "schemaDateModified", "expected") } : {}),
    ...(optionalTextArray(expected, "expectedInternalLinks", "expected") ? { expectedInternalLinks: optionalTextArray(expected, "expectedInternalLinks", "expected") } : {}),
  };
}

function parseObserved(value: unknown): PostPublishAuditObservedStateV0 {
  const observed = requireObject(value, "observed");
  return {
    fetchedUrl: requireText(observed, "fetchedUrl", "observed"),
    ...(optionalNumber(observed, "httpStatus", "observed") !== undefined ? { httpStatus: optionalNumber(observed, "httpStatus", "observed") } : {}),
    fetchOk: requireBoolean(observed, "fetchOk", "observed"),
    renderOk: requireBoolean(observed, "renderOk", "observed"),
    ...(optionalBoolean(observed, "answerVisible", "observed") !== undefined ? { answerVisible: optionalBoolean(observed, "answerVisible", "observed") } : {}),
    ...(optionalTextArray(observed, "visibleClues", "observed") ? { visibleClues: optionalTextArray(observed, "visibleClues", "observed") } : {}),
    ...(optionalText(observed, "canonicalUrl", "observed") ? { canonicalUrl: optionalText(observed, "canonicalUrl", "observed") } : {}),
    ...(optionalBoolean(observed, "noindexPresent", "observed") !== undefined ? { noindexPresent: optionalBoolean(observed, "noindexPresent", "observed") } : {}),
    ...(optionalBoolean(observed, "sitemapIncluded", "observed") !== undefined ? { sitemapIncluded: optionalBoolean(observed, "sitemapIncluded", "observed") } : {}),
    ...(optionalText(observed, "sitemapLastmod", "observed") ? { sitemapLastmod: optionalText(observed, "sitemapLastmod", "observed") } : {}),
    ...(optionalTextArray(observed, "schemaTypes", "observed") ? { schemaTypes: optionalTextArray(observed, "schemaTypes", "observed") } : {}),
    ...(optionalText(observed, "schemaDateModified", "observed") ? { schemaDateModified: optionalText(observed, "schemaDateModified", "observed") } : {}),
    ...(optionalTextArray(observed, "internalLinks", "observed") ? { internalLinks: optionalTextArray(observed, "internalLinks", "observed") } : {}),
  };
}

function rejectUnsafePayload(raw: string): void {
  const unsafeSnippets = [
    "rawRenderedHtml",
    "renderedHtml",
    "modelPrompt",
    "<main",
    "<html",
    "<script",
    "\"secret",
    "\"secrets",
    "\"apiKey",
    "\"token",
  ];
  const lowerRaw = raw.toLowerCase();
  const found = unsafeSnippets.find((snippet) => lowerRaw.includes(snippet.toLowerCase()));
  if (found) {
    throw new Error(`audit input must not include raw HTML, model prompts, or secrets (${found})`);
  }
}

export function parsePostPublishAuditRunnerInput(raw: string): PostPublishAuditRunnerInput {
  rejectUnsafePayload(raw);
  const value = JSON.parse(raw) as unknown;
  const record = requireObject(value, "input");
  const schemaVersion = record.schemaVersion;
  if (schemaVersion !== undefined && schemaVersion !== POST_PUBLISH_AUDIT_RUNNER_INPUT_VERSION) {
    throw new Error(`schemaVersion must be ${POST_PUBLISH_AUDIT_RUNNER_INPUT_VERSION}`);
  }
  const checkedAt = requireText(record, "checkedAt", "input");
  if (!Number.isFinite(Date.parse(checkedAt))) {
    throw new Error("input.checkedAt must be a valid timestamp");
  }

  return {
    ...(schemaVersion ? { schemaVersion: schemaVersion as typeof POST_PUBLISH_AUDIT_RUNNER_INPUT_VERSION } : {}),
    artifactId: requireText(record, "artifactId", "input"),
    checkedAt,
    expected: parseExpected(record.expected),
    observed: parseObserved(record.observed),
  };
}

export function runContentKitchenPostPublishAuditJson(
  input: PostPublishAuditRunnerInput,
): PostPublishAuditArtifactV0 {
  return buildPostPublishAudit(input as BuildPostPublishAuditInput);
}

export async function runContentKitchenPostPublishAuditFromFile(input: {
  inputPath: string;
  outputPath?: string;
}): Promise<ContentKitchenPostPublishAuditRunnerResult> {
  const inputPath = resolve(input.inputPath);
  const outputPath = input.outputPath ? resolve(input.outputPath) : undefined;
  if (outputPath === inputPath) {
    throw new Error("--output must be different from --input");
  }

  const parsedInput = parsePostPublishAuditRunnerInput(await readFile(inputPath, "utf8"));
  const auditArtifact = runContentKitchenPostPublishAuditJson(parsedInput);
  const result: ContentKitchenPostPublishAuditRunnerResult = {
    schemaVersion: POST_PUBLISH_AUDIT_RUNNER_RESULT_VERSION,
    dryRunOnly: true,
    sourcePath: inputPath,
    ...(outputPath ? { outputPath } : {}),
    auditArtifact,
  };

  if (outputPath) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(auditArtifact, null, 2)}\n`, "utf8");
  }

  return result;
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const result = await runContentKitchenPostPublishAuditFromFile(args);
  console.log(JSON.stringify(result, null, args.pretty ? 2 : 0));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
