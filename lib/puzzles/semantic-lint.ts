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

  return issues;
}

export const PUBLISH_BLOCKING_SEMANTIC_CODES = new Set([
  "text.localeMarker",
  "text.brokenEntity",
  "text.leadingEllipsis",
  "text.englishResidual.unrelated",
  "faqs.firstAnswerMissingExactAnswer",
]);

