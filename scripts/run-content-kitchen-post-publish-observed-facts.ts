import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  POST_PUBLISH_AUDIT_RUNNER_INPUT_VERSION,
  type PostPublishAuditRunnerInput,
} from "./run-content-kitchen-post-publish-audit";
import type {
  ContentMode,
  IndexPolicy,
  InternalLinkPolicy,
  PostPublishAuditExpectedStateV0,
  PostPublishAuditObservedStateV0,
  RequiredAction,
  SchemaPolicy,
  SitemapPolicy,
  ValidationPolicies,
} from "../lib/puzzles/content-kitchen/types";

export const POST_PUBLISH_OBSERVED_FACTS_BUILDER_INPUT_VERSION =
  "content-kitchen-post-publish-observed-facts-builder-input-v0";
export const POST_PUBLISH_OBSERVED_FACTS_BUILDER_RESULT_VERSION =
  "content-kitchen-post-publish-observed-facts-builder-result-v0";

export type PostPublishObservedFactsBuilderInput = {
  schemaVersion?: typeof POST_PUBLISH_OBSERVED_FACTS_BUILDER_INPUT_VERSION;
  artifactId: string;
  checkedAt: string;
  expected: PostPublishAuditExpectedStateV0;
  sources: {
    fetchedUrl: string;
    httpStatus?: number;
    htmlPath: string;
    sitemapPath?: string;
  };
};

export type ContentKitchenPostPublishObservedFactsBuilderResult = {
  schemaVersion: typeof POST_PUBLISH_OBSERVED_FACTS_BUILDER_RESULT_VERSION;
  dryRunOnly: true;
  sourcePath: string;
  outputPath?: string;
  sourceFiles: {
    htmlPath: string;
    sitemapPath?: string;
  };
  auditRunnerInput: PostPublishAuditRunnerInput;
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
        "Usage: npm run content-kitchen:post-publish-observed-facts -- --input <path> [--output <path>] [--pretty|--compact]",
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

function resolveInputRelativePath(inputPath: string, value: string): string {
  return isAbsolute(value) ? value : resolve(dirname(inputPath), value);
}

function parseBuilderInput(raw: string): Omit<PostPublishObservedFactsBuilderInput, "sources"> & {
  sources: PostPublishObservedFactsBuilderInput["sources"];
} {
  const record = requireObject(JSON.parse(raw) as unknown, "input");
  const schemaVersion = record.schemaVersion;
  if (schemaVersion !== undefined && schemaVersion !== POST_PUBLISH_OBSERVED_FACTS_BUILDER_INPUT_VERSION) {
    throw new Error(`schemaVersion must be ${POST_PUBLISH_OBSERVED_FACTS_BUILDER_INPUT_VERSION}`);
  }
  const checkedAt = requireText(record, "checkedAt", "input");
  if (!Number.isFinite(Date.parse(checkedAt))) {
    throw new Error("input.checkedAt must be a valid timestamp");
  }
  const sources = requireObject(record.sources, "sources");

  return {
    ...(schemaVersion ? { schemaVersion: schemaVersion as typeof POST_PUBLISH_OBSERVED_FACTS_BUILDER_INPUT_VERSION } : {}),
    artifactId: requireText(record, "artifactId", "input"),
    checkedAt,
    expected: parseExpected(record.expected),
    sources: {
      fetchedUrl: requireText(sources, "fetchedUrl", "sources"),
      ...(optionalNumber(sources, "httpStatus", "sources") !== undefined ? { httpStatus: optionalNumber(sources, "httpStatus", "sources") } : {}),
      htmlPath: requireText(sources, "htmlPath", "sources"),
      ...(optionalText(sources, "sitemapPath", "sources") ? { sitemapPath: optionalText(sources, "sitemapPath", "sources") } : {}),
    },
  };
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
    "#x27": "'",
  };
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]+|#x27);/g, (match, code: string) => named[code] ?? match);
}

function stripHiddenHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ");
}

function visibleTextFromHtml(html: string): string {
  return decodeHtmlEntities(stripHiddenHtml(html).replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForMatch(value: string): string {
  return decodeHtmlEntities(value)
    .toLowerCase()
    .replace(/["“”'`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readAttribute(tag: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const doubleQuoted = tag.match(new RegExp(`\\s${escaped}="([^"]*)"`, "i"))?.[1];
  if (doubleQuoted !== undefined) return decodeHtmlEntities(doubleQuoted);
  const singleQuoted = tag.match(new RegExp(`\\s${escaped}='([^']*)'`, "i"))?.[1];
  return decodeHtmlEntities(singleQuoted ?? "");
}

function findLinkHref(html: string, rel: string): string | undefined {
  const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of linkTags) {
    const relValue = readAttribute(tag, "rel").toLowerCase().split(/\s+/);
    if (relValue.includes(rel.toLowerCase())) return readAttribute(tag, "href") || undefined;
  }
  return undefined;
}

function findMetaContent(html: string, nameOrProperty: string): string | undefined {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    const name = readAttribute(tag, "name") || readAttribute(tag, "property");
    if (name.toLowerCase() === nameOrProperty.toLowerCase()) return readAttribute(tag, "content") || undefined;
  }
  return undefined;
}

function extractHrefValues(html: string): string[] {
  const anchors = html.match(/<a\b[^>]*>/gi) ?? [];
  return [...new Set(anchors.flatMap((tag) => {
    const href = readAttribute(tag, "href");
    return href ? [href] : [];
  }))];
}

function normalizeInternalLink(href: string, canonicalUrl: string): string | undefined {
  if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return undefined;
  if (href.startsWith("/")) return href;
  try {
    const hrefUrl = new URL(href);
    const canonical = new URL(canonicalUrl);
    if (hrefUrl.origin !== canonical.origin) return undefined;
    return `${hrefUrl.pathname}${hrefUrl.search}${hrefUrl.hash}`;
  } catch {
    return undefined;
  }
}

function collectSchemaObjects(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap(collectSchemaObjects);
  }
  const record = value as Record<string, unknown>;
  const graph = record["@graph"];
  return [record, ...collectSchemaObjects(graph)];
}

function parseJsonLdObjects(html: string): Record<string, unknown>[] {
  const scripts = html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  const objects: Record<string, unknown>[] = [];
  for (const match of scripts) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      objects.push(...collectSchemaObjects(JSON.parse(raw) as unknown));
    } catch {
      try {
        objects.push(...collectSchemaObjects(JSON.parse(decodeHtmlEntities(raw)) as unknown));
      } catch {
        // Bad JSON-LD is a render/audit problem for later checks. This builder only records facts it can read.
      }
    }
  }
  return objects;
}

function schemaTypeNames(objects: Record<string, unknown>[]): string[] {
  const types = objects.flatMap((object) => {
    const value = object["@type"];
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
    return typeof value === "string" ? [value] : [];
  });
  return [...new Set(types)];
}

function schemaDateModified(objects: Record<string, unknown>[]): string | undefined {
  for (const object of objects) {
    const value = object.dateModified;
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function parseSitemap(xml: string, canonicalUrl: string): {
  sitemapIncluded: boolean;
  sitemapLastmod?: string;
} {
  const canonical = new URL(canonicalUrl);
  const blocks = xml.matchAll(/<url>([\s\S]*?)<\/url>/gi);
  for (const block of blocks) {
    const text = block[1] ?? "";
    const loc = decodeHtmlEntities(text.match(/<loc>([\s\S]*?)<\/loc>/i)?.[1]?.trim() ?? "");
    if (!loc) continue;
    let matches = loc === canonicalUrl;
    try {
      const locUrl = new URL(loc);
      matches = matches || locUrl.pathname === canonical.pathname;
    } catch {
      matches = matches || loc === canonical.pathname;
    }
    if (!matches) continue;
    const lastmod = decodeHtmlEntities(text.match(/<lastmod>([\s\S]*?)<\/lastmod>/i)?.[1]?.trim() ?? "");
    return {
      sitemapIncluded: true,
      ...(lastmod ? { sitemapLastmod: lastmod } : {}),
    };
  }
  return { sitemapIncluded: false };
}

export async function buildPostPublishObservedFacts(input: {
  expected: PostPublishAuditExpectedStateV0;
  sources: PostPublishObservedFactsBuilderInput["sources"];
  htmlPath: string;
  sitemapPath?: string;
}): Promise<PostPublishAuditObservedStateV0> {
  const html = await readFile(input.htmlPath, "utf8");
  const sitemapXml = input.sitemapPath ? await readFile(input.sitemapPath, "utf8") : undefined;

  return buildPostPublishObservedFactsFromHtml({
    expected: input.expected,
    sources: input.sources,
    html,
    ...(sitemapXml ? { sitemapXml } : {}),
  });
}

export function buildPostPublishObservedFactsFromHtml(input: {
  expected: PostPublishAuditExpectedStateV0;
  sources: Pick<PostPublishObservedFactsBuilderInput["sources"], "fetchedUrl" | "httpStatus">;
  html: string;
  sitemapXml?: string;
}): PostPublishAuditObservedStateV0 {
  const html = input.html;
  const visibleText = visibleTextFromHtml(html);
  const normalizedVisibleText = normalizeForMatch(visibleText);
  const schemaObjects = parseJsonLdObjects(html);
  const internalLinks = [...new Set(
    extractHrefValues(html)
      .map((href) => normalizeInternalLink(href, input.expected.canonicalUrl))
      .filter((href): href is string => Boolean(href)),
  )];
  const sitemapFacts = input.sitemapXml
    ? parseSitemap(input.sitemapXml, input.expected.canonicalUrl)
    : {};
  const statusOk =
    input.sources.httpStatus === undefined ||
    (input.sources.httpStatus >= 200 && input.sources.httpStatus < 400);

  return {
    fetchedUrl: input.sources.fetchedUrl,
    ...(input.sources.httpStatus !== undefined ? { httpStatus: input.sources.httpStatus } : {}),
    fetchOk: statusOk,
    renderOk: html.trim().length > 0,
    answerVisible: normalizedVisibleText.includes(normalizeForMatch(input.expected.answer)),
    visibleClues: input.expected.clues.filter((clue) => normalizedVisibleText.includes(normalizeForMatch(clue))),
    ...(findLinkHref(html, "canonical") ? { canonicalUrl: findLinkHref(html, "canonical") } : {}),
    noindexPresent: (findMetaContent(html, "robots") ?? "").toLowerCase().includes("noindex"),
    ...sitemapFacts,
    schemaTypes: schemaTypeNames(schemaObjects),
    ...(schemaDateModified(schemaObjects) ? { schemaDateModified: schemaDateModified(schemaObjects) } : {}),
    internalLinks,
  };
}

export async function runContentKitchenPostPublishObservedFactsFromFile(input: {
  inputPath: string;
  outputPath?: string;
}): Promise<ContentKitchenPostPublishObservedFactsBuilderResult> {
  const inputPath = resolve(input.inputPath);
  const outputPath = input.outputPath ? resolve(input.outputPath) : undefined;
  if (outputPath === inputPath) {
    throw new Error("--output must be different from --input");
  }
  const parsed = parseBuilderInput(await readFile(inputPath, "utf8"));
  const htmlPath = resolveInputRelativePath(inputPath, parsed.sources.htmlPath);
  const sitemapPath = parsed.sources.sitemapPath
    ? resolveInputRelativePath(inputPath, parsed.sources.sitemapPath)
    : undefined;
  if (outputPath === htmlPath) {
    throw new Error("--output must be different from sources.htmlPath");
  }
  if (outputPath && sitemapPath === outputPath) {
    throw new Error("--output must be different from sources.sitemapPath");
  }

  const observed = await buildPostPublishObservedFacts({
    expected: parsed.expected,
    sources: parsed.sources,
    htmlPath,
    ...(sitemapPath ? { sitemapPath } : {}),
  });
  const auditRunnerInput: PostPublishAuditRunnerInput = {
    schemaVersion: POST_PUBLISH_AUDIT_RUNNER_INPUT_VERSION,
    artifactId: parsed.artifactId,
    checkedAt: parsed.checkedAt,
    expected: parsed.expected,
    observed,
  };
  const result: ContentKitchenPostPublishObservedFactsBuilderResult = {
    schemaVersion: POST_PUBLISH_OBSERVED_FACTS_BUILDER_RESULT_VERSION,
    dryRunOnly: true,
    sourcePath: inputPath,
    ...(outputPath ? { outputPath } : {}),
    sourceFiles: {
      htmlPath,
      ...(sitemapPath ? { sitemapPath } : {}),
    },
    auditRunnerInput,
  };

  if (outputPath) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(auditRunnerInput, null, 2)}\n`, "utf8");
  }

  return result;
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const result = await runContentKitchenPostPublishObservedFactsFromFile(args);
  console.log(JSON.stringify(result, null, args.pretty ? 2 : 0));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
