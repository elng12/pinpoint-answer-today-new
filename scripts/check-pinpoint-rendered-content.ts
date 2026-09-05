import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { puzzleDetailContentSchema, registrySchema } from "../lib/puzzles/schema.shared.mjs";
import { cleanReasoningText } from "../lib/puzzles/reasoning-article";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const BUILD_APP_DIR = resolve(ROOT, ".next", "server", "app");
const DEFAULT_CHECK_LIMIT = Number.POSITIVE_INFINITY;

type RegistryEntry = {
  puzzleNumber: number;
  slug: string;
  publishDate: string;
  status: string;
  clues: string[];
  mainAnswer?: string;
  category?: string;
  updatedAt: string;
  detailState?: string;
};

type DetailRecord = {
  slug?: string;
  pageExperienceMode?: string;
  detailState?: string;
  bodyMode?: string;
  contentTemplateVersion?: string;
  answer?: string;
  clueRows?: { clue: string; resolvedPhraseOrMember: string; nonObviousWhy: string }[];
};

type Issue = {
  scope: string;
  message: string;
};

type SitemapEntry = {
  loc: string;
  lastmod: string;
};

const FORBIDDEN_RENDERED_COPY_PATTERNS = [
  /\bbecause\s+(?:This|That)\b/,
  /\b(?:This|this|that) clue clue\b/,
  /\bBoth clues both\b/i,
  /\bWhen solving puzzles,\s*(?:consider|look for)\b/i,
  /\bunique aspects of each clue\b/i,
];

const issues: Issue[] = [];

function addIssue(scope: string, message: string) {
  issues.push({ scope, message });
}

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function readJson(path: string): unknown {
  return JSON.parse(readText(path));
}

function detailRoute(slug: string): string {
  return `/linkedin-pinpoint-answers/${slug}/`;
}

function detailHtmlPath(slug: string): string {
  return resolve(BUILD_APP_DIR, "linkedin-pinpoint-answers", `${slug}.html`);
}

function isPublicRegistryEntry(entry: RegistryEntry): boolean {
  const detailState =
    entry.detailState ??
    (entry.status === "draft" || entry.status === "preview" ? "draft" : "published");
  return (
    (entry.status === "live" || entry.status === "archived") &&
    Boolean(entry.mainAnswer) &&
    Boolean(entry.category) &&
    (detailState === "published" || detailState === "fallback_full")
  );
}

function normalizeDate(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function newestUpdatedAt(entries: RegistryEntry[]): string {
  const dates = entries
    .map((entry) => normalizeDate(entry.updatedAt))
    .filter(Boolean)
    .sort()
    .reverse();
  return dates[0] ?? "";
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

function normalizeText(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForMatch(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/["“”'`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countClass(markup: string, className: string): number {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = markup.match(new RegExp(`class="[^"]*\\b${escaped}\\b[^"]*"`, "g"));
  return matches?.length ?? 0;
}

function extractTagText(markup: string, tagName: string): string[] {
  const matches = markup.matchAll(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi"));
  return Array.from(matches, (match) => stripTags(match[1] ?? ""));
}

export function checkRenderedContentTemplate(detail: DetailRecord, html: string): string[] {
  const markup = stripScripts(html);
  const teachingCardCount = countClass(markup, "legacy-teaches-item");
  const pageMode = detail.pageExperienceMode ?? (detail.bodyMode === "short" ? "light-explainer" : "full-analysis");
  const requiredFaqCount = pageMode === "full-analysis" ? 3 : 2;
  if (detail.contentTemplateVersion !== "evidence-v1") {
    return teachingCardCount < requiredFaqCount
      ? [`Rendered teaching item count ${teachingCardCount} is below required ${requiredFaqCount} for ${pageMode}.`]
      : [];
  }

  const errors: string[] = [];
  const blocks = Array.from(markup.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/gi), (match) => match[0])
    .filter((block) => countClass(block, "legacy-reasoning-block") > 0);
  const evidenceBlocks = blocks.filter((block) =>
    extractTagText(block, "h3").includes("How Each Clue Fits"),
  );
  const bullets = extractTagText(evidenceBlocks[0] ?? "", "li");
  const rows = detail.clueRows ?? [];
  if (evidenceBlocks.length !== 1 || bullets.length !== 5 || rows.length !== 5) {
    errors.push("Evidence-v1 must render exactly one How Each Clue Fits block with five clue explanations.");
  }
  for (const [index, row] of rows.entries()) {
    const bullet = normalizeForMatch(bullets[index] ?? "");
    for (const label of ["clue", "resolvedPhraseOrMember", "nonObviousWhy"] as const) {
      const value = row[label] ?? "";
      const expected = normalizeForMatch(label === "clue" ? value : cleanReasoningText(value));
      if (!expected || !` ${bullet} `.includes(` ${expected} `)) {
        errors.push(`Evidence-v1 clue ${index + 1} is missing its rendered ${label}.`);
      }
    }
  }
  const reasoningText = stripTags(blocks.join(" "));
  if (/\b(?:My first|I first|I started|first guess|the trap)\b/i.test(reasoningText)) {
    errors.push("Evidence-v1 must not render fabricated first-person solving or false-start copy.");
  }
  if (teachingCardCount > 0 || stripTags(markup).includes("What This Pinpoint Teaches")) {
    errors.push("Evidence-v1 must not render the legacy teaching section.");
  }
  const lastBlock = blocks.at(-1) ?? "";
  const answer = normalizeForMatch(detail.answer ?? "");
  if (countClass(lastBlock, "legacy-reasoning-block-answer") !== 1 || !answer ||
      !normalizeForMatch(stripTags(lastBlock)).includes(answer)) {
    errors.push("Evidence-v1 must end its reasoning with the answer confirmation.");
  }
  return errors;
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

function readAttribute(tag: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`\\s${escaped}="([^"]*)"`, "i"));
  return decodeHtmlEntities(match?.[1] ?? "");
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
        addIssue("structured-data", "Failed to parse an application/ld+json script.");
      }
    }
  }
  return items;
}

function typeMatches(item: Record<string, unknown>, typeName: string): boolean {
  const type = item["@type"];
  return Array.isArray(type) ? type.includes(typeName) : type === typeName;
}

function findStructuredData(items: Record<string, unknown>[], typeName: string): Record<string, unknown> | null {
  return items.find((item) => typeMatches(item, typeName)) ?? null;
}

function parseSitemap(xml: string): Map<string, SitemapEntry> {
  const entries = new Map<string, SitemapEntry>();
  const blocks = xml.matchAll(/<url>([\s\S]*?)<\/url>/g);
  for (const block of blocks) {
    const text = block[1] ?? "";
    const loc = decodeHtmlEntities(text.match(/<loc>([\s\S]*?)<\/loc>/)?.[1]?.trim() ?? "");
    const lastmod = decodeHtmlEntities(text.match(/<lastmod>([\s\S]*?)<\/lastmod>/)?.[1]?.trim() ?? "");
    if (!loc) continue;
    try {
      const url = new URL(loc);
      entries.set(url.pathname, { loc, lastmod });
    } catch {
      entries.set(loc, { loc, lastmod });
    }
  }
  return entries;
}

function readRegistryEntries(): RegistryEntry[] {
  const raw = readJson(resolve(ROOT, "data", "puzzles", "registry.json"));
  return registrySchema.parse(raw) as RegistryEntry[];
}

function readDetail(slug: string): DetailRecord {
  const raw = readJson(resolve(ROOT, "data", "puzzles", `${slug}.json`));
  return puzzleDetailContentSchema.parse(raw) as DetailRecord;
}

function getCheckLimit(): number {
  const raw = (process.env.PINPOINT_RENDERED_CHECK_LIMIT ?? "").trim().toLowerCase();
  if (!raw) return DEFAULT_CHECK_LIMIT;
  if (raw === "all") return Number.POSITIVE_INFINITY;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_CHECK_LIMIT;
}

function checkBuildOutputPresent() {
  if (!existsSync(BUILD_APP_DIR)) {
    addIssue("build-output", "Missing .next/server/app. Run npm run build before this check.");
  }
}

function checkSitemap(publicEntries: RegistryEntry[]) {
  const sitemapPath = resolve(BUILD_APP_DIR, "sitemap.xml.body");
  if (!existsSync(sitemapPath)) {
    addIssue("sitemap", "Missing .next/server/app/sitemap.xml.body.");
    return;
  }

  const sitemap = parseSitemap(readText(sitemapPath));
  const newest = newestUpdatedAt(publicEntries);
  const homeLastmod = sitemap.get("/")?.lastmod;
  const archiveLastmod = sitemap.get("/puzzles")?.lastmod;

  if (normalizeDate(homeLastmod) !== newest) {
    addIssue("sitemap:/", `Home lastmod ${homeLastmod || "(missing)"} does not match newest public detail ${newest}.`);
  }
  if (normalizeDate(archiveLastmod) !== newest) {
    addIssue(
      "sitemap:/puzzles",
      `Archive lastmod ${archiveLastmod || "(missing)"} does not match newest public detail ${newest}.`,
    );
  }

  for (const entry of publicEntries) {
    const route = detailRoute(entry.slug);
    const item = sitemap.get(route);
    if (!item) {
      addIssue(`sitemap:${entry.slug}`, `Missing sitemap URL for ${route}.`);
      continue;
    }
    if (normalizeDate(item.lastmod) !== normalizeDate(entry.updatedAt)) {
      addIssue(
        `sitemap:${entry.slug}`,
        `lastmod ${item.lastmod || "(missing)"} does not match registry updatedAt ${entry.updatedAt}.`,
      );
    }
  }
}

function checkHomeRenderedLinks(publicEntries: RegistryEntry[]) {
  const homePath = resolve(BUILD_APP_DIR, "index.html");
  if (!existsSync(homePath)) {
    addIssue("home", "Missing rendered home page HTML at .next/server/app/index.html.");
    return;
  }

  const html = stripScripts(readText(homePath));
  const hrefs = new Set(extractHrefValues(html));
  const latest = publicEntries[0];
  if (!latest) return;

  if (!hrefs.has(detailRoute(latest.slug))) {
    addIssue("home", `Home page does not link to latest public detail ${detailRoute(latest.slug)}.`);
  }

  const recentLinks = publicEntries
    .slice(0, Math.min(5, publicEntries.length))
    .filter((entry) => hrefs.has(detailRoute(entry.slug)));
  if (recentLinks.length < Math.min(3, publicEntries.length)) {
    addIssue("home", "Home page renders fewer than three recent detail links.");
  }
}

function checkDetailRendered(entry: RegistryEntry, allEntries: RegistryEntry[]) {
  const path = detailHtmlPath(entry.slug);
  if (!existsSync(path)) {
    addIssue(entry.slug, `Missing rendered detail HTML at ${path}.`);
    return;
  }

  const html = readText(path);
  const bodyMarkup = stripScripts(html);
  const pageText = stripTags(bodyMarkup);
  const detail = readDetail(entry.slug);
  const route = detailRoute(entry.slug);
  const canonical = findLinkHref(html, "canonical");
  const robots = findMetaContent(html, "robots");
  const h1Values = extractTagText(bodyMarkup, "h1");
  const expectedH1Parts = ["linkedin", "pinpoint", String(entry.puzzleNumber), "answer"];
  const clueWords = Array.from(
    bodyMarkup.matchAll(/<span class="legacy-reveal-clue-word">([\s\S]*?)<\/span>/g),
    (match) => stripTags(match[1] ?? ""),
  );
  const hrefs = new Set(extractHrefValues(bodyMarkup));
  const recentDetailLinkCount = allEntries
    .filter((candidate) => candidate.slug !== entry.slug)
    .slice(0, 3)
    .filter((candidate) => hrefs.has(detailRoute(candidate.slug))).length;
  const structuredDataItems = parseJsonLd(html);
  const article = findStructuredData(structuredDataItems, "Article");
  const breadcrumb = findStructuredData(structuredDataItems, "BreadcrumbList");
  const itemList = findStructuredData(structuredDataItems, "ItemList");

  if (!canonical.endsWith(route)) {
    addIssue(entry.slug, `Canonical ${canonical || "(missing)"} does not end with ${route}.`);
  }
  if (robots && /noindex/i.test(robots)) {
    addIssue(entry.slug, `Public detail page rendered noindex robots meta: ${robots}.`);
  }
  if (!h1Values.some((value) => {
    const normalized = normalizeForMatch(value);
    return expectedH1Parts.every((part) => normalized.includes(part));
  })) {
    addIssue(entry.slug, `H1 must include LinkedIn, Pinpoint, #${entry.puzzleNumber}, and Answer wording.`);
  }
  if (countClass(bodyMarkup, "legacy-reveal-clue-card") !== 5) {
    addIssue(entry.slug, "Rendered clue reveal grid does not contain exactly five clue cards.");
  }
  if (clueWords.length !== 5 || clueWords.some((value, index) => value !== entry.clues[index])) {
    addIssue(entry.slug, `Rendered clue order mismatch: expected ${entry.clues.join(" | ")}, got ${clueWords.join(" | ")}.`);
  }
  if (!pageText.includes(entry.mainAnswer ?? "")) {
    addIssue(entry.slug, "Rendered page text does not include the registry answer.");
  }
  if (!pageText.includes("Answer Reasoning")) {
    addIssue(entry.slug, "Rendered page is missing the Answer Reasoning section.");
  }
  for (const pattern of FORBIDDEN_RENDERED_COPY_PATTERNS) {
    if (pattern.test(pageText)) {
      addIssue(entry.slug, `Rendered page contains awkward generated copy: ${pattern}`);
    }
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
      addIssue(entry.slug, `Rendered page still exposes old template label: ${legacyLabel}.`);
    }
  }
  for (const message of checkRenderedContentTemplate({ ...detail, answer: entry.mainAnswer }, html)) {
    addIssue(entry.slug, message);
  }
  if (!hrefs.has("/puzzles")) {
    addIssue(entry.slug, "Rendered detail page does not link back to /puzzles.");
  }
  if (recentDetailLinkCount < Math.min(3, allEntries.length - 1)) {
    addIssue(entry.slug, "Rendered detail page has fewer than three recent detail links.");
  }
  if (!article) {
    addIssue(entry.slug, "Missing Article JSON-LD.");
  } else {
    if (normalizeDate(String(article.dateModified ?? "")) !== normalizeDate(entry.updatedAt)) {
      addIssue(entry.slug, "Article JSON-LD dateModified does not match registry updatedAt.");
    }
    if (normalizeDate(String(article.datePublished ?? "")) !== normalizeDate(`${entry.publishDate}T00:00:00Z`)) {
      addIssue(entry.slug, "Article JSON-LD datePublished does not match registry publishDate.");
    }
    const mainEntity = String(article.mainEntityOfPage ?? "");
    if (!mainEntity.endsWith(route)) {
      addIssue(entry.slug, `Article JSON-LD mainEntityOfPage ${mainEntity || "(missing)"} does not end with ${route}.`);
    }
  }
  if (!breadcrumb) {
    addIssue(entry.slug, "Missing BreadcrumbList JSON-LD.");
  }
  if (!itemList) {
    addIssue(entry.slug, "Missing recent ItemList JSON-LD.");
  }
}

function failIfIssues() {
  if (issues.length === 0) return;

  console.error("Pinpoint rendered content gate failed:");
  for (const issue of issues) {
    console.error(`- ${issue.scope}: ${issue.message}`);
  }
  process.exit(1);
}

function main() {
  checkBuildOutputPresent();
  failIfIssues();

  const publicEntries = readRegistryEntries()
    .filter(isPublicRegistryEntry)
    .sort((left, right) => right.puzzleNumber - left.puzzleNumber);
  if (publicEntries.length === 0) {
    addIssue("registry", "No public detail entries found.");
    failIfIssues();
  }

  const checkLimit = getCheckLimit();
  const entriesToCheck = publicEntries.slice(0, checkLimit);
  checkSitemap(publicEntries);
  checkHomeRenderedLinks(publicEntries);
  for (const entry of entriesToCheck) {
    checkDetailRendered(entry, publicEntries);
  }

  failIfIssues();

  const limitLabel = Number.isFinite(checkLimit) ? String(entriesToCheck.length) : `all ${entriesToCheck.length}`;
  console.log(`ok: rendered detail HTML passed for ${limitLabel} public Pinpoint pages`);
  console.log(`ok: sitemap covers ${publicEntries.length} public Pinpoint detail pages with fresh lastmod values`);
  console.log("ok: home page links to the latest public Pinpoint detail page");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
