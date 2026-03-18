import { NextRequest, NextResponse } from "next/server";
import { defaultLocale } from "@/i18n.config";
import {
  generatePuzzleContent,
  generatePuzzleContentFromPrompt,
  PuzzleDataForAI,
} from "@/lib/puzzle-generation";
import {
  CONTENT_CONTRACT,
  normalizeAnswerLabel,
  promotePublishBlockingIssues,
  validateContentContract,
  type ContentContractInput,
  type ContentContractIssue,
} from "@/lib/puzzles/content-contract";
import { buildPinpointDescription, buildPinpointTitle } from "@/lib/seo/pinpoint";

const ADMIN_TOKENS = [
  process.env.API_SECRET_TOKEN,
  process.env.ADMIN_PASSPHRASE,
  process.env.NODE_ENV === "production" ? null : "admin-secret-dev",
].filter(Boolean);

const DISALLOWED_LANGUAGE_PATTERN = /[\u3400-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/;
const LOCALIZE_LABELS: Record<string, string> = {
  fr: "French (fr)",
  de: "German (de)",
  "pt-BR": "Brazilian Portuguese (pt-BR)",
};
const LLM_TEMPLATE_VERSION = "pinpoint-v7";

type DraftRecord = Record<string, unknown>;

type LanguageIssue = {
  level: "error";
  code: "language.disallowed";
  message: string;
  field: string;
  sample?: string;
};

export const maxDuration = 60;

function resolveDefaultModel(
  provider: "openai" | "anthropic" | "zhipu" | "azure",
  mode: "draft",
) {
  if (provider === "zhipu") {
    return "glm-4-plus";
  }
  if (provider === "anthropic") {
    return process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";
  }
  return mode === "draft" ? "google/gemini-2.0-flash-001" : "google/gemini-2.0-flash-001";
}

function asRecord(value: unknown): DraftRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as DraftRecord;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readDraftParts(ai: unknown): {
  sections: DraftRecord;
  analysis: DraftRecord;
} {
  const root = asRecord(ai) ?? {};
  return {
    sections: asRecord(root.sections) ?? {},
    analysis: asRecord(root.analysis) ?? {},
  };
}

function toContractClueDetails(value: unknown): ContentContractInput["clueDetails"] {
  if (!Array.isArray(value)) return null;
  return value.map((item) => {
    const row = asRecord(item);
    return {
      clue: asString(row?.clue),
      phrase: asString(row?.phrase),
      explanation: asString(row?.explanation),
    };
  });
}

function toContractLessons(value: unknown): ContentContractInput["lessons"] {
  if (!Array.isArray(value)) return null;
  return value.map((item) => {
    const row = asRecord(item);
    return {
      title: asString(row?.title),
      body: asString(row?.body),
    };
  });
}

function toContractFaqs(value: unknown): ContentContractInput["faqs"] {
  if (!Array.isArray(value)) return null;
  return value.map((item) => {
    const row = asRecord(item);
    return {
      question: asString(row?.question),
      answer: asString(row?.answer),
    };
  });
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeForMatch(value: string | null | undefined): string {
  return normalizeWhitespace(value ?? "")
    .toLowerCase()
    .replace(/["“”'`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(value: string | undefined | null) {
  return (value?.trim().match(/\S+/g) ?? []).length;
}

function clampToMaxChars(text: string, maxChars: number) {
  const normalized = normalizeWhitespace(text);
  if (normalized.length <= maxChars) return normalized;
  const slice = normalized.slice(0, maxChars + 1);
  const lastSpace = slice.lastIndexOf(" ");
  const cutAt = lastSpace > 0 ? lastSpace : maxChars;
  const clipped = slice.slice(0, cutAt).replace(/[ ,;:.]+$/, "");
  return /[.!?]$/.test(clipped) ? clipped : `${clipped}.`;
}

function ensureMinWords(text: string, minWords: number, fillers: string[]) {
  let result = normalizeWhitespace(text);
  let index = 0;
  while (countWords(result) < minWords && index < fillers.length) {
    result = normalizeWhitespace(`${result} ${fillers[index]}`);
    index += 1;
  }
  while (countWords(result) < minWords && fillers.length > 0) {
    result = normalizeWhitespace(`${result} ${fillers[fillers.length - 1]}`);
  }
  return result;
}

function getMissingClues(text: string | null | undefined, clues: string[]): string[] {
  const normalizedText = normalizeForMatch(text);
  if (!normalizedText) return clues;
  return clues.filter((clue) => !normalizedText.includes(normalizeForMatch(clue)));
}

function buildFallbackCluePhrase(clue: string, answer: string): string {
  const pattern = detectAnswerPattern(answer);
  if (pattern.kind === "before") return normalizeWhitespace(`${clue} ${pattern.token}`);
  if (pattern.kind === "after") return normalizeWhitespace(`${pattern.token} ${clue}`);
  if (pattern.kind === "typed-category") {
    const normalizedClue = normalizeWhitespace(clue.replace(/\s*\([^)]*\)\s*/g, " "));
    if (normalizeForMatch(normalizedClue).includes(normalizeForMatch(pattern.singularNoun))) {
      return normalizedClue;
    }
    return normalizeWhitespace(`${normalizedClue} ${pattern.singularNoun}`);
  }
  return clue;
}

function buildFallbackClueExplanation(clue: string, partnerClue: string): string {
  return normalizeWhitespace(
    `${clue} becomes more convincing when it is read beside ${partnerClue}, because the board starts narrowing toward one concrete shared connection instead of five unrelated facts.`,
  );
}

function hasGenericConnectionFaqAnswer(text: string | null | undefined): boolean {
  const normalized = normalizeWhitespace(text ?? "").toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("same category once the board is read in the right frame") ||
    normalized.includes("one later clue makes the category feel much more obvious")
  );
}

function buildSpecificConnectionFaqAnswer(clues: string[]): string {
  const [first = "the first clue", second = "the second clue", third = "the third clue", fourth = "the fourth clue", fifth = "the fifth clue"] = clues;
  return normalizeWhitespace(
    `${first}, ${second}, and ${third} already point toward the same setting, while ${fourth} and ${fifth} confirm that the board is circling one concrete connection rather than asking for a loose umbrella category.`,
  );
}

function buildFallbackLessons(clues: string[]) {
  const [first = "the first clue", second = "the second clue", third = "the third clue"] = clues;
  return [
    {
      title: "Test one connector across every clue",
      body: `A candidate answer is only worth keeping if ${first}, ${second}, and the remaining clues all fit the same frame without forcing the wording.`,
    },
    {
      title: "Use the strongest clue as the tiebreaker",
      body: `${third} usually matters most once two possible themes seem plausible, because the sharper clue often kills the wrong bucket immediately.`,
    },
    {
      title: "Confirm the board before locking in",
      body: "A good Pinpoint solve feels consistent across all five clues, not just clever for the first two that jump out.",
    },
  ];
}

function normalizeTargetLocale(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return Object.prototype.hasOwnProperty.call(LOCALIZE_LABELS, trimmed) ? trimmed : null;
}

function safeJSONString(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}

type AnswerPattern =
  | { kind: "before"; token: string }
  | { kind: "after"; token: string }
  | { kind: "typed-category"; noun: string; singularNoun: string }
  | { kind: "category" };

function detectAnswerPattern(answer: string): AnswerPattern {
  const before = answer.match(/^Words that come before\s+["“]?(.+?)["”]?$/i);
  if (before?.[1]) {
    return { kind: "before", token: before[1] };
  }
  const after = answer.match(/^Words that come after\s+["“]?(.+?)["”]?$/i);
  if (after?.[1]) {
    return { kind: "after", token: after[1] };
  }
  const typedCategory = answer.match(/^(Types|Kinds)\s+of\s+(.+)$/i);
  if (typedCategory?.[2]) {
    const noun = normalizeWhitespace(typedCategory[2].replace(/["“”]/g, ""));
    const words = noun.split(/\s+/);
    const lastWord = words[words.length - 1] || noun;
    let singularLastWord = lastWord;
    if (/ies$/i.test(lastWord)) {
      singularLastWord = `${lastWord.slice(0, -3)}y`;
    } else if (/s$/i.test(lastWord) && !/ss$/i.test(lastWord)) {
      singularLastWord = lastWord.slice(0, -1);
    }
    const singularNoun = normalizeWhitespace([...words.slice(0, -1), singularLastWord].join(" "));
    return {
      kind: "typed-category",
      noun,
      singularNoun: singularNoun || noun,
    };
  }
  return { kind: "category" };
}

function countMentionedClues(text: string | null | undefined, clues: string[]): number {
  const normalizedText = normalizeForMatch(text);
  if (!normalizedText) return 0;
  return clues.filter((clue) => {
    const normalizedClue = normalizeForMatch(clue);
    return Boolean(normalizedClue && normalizedText.includes(normalizedClue));
  }).length;
}

function looksGenericTurningPoint(text: string | null | undefined): boolean {
  const normalized = normalizeWhitespace(text ?? "").toLowerCase();
  if (!normalized) return true;
  return (
    normalized.includes("the key clue is the clue that makes the pattern click") ||
    normalized.includes("the clue that makes the pattern click") ||
    normalized.includes("the key clue") ||
    normalized.includes("the later clue")
  );
}

function looksMachineyWrongGuess(text: string | null | undefined): boolean {
  const normalized = normalizeWhitespace(text ?? "");
  if (!normalized) return true;
  return (
    /^(brands?|types?|kinds?) of\b/i.test(normalized) ||
    /\b(items?|things?|objects?|stuff)\b/i.test(normalized) ||
    /\bvehicle brands?\b/i.test(normalized) ||
    /\bbrands? of vehicles?\b/i.test(normalized)
  );
}

function pickTurningPointClue(clues: string[]): string {
  const scored = clues
    .map((clue, index) => {
      let score = index;
      if (/\s/.test(clue)) score += 2;
      if (/[^\p{L}\p{N}\s()'"&,-]/u.test(clue)) score += 2;
      if (/bridge|island|square|geographic|advertising|cellular|touch|golden|matryoshka|princess/i.test(clue)) {
        score += 3;
      }
      return { clue, score };
    })
    .sort((left, right) => right.score - left.score);
  return scored[0]?.clue || clues[clues.length - 1] || "the later clue";
}

function buildFallbackConnectorSummary(answer: string): string {
  const pattern = detectAnswerPattern(answer);
  if (pattern.kind === "before" || pattern.kind === "after") {
    return `a phrase pattern built around ${pattern.token}`;
  }
  if (pattern.kind === "typed-category") {
    return `a category board about ${pattern.noun.toLowerCase()}`;
  }
  const label = normalizeAnswerLabel(answer);
  return label ? `a category board about ${label.toLowerCase()}` : "a shared category board";
}

function buildGroundedHeroSummary(puzzleData: PuzzleDataForAI): string {
  const clues = puzzleData.rawWords.map((word) => normalizeWhitespace(String(word ?? ""))).filter(Boolean);
  const cluePreview = clues.slice(0, 3).join(", ");
  const pattern = detectAnswerPattern(puzzleData.mainAnswer);
  const frameLabel =
    pattern.kind === "before" || pattern.kind === "after" ? "shared phrase logic" : "shared category";
  return `At first glance, ${cluePreview} do not suggest one clean pattern. The board only tightens once a later clue makes the ${frameLabel} feel much more specific.`;
}

function buildFallbackFalseStarts(puzzleData: PuzzleDataForAI): string[] {
  const clues = puzzleData.rawWords.map((word) => normalizeWhitespace(String(word ?? ""))).filter(Boolean);
  const joined = clues.join(" ").toLowerCase();
  const pattern = detectAnswerPattern(puzzleData.mainAnswer);
  const guesses = new Set<string>();

  if (pattern.kind === "before" || pattern.kind === "after") {
    if (/mickey|disney|princess|bowser|luigi/i.test(joined)) guesses.add("cartoon references");
    if (/optical|touch|cellular|electric|cable|smart/i.test(joined)) guesses.add("tech terms");
    if (/stop and smell|cat and|wrap|wedding/i.test(joined)) guesses.add("familiar sayings");
    if (/tea|damask|english|dog|rose/i.test(joined) || /\broses?\b/i.test(pattern.token)) guesses.add("garden vocabulary");
    if (guesses.size === 0) guesses.add("common compound words");
    if (guesses.size === 1) guesses.add("loose word associations");
    return [...guesses].slice(0, 2);
  }

  if (/time|economist|cosmopolitan|digest|geographic/i.test(joined)) guesses.add("publication brands");
  if (/bridge|island|square|fog|cable/i.test(joined)) guesses.add("California travel references");
  if (/toad|luigi|bowser|princess|piranha/i.test(joined)) guesses.add("video game references");
  if (/mountain|electric|recumbent|tandem|speed/i.test(joined)) guesses.add("transportation terms");
  if (/ball|bobblehead|voodoo|barbie|matryoshka/i.test(joined)) guesses.add("collectibles");
  if (guesses.size === 0) guesses.add("broader category guesses");
  return [...guesses].slice(0, 2);
}

function buildFallbackRejectedGuess(
  puzzleData: PuzzleDataForAI,
  wrongGuess: string,
  turningClue: string,
): { guess: string; explanation: string } {
  const pattern = detectAnswerPattern(puzzleData.mainAnswer);
  const explanation =
    pattern.kind === "before" || pattern.kind === "after"
      ? `${turningClue} never fit that reading cleanly enough, so the board needed a tighter phrase frame.`
      : `${turningClue} never fit that reading cleanly enough, so the board needed a more exact category.`;
  return {
    guess: wrongGuess,
    explanation,
  };
}

function buildFallbackTurningPoint(puzzleData: PuzzleDataForAI, turningClue: string): string {
  const pattern = detectAnswerPattern(puzzleData.mainAnswer);
  if (pattern.kind === "before" || pattern.kind === "after") {
    return `"${turningClue}" is the clue that makes the phrase pattern click.`;
  }
  return `"${turningClue}" is the clue that makes the category click.`;
}

function buildFallbackSolutionEmergence(
  puzzleData: PuzzleDataForAI,
  wrongGuess: string,
  turningClue: string,
): string {
  const pattern = detectAnswerPattern(puzzleData.mainAnswer);
  if (pattern.kind === "before" || pattern.kind === "after") {
    return [
      `I did not have a clean category from the first clue. I initially drifted toward ${wrongGuess}, but that line of thinking never explained "${turningClue}" cleanly enough.`,
      `The turn came when I let "${turningClue}" lead the solve. Once I read the board through a tighter phrase pattern, the earlier clues stopped feeling broad and started reading like natural phrases.`,
    ].join(" ");
  }
  return [
    `I did not have a clean category from the first clue. I initially drifted toward ${wrongGuess}, but that line of thinking never explained "${turningClue}" cleanly enough.`,
    `The turn came when I let "${turningClue}" narrow the board. Once I read the clues through one tighter category, the earlier items stopped feeling miscellaneous and started reading like members of the same set.`,
  ].join(" ");
}

function buildLocalizationPolicy(answer: string): string {
  const pattern = detectAnswerPattern(answer);
  if (pattern.kind === "before") {
    return [
      `- This is a phrase-pattern answer of the form Words that come before "${pattern.token}".`,
      `- Localize only the connector frame, but keep the token "${pattern.token}" unchanged.`,
      `- Each clueDetails.phrase must be a real English phrase that ends with ${pattern.token}.`,
      "- Do not rewrite the puzzle into a broad topic.",
    ].join("\n");
  }
  if (pattern.kind === "after") {
    return [
      `- This is a phrase-pattern answer of the form Words that come after "${pattern.token}".`,
      `- Localize only the connector frame, but keep the token "${pattern.token}" unchanged.`,
      `- Each clueDetails.phrase must be a real English phrase that begins with ${pattern.token}.`,
      "- Do not rewrite the puzzle into a broad topic.",
    ].join("\n");
  }
  return [
    "- This is a category-type answer.",
    "- Localize the full answer label into the target language.",
    "- clueDetails must explain why each clue belongs to the category.",
  ].join("\n");
}

function buildLocalizePrompt(
  puzzleData: PuzzleDataForAI,
  sourceDraft: unknown,
  targetLocale: string,
): string {
  const localeLabel = LOCALIZE_LABELS[targetLocale] || targetLocale;
  const sourceDraftJson = safeJSONString(sourceDraft);

  return `
You are a localization editor for "Pinpoint Answer Today".
Translate the source JSON content from English into ${localeLabel}.

Output ONLY a valid JSON object with this exact structure:
{
  "sections": {
    "overview": "...",
    "solutionEmergence": "...",
    "wrongGuesses": [{ "guess": "...", "explanation": "..." }],
    "clueDetails": [{ "clue": "...", "phrase": "...", "explanation": "...", "etymology": "..." }],
    "lessons": [{ "title": "...", "body": "..." }],
    "faqs": [{ "question": "...", "answer": "..." }],
    "trivia": "..."
  },
  "analysis": {
    "detailedBreakdown": "...",
    "dailyDebrief": "...",
    "heroSummary": "...",
    "seoTitle": "...",
    "seoDescription": "...",
    "seoKeywords": [],
    "tags": ["...", "...", "...", "...", "..."],
    "llmTemplateVersion": "${LLM_TEMPLATE_VERSION}"
  }
}

Hard rules:
1. Keep the JSON shape exactly.
2. Keep clue words unchanged: ${puzzleData.rawWords.join(", ")}.
3. Keep clueDetails[].clue equal to the original clue token.
4. Follow this answer policy exactly:
${buildLocalizationPolicy(puzzleData.mainAnswer)}
5. Keep array counts the same as source.
6. seoTitle and seoDescription must still include all five clue words exactly as written.
7. heroSummary must remain spoiler-safe and must not reveal the exact answer text unless the source JSON already does.
8. Return only JSON.

Puzzle context:
- puzzleNumber: ${puzzleData.puzzleNumber}
- clues: ${puzzleData.rawWords.join(", ")}
- mainAnswer: ${puzzleData.mainAnswer}
- targetLocale: ${targetLocale}

Source JSON to localize:
${sourceDraftJson}
`.trim();
}

function toContractInput(
  puzzleData: PuzzleDataForAI,
  ai: unknown,
  locale: string | null = defaultLocale,
): ContentContractInput {
  const { sections, analysis } = readDraftParts(ai);
  return {
    puzzleNumber: Number(puzzleData.puzzleNumber),
    locale,
    rawWords: puzzleData.rawWords,
    mainAnswer: puzzleData.mainAnswer,
    summary: asString(analysis.heroSummary) ?? asString(analysis.dailyDebrief) ?? null,
    seoTitle: asString(analysis.seoTitle),
    seoDescription: asString(analysis.seoDescription),
    overview: asString(sections.overview),
    solutionEmergence: asString(sections.solutionEmergence),
    wrongGuesses: Array.isArray(sections.wrongGuesses)
      ? sections.wrongGuesses.map((item) => {
          const row = asRecord(item);
          return {
            guess: asString(row?.guess),
            explanation: asString(row?.explanation),
          };
        })
      : null,
    clueDetails: toContractClueDetails(sections.clueDetails),
    lessons: toContractLessons(sections.lessons),
    faqs: toContractFaqs(sections.faqs),
    trivia: asString(sections.trivia),
    llmTemplateVersion: asString(analysis.llmTemplateVersion),
  };
}

function hasDisallowedLanguage(value: string | null | undefined): boolean {
  return Boolean(value && DISALLOWED_LANGUAGE_PATTERN.test(value));
}

function pushLanguageIssue(issues: LanguageIssue[], field: string, value: unknown) {
  if (typeof value !== "string") return;
  if (!hasDisallowedLanguage(value)) return;
  issues.push({
    level: "error",
    code: "language.disallowed",
    message: `Disallowed non-English characters detected in ${field}`,
    field,
    sample: normalizeWhitespace(value).slice(0, 140) || undefined,
  });
}

function collectInputLanguageIssues(puzzleData: PuzzleDataForAI): LanguageIssue[] {
  const issues: LanguageIssue[] = [];
  pushLanguageIssue(issues, "mainAnswer", puzzleData.mainAnswer);
  puzzleData.rawWords.forEach((word, index) => {
    pushLanguageIssue(issues, `rawWords[${index}]`, word);
  });
  return issues;
}

function collectOutputLanguageIssues(ai: unknown): LanguageIssue[] {
  const { sections, analysis } = readDraftParts(ai);
  const issues: LanguageIssue[] = [];

  pushLanguageIssue(issues, "analysis.heroSummary", analysis.heroSummary);
  pushLanguageIssue(issues, "analysis.dailyDebrief", analysis.dailyDebrief);
  pushLanguageIssue(issues, "analysis.detailedBreakdown", analysis.detailedBreakdown);
  pushLanguageIssue(issues, "analysis.seoTitle", analysis.seoTitle);
  pushLanguageIssue(issues, "analysis.seoDescription", analysis.seoDescription);
  pushLanguageIssue(issues, "sections.overview", sections.overview);
  pushLanguageIssue(issues, "sections.solutionEmergence", sections.solutionEmergence);
  pushLanguageIssue(issues, "sections.trivia", sections.trivia);

  (Array.isArray(sections.wrongGuesses) ? sections.wrongGuesses : []).forEach((item, index) => {
    const row = asRecord(item);
    pushLanguageIssue(issues, `sections.wrongGuesses[${index}].guess`, row?.guess);
    pushLanguageIssue(issues, `sections.wrongGuesses[${index}].explanation`, row?.explanation);
  });

  (Array.isArray(sections.clueDetails) ? sections.clueDetails : []).forEach((item, index) => {
    const row = asRecord(item);
    pushLanguageIssue(issues, `sections.clueDetails[${index}].clue`, row?.clue);
    pushLanguageIssue(issues, `sections.clueDetails[${index}].phrase`, row?.phrase);
    pushLanguageIssue(issues, `sections.clueDetails[${index}].explanation`, row?.explanation);
    pushLanguageIssue(issues, `sections.clueDetails[${index}].etymology`, row?.etymology);
  });

  (Array.isArray(sections.lessons) ? sections.lessons : []).forEach((item, index) => {
    const row = asRecord(item);
    pushLanguageIssue(issues, `sections.lessons[${index}].title`, row?.title);
    pushLanguageIssue(issues, `sections.lessons[${index}].body`, row?.body);
  });

  (Array.isArray(sections.faqs) ? sections.faqs : []).forEach((item, index) => {
    const row = asRecord(item);
    pushLanguageIssue(issues, `sections.faqs[${index}].question`, row?.question);
    pushLanguageIssue(issues, `sections.faqs[${index}].answer`, row?.answer);
  });

  return issues;
}

function validateDraftIssues(
  puzzleData: PuzzleDataForAI,
  ai: unknown,
  locale: string | null = defaultLocale,
) {
  return promotePublishBlockingIssues(validateContentContract(toContractInput(puzzleData, ai, locale)));
}

function buildRepairPrompt(
  puzzleData: PuzzleDataForAI,
  previous: unknown,
  issues: ContentContractIssue[],
) {
  const issueLines = issues.map((issue) => `- ${issue.message}`).join("\n");
  const previousJson = JSON.stringify(previous, null, 2);
  const label = normalizeAnswerLabel(puzzleData.mainAnswer) || "the shared idea";
  return `
You are a senior content writer for "Pinpoint Answer Today". Use the V7 Compatible Template.

The previous JSON failed validation for LinkedIn Pinpoint #${puzzleData.puzzleNumber}.

Fix these issues:
${issueLines}

Hard rules:
1. Output ONLY a valid JSON object.
2. Keep the puzzle data consistent:
   - Clues: ${puzzleData.rawWords.join(", ")}
   - Answer: ${label}
3. overview must be at least ${CONTENT_CONTRACT.overviewMinWords} words.
4. solutionEmergence must be at least ${CONTENT_CONTRACT.solutionEmergenceMinWords} words and use first-person voice.
5. seoTitle must include all five clues and not the answer.
6. seoDescription must include all five clues.
7. clueDetails must include exactly 5 items.
8. analysis.heroSummary must stay spoiler-safe and must not include the exact answer text.
9. overview must not open with the exact answer text or with "The answer is".
10. analysis.llmTemplateVersion must be "${LLM_TEMPLATE_VERSION}".

Previous JSON:
${previousJson}
`.trim();
}

function autoFixDraft(puzzleData: PuzzleDataForAI, ai: unknown) {
  const next = asRecord(JSON.parse(JSON.stringify(ai ?? {}))) ?? {};
  const nextSections = asRecord(next.sections) ?? {};
  const nextAnalysis = asRecord(next.analysis) ?? {};
  const nextSlots = asRecord(next.slots) ?? {};
  next.sections = nextSections;
  next.analysis = nextAnalysis;
  next.slots = nextSlots;

  const puzzleNumber = Number(puzzleData.puzzleNumber);
  const clues = puzzleData.rawWords.map((word) => normalizeWhitespace(String(word ?? ""))).filter(Boolean);
  const label = normalizeAnswerLabel(puzzleData.mainAnswer) || "the shared idea";
  const answerPattern = detectAnswerPattern(puzzleData.mainAnswer);
  const turningClue = pickTurningPointClue(clues);
  const fallbackFalseStarts = buildFallbackFalseStarts(puzzleData);

  nextAnalysis.llmTemplateVersion = LLM_TEMPLATE_VERSION;

  const seoTitle = asString(nextAnalysis.seoTitle);
  if (!seoTitle || getMissingClues(seoTitle, clues).length > 0) {
    nextAnalysis.seoTitle = buildPinpointTitle(puzzleNumber, puzzleData.rawWords);
  } else {
    nextAnalysis.seoTitle = normalizeWhitespace(seoTitle);
  }

  const overview = asString(nextSections.overview) ?? "";
  if (countWords(overview) < CONTENT_CONTRACT.overviewMinWords) {
    nextSections.overview = ensureMinWords(
      overview || `LinkedIn Pinpoint #${puzzleNumber} begins with five clues that seem unrelated at first glance.`,
      CONTENT_CONTRACT.overviewMinWords,
      [
        "I look for a connector that can pair naturally with each clue.",
        "Once I test one shared connector across every clue, the pattern either holds or falls apart.",
        "That consistency is what turns a vague hunch into a confirmed answer.",
      ],
    );
  }

  let solution = asString(nextSections.solutionEmergence) ?? "";
  if (!/\bI\b/.test(solution)) {
    solution = `I started by testing a few obvious categories, but at least one clue felt like an outlier. ${solution}`.trim();
  }
  if (countWords(solution) < CONTENT_CONTRACT.solutionEmergenceMinWords) {
    nextSections.solutionEmergence = ensureMinWords(
      solution || "I began by scanning the clues for a shared pattern.",
      CONTENT_CONTRACT.solutionEmergenceMinWords,
      [
        "When that approach stayed too broad, I switched to a stricter phrase-by-phrase check.",
        "The breakthrough came when one clue narrowed the set enough to make the shared pattern believable.",
        "Once I verified all five clues, I knew I had the correct final connector.",
      ],
    );
  } else {
    nextSections.solutionEmergence = normalizeWhitespace(solution);
  }

  const seoDescription = asString(nextAnalysis.seoDescription);
  const normalizedSeoDescription = seoDescription ? normalizeWhitespace(seoDescription) : "";
  if (
    normalizedSeoDescription.length < CONTENT_CONTRACT.metaDescriptionMinChars ||
    getMissingClues(normalizedSeoDescription, clues).length > 0
  ) {
    nextAnalysis.seoDescription = buildPinpointDescription(puzzleNumber, puzzleData.rawWords);
  } else {
    nextAnalysis.seoDescription = clampToMaxChars(
      normalizedSeoDescription,
      CONTENT_CONTRACT.metaDescriptionMaxChars,
    );
  }

  if (!Array.isArray(nextAnalysis.seoKeywords) || nextAnalysis.seoKeywords.length > 0) {
    nextAnalysis.seoKeywords = [];
  }

  const heroSummary = asString(nextAnalysis.heroSummary) ?? "";
  const normalizedLabel = normalizeAnswerLabel(puzzleData.mainAnswer);
  const normalizedHeroSummary = normalizeWhitespace(heroSummary).replace(/["“”]/g, "");
  if (
    !heroSummary ||
    (normalizedLabel && normalizedHeroSummary.toLowerCase().includes(normalizedLabel.toLowerCase())) ||
    countMentionedClues(heroSummary, clues) < 2
  ) {
    nextAnalysis.heroSummary = buildGroundedHeroSummary(puzzleData);
  }

  const slotHeroSummary = asString(nextSlots.heroIntroSpoilerSafe) ?? "";
  nextSlots.heroIntroSpoilerSafe =
    !slotHeroSummary || countMentionedClues(slotHeroSummary, clues) < 2
      ? nextAnalysis.heroSummary
      : normalizeWhitespace(slotHeroSummary);

  const slotConnectorSummary = asString(nextSlots.connectorSummary) ?? "";
  nextSlots.connectorSummary =
    !slotConnectorSummary ||
    (answerPattern.kind === "typed-category" &&
      !normalizeForMatch(slotConnectorSummary).includes(normalizeForMatch(answerPattern.noun)))
      ? buildFallbackConnectorSummary(puzzleData.mainAnswer)
      : normalizeWhitespace(slotConnectorSummary);

  const slotTurningPoint = asString(nextSlots.turningPoint) ?? "";
  nextSlots.turningPoint =
    !slotTurningPoint || looksGenericTurningPoint(slotTurningPoint) || countMentionedClues(slotTurningPoint, clues) === 0
      ? buildFallbackTurningPoint(puzzleData, turningClue)
      : normalizeWhitespace(slotTurningPoint);

  const rawFalseStarts = Array.isArray(nextSlots.falseStarts)
    ? nextSlots.falseStarts.map((item) => asString(item)).filter((item): item is string => Boolean(item))
    : [];
  const cleanedFalseStarts = rawFalseStarts
    .map((item) => normalizeWhitespace(item))
    .filter((item) => item && !looksMachineyWrongGuess(item));
  const finalFalseStarts = (cleanedFalseStarts.length > 0 ? cleanedFalseStarts : fallbackFalseStarts).slice(0, 2);
  nextSlots.falseStarts = finalFalseStarts;

  const rejectedGuess = asRecord(nextSlots.rejectedGuess) ?? {};
  const rejectedGuessLabel = asString(rejectedGuess.guess);
  const rejectedGuessExplanation = normalizeWhitespace(asString(rejectedGuess.explanation) ?? "");
  const safeRejectedGuess =
    rejectedGuessLabel && !looksMachineyWrongGuess(rejectedGuessLabel)
      ? normalizeWhitespace(rejectedGuessLabel)
      : finalFalseStarts[0] || fallbackFalseStarts[0] || "a broader category guess";
  nextSlots.rejectedGuess = {
    guess: safeRejectedGuess,
    explanation:
      rejectedGuessExplanation && !looksGenericTurningPoint(rejectedGuessExplanation)
        ? rejectedGuessExplanation
        : buildFallbackRejectedGuess(puzzleData, safeRejectedGuess, turningClue).explanation,
  };
  nextSections.wrongGuesses = [
    {
      guess: safeRejectedGuess,
      explanation: asString((nextSlots.rejectedGuess as DraftRecord | null)?.explanation) || "",
    },
    ...finalFalseStarts
      .filter((item) => normalizeForMatch(item) !== normalizeForMatch(safeRejectedGuess))
      .slice(0, 1)
      .map((item) => ({
        guess: item,
        explanation: `${item} feels plausible early on, but "${turningClue}" pushes the board toward a more exact reading.`,
      })),
  ];

  if (
    countMentionedClues(solution, clues) === 0 ||
    looksGenericTurningPoint(solution) ||
    /\bwhat kind of source or title it was\b/i.test(solution) ||
    /\bwhat kind of item each clue described\b/i.test(solution)
  ) {
    solution = buildFallbackSolutionEmergence(puzzleData, safeRejectedGuess, turningClue);
    nextSections.solutionEmergence =
      countWords(solution) < CONTENT_CONTRACT.solutionEmergenceMinWords
        ? ensureMinWords(
            solution,
            CONTENT_CONTRACT.solutionEmergenceMinWords,
            [
              "When that approach stayed too broad, I switched to a stricter phrase-by-phrase check.",
              "The breakthrough came when one clue narrowed the set enough to make the shared pattern believable.",
              "Once I verified all five clues, I knew I had the correct final connector.",
            ],
          )
        : normalizeWhitespace(solution);
  }

  if (!asString(nextSections.trivia)) {
    nextSections.trivia =
      "Did you know? Connector puzzles often depend on one repeatable rule that makes every clue read naturally.";
  }

  const existingClueDetails = Array.isArray(nextSections.clueDetails) ? nextSections.clueDetails : [];
  const clueDetailRows = existingClueDetails.map((item) => asRecord(item));
  nextSections.clueDetails = clues.map((clue, index) => {
    const matchedRow =
      clueDetailRows.find((row) => normalizeForMatch(asString(row?.clue)) === normalizeForMatch(clue)) ??
      clueDetailRows[index] ??
      null;
    const partnerClue = clues[(index + 1) % clues.length] ?? clue;
    const phrase = asString(matchedRow?.phrase);
    const explanation = asString(matchedRow?.explanation);
    const etymology = asString(matchedRow?.etymology);
    const normalizedPhrase = normalizeWhitespace(phrase || "");
    const finalPhrase =
      answerPattern.kind === "typed-category" &&
      !normalizeForMatch(normalizedPhrase).includes(normalizeForMatch(answerPattern.noun))
        ? buildFallbackCluePhrase(clue, label)
        : normalizedPhrase || buildFallbackCluePhrase(clue, label);

    return {
      clue,
      phrase: normalizeWhitespace(finalPhrase),
      explanation: normalizeWhitespace(explanation || buildFallbackClueExplanation(clue, partnerClue)),
      ...(etymology ? { etymology: normalizeWhitespace(etymology) } : {}),
    };
  });

  const existingFaqs = Array.isArray(nextSections.faqs) ? nextSections.faqs : [];
  const faqRows = existingFaqs.map((item) => asRecord(item));
  const faq0Question =
    asString(faqRows[0]?.question) || `What is the answer to LinkedIn Pinpoint #${puzzleNumber}?`;
  const faq0Answer = asString(faqRows[0]?.answer);
  const faq1Question =
    asString(faqRows[1]?.question) || `How do the clues connect in LinkedIn Pinpoint #${puzzleNumber}?`;
  const faq1Answer = asString(faqRows[1]?.answer);
  const faq2Question =
    asString(faqRows[2]?.question) || "What solving strategy works best for boards like this?";
  const faq2Answer = asString(faqRows[2]?.answer);

  nextSections.faqs = [
    {
      question: faq0Question,
      answer:
        faq0Answer && normalizeForMatch(faq0Answer).includes(normalizeForMatch(label))
          ? normalizeWhitespace(faq0Answer)
          : `The answer is ${label}. The clues ${clues.join(", ")} all point back to that same connection.`,
    },
    {
      question: faq1Question,
      answer:
        faq1Answer && !hasGenericConnectionFaqAnswer(faq1Answer)
          ? normalizeWhitespace(faq1Answer)
          : buildSpecificConnectionFaqAnswer(clues),
    },
    {
      question: faq2Question,
      answer:
        faq2Answer
          ? normalizeWhitespace(faq2Answer)
          : "Start by testing one candidate connector against all five clues. If even one clue feels forced, keep looking until the whole board reads cleanly.",
    },
  ];

  if (!Array.isArray(nextSections.lessons) || nextSections.lessons.length < CONTENT_CONTRACT.lessonsMin) {
    nextSections.lessons = buildFallbackLessons(clues);
  }

  return next;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const adminPassHeader = req.headers.get("x-admin-pass");
    const token = authHeader?.replace("Bearer ", "") || adminPassHeader;

    if (!token || !ADMIN_TOKENS.includes(token)) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as {
      puzzleNumber?: string | number;
      rawWords?: string[];
      mainAnswer?: string;
      model?: string;
      type?: "draft" | "localize";
      targetLocale?: string;
      sourceDraft?: unknown;
    };

    const {
      puzzleNumber,
      rawWords,
      mainAnswer,
      model,
      type = "draft",
      targetLocale,
      sourceDraft,
    } = body;

    let provider: "openai" | "anthropic" | "zhipu" | "azure" = "openai";
    let apiKey = process.env.OPENAI_API_KEY;
    let apiEndpoint = process.env.OPENAI_BASE_URL;

    const isStandardOpenAI = apiKey?.startsWith("sk-");
    const isZhipu =
      process.env.ZHIPU_API_ENABLED === "true" ||
      (!isStandardOpenAI && apiKey?.includes(".") && !process.env.AZURE_OPENAI_ENDPOINT);

    if (isZhipu) {
      provider = "zhipu";
    } else if (!isStandardOpenAI && process.env.AZURE_OPENAI_ENDPOINT) {
      provider = "azure";
      apiEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
    } else if (!apiKey && (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)) {
      provider = "anthropic";
      apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
    }

    if (!apiKey) {
      return NextResponse.json({ message: "Server misconfiguration: no AI API keys found." }, { status: 500 });
    }

    if (!puzzleNumber || !rawWords || !mainAnswer) {
      return NextResponse.json(
        { message: "Missing required fields: puzzleNumber, rawWords, mainAnswer" },
        { status: 400 },
      );
    }

    const puzzleData: PuzzleDataForAI = {
      puzzleNumber: Number(puzzleNumber),
      rawWords,
      mainAnswer: normalizeAnswerLabel(mainAnswer),
    };

    if (type === "localize") {
      const normalizedLocale = normalizeTargetLocale(targetLocale);
      if (!normalizedLocale) {
        return NextResponse.json({ message: "Invalid targetLocale" }, { status: 400 });
      }
      const sourceDraftRecord = asRecord(sourceDraft);
      if (!sourceDraftRecord) {
        return NextResponse.json({ message: "sourceDraft is required for localize mode" }, { status: 400 });
      }

      const localizePrompt = buildLocalizePrompt(puzzleData, sourceDraftRecord, normalizedLocale);
      const localizedResult = await generatePuzzleContentFromPrompt(localizePrompt, apiKey, {
        provider,
        model: model || process.env.AI_MODEL || resolveDefaultModel(provider, "draft"),
        apiEndpoint,
      });
      const issues = validateDraftIssues(puzzleData, localizedResult, normalizedLocale);
      const errorIssues = issues.filter((issue) => issue.level === "error");

      if (errorIssues.length > 0) {
        return NextResponse.json(
          {
            success: false,
            message: `Localized draft failed contract: ${errorIssues.map((issue) => issue.message).join(" | ")}`,
            locale: normalizedLocale,
            issues,
          },
          { status: 422 },
        );
      }

      return NextResponse.json({
        success: true,
        locale: normalizedLocale,
        data: localizedResult,
        issues,
      });
    }

    const inputLanguageIssues = collectInputLanguageIssues(puzzleData);
    if (inputLanguageIssues.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Draft generation blocked: non-English characters found in input",
          issues: inputLanguageIssues,
        },
        { status: 422 },
      );
    }

    let result: unknown = await generatePuzzleContent(puzzleData, apiKey, {
      provider,
      model: model || process.env.AI_MODEL || resolveDefaultModel(provider, "draft"),
      apiEndpoint,
    });

    let issues = validateDraftIssues(puzzleData, result, defaultLocale);
    let errorIssues = issues.filter((issue) => issue.level === "error");

    if (errorIssues.length > 0) {
      try {
        const repairPrompt = buildRepairPrompt(puzzleData, result, errorIssues);
        result = await generatePuzzleContentFromPrompt(repairPrompt, apiKey, {
          provider,
          model: model || process.env.AI_MODEL || resolveDefaultModel(provider, "draft"),
          apiEndpoint,
        });
      } catch (repairError) {
        console.warn(
          "[API] Repair attempt failed:",
          repairError instanceof Error ? repairError.message : String(repairError),
        );
      }

      issues = validateDraftIssues(puzzleData, result, defaultLocale);
      errorIssues = issues.filter((issue) => issue.level === "error");
    }

    if (errorIssues.length > 0) {
      result = autoFixDraft(puzzleData, result);
      issues = validateDraftIssues(puzzleData, result, defaultLocale);
      errorIssues = issues.filter((issue) => issue.level === "error");
    }

    if (errorIssues.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Draft generation failed contract: ${errorIssues.map((issue) => issue.message).join(" | ")}`,
          issues,
        },
        { status: 422 },
      );
    }

    const outputLanguageIssues = collectOutputLanguageIssues(result);
    if (outputLanguageIssues.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Draft generation blocked: non-English characters found in output",
          issues: [...issues, ...outputLanguageIssues],
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
      issues,
    });
  } catch (error) {
    console.error("[API] Generate Draft Error:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Internal Server Error",
      },
      { status: 500 },
    );
  }
}
