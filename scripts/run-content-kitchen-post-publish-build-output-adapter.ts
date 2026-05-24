import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  POST_PUBLISH_OBSERVED_FACTS_BUILDER_INPUT_VERSION,
  type PostPublishObservedFactsBuilderInput,
} from "./run-content-kitchen-post-publish-observed-facts";
import type { PostPublishAuditExpectedStateV0 } from "../lib/puzzles/content-kitchen/types";

export const POST_PUBLISH_BUILD_OUTPUT_ADAPTER_INPUT_VERSION =
  "content-kitchen-post-publish-build-output-adapter-input-v0";
export const POST_PUBLISH_BUILD_OUTPUT_ADAPTER_RESULT_VERSION =
  "content-kitchen-post-publish-build-output-adapter-result-v0";

export type PostPublishBuildOutputAdapterInput = {
  schemaVersion?: typeof POST_PUBLISH_BUILD_OUTPUT_ADAPTER_INPUT_VERSION;
  artifactId: string;
  checkedAt: string;
  expected: PostPublishAuditExpectedStateV0;
  buildOutput: {
    appDir: string;
    siteBaseUrl?: string;
    httpStatus?: number;
    sitemapPath?: string;
  };
};

export type ContentKitchenPostPublishBuildOutputAdapterResult = {
  schemaVersion: typeof POST_PUBLISH_BUILD_OUTPUT_ADAPTER_RESULT_VERSION;
  dryRunOnly: true;
  sourcePath: string;
  outputPath?: string;
  sourceFiles: {
    appDir: string;
    htmlPath: string;
    sitemapPath?: string;
  };
  observedFactsBuilderInput: PostPublishObservedFactsBuilderInput;
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
        "Usage: npm run content-kitchen:post-publish-build-output-adapter -- --input <path> [--output <path>] [--pretty|--compact]",
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
    throw new Error(`build output adapter input must not include raw HTML, model prompts, or secrets (${found})`);
  }
}

function parseAdapterInput(raw: string): PostPublishBuildOutputAdapterInput {
  rejectUnsafePayload(raw);
  const record = requireObject(JSON.parse(raw) as unknown, "input");
  const schemaVersion = record.schemaVersion;
  if (schemaVersion !== undefined && schemaVersion !== POST_PUBLISH_BUILD_OUTPUT_ADAPTER_INPUT_VERSION) {
    throw new Error(`schemaVersion must be ${POST_PUBLISH_BUILD_OUTPUT_ADAPTER_INPUT_VERSION}`);
  }
  const checkedAt = requireText(record, "checkedAt", "input");
  if (!Number.isFinite(Date.parse(checkedAt))) {
    throw new Error("input.checkedAt must be a valid timestamp");
  }

  const expected = requireObject(record.expected, "expected") as unknown as PostPublishAuditExpectedStateV0;
  const canonicalUrl = requireText(record.expected as Record<string, unknown>, "canonicalUrl", "expected");
  let parsedCanonicalUrl: URL;
  try {
    parsedCanonicalUrl = new URL(canonicalUrl);
  } catch {
    throw new Error("expected.canonicalUrl must be an absolute URL");
  }

  const buildOutput = requireObject(record.buildOutput, "buildOutput");
  const siteBaseUrl = optionalText(buildOutput, "siteBaseUrl", "buildOutput");
  if (siteBaseUrl) {
    let parsedSiteBaseUrl: URL;
    try {
      parsedSiteBaseUrl = new URL(siteBaseUrl);
    } catch {
      throw new Error("buildOutput.siteBaseUrl must be an absolute URL");
    }
    if (parsedSiteBaseUrl.origin !== parsedCanonicalUrl.origin) {
      throw new Error("buildOutput.siteBaseUrl must match expected.canonicalUrl origin");
    }
  }

  return {
    ...(schemaVersion ? { schemaVersion: schemaVersion as typeof POST_PUBLISH_BUILD_OUTPUT_ADAPTER_INPUT_VERSION } : {}),
    artifactId: requireText(record, "artifactId", "input"),
    checkedAt,
    expected,
    buildOutput: {
      appDir: requireText(buildOutput, "appDir", "buildOutput"),
      ...(siteBaseUrl ? { siteBaseUrl } : {}),
      ...(optionalNumber(buildOutput, "httpStatus", "buildOutput") !== undefined
        ? { httpStatus: optionalNumber(buildOutput, "httpStatus", "buildOutput") }
        : {}),
      ...(optionalText(buildOutput, "sitemapPath", "buildOutput")
        ? { sitemapPath: optionalText(buildOutput, "sitemapPath", "buildOutput") }
        : {}),
    },
  };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveExistingPath(inputPath: string, value: string, fieldPath: string): Promise<string> {
  const candidates = isAbsolute(value)
    ? [value]
    : [resolve(dirname(inputPath), value), resolve(process.cwd(), value)];
  const uniqueCandidates = [...new Set(candidates)];
  for (const candidate of uniqueCandidates) {
    if (await fileExists(candidate)) return candidate;
  }

  throw new Error(`${fieldPath} does not exist or is not readable: ${uniqueCandidates.join(" or ")}`);
}

function buildHtmlPathCandidates(appDir: string, canonicalUrl: string): string[] {
  const pathname = new URL(canonicalUrl).pathname;
  const withoutLeadingSlash = decodeURIComponent(pathname).replace(/^\/+/, "");
  const withoutTrailingSlash = withoutLeadingSlash.replace(/\/+$/, "");

  return [
    resolve(appDir, `${withoutTrailingSlash}.html`),
    resolve(appDir, withoutTrailingSlash, "index.html"),
    resolve(appDir, withoutLeadingSlash, "index.html"),
  ];
}

async function findHtmlPath(appDir: string, canonicalUrl: string): Promise<string> {
  const candidates = buildHtmlPathCandidates(appDir, canonicalUrl);
  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }

  throw new Error(`build output HTML was not found for expected.canonicalUrl: ${candidates.join(" or ")}`);
}

async function findSitemapPath(inputPath: string, appDir: string, sitemapPath?: string): Promise<string | undefined> {
  if (sitemapPath) {
    return resolveExistingPath(inputPath, sitemapPath, "buildOutput.sitemapPath");
  }

  const candidates = [resolve(appDir, "sitemap.xml.body"), resolve(appDir, "sitemap.xml")];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }

  return undefined;
}

export async function runContentKitchenPostPublishBuildOutputAdapterFromFile(input: {
  inputPath: string;
  outputPath?: string;
}): Promise<ContentKitchenPostPublishBuildOutputAdapterResult> {
  const inputPath = resolve(input.inputPath);
  const outputPath = input.outputPath ? resolve(input.outputPath) : undefined;
  if (outputPath === inputPath) {
    throw new Error("--output must be different from --input");
  }

  const parsed = parseAdapterInput(await readFile(inputPath, "utf8"));
  const appDir = await resolveExistingPath(inputPath, parsed.buildOutput.appDir, "buildOutput.appDir");
  const htmlPath = await findHtmlPath(appDir, parsed.expected.canonicalUrl);
  const sitemapPath = await findSitemapPath(inputPath, appDir, parsed.buildOutput.sitemapPath);
  if (outputPath === htmlPath) {
    throw new Error("--output must be different from resolved HTML source");
  }
  if (outputPath && sitemapPath === outputPath) {
    throw new Error("--output must be different from resolved sitemap source");
  }

  const observedFactsBuilderInput: PostPublishObservedFactsBuilderInput = {
    schemaVersion: POST_PUBLISH_OBSERVED_FACTS_BUILDER_INPUT_VERSION,
    artifactId: parsed.artifactId,
    checkedAt: parsed.checkedAt,
    expected: parsed.expected,
    sources: {
      fetchedUrl: parsed.expected.canonicalUrl,
      ...(parsed.buildOutput.httpStatus !== undefined ? { httpStatus: parsed.buildOutput.httpStatus } : {}),
      htmlPath,
      ...(sitemapPath ? { sitemapPath } : {}),
    },
  };
  const result: ContentKitchenPostPublishBuildOutputAdapterResult = {
    schemaVersion: POST_PUBLISH_BUILD_OUTPUT_ADAPTER_RESULT_VERSION,
    dryRunOnly: true,
    sourcePath: inputPath,
    ...(outputPath ? { outputPath } : {}),
    sourceFiles: {
      appDir,
      htmlPath,
      ...(sitemapPath ? { sitemapPath } : {}),
    },
    observedFactsBuilderInput,
  };

  if (outputPath) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(observedFactsBuilderInput, null, 2)}\n`, "utf8");
  }

  return result;
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const result = await runContentKitchenPostPublishBuildOutputAdapterFromFile(args);
  console.log(JSON.stringify(result, null, args.pretty ? 2 : 0));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
