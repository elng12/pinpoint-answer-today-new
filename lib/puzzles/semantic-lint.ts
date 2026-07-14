import { defaultLocale } from "@/i18n.config";
import { getExactAnswerUsageIssue } from "@/lib/puzzles/answer-usage.shared.mjs";

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
  articleBlocks?: string[] | null;
  wrongGuesses?: Array<{
    guess?: string | null;
    explanation?: string | null;
    label?: string | null;
    whyPlausible?: string | null;
    whyRejected?: string | null;
  }> | null;
  faqs?: Array<{ question?: string | null; answer?: string | null }> | null;
  clueDetails?: Array<{ clue?: string | null; phrase?: string | null; explanation?: string | null }> | null;
  lessons?: Array<{ title?: string | null; body?: string | null }> | null;
};

type SemanticWrongGuess = NonNullable<SemanticContentInput["wrongGuesses"]>[number];

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
const GENERIC_FALSE_START_PATTERNS = [
  /^(brands?|types?|kinds?) of\b/i,
  /\b(items?|things?|objects?|stuff)\b/i,
  /\bvehicle brands?\b/i,
  /\bbrands? of vehicles?\b/i,
  /\bwarning words?\b/i,
  /\bmixed signals?\b/i,
  /\bgeneral clues?\b/i,
];
const GENERIC_SOFT_FALSE_START_PATTERNS = [
  /^(?:a\s+)?loose topic list$/i,
  /^(?:a\s+)?loose topic grouping$/i,
  /^(?:a\s+)?loose category match$/i,
  /^(?:a\s+)?loose theme match$/i,
  /^standalone clue meanings$/i,
  /^standalone meanings$/i,
  /^broad topic match$/i,
  /^shared category$/i,
  /^common theme$/i,
  /^they all fit$/i,
  /^all clues point to the same$/i,
];
const GENERIC_REASONING_FILLER_PATTERNS = [
  /\ba loose topic list\b/i,
  /\bstandalone clue meanings\b/i,
  /\bbroad topic match\b/i,
  /\bthe answer becomes clear\b/i,
  /\ball clues point to the same\b/i,
  /\bshared category\b/i,
  /\bcommon theme\b/i,
  /\bthey all fit\b/i,
];
const GENERIC_CATEGORY_PIVOT_PATTERNS = [
  /\bwhat kind of source or title it was\b/i,
  /\bwhat kind of item each clue described\b/i,
  /\bwhat kind of item it was\b/i,
  /\bstopped feeling broad and started reading like parts of one real set\b/i,
];
const GENERIC_CONNECTION_FAQ_PATTERNS = [
  /\bsame category once the board is read in the right frame\b/i,
  /\bone later clue makes the category feel much more obvious\b/i,
];
const GENERIC_TURNING_CLUE_FAQ_PATTERNS = [
  /\bnarrows the board enough to make the earlier clues read cleanly instead of loosely\b/i,
];
const TEMPORARY_PAGE_PATTERNS = [
  /\bthis quick page keeps today'?s answer available\b/i,
  /\blive version generated before the full editorial archive update finishes\b/i,
  /\barchive version adds the fuller explanation layer\b/i,
  /\bfull archived walkthrough is still finishing\b/i,
];
const GENERIC_CLUE_EXPLANATION_PATTERNS = [
  /\bfits the same shared connection\b/i,
  /\bsame shared connection that leads to\b/i,
  /\bpoints back to that same connection\b/i,
];
const GENERIC_LESSON_TITLE_PATTERNS = [
  /\bBroad clues can create the wrong frame early\b/i,
  /\bThe narrowing clue matters more than the loudest clue\b/i,
  /\bPrefer exact phrase logic over loose category logic\b/i,
  /\bPrefer precise category fit over broad topic logic\b/i,
  /\bWait for the clue that makes the set concrete\b/i,
  /^Look for word patterns$/i,
  /^Test each clue$/i,
  /^Trust your instinct$/i,
  /^Lesson \d+$/i,
  /^Solving takeaway \d+$/i,
];
const GENERIC_FAQ_QUESTION_PATTERNS = [
  /^What is the answer to LinkedIn Pinpoint #\d+\?$/i,
  /^What is the connection in LinkedIn Pinpoint #\d+\?$/i,
  /^Which clue really unlocks LinkedIn Pinpoint #\d+\?$/i,
  /^Which clue is decisive in LinkedIn Pinpoint #\d+\?$/i,
  /^Which clue really sets the category in LinkedIn Pinpoint #\d+\?$/i,
  /^Which clue gives the strongest anchor in LinkedIn Pinpoint #\d+\?$/i,
  /^Which clue makes the visual set click in LinkedIn Pinpoint #\d+\?$/i,
];
const PHRASE_EXAMPLE_WITH_GLOSS_PATTERN = /-\s*\([^)]*[A-Za-z][^)]*\)\s+[\p{L}\p{N}]/u;
const ANSWER_NARROWING_PREPOSITIONS = [
  "from",
  "in",
  "on",
  "under",
  "over",
  "with",
  "for",
  "around",
  "through",
  "inside",
  "outside",
  "beneath",
  "across",
] as const;

type AnswerPattern =
  | { kind: "before"; token: string }
  | { kind: "after"; token: string }
  | { kind: "typed-category"; noun: string; singularNoun: string }
  | { kind: "category" };

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

function longestSharedTokenRun(left: string | null | undefined, right: string | null | undefined): number {
  const leftTokens = normalizeForMatch(left).split(" ").filter((token) => token.length >= 4);
  const rightTokens = normalizeForMatch(right).split(" ").filter((token) => token.length >= 4);
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;

  const matrix = Array.from({ length: leftTokens.length + 1 }, () => new Array<number>(rightTokens.length + 1).fill(0));
  let longest = 0;

  for (let i = 1; i <= leftTokens.length; i += 1) {
    for (let j = 1; j <= rightTokens.length; j += 1) {
      if (leftTokens[i - 1] === rightTokens[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1] + 1;
        if (matrix[i][j] > longest) longest = matrix[i][j];
      }
    }
  }

  return longest;
}

function detectAnswerPattern(answer: string | null | undefined): AnswerPattern {
  const text = normalizeText(answer);
  const before = text.match(/^Words that come before\s+["“]?(.+?)["”]?$/i);
  if (before?.[1]) return { kind: "before", token: before[1] };
  const after = text.match(/^Words that come after\s+["“]?(.+?)["”]?$/i);
  if (after?.[1]) return { kind: "after", token: after[1] };
  const typedCategory = text.match(/^(Types|Kinds)\s+of\s+(.+)$/i);
  if (typedCategory?.[2]) {
    const noun = typedCategory[2].trim();
    const words = noun.split(/\s+/);
    const lastWord = words[words.length - 1] || noun;
    let singularLastWord = lastWord;
    if (/ies$/i.test(lastWord)) {
      singularLastWord = `${lastWord.slice(0, -3)}y`;
    } else if (/(ches|shes|xes|zes)$/i.test(lastWord)) {
      singularLastWord = lastWord.slice(0, -2);
    } else if (/s$/i.test(lastWord) && !/ss$/i.test(lastWord)) {
      singularLastWord = lastWord.slice(0, -1);
    }
    return {
      kind: "typed-category",
      noun,
      singularNoun: [...words.slice(0, -1), singularLastWord].join(" ").trim() || noun,
    };
  }
  return { kind: "category" };
}

function isSuspiciousCategoryAnswerLabel(answer: string | null | undefined): boolean {
  const text = normalizeText(answer);
  if (!text) return false;
  if (/^Words that come (before|after)\b/i.test(text)) return false;
  if (/^(Types|Kinds)\s+of\b/i.test(text)) return false;
  return /\//.test(text) || /\((?:with|for|including)\b[^)]*\)/i.test(text);
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeAnswerLabelForComparison(value: string | null | undefined): string {
  return normalizeText(value)
    .replace(/["“”'`]/g, "")
    .replace(/[.!?]+$/g, "")
    .trim();
}

function looksLikeSameAnswerFamily(candidate: string, answer: string): boolean {
  const normalizedCandidate = normalizeForMatch(candidate);
  const normalizedAnswer = normalizeForMatch(answer);
  if (!normalizedCandidate || !normalizedAnswer) return false;
  if (normalizedCandidate === normalizedAnswer) return false;
  return (
    normalizedCandidate.startsWith(`${normalizedAnswer} `) ||
    normalizedAnswer.startsWith(`${normalizedCandidate} `) ||
    overlapRatio(normalizedCandidate, normalizedAnswer) >= 0.75
  );
}

function extractAnswerLikeCandidates(text: string): string[] {
  const candidates = new Set<string>();
  const patterns = [
    /\bWords that come (?:before|after)\s+["“]?[A-Za-z0-9'’ -]+["”]?/gi,
    /\b(?:Types|Kinds)\s+of\s+[A-Za-z][A-Za-z'’ -]+/gi,
    /\b(?:Things|Items|Objects|People|Places)\s+that\s+[A-Za-z][A-Za-z'’ -]+/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const candidate = normalizeAnswerLabelForComparison(match[0]);
      if (candidate) candidates.add(candidate);
    }
  }

  return [...candidates];
}

function buildAnswerNarrowingPattern(answer: string): RegExp | null {
  const normalizedAnswer = normalizeAnswerLabelForComparison(answer);
  if (!normalizedAnswer) return null;
  const prepositions = ANSWER_NARROWING_PREPOSITIONS.join("|");
  return new RegExp(`\\b${escapeForRegex(normalizedAnswer)}\\s+(?:${prepositions})\\b`, "i");
}

function pushAnswerLogicIssues(
  issues: SemanticLintIssue[],
  field: string,
  value: string | null | undefined,
  answer: string | null | undefined,
) {
  const text = normalizeText(value);
  const mainAnswer = normalizeAnswerLabelForComparison(answer);
  if (!text || !mainAnswer) return;

  const narrowingPattern = buildAnswerNarrowingPattern(mainAnswer);
  if (narrowingPattern?.test(text)) {
    pushIssue(
      issues,
      "answer.semanticNarrowing",
      "Draft narrows the answer with an extra qualifier that is not part of the official answer",
      field,
      text,
    );
  }

  for (const candidate of extractAnswerLikeCandidates(text)) {
    if (!looksLikeSameAnswerFamily(candidate, mainAnswer)) continue;
    pushIssue(
      issues,
      "answer.alternateRestatement",
      "Draft introduces an alternate answer-like phrase instead of restating the official answer cleanly",
      field,
      candidate,
    );
    break;
  }
}

function looksLikeMachineGuess(value: string | null | undefined): boolean {
  const text = normalizeText(value);
  if (!text) return false;
  return GENERIC_FALSE_START_PATTERNS.some((pattern) => pattern.test(text));
}

function looksLikeGenericSoftFalseStart(value: string | null | undefined): boolean {
  const text = normalizeText(value);
  if (!text) return false;
  return GENERIC_SOFT_FALSE_START_PATTERNS.some((pattern) => pattern.test(text));
}

function containsGenericReasoningFiller(value: string | null | undefined): boolean {
  const text = normalizeText(value);
  if (!text) return false;
  return GENERIC_REASONING_FILLER_PATTERNS.some((pattern) => pattern.test(text));
}

function getWrongGuessLabel(item: SemanticWrongGuess | null | undefined): string | null | undefined {
  return item?.guess ?? item?.label;
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
  input.articleBlocks?.forEach((item, index) => {
    scanTextEntry(issues, `articleBlocks[${index}]`, item, input.locale);
    if (containsGenericReasoningFiller(item)) {
      pushIssue(
        issues,
        "copy.genericReasoningFiller",
        "Article copy uses generic filler instead of a clue-specific solving path",
        `articleBlocks[${index}]`,
        item,
      );
    }
  });

  input.wrongGuesses?.forEach((item, index) => {
    const label = getWrongGuessLabel(item);
    const labelField = item?.guess !== undefined ? `wrongGuesses[${index}].guess` : `wrongGuesses[${index}].label`;
    const explanation = item?.explanation ?? [item?.whyPlausible, item?.whyRejected].filter(Boolean).join(" ");
    scanTextEntry(issues, labelField, label, input.locale);
    scanTextEntry(issues, `wrongGuesses[${index}].explanation`, explanation, input.locale);
    if (item?.guess !== undefined && looksLikeMachineGuess(label)) {
      pushIssue(
        issues,
        "wrongGuesses.machineyGuess",
        "Wrong-guess label sounds machine-made instead of like a believable human false start",
        labelField,
        label,
      );
    } else if (looksLikeMachineGuess(label) || looksLikeGenericSoftFalseStart(label)) {
      pushIssue(
        issues,
        "wrongGuesses.genericLabel",
        "Wrong-guess label is too generic to explain how a human would misread the clues",
        labelField,
        label,
      );
    }
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
  const answerLogicFields: Array<[string, string | null | undefined]> = [
    ["overview", input.overview],
    ["solutionEmergence", input.solutionEmergence],
    ["summary", input.summary],
    ["seoDescription", input.seoDescription],
    ...(input.articleBlocks?.map((item, index) => [`articleBlocks[${index}]`, item] as [string, string]) ?? []),
    ...(input.clueDetails?.flatMap((item, index) => [
      [`clueDetails[${index}].phrase`, item?.phrase] as [string, string | null | undefined],
      [`clueDetails[${index}].explanation`, item?.explanation] as [string, string | null | undefined],
    ]) ?? []),
    ...(input.faqs?.flatMap((item, index) => [
      [`faqs[${index}].question`, item?.question] as [string, string | null | undefined],
      [`faqs[${index}].answer`, item?.answer] as [string, string | null | undefined],
    ]) ?? []),
  ];

  for (const [field, value] of answerLogicFields) {
    pushAnswerLogicIssues(issues, field, value, input.mainAnswer);
  }

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

    const answerUsageIssue = getExactAnswerUsageIssue(input);
    if (answerUsageIssue) {
      issues.push({
        code: answerUsageIssue.code,
        message: answerUsageIssue.message,
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

  const temporaryPageFields: Array<[string, string | null | undefined]> = [
    ["overview", input.overview],
    ["solutionEmergence", input.solutionEmergence],
    ["lessons[0].body", input.lessons?.[0]?.body],
    ["lessons[1].body", input.lessons?.[1]?.body],
    ["lessons[2].body", input.lessons?.[2]?.body],
    ["faqs[0].answer", input.faqs?.[0]?.answer],
    ["faqs[1].answer", input.faqs?.[1]?.answer],
    ["faqs[2].answer", input.faqs?.[2]?.answer],
  ];

  const genericReasoningFillerFields: Array<[string, string | null | undefined]> = [
    ["overview", input.overview],
    ["solutionEmergence", input.solutionEmergence],
    ["summary", input.summary],
    ...(input.faqs?.flatMap((item, index) => [
      [`faqs[${index}].question`, item?.question] as [string, string | null | undefined],
      [`faqs[${index}].answer`, item?.answer] as [string, string | null | undefined],
    ]) ?? []),
    ...(input.clueDetails?.flatMap((item, index) => [
      [`clueDetails[${index}].phrase`, item?.phrase] as [string, string | null | undefined],
      [`clueDetails[${index}].explanation`, item?.explanation] as [string, string | null | undefined],
    ]) ?? []),
    ...(input.lessons?.flatMap((item, index) => [
      [`lessons[${index}].title`, item?.title] as [string, string | null | undefined],
      [`lessons[${index}].body`, item?.body] as [string, string | null | undefined],
    ]) ?? []),
  ];

  for (const [field, value] of genericReasoningFillerFields) {
    if (containsGenericReasoningFiller(value)) {
      pushIssue(
        issues,
        "copy.genericReasoningFiller",
        "Copy uses generic filler instead of a clue-specific solving path",
        field,
        value,
      );
    }
  }

  for (const [field, value] of temporaryPageFields) {
    const text = normalizeText(value);
    if (!text) continue;
    if (TEMPORARY_PAGE_PATTERNS.some((pattern) => pattern.test(text))) {
      issues.push({
        code: "copy.temporaryPageLanguage",
        message: "Draft sounds like a temporary quick-page notice instead of a normal walkthrough",
        field,
        ...(sampleText(value) ? { sample: sampleText(value) } : {}),
      });
      break;
    }
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

  const sharedRun = longestSharedTokenRun(input.overview, input.solutionEmergence);
  if (sharedRun >= 7) {
    issues.push({
      code: "sections.sharedPhrasing",
      message: `Overview and solve narrative reuse too much of the same phrasing (${sharedRun} words in a row)`,
      field: "solutionEmergence",
      ...(sampleText(input.solutionEmergence) ? { sample: sampleText(input.solutionEmergence) } : {}),
    });
  }

  if (GENERIC_CATEGORY_PIVOT_PATTERNS.some((pattern) => pattern.test(normalizeText(input.solutionEmergence)))) {
    issues.push({
      code: "solutionEmergence.genericPivot",
      message: "Solve narrative uses a generic category pivot instead of a clue-specific turning point",
      field: "solutionEmergence",
      ...(sampleText(input.solutionEmergence) ? { sample: sampleText(input.solutionEmergence) } : {}),
    });
  }

  const answerPattern = detectAnswerPattern(input.mainAnswer);
  if (answerPattern.kind === "typed-category" || answerPattern.kind === "category") {
    const faqConnectionAnswer = normalizeText(input.faqs?.[1]?.answer);
    if (GENERIC_CONNECTION_FAQ_PATTERNS.some((pattern) => pattern.test(faqConnectionAnswer))) {
      issues.push({
        code: "faqs.genericConnectionAnswer",
        message: "Connection FAQ sounds generic and does not explain the board specifically enough",
        field: "faqs[1].answer",
        ...(sampleText(input.faqs?.[1]?.answer) ? { sample: sampleText(input.faqs?.[1]?.answer) } : {}),
      });
    }
  }

  const faqTurningClueAnswer = normalizeText(input.faqs?.[2]?.answer);
  if (GENERIC_TURNING_CLUE_FAQ_PATTERNS.some((pattern) => pattern.test(faqTurningClueAnswer))) {
    issues.push({
      code: "faqs.genericTurningClueAnswer",
      message: "Turning clue FAQ uses generic narrowing phrasing instead of clue-specific evidence",
      field: "faqs[2].answer",
      ...(sampleText(input.faqs?.[2]?.answer) ? { sample: sampleText(input.faqs?.[2]?.answer) } : {}),
    });
  }

  input.clueDetails?.forEach((item, index) => {
    const explanation = normalizeText(item?.explanation);
    const phrase = normalizeText(item?.phrase);
    if (
      (answerPattern.kind === "before" || answerPattern.kind === "after") &&
      PHRASE_EXAMPLE_WITH_GLOSS_PATTERN.test(phrase)
    ) {
      issues.push({
        code: "clueDetails.unnaturalPhrase",
        message: "Phrase example looks mechanically pasted from a clue gloss instead of a natural phrase",
        field: `clueDetails[${index}].phrase`,
        ...(sampleText(item?.phrase) ? { sample: sampleText(item?.phrase) } : {}),
      });
    }
    if (!explanation) return;
    if (GENERIC_CLUE_EXPLANATION_PATTERNS.some((pattern) => pattern.test(explanation))) {
      issues.push({
        code: "clueDetails.genericExplanation",
        message: "Clue explanation repeats generic shared-connection filler instead of explaining the clue specifically",
        field: `clueDetails[${index}].explanation`,
        ...(sampleText(item?.explanation) ? { sample: sampleText(item?.explanation) } : {}),
      });
    }
  });

  input.lessons?.forEach((item, index) => {
    const title = normalizeText(item?.title);
    if (!title) return;
    if (GENERIC_LESSON_TITLE_PATTERNS.some((pattern) => pattern.test(title))) {
      issues.push({
        code: "lessons.genericTitle",
        message: `Lesson ${index + 1} title is generic and repeats across puzzles instead of referencing a specific clue or answer detail`,
        field: `lessons[${index}].title`,
        ...(sampleText(item?.title) ? { sample: sampleText(item?.title) } : {}),
      });
    }
  });

  input.faqs?.forEach((item, index) => {
    const question = normalizeText(item?.question);
    if (!question) return;
    if (GENERIC_FAQ_QUESTION_PATTERNS.some((pattern) => pattern.test(question))) {
      issues.push({
        code: "faqs.genericQuestion",
        message: `FAQ ${index + 1} question is a generic template instead of referencing a specific clue or answer detail`,
        field: `faqs[${index}].question`,
        ...(sampleText(item?.question) ? { sample: sampleText(item?.question) } : {}),
      });
    }
  });

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
  "copy.temporaryPageLanguage",
  "summary.answerSpoiler",
  "overview.leadingAnswerSpoiler",
  "sections.overlap",
  "sections.sharedPhrasing",
  "answer.overused",
  "wrongGuesses.machineyGuess",
  "solutionEmergence.genericPivot",
  "faqs.genericConnectionAnswer",
  "faqs.genericTurningClueAnswer",
  "clueDetails.genericExplanation",
  "clueDetails.unnaturalPhrase",
  "lessons.genericTitle",
  "faqs.genericQuestion",
  "answer.semanticNarrowing",
  "answer.alternateRestatement",
]);
