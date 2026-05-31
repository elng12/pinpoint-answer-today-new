import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { buildPuzzleSeoDescription, buildPuzzleSeoTitle, getSiteUrl } from "../lib/seo/metadata";
import { hashInputSnapshot } from "../lib/puzzles/content-kitchen/identity";
import { validateCandidate } from "../lib/puzzles/content-kitchen/validate-candidate";
import {
  formatPublishGateIssues,
  validatePublishEligibility,
} from "../lib/puzzles/publish-eligibility.shared.mjs";
import { puzzleDetailContentSchema, registrySchema } from "../lib/puzzles/schema.shared.mjs";
import type {
  ContentCandidate,
  ContentKitchenIssueCode,
  FullAnalysisReasoning,
  L1PuzzleInput,
  ValidationOutcome,
} from "../lib/puzzles/content-kitchen/types";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const BUILD_APP_DIR = resolve(ROOT, ".next", "server", "app");
const PUBLIC_DETAIL_STATES = new Set(["published", "fallback_full"]);

type GateStatus =
  | "AUTO_PUBLISH_ALLOWED"
  | "BLOCK_PUBLISH"
  | "DOWNGRADE_TO_ANSWER_FIRST_NOINDEX"
  | "REVIEW_REQUIRED";

type RegistryEntry = {
  puzzleNumber: number;
  slug: string;
  publishDate: string;
  status: string;
  detailState?: string;
  clues: string[];
  mainAnswer?: string;
  category?: string;
  shortSummary?: string;
  updatedAt?: string;
};

type DetailRecord = Record<string, unknown> & {
  answer?: string;
  mainAnswer?: string;
  category?: string;
  slug?: string;
  detailState?: string;
  bodyMode?: string;
  pageExperienceMode?: string;
  clueRows?: unknown[];
  faqItems?: unknown[];
  faqs?: unknown[];
  turningPoint?: unknown;
  solvePath?: unknown;
};

type GateIssue = {
  level: "hard" | "review" | "downgrade" | "info";
  scope: string;
  message: string;
};

type Args = {
  build: boolean;
  json: boolean;
  slug?: string;
  help: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    build: true,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--use-existing-build" || arg === "--skip-build") {
      args.build = false;
    } else if (arg === "--slug") {
      const value = argv[index + 1];
      if (!value) throw new Error("--slug requires a value");
      args.slug = value;
      index += 1;
    } else if (arg.startsWith("--slug=")) {
      args.slug = arg.slice("--slug=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Usage:
  npm run pinpoint:prepublish-gate
  npm run pinpoint:prepublish-gate -- --slug pinpoint-answer-759
  npm run pinpoint:prepublish-gate -- --use-existing-build
  npm --silent run pinpoint:prepublish-gate -- --json

What it checks:
  - current data validates through npm run build
  - latest registry/detail data is public and internally consistent
  - rendered detail HTML has answer, clues, FAQ, recent links, canonical, robots, JSON-LD, title, description, and H1
  - rendered detail HTML passes the AITDK-style detail keyword order audit
  - rendered homepage, archive, and sitemap point to the latest detail page
  - Content Kitchen candidate rules return a final publish decision
`.trim());
}

function run(command: string, args: string[], options: { quiet?: boolean } = {}): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: process.env,
      stdio: options.quiet ? ["ignore", "pipe", "pipe"] : "inherit",
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    if (options.quiet) {
      child.stdout?.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });
    }

    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      const detail = `${stdout}${stderr}`.trim();
      rejectPromise(new Error(`Command failed: ${command} ${args.join(" ")}${detail ? `\n${detail}` : ""}`));
    });
  });
}

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function readJson(path: string): unknown {
  return JSON.parse(readText(path));
}

function addIssue(issues: GateIssue[], level: GateIssue["level"], scope: string, message: string) {
  issues.push({ level, scope, message });
}

async function checkDetailKeywordAudit(issues: GateIssue[], htmlPath: string, slug: string) {
  try {
    await run(
      "npm",
      ["run", "detail:keyword-audit", "--", "--html", htmlPath, "--slug", slug, "--top", "16"],
      { quiet: true },
    );
  } catch (error) {
    addIssue(
      issues,
      "hard",
      "detail:keyword-audit",
      error instanceof Error ? error.message : "Detail keyword audit failed.",
    );
  }
}

function detailRoute(slug: string): string {
  return `/linkedin-pinpoint-answers/${slug}/`;
}

function withTrailingSlash(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
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

function stripTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function stripScripts(html: string): string {
  return html.replace(/<script\b[\s\S]*?<\/script>/gi, "");
}

function normalizeText(value: unknown): string {
  return decodeHtmlEntities(String(value ?? ""))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForMatch(value: unknown): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/["“”'`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readAttribute(tag: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`\\s${escaped}="([^"]*)"`, "i"));
  return decodeHtmlEntities(match?.[1] ?? "");
}

function extractTagText(markup: string, tagName: string): string[] {
  const matches = markup.matchAll(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi"));
  return Array.from(matches, (match) => stripTags(match[1] ?? ""));
}

function extractHrefValues(markup: string): string[] {
  const matches = markup.matchAll(/<a\b[^>]*\shref="([^"]+)"/gi);
  return Array.from(matches, (match) => decodeHtmlEntities(match[1] ?? ""));
}

function findMetaContent(markup: string, nameOrProperty: string): string {
  const metaTags = markup.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    const name = readAttribute(tag, "name") || readAttribute(tag, "property");
    if (name === nameOrProperty) return readAttribute(tag, "content");
  }
  return "";
}

function findLinkHref(markup: string, rel: string): string {
  const linkTags = markup.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of linkTags) {
    if (readAttribute(tag, "rel") === rel) return readAttribute(tag, "href");
  }
  return "";
}

function countClass(markup: string, className: string): number {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = markup.match(new RegExp(`class="[^"]*\\b${escaped}\\b[^"]*"`, "g"));
  return matches?.length ?? 0;
}

function parseJsonLd(html: string): Record<string, unknown>[] {
  const scripts = html.matchAll(
    /<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  );
  const items: Record<string, unknown>[] = [];
  for (const match of scripts) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        items.push(parsed as Record<string, unknown>);
      }
    } catch {
      try {
        const parsed = JSON.parse(decodeHtmlEntities(raw)) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          items.push(parsed as Record<string, unknown>);
        }
      } catch {
        items.push({ "@type": "ParseError" });
      }
    }
  }
  return items;
}

function typeMatches(item: Record<string, unknown>, typeName: string): boolean {
  const type = item["@type"];
  return Array.isArray(type) ? type.includes(typeName) : type === typeName;
}

function hasStructuredData(items: Record<string, unknown>[], typeName: string): boolean {
  return items.some((item) => typeMatches(item, typeName));
}

function buildHtmlPathCandidates(canonicalUrl: string): string[] {
  const pathname = new URL(canonicalUrl).pathname;
  const withoutLeadingSlash = decodeURIComponent(pathname).replace(/^\/+/, "");
  const withoutTrailingSlash = withoutLeadingSlash.replace(/\/+$/, "");

  return [
    resolve(BUILD_APP_DIR, `${withoutTrailingSlash}.html`),
    resolve(BUILD_APP_DIR, withoutTrailingSlash, "index.html"),
    resolve(BUILD_APP_DIR, withoutLeadingSlash, "index.html"),
  ];
}

function findHtmlPath(canonicalUrl: string): string | null {
  for (const candidate of buildHtmlPathCandidates(canonicalUrl)) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function findSitemapPath(): string | null {
  const candidates = [
    resolve(BUILD_APP_DIR, "sitemap.xml.body"),
    resolve(BUILD_APP_DIR, "sitemap.xml"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function parseSitemapPaths(xml: string): Set<string> {
  const paths = new Set<string>();
  const blocks = xml.matchAll(/<url>([\s\S]*?)<\/url>/g);
  for (const block of blocks) {
    const text = block[1] ?? "";
    const loc = decodeHtmlEntities(text.match(/<loc>([\s\S]*?)<\/loc>/)?.[1]?.trim() ?? "");
    if (!loc) continue;
    try {
      paths.add(withTrailingSlash(new URL(loc).pathname));
    } catch {
      paths.add(withTrailingSlash(loc));
    }
  }
  return paths;
}

function readRegistryEntries(): RegistryEntry[] {
  return registrySchema.parse(readJson(resolve(ROOT, "data", "puzzles", "registry.json"))) as RegistryEntry[];
}

function readDetail(slug: string): DetailRecord {
  return puzzleDetailContentSchema.parse(readJson(resolve(ROOT, "data", "puzzles", `${slug}.json`))) as DetailRecord;
}

function isPublicEntry(entry: RegistryEntry): boolean {
  const detailState = entry.detailState ?? (entry.status === "draft" || entry.status === "preview" ? "draft" : "published");
  return (
    (entry.status === "live" || entry.status === "archived") &&
    Boolean(entry.mainAnswer) &&
    Boolean(entry.category) &&
    PUBLIC_DETAIL_STATES.has(detailState)
  );
}

function newestPublicEntry(entries: RegistryEntry[], slug?: string): RegistryEntry | null {
  const publicEntries = entries
    .filter(isPublicEntry)
    .sort((left, right) => right.puzzleNumber - left.puzzleNumber);
  if (slug) {
    return publicEntries.find((entry) => entry.slug === slug) ?? null;
  }
  return publicEntries.find((entry) => entry.status === "live") ?? publicEntries[0] ?? null;
}

function makeL1Input(entry: RegistryEntry): L1PuzzleInput {
  return {
    puzzleId: `linkedin-pinpoint-${entry.puzzleNumber}`,
    puzzleNumber: entry.puzzleNumber,
    logicalGameDate: entry.publishDate,
    source: "local-registry",
    answer: normalizeText(entry.mainAnswer),
    clues: entry.clues.map((text, index) => ({
      clueId: `clue-${index + 1}`,
      text,
      position: index + 1,
    })),
  };
}

function clueIdForText(l1Input: L1PuzzleInput, value: unknown): string {
  const normalized = normalizeForMatch(value);
  return l1Input.clues.find((clue) => normalizeForMatch(clue.text) === normalized)?.clueId ?? "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(normalizeText).filter(Boolean) : [];
}

function buildReasoning(detail: DetailRecord, l1Input: L1PuzzleInput): FullAnalysisReasoning | undefined {
  const explicitReasoning = asRecord(detail.reasoning);
  if (explicitReasoning) return explicitReasoning as FullAnalysisReasoning;

  const turningPoint = asRecord(detail.turningPoint);
  const solvePath = asRecord(detail.solvePath);
  if (!turningPoint) return undefined;

  const clueId = clueIdForText(l1Input, turningPoint.clue);
  if (!clueId) return undefined;

  return {
    pattern: "turning_point",
    clueId,
    brokenTheory: asStringArray(solvePath?.falseStarts)[0] ?? "the first loose reading",
    supportedTheory: normalizeText(detail.answer ?? detail.mainAnswer ?? l1Input.answer),
    text: [turningPoint.whyDecisive, turningPoint.whatChangedAfterIt].map(normalizeText).filter(Boolean).join(" "),
  };
}

function stableContentHash(detail: DetailRecord): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(detail), "utf8").digest("hex")}`;
}

function buildCandidate(entry: RegistryEntry, detail: DetailRecord, l1Input: L1PuzzleInput, siteUrl: string): Partial<ContentCandidate> {
  const clueRows = Array.isArray(detail.clueRows)
    ? detail.clueRows.map((row) => {
      const record = asRecord(row) ?? {};
      const clueText = normalizeText(record.clue);
      const evidenceRefs = asStringArray(record.evidenceRefs);
      const evidenceRef = normalizeText(record.evidenceRef);
      return {
        clueId: clueIdForText(l1Input, clueText),
        clueText,
        fit: normalizeText(record.resolvedPhraseOrMember ?? clueText),
        whyItSupportsAnswer: normalizeText(record.nonObviousWhy ?? record.searchableContext),
        evidenceRefs: evidenceRefs.length > 0 ? evidenceRefs : evidenceRef ? [evidenceRef] : [],
      };
    })
    : undefined;

  const faqItems = Array.isArray(detail.faqItems)
    ? detail.faqItems.map((item) => {
      const record = asRecord(item) ?? {};
      return {
        question: normalizeText(record.question),
        answer: normalizeText(record.answer),
      };
    })
    : undefined;

  return {
    puzzleId: l1Input.puzzleId,
    slug: entry.slug,
    canonicalUrl: new URL(detailRoute(entry.slug), siteUrl).toString(),
    contentMode: detail.pageExperienceMode === "light-explainer" || detail.bodyMode === "short" ? "answer-first" : "full-analysis",
    revisionId: normalizeText(detail.revisionId) || `local-${entry.slug}-${normalizeText(entry.updatedAt) || "unknown"}`,
    inputSnapshotHash: hashInputSnapshot(l1Input),
    contentHash: normalizeText(detail.contentHash) || stableContentHash(detail),
    answer: normalizeText(detail.answer ?? detail.mainAnswer ?? entry.mainAnswer),
    answerCategory: normalizeText(detail.category ?? entry.category ?? entry.mainAnswer),
    clues: l1Input.clues,
    summary: normalizeText(entry.shortSummary),
    clueRows,
    reasoning: buildReasoning(detail, l1Input),
    faqItems,
  };
}

const FAST_EXPLANATION_ONLY_ISSUES = new Set<ContentKitchenIssueCode>([
  "MISSING_EVIDENCE_REF",
  "WEAK_FIT_EVIDENCE",
]);

function hasFastGeneratedClueExplanations(detail: DetailRecord, entry: RegistryEntry): boolean {
  if (!Array.isArray(detail.clueRows) || detail.clueRows.length !== entry.clues.length) {
    return false;
  }

  return detail.clueRows.every((row, index) => {
    const record = asRecord(row);
    if (!record) return false;
    const clue = normalizeText(record.clue);
    const resolved = normalizeText(record.phraseExample ?? record.resolvedPhraseOrMember ?? record.searchableContext);
    const why = normalizeText(record.nonObviousWhy);

    return (
      normalizeForMatch(clue) === normalizeForMatch(entry.clues[index]) &&
      resolved.length >= 3 &&
      normalizeForMatch(resolved) !== normalizeForMatch(clue) &&
      why.length >= 45
    );
  });
}

function canUseFastGeneratedExplanationMode(
  candidateOutcome: ValidationOutcome,
  issueCodes: ContentKitchenIssueCode[],
  detail: DetailRecord,
  entry: RegistryEntry,
): boolean {
  if (candidateOutcome !== "downgrade_to_answer_first" && candidateOutcome !== "requires_review") {
    return false;
  }
  if (issueCodes.length === 0 || issueCodes.some((code) => !FAST_EXPLANATION_ONLY_ISSUES.has(code))) {
    return false;
  }
  return hasFastGeneratedClueExplanations(detail, entry);
}

function checkRenderedDetail(issues: GateIssue[], input: {
  html: string;
  entry: RegistryEntry;
  detail: DetailRecord;
  allEntries: RegistryEntry[];
}) {
  const { html, entry, detail, allEntries } = input;
  const bodyMarkup = stripScripts(html);
  const pageText = stripTags(bodyMarkup);
  const h1Values = extractTagText(bodyMarkup, "h1");
  const title = extractTagText(html, "title")[0] ?? "";
  const description = findMetaContent(html, "description");
  const canonical = findLinkHref(html, "canonical");
  const robots = findMetaContent(html, "robots");
  const hrefs = new Set(extractHrefValues(bodyMarkup));
  const detailPath = detailRoute(entry.slug);
  const structuredData = parseJsonLd(html);
  const answer = normalizeText(detail.answer ?? detail.mainAnswer ?? entry.mainAnswer);
  const expectedTitle = buildPuzzleSeoTitle(entry.puzzleNumber, entry.clues);
  const expectedDescription = buildPuzzleSeoDescription(entry.puzzleNumber, entry.clues, answer);

  if (title !== expectedTitle) {
    addIssue(issues, "hard", "detail:title", `Title does not match the fixed builder output. Expected "${expectedTitle}", got "${title || "(missing)"}".`);
  }
  if (description !== expectedDescription) {
    addIssue(issues, "hard", "detail:description", "Meta description does not match the fixed builder output.");
  }
  if (!canonical.endsWith(detailPath)) {
    addIssue(issues, "hard", "detail:canonical", `Canonical ${canonical || "(missing)"} does not end with ${detailPath}.`);
  }
  if (robots && /noindex/i.test(robots)) {
    addIssue(issues, "hard", "detail:robots", `Public detail page rendered noindex robots meta: ${robots}.`);
  }
  if (!h1Values.some((value) => {
    const normalized = normalizeForMatch(value);
    return normalized.includes("linkedin") &&
      normalized.includes("pinpoint") &&
      normalized.includes(String(entry.puzzleNumber)) &&
      normalized.includes("answer");
  })) {
    addIssue(issues, "hard", "detail:h1", `H1 must include LinkedIn, Pinpoint, #${entry.puzzleNumber}, and Answer wording.`);
  }
  if (!pageText.includes(answer)) {
    addIssue(issues, "hard", "detail:answer", "Rendered page text does not include the answer.");
  }
  for (const clue of entry.clues) {
    if (!pageText.includes(clue)) {
      addIssue(issues, "hard", "detail:clues", `Rendered page text does not include clue: ${clue}.`);
    }
  }
  if (countClass(bodyMarkup, "legacy-reveal-clue-card") !== 5) {
    addIssue(issues, "hard", "detail:clue-cards", "Rendered clue reveal grid does not contain exactly five clue cards.");
  }
  if (!pageText.includes("Answer Reasoning")) {
    addIssue(issues, "hard", "detail:answer-reasoning", "Rendered page is missing the Answer Reasoning section.");
  }
  for (const legacyLabel of [
    "Words & How They Fit",
    "Words &amp; How They Fit",
    "Lessons Learned from Pinpoint",
    "Nearby Reads We Ruled Out",
    "Why This Answer Fits Tighter",
    "Compact FAQ",
    "Quick Take",
  ]) {
    if (bodyMarkup.includes(legacyLabel) || pageText.includes(legacyLabel)) {
      addIssue(issues, "hard", "detail:old-template", `Rendered page still exposes old template label: ${legacyLabel}.`);
    }
  }
  if (countClass(bodyMarkup, "legacy-teaches-item") < 3) {
    addIssue(issues, "hard", "detail:teaches", "Rendered page has fewer than three teaching items.");
  }
  if (!hrefs.has("/puzzles")) {
    addIssue(issues, "hard", "detail:archive-link", "Rendered detail page does not link back to /puzzles.");
  }

  const recentDetailLinkCount = allEntries
    .filter((candidate) => candidate.slug !== entry.slug)
    .slice(0, 3)
    .filter((candidate) => hrefs.has(detailRoute(candidate.slug))).length;
  if (recentDetailLinkCount < Math.min(3, allEntries.length - 1)) {
    addIssue(issues, "hard", "detail:recent-links", "Rendered detail page has fewer than three recent detail links.");
  }

  for (const schemaType of ["Article", "Game", "ItemList", "BreadcrumbList"]) {
    if (!hasStructuredData(structuredData, schemaType)) {
      addIssue(issues, "hard", "detail:json-ld", `Missing ${schemaType} JSON-LD.`);
    }
  }
}

function checkPageLinks(issues: GateIssue[], input: {
  siteUrl: string;
  route: string;
  label: string;
  expectedHref: string;
  allowDynamicRouteFallback?: boolean;
}) {
  const path = findHtmlPath(new URL(input.route, input.siteUrl).toString());
  if (!path) {
    if (input.allowDynamicRouteFallback && hasDynamicPageRoute(input.route)) {
      addIssue(issues, "info", input.label, `${input.route} is dynamic in the build output; latest public registry entry is the archive source.`);
      return;
    }
    addIssue(issues, "hard", input.label, `Missing rendered HTML for ${input.route}.`);
    return;
  }

  const hrefs = new Set(extractHrefValues(stripScripts(readText(path))));
  if (!hrefs.has(input.expectedHref)) {
    addIssue(issues, "hard", input.label, `${input.route} does not link to ${input.expectedHref}.`);
  }
}

function hasDynamicPageRoute(route: string): boolean {
  const normalized = route.replace(/^\/+|\/+$/g, "");
  if (!normalized) return false;
  const candidates = [
    resolve(BUILD_APP_DIR, normalized, "page.js"),
    resolve(BUILD_APP_DIR, "(site)", normalized, "page.js"),
  ];
  return candidates.some((candidate) => existsSync(candidate));
}

function checkSitemap(issues: GateIssue[], entry: RegistryEntry) {
  const path = findSitemapPath();
  if (!path) {
    addIssue(issues, "hard", "sitemap", "Missing rendered sitemap XML.");
    return;
  }
  const paths = parseSitemapPaths(readText(path));
  const detailPath = detailRoute(entry.slug);
  for (const requiredPath of ["/", "/puzzles/", detailPath]) {
    if (!paths.has(requiredPath)) {
      addIssue(issues, "hard", "sitemap", `Sitemap is missing ${requiredPath}.`);
    }
  }
}

function printResult(result: {
  status: GateStatus;
  entry?: RegistryEntry;
  candidateOutcome?: ValidationOutcome;
  issueCodes?: ContentKitchenIssueCode[];
  issues: GateIssue[];
}, json: boolean) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(result.status);
  if (result.entry) {
    console.log(`Puzzle: #${result.entry.puzzleNumber} ${result.entry.slug}`);
  }
  if (result.candidateOutcome) {
    console.log(`Content Kitchen: ${result.candidateOutcome}`);
  }
  if (result.issueCodes?.length) {
    console.log(`Issue codes: ${result.issueCodes.join(", ")}`);
  }
  if (result.issues.length > 0) {
    console.log("Issues:");
    for (const issue of result.issues) {
      console.log(`- [${issue.level}] ${issue.scope}: ${issue.message}`);
    }
  }
}

function decideStatus(issues: GateIssue[], candidateOutcome?: ValidationOutcome): GateStatus {
  if (issues.some((issue) => issue.level === "hard")) return "BLOCK_PUBLISH";
  if (candidateOutcome === "block_publish") return "BLOCK_PUBLISH";
  if (candidateOutcome === "downgrade_to_answer_first") return "DOWNGRADE_TO_ANSWER_FIRST_NOINDEX";
  if (candidateOutcome === "requires_review") return "REVIEW_REQUIRED";
  if (issues.some((issue) => issue.level === "review")) return "REVIEW_REQUIRED";
  if (issues.some((issue) => issue.level === "downgrade")) return "DOWNGRADE_TO_ANSWER_FIRST_NOINDEX";
  return "AUTO_PUBLISH_ALLOWED";
}

async function runGate(args: Args) {
  const issues: GateIssue[] = [];
  if (args.build) {
    await run("npm", ["run", "build"], { quiet: args.json });
  } else {
    await run("npm", ["run", "validate:data"], { quiet: args.json });
  }

  const siteUrl = getSiteUrl();
  const entries = readRegistryEntries();
  const entry = newestPublicEntry(entries, args.slug);
  if (!entry) {
    addIssue(issues, "hard", "registry", args.slug ? `No public registry entry found for ${args.slug}.` : "No public latest registry entry found.");
    const status = decideStatus(issues);
    return { status, issues };
  }

  const publicEntries = entries
    .filter(isPublicEntry)
    .sort((left, right) => right.puzzleNumber - left.puzzleNumber);
  const detail = readDetail(entry.slug);
  const detailState = normalizeText(detail.detailState ?? entry.detailState ?? "published");
  const answer = normalizeText(detail.answer ?? detail.mainAnswer ?? entry.mainAnswer);

  if (!PUBLIC_DETAIL_STATES.has(detailState)) {
    addIssue(issues, "hard", "detailState", `Latest detailState is not public: ${detailState || "(missing)"}.`);
  }
  if (normalizeText(detail.slug) && normalizeText(detail.slug) !== entry.slug) {
    addIssue(issues, "hard", "detail:slug", `Detail slug ${detail.slug} does not match registry slug ${entry.slug}.`);
  }
  if (!answer || answer !== normalizeText(entry.mainAnswer)) {
    addIssue(issues, "hard", "detail:answer", "Detail answer does not match registry mainAnswer.");
  }
  if (JSON.stringify(detail.clues ?? entry.clues) !== JSON.stringify(entry.clues)) {
    addIssue(issues, "hard", "detail:clues", "Detail clues do not match registry clues.");
  }

  const eligibility = validatePublishEligibility({
    slug: entry.slug,
    detail,
    registryEntry: entry,
    expectedMode: "full-analysis",
    answerFirstPublicEnabled: false,
  });
  if (!eligibility.ok) {
    addIssue(issues, "hard", "publish-eligibility", formatPublishGateIssues(eligibility.issues));
  }

  if (!existsSync(BUILD_APP_DIR)) {
    addIssue(issues, "hard", "build-output", "Missing .next/server/app. Run npm run build before this gate.");
  } else {
    const detailHtmlPath = findHtmlPath(new URL(detailRoute(entry.slug), siteUrl).toString());
    if (!detailHtmlPath) {
      addIssue(issues, "hard", "detail:html", `Missing rendered detail HTML for ${detailRoute(entry.slug)}.`);
    } else {
      const detailHtml = readText(detailHtmlPath);
      checkRenderedDetail(issues, { html: detailHtml, entry, detail, allEntries: publicEntries });
      await checkDetailKeywordAudit(issues, detailHtmlPath, entry.slug);

      const l1Input = makeL1Input(entry);
      const candidate = buildCandidate(entry, detail, l1Input, siteUrl);
      const candidateResult = validateCandidate({
        l1Input,
        candidate,
        canonicalConfig: {
          siteBaseUrl: siteUrl,
          detailRoutePrefix: "/linkedin-pinpoint-answers",
          trailingSlash: true,
        },
        renderedHtml: detailHtml,
        allowAnswerFirstIndex: false,
        existingRoutes: [
          "/",
          "/puzzles",
          ...publicEntries.map((candidateEntry) => detailRoute(candidateEntry.slug)),
        ],
      });
      const issueCodes = candidateResult.issues.map((issue) => issue.issueCode);
      const fastGeneratedExplanationMode = canUseFastGeneratedExplanationMode(
        candidateResult.outcome,
        issueCodes,
        detail,
        entry,
      );
      const effectiveCandidateOutcome: ValidationOutcome = fastGeneratedExplanationMode
        ? "pass_full_analysis"
        : candidateResult.outcome;

      for (const issue of candidateResult.issues) {
        addIssue(
          issues,
          fastGeneratedExplanationMode
            ? "info"
            : candidateResult.outcome === "downgrade_to_answer_first"
              ? "downgrade"
              : "review",
          `content-kitchen:${issue.fieldPath}`,
          fastGeneratedExplanationMode
            ? `${issue.issueCode}: ${issue.message} Fast clue explanations are present; this is info only under the current policy.`
            : `${issue.issueCode}: ${issue.message}`,
        );
      }
      if (fastGeneratedExplanationMode) {
        addIssue(
          issues,
          "info",
          "fast-generated-explanations",
          "Using the quick clue-explanation path: five clue rows are complete, specific, and in clue order.",
        );
      }

      checkPageLinks(issues, {
        siteUrl,
        route: "/",
        label: "home",
        expectedHref: detailRoute(entry.slug),
      });
      checkPageLinks(issues, {
        siteUrl,
        route: "/puzzles/",
        label: "archive",
        expectedHref: detailRoute(entry.slug),
        allowDynamicRouteFallback: true,
      });
      checkSitemap(issues, entry);

      const status = decideStatus(issues, effectiveCandidateOutcome);
      return {
        status,
        entry,
        candidateOutcome: effectiveCandidateOutcome,
        issueCodes,
        issues,
      };
    }
  }

  const status = decideStatus(issues);
  return { status, entry, issues };
}

async function main() {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }

  if (args.help) {
    printHelp();
    return;
  }

  try {
    const result = await runGate(args);
    printResult(result, args.json);
    process.exit(result.status === "AUTO_PUBLISH_ALLOWED" ? 0 : 1);
  } catch (error) {
    const issues: GateIssue[] = [{
      level: "hard",
      scope: "command",
      message: error instanceof Error ? error.message : String(error),
    }];
    printResult({ status: "BLOCK_PUBLISH", issues }, args?.json ?? false);
    process.exit(1);
  }
}

main();
