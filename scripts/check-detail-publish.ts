import { spawn } from "node:child_process";
import { getCurrentPuzzle, getPuzzleBySlug } from "../lib/puzzles/data";
import type { PuzzleDetail } from "../lib/puzzles/data";

const DEFAULT_SITE_URL = "https://pinpointanswertoday.app";
const DEFAULT_VERCEL_SCOPE = "team_funPiYWRgqIN2bAClbNEdWJ8";
const DETAIL_PREFIX = "/linkedin-pinpoint-answers/";

type Args = {
  help: boolean;
  siteUrl: string;
  skipKeywordAudit: boolean;
  skipVercel: boolean;
  slug: string | null;
  top: number;
  url: string | null;
  vercelScope: string;
};

type Issue = {
  message: string;
  scope: string;
};

type CheckResult = {
  label: string;
  ok: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    help: false,
    siteUrl: DEFAULT_SITE_URL,
    skipKeywordAudit: false,
    skipVercel: false,
    slug: null,
    top: 12,
    url: null,
    vercelScope: DEFAULT_VERCEL_SCOPE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--site") {
      args.siteUrl = readArgValue(argv, index, arg);
      index += 1;
    } else if (arg.startsWith("--site=")) {
      args.siteUrl = arg.slice("--site=".length);
    } else if (arg === "--skip-keyword-audit") {
      args.skipKeywordAudit = true;
    } else if (arg === "--skip-vercel") {
      args.skipVercel = true;
    } else if (arg === "--slug") {
      args.slug = readArgValue(argv, index, arg);
      index += 1;
    } else if (arg.startsWith("--slug=")) {
      args.slug = arg.slice("--slug=".length);
    } else if (arg === "--top") {
      args.top = Number.parseInt(readArgValue(argv, index, arg), 10);
      index += 1;
    } else if (arg.startsWith("--top=")) {
      args.top = Number.parseInt(arg.slice("--top=".length), 10);
    } else if (arg === "--url") {
      args.url = readArgValue(argv, index, arg);
      index += 1;
    } else if (arg.startsWith("--url=")) {
      args.url = arg.slice("--url=".length);
    } else if (arg === "--vercel-scope") {
      args.vercelScope = readArgValue(argv, index, arg);
      index += 1;
    } else if (arg.startsWith("--vercel-scope=")) {
      args.vercelScope = arg.slice("--vercel-scope=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.top) || args.top < 1) {
    throw new Error("--top must be a positive number.");
  }

  return args;
}

function readArgValue(argv: string[], index: number, name: string): string {
  const value = argv[index + 1];
  if (!value) throw new Error(`${name} requires a value.`);
  return value;
}

function printHelp() {
  console.log(`
Usage:
  npm run detail:publish-check
  npm run detail:publish-check -- --slug pinpoint-answer-761
  npm run detail:publish-check -- --url https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-761/

What it checks:
  - production detail URL returns 200
  - H1, title, answer, five clue cards, reasoning, teaching items, recent links, and JSON-LD are present
  - old removed modules do not appear
  - runtime error text does not appear
  - detail keyword audit passes
  - /api/puzzles/summary points to the same page
  - Vercel production deployment is Ready
`.trim());
}

function normalizeSiteUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function detailRoute(slug: string): string {
  return `${DETAIL_PREFIX}${slug}/`;
}

function buildDetailUrl(siteUrl: string, slug: string): string {
  return `${normalizeSiteUrl(siteUrl)}${detailRoute(slug)}`;
}

function normalizeUrlForCompare(value: string): string {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "/");
  } catch {
    return value.replace(/[?#].*$/, "").replace(/\/+$/, "/");
  }
}

function slugFromUrl(url: string): string | null {
  const match = url.match(/\/linkedin-pinpoint-answers\/([^/?#]+)\/?/);
  return match?.[1] ?? null;
}

function addIssue(issues: Issue[], scope: string, message: string) {
  issues.push({ scope, message });
}

function addOk(results: CheckResult[], label: string) {
  results.push({ label, ok: true });
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

function stripScripts(html: string): string {
  return html.replace(/<script\b[\s\S]*?<\/script>/gi, "");
}

function stripTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
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

function extractTagText(markup: string, tagName: string): string[] {
  const matches = markup.matchAll(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi"));
  return Array.from(matches, (match) => stripTags(match[1] ?? ""));
}

function extractHrefValues(markup: string): string[] {
  const matches = markup.matchAll(/<a\b[^>]*\shref="([^"]+)"/gi);
  return Array.from(matches, (match) => decodeHtmlEntities(match[1] ?? ""));
}

function countClass(markup: string, className: string): number {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return markup.match(new RegExp(`class="[^"]*\\b${escaped}\\b[^"]*"`, "g"))?.length ?? 0;
}

function parseJsonLd(html: string): Record<string, unknown>[] {
  const scripts = html.matchAll(
    /<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  );
  const items: Record<string, unknown>[] = [];

  for (const match of scripts) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    const candidates = [raw, decodeHtmlEntities(raw)];
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          items.push(parsed as Record<string, unknown>);
          break;
        }
      } catch {
        // Try the decoded candidate next.
      }
    }
  }

  return items;
}

function typeMatches(item: Record<string, unknown>, typeName: string): boolean {
  const type = item["@type"];
  return Array.isArray(type) ? type.includes(typeName) : type === typeName;
}

function hasStructuredType(items: Record<string, unknown>[], typeName: string): boolean {
  return items.some((item) => typeMatches(item, typeName));
}

async function fetchText(url: string): Promise<{ finalUrl: string; html: string; status: number }> {
  const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}publish_check=${Date.now()}`, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "cache-control": "no-cache",
      pragma: "no-cache",
      "user-agent": "PinpointDetailPublishCheck/0.1",
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

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}publish_check=${Date.now()}`, {
    headers: {
      accept: "application/json",
      "cache-control": "no-cache",
      pragma: "no-cache",
      "user-agent": "PinpointDetailPublishCheck/0.1",
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

function run(command: string, args: string[], timeoutMs = 120000): Promise<string> {
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
      const output = `${stdout}${stderr}`.trim();
      if (code === 0) {
        resolvePromise(output);
      } else {
        rejectPromise(new Error(`Command failed: ${command} ${args.join(" ")}${output ? `\n${output}` : ""}`));
      }
    });
  });
}

function checkDetailHtml(
  issues: Issue[],
  results: CheckResult[],
  html: string,
  finalUrl: string,
  detailUrl: string,
  puzzle: PuzzleDetail,
) {
  const bodyMarkup = stripScripts(html);
  const pageText = stripTags(bodyMarkup);
  const normalizedText = normalizeForMatch(pageText);
  const title = extractTagText(html, "title")[0] ?? "";
  const h1Values = extractTagText(bodyMarkup, "h1");
  const h2Values = extractTagText(bodyMarkup, "h2");
  const h3Values = extractTagText(bodyMarkup, "h3");
  const hrefs = new Set(extractHrefValues(bodyMarkup));
  const clueWords = Array.from(
    bodyMarkup.matchAll(/<span class="legacy-reveal-clue-word">([\s\S]*?)<\/span>/g),
    (match) => stripTags(match[1] ?? ""),
  );

  if (normalizeUrlForCompare(finalUrl) !== normalizeUrlForCompare(detailUrl)) {
    addIssue(issues, "detail-url", `Final URL is ${finalUrl}, expected ${detailUrl}.`);
  } else {
    addOk(results, "detail URL resolves to the expected page");
  }

  if (!normalizeForMatch(title).includes(`linkedin pinpoint ${puzzle.number} answer`)) {
    addIssue(issues, "title", `Title should include LinkedIn Pinpoint ${puzzle.number} Answer.`);
  } else {
    addOk(results, "title targets the current detail page");
  }

  const expectedH1 = `Pinpoint ${puzzle.number} Answer & LinkedIn Analysis`;
  if (!h1Values.includes(expectedH1)) {
    addIssue(issues, "h1", `H1 should be exactly: ${expectedH1}.`);
  } else {
    addOk(results, "H1 uses the fixed detail-page format");
  }

  if (countClass(bodyMarkup, "legacy-reveal-clue-card") !== 5) {
    addIssue(issues, "clue-cards", "Rendered page must have exactly five clue cards.");
  } else {
    addOk(results, "five clue cards are visible");
  }

  if (clueWords.length !== 5 || clueWords.some((value, index) => value !== puzzle.clues[index])) {
    addIssue(issues, "clue-order", `Clue order mismatch: expected ${puzzle.clues.join(" | ")}, got ${clueWords.join(" | ")}.`);
  } else {
    addOk(results, "clue order matches data");
  }

  if (!pageText.includes(puzzle.answer)) {
    addIssue(issues, "answer", "Rendered page text does not include the answer.");
  } else {
    addOk(results, "answer is visible in rendered HTML");
  }

  const expectedReasoning = `LinkedIn Pinpoint ${puzzle.number} Answer Reasoning`;
  if (!h2Values.includes(expectedReasoning)) {
    addIssue(issues, "reasoning", `Missing heading: ${expectedReasoning}.`);
  } else {
    addOk(results, "reasoning heading is present");
  }

  if (!h3Values.includes("What This Pinpoint Teaches")) {
    addIssue(issues, "teaching", "Missing What This Pinpoint Teaches heading.");
  } else {
    addOk(results, "teaching section is present");
  }

  const requiredTeachingItems = puzzle.pageExperienceMode === "full-analysis" ? 3 : 2;
  const teachingCount = countClass(bodyMarkup, "legacy-teaches-item");
  if (teachingCount < requiredTeachingItems) {
    addIssue(issues, "teaching", `Teaching item count ${teachingCount} is below required ${requiredTeachingItems}.`);
  } else {
    addOk(results, "teaching items are present");
  }

  const recentDetailLinkCount = Array.from(hrefs).filter((href) => href.startsWith(DETAIL_PREFIX) && !href.includes(puzzle.slug)).length;
  if (recentDetailLinkCount < 3) {
    addIssue(issues, "recent-links", "Rendered page has fewer than three recent detail links.");
  } else {
    addOk(results, "recent detail links are present");
  }

  if (!hrefs.has("/puzzles")) {
    addIssue(issues, "archive-link", "Rendered page does not link back to /puzzles.");
  } else {
    addOk(results, "archive link is present");
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
      addIssue(issues, "old-module", `Old removed module label is visible: ${oldLabel}.`);
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
      addIssue(issues, "runtime-error", `Runtime error text appears on the page: ${runtimeError}.`);
    }
  }

  if (
    !normalizedText.includes(`pinpoint ${puzzle.number}`) ||
    !normalizedText.includes(`pinpoint ${puzzle.number} answer`) ||
    !normalizedText.includes(`linkedin pinpoint ${puzzle.number} answer`)
  ) {
    addIssue(issues, "issue-number", `Page text must include pinpoint ${puzzle.number}, pinpoint ${puzzle.number} answer, and linkedin pinpoint ${puzzle.number} answer.`);
  } else {
    addOk(results, "current-number phrases are present");
  }

  const jsonLd = parseJsonLd(html);
  for (const typeName of ["Article", "BreadcrumbList", "ItemList"]) {
    if (!hasStructuredType(jsonLd, typeName)) {
      addIssue(issues, "json-ld", `Missing ${typeName} JSON-LD.`);
    }
  }
  if (["Article", "BreadcrumbList", "ItemList"].every((typeName) => hasStructuredType(jsonLd, typeName))) {
    addOk(results, "required JSON-LD types are present");
  }
}

async function checkSummary(
  issues: Issue[],
  results: CheckResult[],
  siteUrl: string,
  puzzle: PuzzleDetail,
) {
  try {
    const payload = await fetchJson(`${normalizeSiteUrl(siteUrl)}/api/puzzles/summary`);
    const latest = (payload as { latest?: { puzzleNumber?: unknown; slug?: unknown; status?: unknown } })?.latest;
    const number = Number(latest?.puzzleNumber);
    const slug = String(latest?.slug ?? "");
    const status = String(latest?.status ?? "");

    if (number !== puzzle.number || slug !== puzzle.slug || status !== "live") {
      addIssue(
        issues,
        "summary-api",
        `/api/puzzles/summary points to number=${number || "(missing)"}, slug=${slug || "(missing)"}, status=${status || "(missing)"}. Expected ${puzzle.number}, ${puzzle.slug}, live.`,
      );
      return;
    }

    addOk(results, "/api/puzzles/summary points to this page");
  } catch (error) {
    addIssue(issues, "summary-api", error instanceof Error ? error.message : String(error));
  }
}

async function checkKeywordAudit(
  issues: Issue[],
  results: CheckResult[],
  detailUrl: string,
  top: number,
) {
  try {
    await run("npm", ["run", "detail:keyword-audit", "--", "--url", detailUrl, "--top", String(top)], 120000);
    addOk(results, "detail keyword audit passes");
  } catch (error) {
    addIssue(issues, "detail:keyword-audit", error instanceof Error ? error.message : String(error));
  }
}

async function checkVercel(
  issues: Issue[],
  results: CheckResult[],
  vercelScope: string,
) {
  try {
    const output = await run("npx", ["vercel", "ls", "pinpoint-answer-today-new", "--scope", vercelScope], 90000);
    if (!/\bReady\b/i.test(output) || !/\bProduction\b/i.test(output)) {
      addIssue(issues, "vercel", "Vercel ls did not show a Ready Production deployment.");
      return;
    }
    addOk(results, "Vercel has a Ready Production deployment");
  } catch (error) {
    addIssue(issues, "vercel", error instanceof Error ? error.message : String(error));
  }
}

async function resolvePuzzle(args: Args): Promise<PuzzleDetail> {
  const slug = args.slug ?? (args.url ? slugFromUrl(args.url) : null);
  if (slug) {
    const puzzle = await getPuzzleBySlug(slug, { allowLiveWorkerFallback: false });
    if (!puzzle) throw new Error(`No local puzzle data found for ${slug}.`);
    return puzzle;
  }

  return getCurrentPuzzle({ allowLiveWorkerFallback: false });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const issues: Issue[] = [];
  const results: CheckResult[] = [];
  const puzzle = await resolvePuzzle(args);
  const detailUrl = args.url ?? buildDetailUrl(args.siteUrl, puzzle.slug);

  console.log(`Detail publish check: ${puzzle.slug}`);
  console.log(`URL: ${detailUrl}`);

  try {
    const fetched = await fetchText(detailUrl);
    if (fetched.status !== 200) {
      addIssue(issues, "detail-url", `Detail URL returned HTTP ${fetched.status}.`);
    } else {
      addOk(results, "detail URL returns HTTP 200");
      checkDetailHtml(issues, results, fetched.html, fetched.finalUrl, detailUrl, puzzle);
    }
  } catch (error) {
    addIssue(issues, "detail-url", error instanceof Error ? error.message : String(error));
  }

  await checkSummary(issues, results, args.siteUrl, puzzle);

  if (args.skipKeywordAudit) {
    addOk(results, "detail keyword audit skipped by flag");
  } else {
    await checkKeywordAudit(issues, results, detailUrl, args.top);
  }

  if (args.skipVercel) {
    addOk(results, "Vercel check skipped by flag");
  } else {
    await checkVercel(issues, results, args.vercelScope);
  }

  for (const result of results) {
    console.log(`ok: ${result.label}`);
  }

  if (issues.length > 0) {
    console.error("\nDETAIL_PUBLISH_CHECK_BLOCKED");
    for (const issue of issues) {
      console.error(`- ${issue.scope}: ${issue.message}`);
    }
    process.exit(1);
  }

  console.log("\nDETAIL_PUBLISH_CHECK_PASSED");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
