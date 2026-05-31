import { spawn } from "node:child_process";
import { getArchiveEntries, getPuzzleBySlug } from "../lib/puzzles/data";
import type { PuzzleDetail } from "../lib/puzzles/data";
import {
  buildReasoningArticleDraft,
  validateReasoningArticleDraft,
} from "../lib/puzzles/reasoning-article";

const DEFAULT_SITE_URL = "https://pinpointanswertoday.app";
const DETAIL_PREFIX = "/linkedin-pinpoint-answers/";

type CliOptions = {
  failOnBlockers: boolean;
  json: boolean;
  limit: number;
  siteUrl: string;
  skipFetch: boolean;
  skipKeywordAudit: boolean;
  top: number;
};

type IssueKind = "blocker" | "rewrite" | "warn";

type BackfillIssue = {
  kind: IssueKind;
  message: string;
  scope: string;
};

type PageAuditResult = {
  detailState: PuzzleDetail["detailState"] | "missing";
  detailUrl: string;
  issueCount: number;
  issues: BackfillIssue[];
  number: number;
  slug: string;
  status: "OK" | "WATCH" | "REWRITE" | "BLOCKED";
};

type KeywordAuditJson = {
  issues?: Array<{
    message?: unknown;
    severity?: unknown;
  }>;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    failOnBlockers: false,
    json: false,
    limit: 10,
    siteUrl: DEFAULT_SITE_URL,
    skipFetch: false,
    skipKeywordAudit: false,
    top: 12,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--fail-on-blockers") {
      options.failOnBlockers = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--limit") {
      options.limit = Number.parseInt(readArgValue(argv, index, arg), 10);
      index += 1;
    } else if (arg.startsWith("--limit=")) {
      options.limit = Number.parseInt(arg.slice("--limit=".length), 10);
    } else if (arg === "--site") {
      options.siteUrl = readArgValue(argv, index, arg);
      index += 1;
    } else if (arg.startsWith("--site=")) {
      options.siteUrl = arg.slice("--site=".length);
    } else if (arg === "--skip-fetch") {
      options.skipFetch = true;
    } else if (arg === "--skip-keyword-audit") {
      options.skipKeywordAudit = true;
    } else if (arg === "--top") {
      options.top = Number.parseInt(readArgValue(argv, index, arg), 10);
      index += 1;
    } else if (arg.startsWith("--top=")) {
      options.top = Number.parseInt(arg.slice("--top=".length), 10);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.limit) || options.limit < 1) {
    throw new Error("--limit must be a positive number.");
  }
  if (!Number.isFinite(options.top) || options.top < 1) {
    throw new Error("--top must be a positive number.");
  }

  return options;
}

function readArgValue(argv: string[], index: number, name: string): string {
  const value = argv[index + 1];
  if (!value) throw new Error(`${name} requires a value.`);
  return value;
}

function normalizeSiteUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function buildDetailUrl(siteUrl: string, slug: string): string {
  return `${normalizeSiteUrl(siteUrl)}${DETAIL_PREFIX}${slug}/`;
}

function addIssue(issues: BackfillIssue[], kind: IssueKind, scope: string, message: string) {
  issues.push({ kind, scope, message });
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

function normalizeForMatch(value: unknown): string {
  return decodeHtmlEntities(String(value ?? ""))
    .toLowerCase()
    .replace(/["“”'`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTagText(markup: string, tagName: string): string[] {
  const matches = markup.matchAll(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi"));
  return Array.from(matches, (match) => stripTags(match[1] ?? ""));
}

function stripScripts(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ");
}

function countClass(markup: string, className: string): number {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return markup.match(new RegExp(`class="[^"]*\\b${escaped}\\b[^"]*"`, "g"))?.length ?? 0;
}

async function fetchHtml(url: string): Promise<{ finalUrl: string; html: string; status: number }> {
  const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}backfill_audit=${Date.now()}`, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "cache-control": "no-cache",
      pragma: "no-cache",
      "user-agent": "PinpointRecentBackfillAudit/0.1",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });

  return {
    finalUrl: response.url,
    html: await response.text(),
    status: response.status,
  };
}

function runCommand(
  command: string,
  args: string[],
  timeoutMs = 120000,
): Promise<{ code: number | null; output: string; stderr: string; stdout: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      rejectPromise(new Error(`Timed out: ${command} ${args.join(" ")}`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({
        code,
        output: `${stdout}${stderr}`.trim(),
        stderr,
        stdout,
      });
    });
  });
}

function checkDataShape(issues: BackfillIssue[], puzzle: PuzzleDetail) {
  if (puzzle.detailState === "fallback_full") {
    addIssue(issues, "rewrite", "detail-state", "detailState is fallback_full, so this is a rewrite candidate.");
  }

  if (puzzle.detailSource === "fallback") {
    addIssue(issues, "rewrite", "detail-source", "detailSource is fallback, so content may be older fallback copy.");
  }

  if (puzzle.clues.length !== 5) {
    addIssue(issues, "blocker", "clues", `Expected 5 clues, got ${puzzle.clues.length}.`);
  }

  if (!puzzle.answer.trim()) {
    addIssue(issues, "blocker", "answer", "Answer is missing.");
  }

  if (puzzle.clueRows.length < 5) {
    addIssue(issues, "rewrite", "clue-rows", `Only ${puzzle.clueRows.length} clue rows found.`);
  }

  if (puzzle.faqItems.length < 3) {
    addIssue(issues, "rewrite", "faq-items", `Only ${puzzle.faqItems.length} evidence FAQ items found.`);
  }

  if (puzzle.lessons.length < 3) {
    addIssue(issues, "rewrite", "lessons", `Only ${puzzle.lessons.length} teaching items found.`);
  }

  if (!puzzle.solvePath && puzzle.solutionNarrative.length === 0 && puzzle.articleBlocks.length === 0) {
    addIssue(issues, "rewrite", "reasoning-source", "No solvePath, solutionNarrative, or articleBlocks source text found.");
  }

  if (!puzzle.turningPoint && !puzzle.solvePath?.breakingClue) {
    addIssue(issues, "warn", "turning-point", "No turningPoint or breakingClue is recorded.");
  }

  if (/^Pinpoint Answer Today asks:/i.test(puzzle.shortSummary)) {
    addIssue(issues, "rewrite", "summary", "shortSummary uses the old generic Pinpoint Answer Today intro.");
  }
}

function checkReasoningDraft(issues: BackfillIssue[], puzzle: PuzzleDetail) {
  const draft = buildReasoningArticleDraft(puzzle);
  const draftIssues = validateReasoningArticleDraft(draft, puzzle);

  for (const issue of draftIssues) {
    addIssue(
      issues,
      issue.severity === "hard" ? "rewrite" : "warn",
      `reasoning:${issue.code}`,
      issue.message,
    );
  }
}

function checkProductionHtml(issues: BackfillIssue[], html: string, puzzle: PuzzleDetail) {
  const bodyMarkup = stripScripts(html);
  const pageText = stripTags(bodyMarkup);
  const normalizedText = normalizeForMatch(pageText);
  const title = extractTagText(html, "title")[0] ?? "";
  const h1Values = extractTagText(bodyMarkup, "h1");
  const h2Values = extractTagText(bodyMarkup, "h2");

  if (!normalizeForMatch(title).includes(`linkedin pinpoint ${puzzle.number} answer`)) {
    addIssue(issues, "rewrite", "title", `Title should include LinkedIn Pinpoint ${puzzle.number} Answer.`);
  }

  const expectedH1 = `Pinpoint ${puzzle.number} Answer & LinkedIn Analysis`;
  if (!h1Values.includes(expectedH1)) {
    addIssue(issues, "rewrite", "h1", `H1 should be exactly: ${expectedH1}.`);
  }

  const expectedReasoning = `LinkedIn Pinpoint ${puzzle.number} Answer Reasoning`;
  if (!h2Values.includes(expectedReasoning)) {
    addIssue(issues, "rewrite", "reasoning-heading", `Missing heading: ${expectedReasoning}.`);
  }

  if (countClass(bodyMarkup, "legacy-reveal-clue-card") !== 5) {
    addIssue(issues, "blocker", "clue-cards", "Rendered page must have exactly five clue cards.");
  }

  if (!pageText.includes(puzzle.answer)) {
    addIssue(issues, "blocker", "answer", "Rendered page text does not include the answer.");
  }

  for (const clue of puzzle.clues) {
    if (!pageText.includes(clue)) {
      addIssue(issues, "blocker", "clue-text", `Rendered page text is missing clue: ${clue}.`);
    }
  }

  for (const oldLabel of [
    "Clue Connections",
    "Words & How They Fit",
    "Words &amp; How They Fit",
    "Lessons Learned",
    "Compact FAQ",
    "Words and How They Fit",
  ]) {
    if (pageText.includes(oldLabel) || bodyMarkup.includes(oldLabel)) {
      addIssue(issues, "rewrite", "old-module", `Old removed module label is visible: ${oldLabel}.`);
    }
  }

  for (const runtimeError of [
    "Application error",
    "Unhandled Runtime Error",
    "Hydration failed",
    "Minified React error",
    "client-side exception",
  ]) {
    if (pageText.includes(runtimeError) || bodyMarkup.includes(runtimeError)) {
      addIssue(issues, "blocker", "runtime-error", `Runtime error text appears on the page: ${runtimeError}.`);
    }
  }

  if (
    !normalizedText.includes(`pinpoint ${puzzle.number}`) ||
    !normalizedText.includes(`pinpoint ${puzzle.number} answer`) ||
    !normalizedText.includes(`linkedin pinpoint ${puzzle.number} answer`)
  ) {
    addIssue(
      issues,
      "rewrite",
      "issue-number",
      `Page text should include pinpoint ${puzzle.number}, pinpoint ${puzzle.number} answer, and linkedin pinpoint ${puzzle.number} answer.`,
    );
  }
}

async function checkKeywordAudit(
  issues: BackfillIssue[],
  detailUrl: string,
  top: number,
) {
  const result = await runCommand(
    "npm",
    ["--silent", "run", "detail:keyword-audit", "--", "--url", detailUrl, "--top", String(top), "--json"],
    120000,
  );

  let parsed: KeywordAuditJson | null = null;
  try {
    parsed = parseJsonObject(result.stdout || result.output) as KeywordAuditJson;
  } catch {
    addIssue(issues, "warn", "keyword-audit", "Keyword audit JSON output could not be parsed.");
  }

  const keywordIssues = parsed?.issues ?? [];
  for (const issue of keywordIssues.slice(0, 8)) {
    const severity = String(issue.severity ?? "warn");
    addIssue(
      issues,
      severity === "hard" ? "rewrite" : "warn",
      `keyword:${severity}`,
      String(issue.message ?? "Keyword audit issue."),
    );
  }

  if (keywordIssues.length > 8) {
    addIssue(issues, "warn", "keyword-audit", `Keyword audit returned ${keywordIssues.length - 8} more issues.`);
  }

  if (result.code !== 0 && keywordIssues.length === 0) {
    addIssue(
      issues,
      "rewrite",
      "keyword-audit",
      summarizeCommandOutput(result.output || `Keyword audit exited with code ${result.code}.`),
    );
  }
}

function parseJsonObject(output: string): unknown {
  const trimmed = output.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("No JSON object found.");
    }
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

function summarizeCommandOutput(output: string): string {
  const compact = output.replace(/\s+/g, " ").trim();
  return compact.length > 360 ? `${compact.slice(0, 360)}...` : compact;
}

function statusForIssues(issues: BackfillIssue[]): PageAuditResult["status"] {
  if (issues.some((issue) => issue.kind === "blocker")) return "BLOCKED";
  if (issues.some((issue) => issue.kind === "rewrite")) return "REWRITE";
  if (issues.some((issue) => issue.kind === "warn")) return "WATCH";
  return "OK";
}

async function auditPage(
  slug: string,
  options: CliOptions,
): Promise<PageAuditResult> {
  const puzzle = await getPuzzleBySlug(slug, { allowLiveWorkerFallback: false });
  const number = puzzle?.number ?? Number.parseInt(slug.match(/(\d+)$/)?.[1] ?? "0", 10);
  const detailUrl = buildDetailUrl(options.siteUrl, slug);
  const issues: BackfillIssue[] = [];

  if (!puzzle) {
    addIssue(issues, "blocker", "data", "Local puzzle detail could not be loaded.");
    return {
      detailState: "missing",
      detailUrl,
      issueCount: issues.length,
      issues,
      number,
      slug,
      status: "BLOCKED",
    };
  }

  checkDataShape(issues, puzzle);
  checkReasoningDraft(issues, puzzle);

  if (!options.skipFetch) {
    try {
      const fetched = await fetchHtml(detailUrl);
      if (fetched.status !== 200) {
        addIssue(issues, "blocker", "detail-url", `Detail URL returned HTTP ${fetched.status}.`);
      } else {
        checkProductionHtml(issues, fetched.html, puzzle);
      }
    } catch (error) {
      addIssue(issues, "blocker", "detail-url", error instanceof Error ? error.message : String(error));
    }
  }

  if (!options.skipKeywordAudit) {
    try {
      await checkKeywordAudit(issues, detailUrl, options.top);
    } catch (error) {
      addIssue(issues, "rewrite", "keyword-audit", error instanceof Error ? error.message : String(error));
    }
  }

  return {
    detailState: puzzle.detailState,
    detailUrl,
    issueCount: issues.length,
    issues,
    number: puzzle.number,
    slug,
    status: statusForIssues(issues),
  };
}

function printTextSummary(results: PageAuditResult[]) {
  const blocked = results.filter((result) => result.status === "BLOCKED").length;
  const rewrite = results.filter((result) => result.status === "REWRITE").length;
  const watch = results.filter((result) => result.status === "WATCH").length;
  const ok = results.filter((result) => result.status === "OK").length;

  console.log(`Recent detail backfill audit: ${results.length} pages`);
  console.log(`OK ${ok} | WATCH ${watch} | REWRITE ${rewrite} | BLOCKED ${blocked}`);

  for (const result of results) {
    const label = `#${result.number} ${result.slug}`;
    console.log(`\n${label} — ${result.status} (${result.detailState}, ${result.issueCount} notes)`);
    for (const issue of result.issues.slice(0, 10)) {
      console.log(`- [${issue.kind}] ${issue.scope}: ${issue.message}`);
    }
    if (result.issues.length > 10) {
      console.log(`- ...and ${result.issues.length - 10} more notes`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const entries = (await getArchiveEntries({ allowLiveWorkerFallback: false })).slice(0, options.limit);

  if (entries.length === 0) {
    throw new Error("No public detail pages found.");
  }

  const results: PageAuditResult[] = [];
  for (const entry of entries) {
    results.push(await auditPage(entry.slug, options));
  }

  const summary = {
    blocked: results.filter((result) => result.status === "BLOCKED").length,
    ok: results.filter((result) => result.status === "OK").length,
    rewrite: results.filter((result) => result.status === "REWRITE").length,
    total: results.length,
    watch: results.filter((result) => result.status === "WATCH").length,
  };

  if (options.json) {
    console.log(JSON.stringify({ results, summary }, null, 2));
  } else {
    printTextSummary(results);
  }

  if (options.failOnBlockers && summary.blocked > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
