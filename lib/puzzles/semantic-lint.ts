import { defaultLocale } from "@/i18n.config";

export type SemanticLintIssue = {
  code: string;
  message: string;
  field?: string;
  sample?: string;
};

export type SemanticContentInput = {
  locale?: string | null;
  mainAnswer?: string | null;
  summary?: string | null;
  seoDescription?: string | null;
  overview?: string | null;
  solutionEmergence?: string | null;
  wrongGuesses?: Array<{ guess?: string | null; explanation?: string | null }> | null;
  faqs?: Array<{ question?: string | null; answer?: string | null }> | null;
  clueDetails?: Array<{ clue?: string | null; phrase?: string | null; explanation?: string | null }> | null;
  lessons?: Array<{ title?: string | null; body?: string | null }> | null;
};

const LOCALE_MARKER_PATTERN = /\[(?:fr|de|pt-BR)\]/i;
const BROKEN_ENTITY_PATTERN = /&#92;|&#x5c;|&#x5C;/i;
const LEADING_ELLIPSIS_PATTERN = /^\s*\.\.\./;
const ENGLISH_RESIDUAL_PATTERNS = [
  {
    code: "text.englishResidual.unrelated",
    pattern: /\bunrelated\b/i,
    message: 'Detected obvious English residual token "unrelated"',
  },
];
const PROMOTIONAL_SUMMARY_PATTERNS = [
  /\bembark on a journey\b/i,
  /\bdive into\b/i,
  /\blet'?s see\b/i,
  /\bblooming with possibilities\b/i,
  /\bcan you identify\b/i,
];

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeForMatch(value: string | null | undefined): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/["“”'`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLeadSentence(value: string | null | undefined): string {
  const text = normalizeText(value);
  if (!text) return "";
  const match = text.match(/^(.+?[.!?])(?:\s|$)/);
  return (match?.[1] ?? text).trim();
}

function countOccurrences(haystack: string, needle: string): number {
  if (!haystack || !needle) return 0;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = haystack.match(new RegExp(`\\b${escaped}\\b`, "g"));
  return matches?.length ?? 0;
}

function tokenizeForOverlap(value: string | null | undefined): string[] {
  return normalizeForMatch(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 4);
}

function overlapRatio(left: string | null | undefined, right: string | null | undefined): number {
  const leftTokens = new Set(tokenizeForOverlap(left));
  const rightTokens = new Set(tokenizeForOverlap(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }

  return overlap / Math.min(leftTokens.size, rightTokens.size);
}

function isSuspiciousCategoryAnswerLabel(answer: string | null | undefined): boolean {
  const text = normalizeText(answer);
  if (!text) return false;
  if (/^Words that come (before|after)\b/i.test(text)) return false;
  if (/^(Types|Kinds)\s+of\b/i.test(text)) return false;
  return /\//.test(text) || /\((?:with|for|including)\b[^)]*\)/i.test(text);
}

function sampleText(value: string | null | undefined): string | undefined {
  const normalized = normalizeText(value);
  return normalized ? normalized.slice(0, 160) : undefined;
}

function isNonDefaultLocale(locale: string | null | undefined): boolean {
  return Boolean(locale && locale !== defaultLocale);
}

function pushIssue(
  issues: SemanticLintIssue[],
  code: string,
  message: string,
  field: string,
  value?: string | null | undefined,
) {
  issues.push({
    code,
    message,
    field,
    ...(sampleText(value) ? { sample: sampleText(value) } : {}),
  });
}

function scanTextEntry(
  issues: SemanticLintIssue[],
  field: string,
  value: string | null | undefined,
  locale?: string | null,
) {
  const text = normalizeText(value);
  if (!text) return;

  if (LOCALE_MARKER_PATTERN.test(text)) {
    pushIssue(issues, "text.localeMarker", "Detected locale marker residue", field, text);
  }
  if (BROKEN_ENTITY_PATTERN.test(text)) {
    pushIssue(issues, "text.brokenEntity", "Detected broken HTML entity residue", field, text);
  }
  if (LEADING_ELLIPSIS_PATTERN.test(text)) {
    pushIssue(issues, "text.leadingEllipsis", "Detected leading ellipsis template fragment", field, text);
  }

  if (isNonDefaultLocale(locale)) {
    for (const pattern of ENGLISH_RESIDUAL_PATTERNS) {
      if (pattern.pattern.test(text)) {
        pushIssue(issues, pattern.code, pattern.message, field, text);
      }
    }
  }
}

export function collectSemanticLintIssues(input: SemanticContentInput): SemanticLintIssue[] {
  const issues: SemanticLintIssue[] = [];

  scanTextEntry(issues, "summary", input.summary, input.locale);
  scanTextEntry(issues, "seoDescription", input.seoDescription, input.locale);
  scanTextEntry(issues, "overview", input.overview, input.locale);
  scanTextEntry(issues, "solutionEmergence", input.solutionEmergence, input.locale);

  input.wrongGuesses?.forEach((item, index) => {
    scanTextEntry(issues, `wrongGuesses[${index}].guess`, item?.guess, input.locale);
    scanTextEntry(issues, `wrongGuesses[${index}].explanation`, item?.explanation, input.locale);
  });
  input.faqs?.forEach((item, index) => {
    scanTextEntry(issues, `faqs[${index}].question`, item?.question, input.locale);
    scanTextEntry(issues, `faqs[${index}].answer`, item?.answer, input.locale);
  });
  input.clueDetails?.forEach((item, index) => {
    scanTextEntry(issues, `clueDetails[${index}].clue`, item?.clue, input.locale);
    scanTextEntry(issues, `clueDetails[${index}].phrase`, item?.phrase, input.locale);
    scanTextEntry(issues, `clueDetails[${index}].explanation`, item?.explanation, input.locale);
  });
  input.lessons?.forEach((item, index) => {
    scanTextEntry(issues, `lessons[${index}].title`, item?.title, input.locale);
    scanTextEntry(issues, `lessons[${index}].body`, item?.body, input.locale);
  });

  const normalizedAnswer = normalizeForMatch(input.mainAnswer);
  const firstFaqAnswer = normalizeForMatch(input.faqs?.[0]?.answer);
  if (normalizedAnswer && (!firstFaqAnswer || !firstFaqAnswer.includes(normalizedAnswer))) {
    issues.push({
      code: "faqs.firstAnswerMissingExactAnswer",
      message: "First FAQ answer does not include the exact answer text",
      field: "faqs[0].answer",
      ...(sampleText(input.faqs?.[0]?.answer) ? { sample: sampleText(input.faqs?.[0]?.answer) } : {}),
    });
  }

  if (normalizedAnswer) {
    if (isSuspiciousCategoryAnswerLabel(input.mainAnswer)) {
      issues.push({
        code: "mainAnswer.suspiciousCategoryLabel",
        message: "Category-style answer label looks over-qualified or machine-made",
        field: "mainAnswer",
        ...(sampleText(input.mainAnswer) ? { sample: sampleText(input.mainAnswer) } : {}),
      });
    }

    const normalizedSummary = normalizeForMatch(input.summary);
    if (normalizedSummary.includes(normalizedAnswer)) {
      issues.push({
        code: "summary.answerSpoiler",
        message: "Hero summary reveals the exact answer before the opt-in reveal",
        field: "summary",
        ...(sampleText(input.summary) ? { sample: sampleText(input.summary) } : {}),
      });
    }

    const openingOverviewSentence = normalizeForMatch(extractLeadSentence(input.overview));
    if (openingOverviewSentence.includes(normalizedAnswer)) {
      issues.push({
        code: "overview.leadingAnswerSpoiler",
        message: "Overview opens by stating the exact answer too early",
        field: "overview",
        ...(sampleText(input.overview) ? { sample: sampleText(input.overview) } : {}),
      });
    }

    const answerMentions = [
      input.summary,
      input.overview,
      input.solutionEmergence,
      ...(input.wrongGuesses?.flatMap((item) => [item?.guess, item?.explanation]) ?? []),
      ...(input.clueDetails?.flatMap((item) => [item?.phrase, item?.explanation]) ?? []),
      ...(input.lessons?.flatMap((item) => [item?.title, item?.body]) ?? []),
      ...(input.faqs?.flatMap((item) => [item?.question, item?.answer]) ?? []),
    ]
      .map((value) => countOccurrences(normalizeForMatch(value), normalizedAnswer))
      .reduce((total, count) => total + count, 0);

    if (answerMentions > 3) {
      issues.push({
        code: "answer.overused",
        message: `Exact answer text appears too many times (${answerMentions}) across the draft`,
        field: "mainAnswer",
        ...(sampleText(input.mainAnswer) ? { sample: sampleText(input.mainAnswer) } : {}),
      });
    }
  }

  if (PROMOTIONAL_SUMMARY_PATTERNS.some((pattern) => pattern.test(normalizeText(input.summary)))) {
    issues.push({
      code: "summary.promotionalTone",
      message: "Hero summary sounds like teaser copy instead of a spoiler-safe clue introduction",
      field: "summary",
      ...(sampleText(input.summary) ? { sample: sampleText(input.summary) } : {}),
    });
  }

  const sectionOverlap = overlapRatio(input.overview, input.solutionEmergence);
  if (sectionOverlap >= 0.6) {
    issues.push({
      code: "sections.overlap",
      message: `Overview and solve narrative overlap too heavily (${Math.round(sectionOverlap * 100)}%)`,
      field: "solutionEmergence",
      ...(sampleText(input.solutionEmergence) ? { sample: sampleText(input.solutionEmergence) } : {}),
    });
  }

  return issues;
}

export const PUBLISH_BLOCKING_SEMANTIC_CODES = new Set([
  "text.localeMarker",
  "text.brokenEntity",
  "text.leadingEllipsis",
  "text.englishResidual.unrelated",
  "mainAnswer.suspiciousCategoryLabel",
  "faqs.firstAnswerMissingExactAnswer",
  "summary.promotionalTone",
  "summary.answerSpoiler",
  "overview.leadingAnswerSpoiler",
  "sections.overlap",
  "answer.overused",
]);
