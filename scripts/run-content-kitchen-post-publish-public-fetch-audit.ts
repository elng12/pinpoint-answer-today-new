import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  ContentMode,
  IndexPolicy,
  InternalLinkPolicy,
  PostPublishAuditArtifactV0,
  PostPublishAuditExpectedStateV0,
  RequiredAction,
  SchemaPolicy,
  SitemapPolicy,
  ValidationPolicies,
} from "../lib/puzzles/content-kitchen/types";
import {
  POST_PUBLISH_AUDIT_RUNNER_INPUT_VERSION,
  runContentKitchenPostPublishAuditJson,
  type PostPublishAuditRunnerInput,
} from "./run-content-kitchen-post-publish-audit";
import {
  buildPostPublishObservedFactsFromHtml,
} from "./run-content-kitchen-post-publish-observed-facts";

export const POST_PUBLISH_PUBLIC_FETCH_AUDIT_INPUT_VERSION =
  "content-kitchen-post-publish-public-fetch-audit-input-v0";
export const POST_PUBLISH_PUBLIC_FETCH_AUDIT_RESULT_VERSION =
  "content-kitchen-post-publish-public-fetch-audit-result-v0";

export type PostPublishPublicFetchAuditInput = {
  schemaVersion?: typeof POST_PUBLISH_PUBLIC_FETCH_AUDIT_INPUT_VERSION;
  artifactId: string;
  checkedAt: string;
  expected: PostPublishAuditExpectedStateV0;
  publicFetch?: {
    sitemapUrl?: string;
    timeoutMs?: number;
    userAgent?: string;
  };
};

export type ContentKitchenPostPublishPublicFetchAuditResult = {
  schemaVersion: typeof POST_PUBLISH_PUBLIC_FETCH_AUDIT_RESULT_VERSION;
  readOnly: true;
  dryRunOnly: true;
  publicFetchPerformedByReader: true;
  sourcePath: string;
  outputPath?: string;
  fetched: {
    url: string;
    httpStatus?: number;
    sitemapUrl?: string;
    sitemapHttpStatus?: number;
  };
  auditArtifact: PostPublishAuditArtifactV0;
};

type ParsedArgs = {
  inputPath: string;
  outputPath?: string;
  pretty: boolean;
};

type FetchResult = {
  url: string;
  httpStatus?: number;
  ok: boolean;
  body: string;
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
        "Usage: npm run content-kitchen:post-publish-public-fetch-audit -- --input <path> [--output <path>] [--pretty|--compact]",
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

function requireHttpUrl(value: string, fieldPath: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${fieldPath} must be an absolute URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${fieldPath} must use http or https`);
  }

  return url;
}

function parseExpected(value: unknown): PostPublishAuditExpectedStateV0 {
  const expected = requireObject(value, "expected");
  const canonicalUrl = requireText(expected, "canonicalUrl", "expected");
  requireHttpUrl(canonicalUrl, "expected.canonicalUrl");

  return {
    puzzleId: requireText(expected, "puzzleId", "expected"),
    canonicalUrl,
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
    throw new Error(`public fetch audit input must not include raw HTML, model prompts, or secrets (${found})`);
  }
}

function parsePublicFetchAuditInput(raw: string): PostPublishPublicFetchAuditInput {
  rejectUnsafePayload(raw);
  const record = requireObject(JSON.parse(raw) as unknown, "input");
  const schemaVersion = record.schemaVersion;
  if (schemaVersion !== undefined && schemaVersion !== POST_PUBLISH_PUBLIC_FETCH_AUDIT_INPUT_VERSION) {
    throw new Error(`schemaVersion must be ${POST_PUBLISH_PUBLIC_FETCH_AUDIT_INPUT_VERSION}`);
  }
  const checkedAt = requireText(record, "checkedAt", "input");
  if (!Number.isFinite(Date.parse(checkedAt))) {
    throw new Error("input.checkedAt must be a valid timestamp");
  }

  const expected = parseExpected(record.expected);
  const canonicalUrl = requireHttpUrl(expected.canonicalUrl, "expected.canonicalUrl");
  const publicFetch = record.publicFetch === undefined
    ? {}
    : requireObject(record.publicFetch, "publicFetch");
  const sitemapUrl = optionalText(publicFetch, "sitemapUrl", "publicFetch");
  if (sitemapUrl) {
    const parsedSitemapUrl = requireHttpUrl(sitemapUrl, "publicFetch.sitemapUrl");
    if (parsedSitemapUrl.origin !== canonicalUrl.origin) {
      throw new Error("publicFetch.sitemapUrl must use the same origin as expected.canonicalUrl");
    }
  }
  const timeoutMs = optionalNumber(publicFetch, "timeoutMs", "publicFetch");
  if (timeoutMs !== undefined && (timeoutMs < 500 || timeoutMs > 30000)) {
    throw new Error("publicFetch.timeoutMs must be between 500 and 30000");
  }

  return {
    ...(schemaVersion ? { schemaVersion: schemaVersion as typeof POST_PUBLISH_PUBLIC_FETCH_AUDIT_INPUT_VERSION } : {}),
    artifactId: requireText(record, "artifactId", "input"),
    checkedAt,
    expected,
    publicFetch: {
      ...(sitemapUrl ? { sitemapUrl } : {}),
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      ...(optionalText(publicFetch, "userAgent", "publicFetch")
        ? { userAgent: optionalText(publicFetch, "userAgent", "publicFetch") }
        : {}),
    },
  };
}

function defaultSitemapUrl(canonicalUrl: string): string {
  const url = new URL(canonicalUrl);
  return `${url.origin}/sitemap.xml`;
}

async function fetchText(url: string, input: {
  timeoutMs: number;
  userAgent: string;
}): Promise<FetchResult> {
  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
        "user-agent": input.userAgent,
      },
      signal: AbortSignal.timeout(input.timeoutMs),
    });

    return {
      url,
      httpStatus: response.status,
      ok: response.ok,
      body: await response.text(),
    };
  } catch {
    return {
      url,
      ok: false,
      body: "",
    };
  }
}

export async function runContentKitchenPostPublishPublicFetchAuditFromFile(input: {
  inputPath: string;
  outputPath?: string;
}): Promise<ContentKitchenPostPublishPublicFetchAuditResult> {
  const inputPath = resolve(input.inputPath);
  const outputPath = input.outputPath ? resolve(input.outputPath) : undefined;
  if (outputPath === inputPath) {
    throw new Error("--output must be different from --input");
  }

  const parsed = parsePublicFetchAuditInput(await readFile(inputPath, "utf8"));
  const timeoutMs = parsed.publicFetch?.timeoutMs ?? 10000;
  const userAgent = parsed.publicFetch?.userAgent ?? "PinpointContentKitchenAudit/0.1";
  const pageFetch = await fetchText(parsed.expected.canonicalUrl, { timeoutMs, userAgent });
  const sitemapUrl = parsed.publicFetch?.sitemapUrl ?? defaultSitemapUrl(parsed.expected.canonicalUrl);
  const sitemapFetch = pageFetch.ok
    ? await fetchText(sitemapUrl, { timeoutMs, userAgent })
    : undefined;
  const observed = pageFetch.ok
    ? buildPostPublishObservedFactsFromHtml({
      expected: parsed.expected,
      sources: {
        fetchedUrl: pageFetch.url,
        ...(pageFetch.httpStatus !== undefined ? { httpStatus: pageFetch.httpStatus } : {}),
      },
      html: pageFetch.body,
      ...(sitemapFetch?.ok ? { sitemapXml: sitemapFetch.body } : {}),
    })
    : {
      fetchedUrl: pageFetch.url,
      ...(pageFetch.httpStatus !== undefined ? { httpStatus: pageFetch.httpStatus } : {}),
      fetchOk: false,
      renderOk: false,
    };
  const auditRunnerInput: PostPublishAuditRunnerInput = {
    schemaVersion: POST_PUBLISH_AUDIT_RUNNER_INPUT_VERSION,
    artifactId: parsed.artifactId,
    checkedAt: parsed.checkedAt,
    expected: parsed.expected,
    observed,
  };
  const auditArtifact = runContentKitchenPostPublishAuditJson(auditRunnerInput);
  const result: ContentKitchenPostPublishPublicFetchAuditResult = {
    schemaVersion: POST_PUBLISH_PUBLIC_FETCH_AUDIT_RESULT_VERSION,
    readOnly: true,
    dryRunOnly: true,
    publicFetchPerformedByReader: true,
    sourcePath: inputPath,
    ...(outputPath ? { outputPath } : {}),
    fetched: {
      url: pageFetch.url,
      ...(pageFetch.httpStatus !== undefined ? { httpStatus: pageFetch.httpStatus } : {}),
      ...(sitemapFetch ? { sitemapUrl: sitemapFetch.url } : {}),
      ...(sitemapFetch?.httpStatus !== undefined ? { sitemapHttpStatus: sitemapFetch.httpStatus } : {}),
    },
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
  const result = await runContentKitchenPostPublishPublicFetchAuditFromFile(args);
  console.log(JSON.stringify(result, null, args.pretty ? 2 : 0));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
