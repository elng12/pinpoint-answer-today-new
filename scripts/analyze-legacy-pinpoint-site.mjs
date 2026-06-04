#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const DEFAULT_SOURCE =
  "/Users/elng/Downloads/us.sitesucker.mac.sitesucker-pro/pinpointanswer.today/linkedin-pinpoint-answer";

function parseArgs(argv) {
  const args = {
    json: false,
    source: process.env.LEGACY_PINPOINT_SITE || DEFAULT_SOURCE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      args.json = true;
    } else if (arg === "--source") {
      args.source = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--source=")) {
      args.source = arg.slice("--source=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function decodeHtml(value) {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (match, code) => named[code] ?? match);
}

function stripVisibleText(html) {
  return decodeHtml(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function extractTagText(html, tagName) {
  const matches = html.matchAll(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi"));
  return Array.from(matches, (match) =>
    decodeHtml((match[1] || "").replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim(),
  ).filter(Boolean);
}

function countWords(text) {
  return (text.match(/\b[\p{L}\p{N}_]+\b/gu) || []).length;
}

function percentile(sortedValues, percent) {
  if (sortedValues.length === 0) return 0;
  const index = (sortedValues.length - 1) * percent;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
}

function median(values) {
  return percentile([...values].sort((left, right) => left - right), 0.5);
}

function tableBodyRowCount(html) {
  const tables = Array.from(html.matchAll(/<table\b[\s\S]*?<\/table>/gi), (match) => match[0]);
  if (tables.length === 0) return 0;
  return Math.max(
    ...tables.map((table) => {
      const trCount = (table.match(/<tr\b/gi) || []).length;
      return Math.max(0, trCount - 1);
    }),
  );
}

function faqQuestionCount(text) {
  const faqIndex = text.indexOf("FAQ");
  if (faqIndex === -1) return 0;
  const recentIndex = text.indexOf("Recent", faqIndex + 1);
  const segment = recentIndex === -1 ? text.slice(faqIndex) : text.slice(faqIndex, recentIndex);
  return (segment.match(/\?/g) || []).length;
}

function findPages(source) {
  if (!existsSync(source)) {
    throw new Error(`Legacy source directory does not exist: ${source}`);
  }

  return readdirSync(source, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^pinpoint-\d+$/.test(entry.name))
    .map((entry) => {
      const number = Number.parseInt(entry.name.replace("pinpoint-", ""), 10);
      return {
        number,
        path: join(source, entry.name, "index.html"),
        slug: entry.name,
      };
    })
    .filter((entry) => existsSync(entry.path))
    .sort((left, right) => left.number - right.number);
}

function analyze(source) {
  const pages = findPages(source);
  const metrics = {
    clueCardsDataAttr: 0,
    reveal: 0,
    recentLinks: 0,
    newsArticle: 0,
    breadcrumbSchema: 0,
    gameSchema: 0,
    websiteSchema: 0,
    organizationSchema: 0,
    faqSchema: 0,
    fullAnalysisHeading: 0,
    wordsTableHeading: 0,
    exactFiveRowTable: 0,
    faqHeading: 0,
    faqThreeQuestions: 0,
    firstPerson: 0,
    wrongOrTrapLanguage: 0,
    turningLanguage: 0,
    confirmationLanguage: 0,
  };
  const outliers = {
    missingFullAnalysisHeading: [],
    missingWordsTableHeading: [],
    tableNotFiveRows: [],
    missingFaqHeading: [],
    faqQuestionCountNotThree: [],
  };
  const wordCounts = [];
  const snapshotHash = createHash("sha256");
  let totalBytes = 0;

  for (const page of pages) {
    const raw = readFileSync(page.path, "utf8");
    const rawBytes = Buffer.byteLength(raw);
    totalBytes += rawBytes;
    snapshotHash.update(`${page.slug}\0${rawBytes}\0`);
    snapshotHash.update(raw);
    const noScript = raw
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ");
    const text = stripVisibleText(raw);
    const headings = ["h1", "h2", "h3"].flatMap((tagName) => extractTagText(noScript, tagName));
    const words = countWords(text);
    const rowCount = tableBodyRowCount(noScript);
    const faqCount = faqQuestionCount(text);

    wordCounts.push(words);

    const hasFullAnalysis = headings.some((heading) => heading.includes("Answer & Full Analysis"));
    const hasWordsTable = headings.some(
      (heading) => heading.includes("Words & How They Fit") || heading.includes("Words and How They Fit"),
    );
    const hasFaq = headings.some((heading) => heading.includes("FAQ"));

    if (raw.includes("data-clue-card")) metrics.clueCardsDataAttr += 1;
    if (/Reveal.*Answer|Click to reveal|seeTheAnswer|Reveal-answer/i.test(raw)) metrics.reveal += 1;
    if (/Recent Pinpoint Answers|Recent/i.test(text)) metrics.recentLinks += 1;
    if (raw.includes("NewsArticle")) metrics.newsArticle += 1;
    if (raw.includes("BreadcrumbList")) metrics.breadcrumbSchema += 1;
    if (raw.includes('"Game"') || raw.includes("Game")) metrics.gameSchema += 1;
    if (raw.includes("WebSite")) metrics.websiteSchema += 1;
    if (raw.includes("Organization")) metrics.organizationSchema += 1;
    if (raw.includes("FAQPage")) metrics.faqSchema += 1;
    if (hasFullAnalysis) metrics.fullAnalysisHeading += 1;
    if (hasWordsTable) metrics.wordsTableHeading += 1;
    if (rowCount === 5) metrics.exactFiveRowTable += 1;
    if (hasFaq) metrics.faqHeading += 1;
    if (faqCount === 3) metrics.faqThreeQuestions += 1;
    if (/\bI\b|\bmy\b|\bMy\b/.test(text)) metrics.firstPerson += 1;
    if (/false start|wrong|trap|decoy|mislead|misleading|first instinct|first thought/i.test(text)) {
      metrics.wrongOrTrapLanguage += 1;
    }
    if (/turning point|changed everything|changes everything|clicked|breakthrough|pivot|shift/i.test(text)) {
      metrics.turningLanguage += 1;
    }
    if (/confirmation|confirmed|sealed it|checks? cleanly|fit.*perfectly/i.test(text)) {
      metrics.confirmationLanguage += 1;
    }

    if (!hasFullAnalysis) outliers.missingFullAnalysisHeading.push(page.slug);
    if (!hasWordsTable) outliers.missingWordsTableHeading.push(page.slug);
    if (rowCount !== 5) outliers.tableNotFiveRows.push({ slug: page.slug, rowCount });
    if (!hasFaq) outliers.missingFaqHeading.push(page.slug);
    if (faqCount !== 3) outliers.faqQuestionCountNotThree.push({ slug: page.slug, questionCount: faqCount });
  }

  const sortedWords = [...wordCounts].sort((left, right) => left - right);

  return {
    source,
    totalPages: pages.length,
    range: pages.length > 0 ? `${pages[0].slug}..${pages[pages.length - 1].slug}` : "",
    sourceFingerprint: {
      htmlFileCount: pages.length,
      totalBytes,
      sha256: snapshotHash.digest("hex"),
    },
    metrics,
    outliers,
    wordCounts: {
      min: sortedWords[0] ?? 0,
      p25: Math.round(percentile(sortedWords, 0.25)),
      median: Math.round(median(sortedWords)),
      p75: Math.round(percentile(sortedWords, 0.75)),
      max: sortedWords[sortedWords.length - 1] ?? 0,
    },
  };
}

function printSummary(result) {
  console.log(`Legacy Pinpoint site: ${result.source}`);
  console.log(`pages: ${result.totalPages} (${result.range})`);
  console.log(
    `source fingerprint: ${result.sourceFingerprint.sha256} (${result.sourceFingerprint.htmlFileCount} html files, ${result.sourceFingerprint.totalBytes} bytes)`,
  );
  console.log(`visible words: ${JSON.stringify(result.wordCounts)}`);
  console.log("metrics:");
  for (const [key, value] of Object.entries(result.metrics)) {
    console.log(`- ${key}: ${value}`);
  }
  console.log("outliers:");
  console.log(`- missingFullAnalysisHeading: ${result.outliers.missingFullAnalysisHeading.join(", ") || "none"}`);
  console.log(`- missingWordsTableHeading: ${result.outliers.missingWordsTableHeading.join(", ") || "none"}`);
  console.log(
    `- tableNotFiveRows: ${
      result.outliers.tableNotFiveRows.map((item) => `${item.slug}:${item.rowCount}`).join(", ") || "none"
    }`,
  );
  console.log(`- missingFaqHeading: ${result.outliers.missingFaqHeading.join(", ") || "none"}`);
  console.log(
    `- faqQuestionCountNotThree: ${
      result.outliers.faqQuestionCountNotThree
        .map((item) => `${item.slug}:${item.questionCount}`)
        .join(", ") || "none"
    }`,
  );
}

const args = parseArgs(process.argv.slice(2));
const result = analyze(args.source);

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  printSummary(result);
}
