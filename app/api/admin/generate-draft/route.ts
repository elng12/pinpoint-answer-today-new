import { NextRequest, NextResponse } from "next/server";
import { defaultLocale } from "@/i18n.config";
import {
  buildDeterministicPuzzleContent,
  generatePuzzleContent,
  generatePuzzleContentFromPrompt,
  PuzzleDataForAI,
} from "@/lib/puzzle-generation";
import {
  CONTENT_CONTRACT,
  getContentContractThresholds,
  normalizeAnswerLabel,
  promotePublishBlockingIssues,
  validateContentContract,
  type ContentContractInput,
  type ContentContractIssue,
} from "@/lib/puzzles/content-contract";
import {
  validateEvidenceContract,
} from "@/lib/puzzles/evidence-contract";
import {
  validateSlotContract,
  type SlotContractInput,
} from "@/lib/puzzles/slot-contract";
import {
  buildSharedFallbackLessons,
  buildSharedFallbackSolutionNarrative,
} from "@/lib/puzzles/fallback-copy";
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
const LLM_TEMPLATE_VERSION = "pinpoint-v9";

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
  _mode: "draft",
) {
  if (provider === "zhipu") {
    return "glm-4-plus";
  }
  if (provider === "anthropic") {
    return process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";
  }
  if (provider === "azure") {
    return process.env.AI_MODEL || "gpt-4.1-mini";
  }
  return process.env.OPENAI_BASE_URL ? "google/gemini-2.0-flash-001" : "gpt-4.1-mini";
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

function toStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === "string");
}

function toEvidenceContractInput(puzzleData: PuzzleDataForAI, ai: unknown) {
  const root = asRecord(ai) ?? {};
  const solvePath = asRecord(root.solvePath);
  const turningPoint = asRecord(root.turningPoint);
  const uniquenessSignals = asRecord(root.uniquenessSignals);

  return {
    rawWords: puzzleData.rawWords,
    mainAnswer: puzzleData.mainAnswer,
    questionType: asString(root.questionType),
    difficultyBand: asString(root.difficultyBand),
    solvePath: solvePath
      ? {
          firstRead: asString(solvePath.firstRead),
          falseStarts: toStringArray(solvePath.falseStarts),
          whyFalseStartPlausible: toStringArray(solvePath.whyFalseStartPlausible),
          breakingClue: asString(solvePath.breakingClue),
          pivot: asString(solvePath.pivot),
          fullBoardConfirmation: asString(solvePath.fullBoardConfirmation),
        }
      : null,
    turningPoint: turningPoint
      ? {
          clue: asString(turningPoint.clue),
          whyDecisive: asString(turningPoint.whyDecisive),
          whatChangedAfterIt: asString(turningPoint.whatChangedAfterIt),
        }
      : null,
    clueRows: Array.isArray(root.clueRows)
      ? root.clueRows.map((item) => {
          const row = asRecord(item);
          return {
            clue: asString(row?.clue),
            surfaceMisread: asString(row?.surfaceMisread),
            resolvedPhraseOrMember: asString(row?.resolvedPhraseOrMember),
            nonObviousWhy: asString(row?.nonObviousWhy),
            searchableContext: asString(row?.searchableContext),
          };
        })
      : null,
    faqItems: Array.isArray(root.faqItems)
      ? root.faqItems.map((item) => {
          const row = asRecord(item);
          return {
            intentType: asString(row?.intentType),
            question: asString(row?.question),
            answer: asString(row?.answer),
            tiedClue: asString(row?.tiedClue),
          };
        })
      : null,
    uniquenessSignals: uniquenessSignals
      ? {
          angle: asString(uniquenessSignals.angle),
          relatedEntities: toStringArray(uniquenessSignals.relatedEntities),
          doNotRepeatPatterns: toStringArray(uniquenessSignals.doNotRepeatPatterns),
        }
      : null,
  };
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
    `${clue} reads more cleanly once it is tested beside ${partnerClue}, because the board is clearly narrowing toward one answer instead of five unrelated facts.`,
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
    `${first}, ${second}, and ${third} already lean toward the same answer, while ${fourth} and ${fifth} confirm that the board is circling one concrete idea rather than a loose umbrella theme.`,
  );
}

function buildFallbackLessons(clues: string[]) {
  const turningPoint = clues[2] ?? clues[clues.length - 1] ?? "the later clue";
  return buildSharedFallbackLessons({ kind: "category", turningPoint });
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
  if (pattern.kind === "before") {
    return `familiar phrases that end with "${pattern.token}"`;
  }
  if (pattern.kind === "after") {
    return `familiar phrases and common terms that begin with "${pattern.token}"`;
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
  return pattern.kind === "before" || pattern.kind === "after"
    ? `At first, ${cluePreview} could point toward a few different phrase guesses before one later clue makes the missing word hard to miss.`
    : `At first, ${cluePreview} do not suggest one clean answer until a later clue makes the shared idea concrete enough to test.`;
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
      ? `${turningClue} never fit that reading cleanly enough, so the board needed one exact missing word instead of a loose phrase guess.`
      : `${turningClue} never fit that reading cleanly enough, so the board needed a more exact category.`;
  return {
    guess: wrongGuess,
    explanation,
  };
}

function buildFallbackTurningPoint(puzzleData: PuzzleDataForAI, turningClue: string): string {
  const pattern = detectAnswerPattern(puzzleData.mainAnswer);
  if (pattern.kind === "before" || pattern.kind === "after") {
    return `"${turningClue}" is the clue that makes the missing word hard to miss.`;
  }
  return `"${turningClue}" is the clue that makes the answer concrete enough to test.`;
}

function buildFallbackSolutionEmergence(
  puzzleData: PuzzleDataForAI,
  wrongGuess: string,
  turningClue: string,
): string {
  const pattern = detectAnswerPattern(puzzleData.mainAnswer);
  return buildSharedFallbackSolutionNarrative({
    kind: pattern.kind,
    wrongGuess,
    turningPoint: turningClue,
  }).join(" ");
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
    "articleBlocks": ["..."],
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
  const articleBlocks = Array.isArray(sections.articleBlocks)
    ? sections.articleBlocks.map((item) => asString(item) ?? "").filter(Boolean)
    : [];
  const bodyMode: ContentContractInput["bodyMode"] =
    articleBlocks.length > 0 && articleBlocks.length <= 6 ? "short" : "standard";
  return {
    puzzleNumber: Number(puzzleData.puzzleNumber),
    bodyMode,
    locale,
    rawWords: puzzleData.rawWords,
    mainAnswer: puzzleData.mainAnswer,
    summary: asString(analysis.heroSummary) ?? asString(analysis.dailyDebrief) ?? null,
    seoTitle: asString(analysis.seoTitle),
    seoDescription: asString(analysis.seoDescription),
    overview: asString(sections.overview),
    solutionEmergence: asString(sections.solutionEmergence),
    articleBlocks: articleBlocks.length > 0 ? articleBlocks : null,
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

function toSlotContractInput(
  puzzleData: PuzzleDataForAI,
  ai: unknown,
): SlotContractInput {
  const root = asRecord(ai) ?? {};
  const slots = asRecord(root.slots);
  return {
    rawWords: puzzleData.rawWords,
    mainAnswer: puzzleData.mainAnswer,
    slots: slots
      ? {
          heroIntroSpoilerSafe: asString(slots.heroIntroSpoilerSafe) ?? undefined,
          connectorSummary: asString(slots.connectorSummary) ?? undefined,
          turningPoint: asString(slots.turningPoint) ?? undefined,
          falseStarts: Array.isArray(slots.falseStarts)
            ? slots.falseStarts.filter((item): item is string => typeof item === "string")
            : undefined,
          rejectedGuess: asRecord(slots.rejectedGuess)
            ? {
                guess: asString(asRecord(slots.rejectedGuess)?.guess) ?? "",
                explanation: asString(asRecord(slots.rejectedGuess)?.explanation) ?? "",
              }
            : undefined,
          clueDetails: Array.isArray(slots.clueDetails)
            ? slots.clueDetails.map((item) => {
                const row = asRecord(item);
                return {
                  clue: asString(row?.clue) ?? "",
                  surfaceRead: asString(row?.surfaceRead) ?? "",
                  phrase: asString(row?.phrase) ?? "",
                  whyItWorks: asString(row?.whyItWorks) ?? "",
                  etymology: asString(row?.etymology) ?? undefined,
                };
              })
            : undefined,
          difficultyReason: asString(slots.difficultyReason) ?? undefined,
          portableTakeaway: asString(slots.portableTakeaway) ?? undefined,
        }
      : null,
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
  (Array.isArray(sections.articleBlocks) ? sections.articleBlocks : []).forEach((item, index) => {
    pushLanguageIssue(issues, `sections.articleBlocks[${index}]`, item);
  });

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
  return [
    ...promotePublishBlockingIssues(validateContentContract(toContractInput(puzzleData, ai, locale))),
    ...validateEvidenceContract(toEvidenceContractInput(puzzleData, ai), {
      requireEvidenceFields: true,
    }),
    ...validateSlotContract(toSlotContractInput(puzzleData, ai)),
  ];
}

function buildRepairPrompt(
  puzzleData: PuzzleDataForAI,
  previous: unknown,
  issues: ContentContractIssue[],
) {
  const issueLines = issues.map((issue) => `- ${issue.message}`).join("\n");
  const previousJson = JSON.stringify(previous, null, 2);
  const label = normalizeAnswerLabel(puzzleData.mainAnswer) || "the shared idea";
  const thresholds = getContentContractThresholds(toContractInput(puzzleData, previous));
  const articleBlockRule =
    thresholds.bodyMode === "short"
      ? "5. sections.articleBlocks must contain 4 to 6 short paragraphs that read like a natural quick guide."
      : "5. sections.articleBlocks must contain 8 to 14 short paragraphs that read like a natural article.";
  return `
You are a senior content writer for "Pinpoint Answer Today". Use the V9 Article Slot Template.

The previous JSON failed validation for LinkedIn Pinpoint #${puzzleData.puzzleNumber}.

Fix these issues:
${issueLines}

Hard rules:
1. Output ONLY a valid JSON object.
2. Keep the puzzle data consistent:
   - Clues: ${puzzleData.rawWords.join(", ")}
   - Answer: ${label}
3. overview must be at least ${thresholds.overviewMinWords} words.
4. solutionEmergence must be at least ${thresholds.solutionEmergenceMinWords} words${thresholds.bodyMode === "short" ? "." : " and use first-person voice."}
${articleBlockRule}
6. seoTitle must include all five clues and not the answer.
7. seoDescription must include all five clues.
8. clueDetails must include exactly 5 items.
9. analysis.heroSummary must stay spoiler-safe and must not include the exact answer text.
10. overview must not open with the exact answer text or with "The answer is".
11. analysis.llmTemplateVersion must be "${LLM_TEMPLATE_VERSION}".
12. Include questionType, difficultyBand, solvePath, turningPoint, clueRows, faqItems, and uniquenessSignals.
13. turningPoint.clue must name a real clue, clueRows must stay in clue order, and at least one faqItems entry must be clue-specific with tiedClue.
14. Keep the prose natural and article-like, not robotic or overly analytical.
15. Prefer one believable wrong read, one clear turning clue, and one explicit answer reveal in the body.

Previous JSON:
${previousJson}
`.trim();
}

function autoFixDraft(puzzleData: PuzzleDataForAI, ai: unknown) {
  const next = asRecord(JSON.parse(JSON.stringify(ai ?? {}))) ?? {};
  return buildDeterministicPuzzleContent(
    puzzleData,
    toSlotContractInput(puzzleData, next).slots ?? {},
  );
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
