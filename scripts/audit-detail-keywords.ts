import { readFileSync } from "node:fs";
import { getPuzzleBySlug, getPuzzleSlugByNumber } from "../lib/puzzles/data";
import type { PuzzleDetail } from "../lib/puzzles/data";

type CliOptions = {
  failOnWarnings: boolean;
  htmlPath: string | null;
  json: boolean;
  number: number | null;
  slug: string | null;
  text: string | null;
  top: number;
  url: string | null;
};

type PhraseStat = {
  count: number;
  firstIndex: number;
  phrase: string;
  rank: number;
};

type AuditIssue = {
  message: string;
  severity: "hard" | "warn";
};

type AuditResult = {
  issues: AuditIssue[];
  number: number | null;
  slug: string | null;
  top: Record<number, PhraseStat[]>;
  rawIssuePhraseCounts: Record<string, number>;
  totalTokens: number;
};

const HOME_PHRASES_BY_SIZE: Record<number, string[]> = {
  2: ["pinpoint today"],
  3: ["pinpoint answer today", "todays pinpoint answer"],
  4: ["linkedin pinpoint answer today", "pinpoint linkedin answer today"],
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "for",
  "from",
  "had",
  "has",
  "have",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "not",
  "of",
  "on",
  "or",
  "should",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "these",
  "they",
  "this",
  "those",
  "to",
  "was",
  "were",
  "when",
  "where",
  "will",
  "with",
  "would",
]);

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    failOnWarnings: false,
    htmlPath: null,
    json: false,
    number: null,
    slug: null,
    text: null,
    top: 12,
    url: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--fail-on-warnings") {
      options.failOnWarnings = true;
    } else if (arg === "--html") {
      options.htmlPath = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--number") {
      const rawNumber = argv[index + 1];
      options.number = rawNumber ? Number.parseInt(rawNumber, 10) : null;
      index += 1;
    } else if (arg === "--slug") {
      options.slug = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === "--text") {
      options.text = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === "--top") {
      const rawTop = argv[index + 1];
      options.top = rawTop ? Number.parseInt(rawTop, 10) : Number.NaN;
      index += 1;
    } else if (arg === "--url") {
      options.url = argv[index + 1] ?? null;
      index += 1;
    }
  }

  if (!Number.isFinite(options.top) || options.top < 1) {
    throw new Error("--top must be a positive number.");
  }

  if (options.number !== null && (!Number.isFinite(options.number) || options.number < 1)) {
    throw new Error("--number must be a positive number.");
  }

  return options;
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (match, code: string) => named[code] ?? match);
}

function stripHtmlToVisibleText(html: string): string {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;

  return decodeHtmlEntities(
    body
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  const normalized = decodeHtmlEntities(value)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/["“”'`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ");

  return normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
}

function tokenizeForOneWordRanking(value: string): string[] {
  return tokenize(value).filter((token) => !STOP_WORDS.has(token) && !/^\d+$/.test(token));
}

function tokenizeForPhraseRanking(value: string): string[] {
  return tokenize(value).filter((token) => !/^\d+$/.test(token));
}

function normalizePhraseForSize(value: string, size: number): string {
  return (size === 1 ? tokenizeForOneWordRanking(value) : tokenizeForPhraseRanking(value)).join(" ");
}

function buildNgramStats(tokens: string[], size: number): PhraseStat[] {
  const stats = new Map<string, { count: number; firstIndex: number }>();

  for (let index = 0; index <= tokens.length - size; index += 1) {
    const phrase = tokens.slice(index, index + size).join(" ");
    const current = stats.get(phrase);
    if (current) {
      current.count += 1;
    } else {
      stats.set(phrase, { count: 1, firstIndex: index });
    }
  }

  return Array.from(stats, ([phrase, stat]) => ({
    count: stat.count,
    firstIndex: stat.firstIndex,
    phrase,
    rank: 0,
  }))
    .sort((left, right) => right.count - left.count || left.firstIndex - right.firstIndex || left.phrase.localeCompare(right.phrase))
    .map((stat, index) => ({ ...stat, rank: index + 1 }));
}

function makeRankLookup(stats: PhraseStat[]): Map<string, PhraseStat> {
  return new Map(stats.map((stat) => [stat.phrase, stat]));
}

function getStat(lookups: Record<number, Map<string, PhraseStat>>, size: number, phrase: string): PhraseStat | null {
  return lookups[size]?.get(normalizePhraseForSize(phrase, size)) ?? null;
}

function getCount(lookups: Record<number, Map<string, PhraseStat>>, size: number, phrase: string): number {
  return getStat(lookups, size, phrase)?.count ?? 0;
}

function getRank(lookups: Record<number, Map<string, PhraseStat>>, size: number, phrase: string): number | null {
  return getStat(lookups, size, phrase)?.rank ?? null;
}

function formatRank(rank: number | null): string {
  return rank === null ? "missing" : `#${rank}`;
}

function cluePathTokens(puzzle: PuzzleDetail): string[] {
  return tokenizeForPhraseRanking(puzzle.clues.join(" "));
}

function clueNgrams(puzzle: PuzzleDetail, size: number): string[] {
  const tokens = cluePathTokens(puzzle);
  const phrases: string[] = [];
  for (let index = 0; index <= tokens.length - size; index += 1) {
    phrases.push(tokens.slice(index, index + size).join(" "));
  }
  return phrases;
}

function maxCount(lookups: Record<number, Map<string, PhraseStat>>, size: number, phrases: string[]): number {
  return Math.max(0, ...phrases.map((phrase) => getCount(lookups, size, phrase)));
}

function countRawPhrase(rawTokens: string[], phrase: string): number {
  const phraseTokens = tokenize(phrase);
  if (phraseTokens.length === 0 || rawTokens.length < phraseTokens.length) return 0;

  let count = 0;
  for (let index = 0; index <= rawTokens.length - phraseTokens.length; index += 1) {
    const candidate = rawTokens.slice(index, index + phraseTokens.length);
    if (candidate.every((token, tokenIndex) => token === phraseTokens[tokenIndex])) {
      count += 1;
    }
  }
  return count;
}

function addIssue(issues: AuditIssue[], severity: AuditIssue["severity"], message: string) {
  issues.push({ severity, message });
}

function checkExactRank(
  issues: AuditIssue[],
  lookups: Record<number, Map<string, PhraseStat>>,
  size: number,
  phrase: string,
  expectedRank: number,
) {
  const stat = getStat(lookups, size, phrase);
  if (!stat) {
    addIssue(issues, "hard", `\`${phrase}\` should be ${size} words #${expectedRank}, but it is missing.`);
    return;
  }
  if (stat.rank !== expectedRank) {
    addIssue(
      issues,
      "hard",
      `\`${phrase}\` should be ${size} words #${expectedRank}, but it is ${formatRank(stat.rank)}.`,
    );
  }
}

function checkMaxRank(
  issues: AuditIssue[],
  lookups: Record<number, Map<string, PhraseStat>>,
  size: number,
  phrase: string,
  maxRank: number,
  severity: AuditIssue["severity"] = "warn",
) {
  const stat = getStat(lookups, size, phrase);
  if (!stat) {
    addIssue(issues, severity, `\`${phrase}\` should appear in ${size} words top ${maxRank}, but it is missing.`);
    return;
  }
  if (stat.rank > maxRank) {
    addIssue(
      issues,
      severity,
      `\`${phrase}\` should appear in ${size} words top ${maxRank}, but it is ${formatRank(stat.rank)}.`,
    );
  }
}

function checkCoreTerms(issues: AuditIssue[], lookups: Record<number, Map<string, PhraseStat>>) {
  checkExactRank(issues, lookups, 1, "pinpoint", 1);
  checkExactRank(issues, lookups, 1, "answer", 2);
  checkExactRank(issues, lookups, 1, "linkedin", 3);
}

function checkPuzzleSpecificTerms(
  issues: AuditIssue[],
  lookups: Record<number, Map<string, PhraseStat>>,
  puzzle: PuzzleDetail,
) {
  const clueTwoPhrases = clueNgrams(puzzle, 2);
  const clueThreePhrases = clueNgrams(puzzle, 3);
  const clueFourPhrases = clueNgrams(puzzle, 4);
  const clueFivePhrases = clueNgrams(puzzle, 5);

  checkExactRank(issues, lookups, 2, "pinpoint answer", 1);
  checkExactRank(issues, lookups, 2, "linkedin pinpoint", 2);

  clueTwoPhrases.slice(0, 4).forEach((phrase, index) => {
    checkExactRank(issues, lookups, 2, phrase, index + 3);
  });

  clueThreePhrases.slice(0, 3).forEach((phrase, index) => {
    checkExactRank(issues, lookups, 3, phrase, index + 1);
  });
  checkMaxRank(issues, lookups, 3, "linkedin pinpoint answer", 6);

  clueFourPhrases.slice(0, 2).forEach((phrase, index) => {
    checkExactRank(issues, lookups, 4, phrase, index + 1);
  });

  if (clueFivePhrases.length > 0) {
    checkExactRank(issues, lookups, 5, clueFivePhrases[0], 1);
  }

  if (clueThreePhrases.length > 0 && maxCount(lookups, 3, clueThreePhrases) === 0) {
    addIssue(issues, "hard", "The detail page is missing the current puzzle's 3-word clue sequence.");
  }
  if (clueFourPhrases.length > 0 && maxCount(lookups, 4, clueFourPhrases) === 0) {
    addIssue(issues, "hard", "The detail page is missing the current puzzle's 4-word clue sequence.");
  }
  if (clueFivePhrases.length > 0 && maxCount(lookups, 5, clueFivePhrases) === 0) {
    addIssue(issues, "hard", "The detail page is missing the current puzzle's 5-word clue sequence.");
  }

  for (const [sizeText, phrases] of Object.entries(HOME_PHRASES_BY_SIZE)) {
    const size = Number.parseInt(sizeText, 10);
    const detailPhrases = [
      ...clueNgrams(puzzle, size),
      ...(size === 2 ? ["pinpoint answer", "linkedin pinpoint"] : []),
      ...(size === 3 ? ["linkedin pinpoint answer"] : []),
    ];
    const detailBestCount = maxCount(lookups, size, detailPhrases);

    for (const phrase of phrases) {
      const phraseCount = getCount(lookups, size, phrase);
      if (phraseCount === 0) continue;
      if (phraseCount > detailBestCount) {
        addIssue(
          issues,
          "hard",
          `\`${phrase}\` is a homepage phrase and is stronger than the detail-page ${size}-word clue/issue phrases.`,
        );
      } else if (phraseCount === detailBestCount) {
        addIssue(
          issues,
          "warn",
          `\`${phrase}\` ties the strongest detail-page ${size}-word phrase. That is acceptable only if it comes from brand/nav text, not body stuffing.`,
        );
      }
    }
  }
}

function checkRawIssueSignals(issues: AuditIssue[], rawIssuePhraseCounts: Record<string, number>) {
  for (const [phrase, count] of Object.entries(rawIssuePhraseCounts)) {
    if (count === 0) {
      addIssue(
        issues,
        "hard",
        `Raw page text is missing \`${phrase}\`. The AITDK-style ranking filters numbers, but the visible page still needs the current issue number.`,
      );
    }
  }
}

async function readSource(options: CliOptions): Promise<string> {
  if (options.text !== null) return options.text;
  if (options.htmlPath !== null) return stripHtmlToVisibleText(readFileSync(options.htmlPath, "utf8"));
  if (options.url !== null) {
    const response = await fetch(options.url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0 Safari/537.36",
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${options.url}: ${response.status} ${response.statusText}`);
    }
    return stripHtmlToVisibleText(await response.text());
  }
  throw new Error("Pass one content source: --url, --html, or --text.");
}

function slugFromUrl(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/\/linkedin-pinpoint-answers\/([^/?#]+)\/?/);
  return match?.[1] ?? null;
}

function numberFromSlug(slug: string | null): number | null {
  if (!slug) return null;
  const match = slug.match(/pinpoint-answer-(\d+)/);
  return match?.[1] ? Number.parseInt(match[1], 10) : null;
}

async function loadPuzzle(options: CliOptions): Promise<PuzzleDetail | null> {
  let slug = options.slug ?? slugFromUrl(options.url);
  const number = options.number ?? numberFromSlug(slug);

  if (!slug && number) {
    slug = await getPuzzleSlugByNumber(number, { allowLiveWorkerFallback: false });
  }
  if (!slug) return null;

  return getPuzzleBySlug(slug, { allowLiveWorkerFallback: false });
}

function formatTopRows(stats: PhraseStat[], limit: number): string {
  return stats
    .slice(0, limit)
    .map((stat) => `${String(stat.rank).padStart(2, " ")}. ${stat.phrase} (${stat.count})`)
    .join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [text, puzzle] = await Promise.all([readSource(options), loadPuzzle(options)]);
  const rawTokens = tokenize(text);
  const oneWordTokens = tokenizeForOneWordRanking(text);
  const phraseTokens = tokenizeForPhraseRanking(text);
  const top: Record<number, PhraseStat[]> = {
    1: buildNgramStats(oneWordTokens, 1),
    2: buildNgramStats(phraseTokens, 2),
    3: buildNgramStats(phraseTokens, 3),
    4: buildNgramStats(phraseTokens, 4),
    5: buildNgramStats(phraseTokens, 5),
  };
  const lookups: Record<number, Map<string, PhraseStat>> = {
    1: makeRankLookup(top[1]),
    2: makeRankLookup(top[2]),
    3: makeRankLookup(top[3]),
    4: makeRankLookup(top[4]),
    5: makeRankLookup(top[5]),
  };
  const issues: AuditIssue[] = [];

  checkCoreTerms(issues, lookups);
  let rawIssuePhraseCounts: Record<string, number> = {};
  if (puzzle) {
    rawIssuePhraseCounts = {
      [`pinpoint ${puzzle.number}`]: countRawPhrase(rawTokens, `pinpoint ${puzzle.number}`),
      [`pinpoint ${puzzle.number} answer`]: countRawPhrase(rawTokens, `pinpoint ${puzzle.number} answer`),
      [`linkedin pinpoint ${puzzle.number} answer`]: countRawPhrase(
        rawTokens,
        `linkedin pinpoint ${puzzle.number} answer`,
      ),
    };
    checkRawIssueSignals(issues, rawIssuePhraseCounts);
    checkPuzzleSpecificTerms(issues, lookups, puzzle);
  } else {
    addIssue(issues, "warn", "Puzzle data was not loaded, so clue and issue-number checks were skipped.");
  }

  const result: AuditResult = {
    issues,
    number: puzzle?.number ?? options.number ?? numberFromSlug(options.slug ?? slugFromUrl(options.url)),
    rawIssuePhraseCounts,
    slug: puzzle?.slug ?? options.slug ?? slugFromUrl(options.url),
    top,
    totalTokens: phraseTokens.length,
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `Detail keyword audit: ${result.slug ?? "unknown page"} (${result.totalTokens} AITDK-like ranking tokens)`,
    );
    for (const size of [1, 2, 3, 4, 5]) {
      console.log(`\n${size} word top ${options.top}`);
      console.log(formatTopRows(top[size], options.top));
    }
    if (puzzle) {
      console.log("\nTracked detail phrases");
      console.log(`- pinpoint: ${formatRank(getRank(lookups, 1, "pinpoint"))}`);
      console.log(`- answer: ${formatRank(getRank(lookups, 1, "answer"))}`);
      console.log(`- linkedin: ${formatRank(getRank(lookups, 1, "linkedin"))}`);
      console.log(`- pinpoint answer: ${formatRank(getRank(lookups, 2, "pinpoint answer"))}`);
      console.log(`- linkedin pinpoint: ${formatRank(getRank(lookups, 2, "linkedin pinpoint"))}`);
      console.log(`- ${clueNgrams(puzzle, 3)[0] ?? "clue 3-word phrase"}: ${formatRank(getRank(lookups, 3, clueNgrams(puzzle, 3)[0] ?? ""))}`);
      console.log(`- linkedin pinpoint answer: ${formatRank(getRank(lookups, 3, "linkedin pinpoint answer"))}`);
      console.log(`- ${clueNgrams(puzzle, 4)[0] ?? "clue 4-word phrase"}: ${formatRank(getRank(lookups, 4, clueNgrams(puzzle, 4)[0] ?? ""))}`);
      console.log(`- ${clueNgrams(puzzle, 5)[0] ?? "clue 5-word phrase"}: ${formatRank(getRank(lookups, 5, clueNgrams(puzzle, 5)[0] ?? ""))}`);
      console.log("\nRaw issue-number phrase counts");
      for (const [phrase, count] of Object.entries(rawIssuePhraseCounts)) {
        console.log(`- ${phrase}: ${count}`);
      }
    }
    if (issues.length > 0) {
      console.log("\nIssues");
      for (const issue of issues) {
        console.log(`- [${issue.severity}] ${issue.message}`);
      }
    } else {
      console.log("\nok: detail keyword split checks passed");
    }
  }

  const hardIssues = issues.filter((issue) => issue.severity === "hard");
  const warnings = issues.filter((issue) => issue.severity === "warn");
  if (hardIssues.length > 0 || (options.failOnWarnings && warnings.length > 0)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
