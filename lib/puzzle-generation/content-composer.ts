import { detectAnswerPattern } from "@/lib/puzzle-generation/answer-pattern";
import { validateParsedResponseShape, validateParsedSlotsContract } from "@/lib/puzzle-generation/ai-response-shape";
import { LLM_TEMPLATE_VERSION } from "@/lib/puzzle-generation/prompt-builder";
import type {
  AIGeneratedContent,
  AIGeneratedSlots,
  ParsedAIResponse,
  PuzzleDataForAI,
} from "@/lib/puzzle-generation/types";
import type {
  PuzzleClueRowRecord,
  PuzzleDifficultyBand,
  PuzzleEvidenceFaqItemRecord,
  PuzzleQuestionType,
  PuzzleSolvePathRecord,
  PuzzleTurningPointRecord,
  PuzzleUniquenessSignalsRecord,
} from "@/lib/puzzles/schema";
import { SLOT_CONTRACT, type PuzzleSlotClueDetail } from "@/lib/puzzles/slot-contract";
import { buildPinpointDescription, buildPinpointTitle } from "@/lib/seo/pinpoint";

type SlotClueDetail = PuzzleSlotClueDetail;

type GeneratedClueDetail = {
  clue: string;
  surfaceRead: string;
  phrase: string;
  whyItWorks: string;
  etymology?: string;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function countWords(value: string | null | undefined): number {
  return normalizeText(value).match(/\S+/g)?.length ?? 0;
}

function ensureSentence(value: string | null | undefined): string {
  const text = normalizeText(value);
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function lowerFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function normalizeGuessLabel(value: string | null | undefined): string {
  const text = stripQuotes(normalizeText(value));
  if (!text) return "";
  if (looksLikeRecognizableTitle(text) || /^[A-Z]{2,}\b/.test(text)) {
    return text;
  }
  return lowerFirst(text);
}

function withIndefiniteArticle(value: string): string {
  const text = stripQuotes(normalizeText(value));
  if (!text) return "";
  if (/^(a|an|the)\b/i.test(text) || looksLikeRecognizableTitle(text)) {
    return text;
  }
  const article = /^[aeiou]/i.test(text) ? "an" : "a";
  return `${article} ${lowerFirst(text)}`;
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = normalizeText(value);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

function formatNaturalList(values: Array<string | null | undefined>, conjunction = "and"): string {
  const cleaned = uniqueNonEmpty(values.map((value) => stripQuotes(normalizeText(value))));
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]} ${conjunction} ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(", ")}, ${conjunction} ${cleaned[cleaned.length - 1]}`;
}

function formatQuotedList(values: Array<string | null | undefined>, conjunction = "and"): string {
  const cleaned = uniqueNonEmpty(values.map((value) => stripQuotes(normalizeText(value))));
  return formatNaturalList(cleaned.map((value) => `"${value}"`), conjunction);
}

function buildConnectorSummaryFromAnswer(answer: string): string {
  const pattern = detectAnswerPattern(answer);
  if (pattern.kind === "before" || pattern.kind === "after") {
    return "a repeated-word phrase pattern with one missing term";
  }
  if (pattern.kind === "typed-category") {
    return `a category board focused on ${pattern.noun.toLowerCase()}`;
  }
  return "a shared category board with one concrete theme";
}

function buildFallbackPhrase(clue: string, answer: string): string {
  const pattern = detectAnswerPattern(answer);
  if (pattern.kind === "before") return `${clue} ${pattern.token}`.trim();
  if (pattern.kind === "after") return `${pattern.token} ${clue}`.trim();
  if (pattern.kind === "typed-category") {
    const baseClue = clue.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
    const normalizedBase = baseClue || clue;
    const noun = pattern.singularNoun;
    const looseBase = normalizeLooseMatch(normalizedBase);
    const looseNoun = normalizeLooseMatch(noun);
    if (looseBase.includes(looseNoun)) return normalizedBase;
    return `${normalizedBase} ${noun}`.trim();
  }
  return clue;
}

function stripQuotes(value: string): string {
  return value.replace(/["“”]/g, "");
}

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[.!?]+$/, "").trim();
}

function singularizeToken(value: string): string {
  const normalized = normalizeText(value);
  if (!normalized) return normalized;
  if (/ies$/i.test(normalized)) return `${normalized.slice(0, -3)}y`;
  if (/(ches|shes|xes|zes)$/i.test(normalized)) return normalized.slice(0, -2);
  if (/s$/i.test(normalized) && !/ss$/i.test(normalized)) return normalized.slice(0, -1);
  return normalized;
}

function normalizeLooseMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/["“”'’()\-_,!?:.;/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasVisualCue(value: string): boolean {
  return /[^\p{L}\p{N}\s()'"&,-]/u.test(value);
}

function looksLikeRecognizableTitle(clue: string): boolean {
  const text = normalizeText(clue);
  if (!text) return false;
  if (/['’]/.test(text) || /^The\s+/i.test(text)) return true;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const alphaWords = words.filter((word) => /[A-Za-z]/.test(word));
  if (alphaWords.length === 0) return false;
  return alphaWords.every((word) => /^[A-Z(]/.test(word));
}

function sharesMeaningfulClueWord(phrase: string, clue: string): boolean {
  const phraseText = normalizeLooseMatch(phrase);
  if (!phraseText) return false;
  return extractMeaningfulClueWords(clue).some((word) => phraseText.includes(word));
}

function extractCategoryStem(answer: string): string {
  const pattern = detectAnswerPattern(answer);
  if (pattern.kind === "typed-category") {
    return pattern.noun.toLowerCase();
  }
  if (pattern.kind !== "category") return "";
  const cleaned = stripQuotes(normalizeText(answer)).replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (!cleaned) return "";
  const beforeSlash = cleaned.split("/")[0]?.trim() || cleaned;
  const words = beforeSlash.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const lastWord = words[words.length - 1] || "";
  const lower = lastWord.toLowerCase();
  return lower.length > 2 ? singularizeToken(lower) : "";
}

function extractCategoryDisplayLabel(answer: string): string {
  const pattern = detectAnswerPattern(answer);
  if (pattern.kind === "typed-category") {
    return pattern.noun.toLowerCase();
  }
  if (pattern.kind !== "category") return "";
  const cleaned = stripQuotes(normalizeText(answer)).replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (!cleaned) return "";
  const beforeSlash = cleaned.split("/")[0]?.trim() || cleaned;
  return beforeSlash.toLowerCase();
}

function buildReadableCategoryPhrase(clue: string, answer: string): string {
  const pattern = detectAnswerPattern(answer);
  const normalizedClue = normalizeText(clue);
  if (!normalizedClue) return normalizedClue;
  if (pattern.kind === "category") {
    return normalizedClue;
  }
  const categoryStem = extractCategoryStem(answer);
  if (countWords(normalizedClue) === 1 && categoryStem) {
    const looseClue = normalizeLooseMatch(normalizedClue);
    if (!looseClue.includes(categoryStem)) {
      return `${normalizedClue} ${categoryStem}`.trim();
    }
  }
  return normalizedClue;
}

function simplifyRecognizableTitlePhrase(rawPhrase: string, clue: string, answer: string): string {
  const normalizedPhrase = normalizeText(rawPhrase);
  const normalizedClue = normalizeText(clue);
  if (!normalizedPhrase || !normalizedClue) return normalizedPhrase;
  if (!looksLikeRecognizableTitle(normalizedClue) || countWords(normalizedClue) < 2) {
    return normalizedPhrase;
  }

  const displayLabel = extractCategoryDisplayLabel(answer);
  const singularLabel = singularizeToken(displayLabel);
  const loosePhrase = normalizeLooseMatch(normalizedPhrase);
  const looseClue = normalizeLooseMatch(normalizedClue);
  const suffixes = [displayLabel, singularLabel]
    .map((item) => normalizeLooseMatch(item))
    .filter((item) => item.length > 0);

  if (!loosePhrase.startsWith(looseClue)) return normalizedPhrase;

  for (const suffix of suffixes) {
    if (loosePhrase === `${looseClue} ${suffix}` || loosePhrase === `${looseClue} ${suffix}s`) {
      return normalizedClue;
    }
  }

  return normalizedPhrase;
}

function looksSuspiciousConnectorSummary(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return true;
  return (
    /[()/]/.test(normalized) ||
    normalized.length > 70 ||
    /\b(common household item|everyday item that comes|comes in different varieties|comes in different forms)\b/i.test(normalized) ||
    /\b(you|your|youre|you're|thinking|guess|joke|actually|really|clearly|obviously|instead|rather than|but not)\b/i.test(
      normalized,
    ) ||
    /\b(descriptor|descriptors|label|labels|term|terms|clue|clues|word|words|adjective|adjectives)\b/i.test(
      normalized,
    ) ||
    /\b(illuminating|common thread|diverse items|diverse|thread between|thread across)\b/i.test(normalized) ||
    /[,;:]/.test(normalized) ||
    /\bnot the\b/i.test(normalized)
  );
}

function connectorSummaryLeaksAnswer(summary: string, answer: string): boolean {
  const normalizedSummary = normalizeLooseMatch(summary);
  if (!normalizedSummary) return true;

  const normalizedAnswer = normalizeLooseMatch(stripQuotes(answer));
  if (normalizedAnswer && normalizedSummary.includes(normalizedAnswer)) {
    return true;
  }

  const pattern = detectAnswerPattern(answer);
  if (pattern.kind === "before" || pattern.kind === "after") {
    return buildTokenVariants(pattern.token).some((variant) => normalizedSummary.includes(variant));
  }

  if (pattern.kind === "typed-category") {
    const normalizedNoun = normalizeLooseMatch(pattern.noun);
    const normalizedSingularNoun = normalizeLooseMatch(pattern.singularNoun);
    return (
      (normalizedNoun.length > 0 && normalizedSummary.includes(normalizedNoun)) ||
      (normalizedSingularNoun.length > 0 && normalizedSummary.includes(normalizedSingularNoun))
    );
  }

  return false;
}

function isUsableConnectorSummary(value: string | null | undefined, answer: string): value is string {
  const text = trimTrailingPunctuation(normalizeText(value));
  if (!text) return false;
  const words = countWords(text);
  if (words < SLOT_CONTRACT.connectorSummaryMinWords || words > SLOT_CONTRACT.connectorSummaryMaxWords) {
    return false;
  }
  const pattern = detectAnswerPattern(answer);
  if (pattern.kind === "typed-category") {
    const normalizedText = normalizeLooseMatch(text);
    const noun = normalizeLooseMatch(pattern.noun);
    const singularNoun = normalizeLooseMatch(pattern.singularNoun);
    if (!normalizedText.includes(noun) && !normalizedText.includes(singularNoun)) {
      return false;
    }
  }
  if (looksSuspiciousConnectorSummary(text)) return false;
  if (connectorSummaryLeaksAnswer(text, answer)) return false;
  return true;
}

function buildCategoryReading(answer: string): string {
  const pattern = detectAnswerPattern(answer);
  if (pattern.kind === "typed-category") {
    return `reading them as ${pattern.noun.toLowerCase()}`;
  }
  return "reading them through one specific category frame";
}

function buildCategoryFocusQuestion(answer: string): string {
  const pattern = detectAnswerPattern(answer);
  if (pattern.kind === "typed-category") {
    return `asked what kind of ${pattern.singularNoun.toLowerCase()} each clue could describe`;
  }
  return "asked what kind of thing each clue could really be describing";
}

function buildCategoryConnectionAnswer(answer: string, clueCount: number): string {
  const pattern = detectAnswerPattern(answer);
  const cluePhrase = `all ${clueCount} clues`;
  if (pattern.kind === "typed-category") {
    return `The connection is that ${cluePhrase} point to recognizable types of ${pattern.noun.toLowerCase()}.`;
  }
  return `The connection is that ${cluePhrase} point back to one specific category instead of a loose umbrella theme.`;
}

function buildTokenVariants(token: string): string[] {
  const normalized = normalizeLooseMatch(token);
  const variants = new Set<string>();
  if (!normalized) return [];
  variants.add(normalized);

  const irregularSingulars: Record<string, string> = {
    mice: "mouse",
    geese: "goose",
    teeth: "tooth",
    feet: "foot",
    men: "man",
    women: "woman",
  };

  if (irregularSingulars[normalized]) {
    variants.add(irregularSingulars[normalized]);
  }

  if (/ies$/i.test(normalized)) {
    variants.add(`${normalized.slice(0, -3)}y`);
  } else if (/(ches|shes|xes|zes)$/i.test(normalized)) {
    variants.add(normalized.slice(0, -2));
  } else if (/s$/i.test(normalized) && !/ss$/i.test(normalized)) {
    variants.add(normalized.slice(0, -1));
  } else {
    variants.add(`${normalized}s`);
  }

  return [...variants].filter(Boolean);
}

function extractMeaningfulClueWords(clue: string): string[] {
  return normalizeLooseMatch(clue)
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length >= 3 && !["and", "the", "for", "with"].includes(part));
}

function buildSpecialPhraseFromClue(clue: string, answer: string): string {
  const pattern = detectAnswerPattern(answer);
  if (pattern.kind !== "before" && pattern.kind !== "after") return "";

  const token = pattern.token;
  const original = normalizeText(clue);
  let candidate = original;
  const symbolGroupPattern = /\(\s*[^\p{L}\p{N}]+\s*\)|[^\p{L}\p{N}\s()'"&,-]+/gu;

  const replaced = candidate.replace(symbolGroupPattern, ` ${token} `).replace(/\s+/g, " ").trim();
  if (replaced === original) {
    return "";
  }

  candidate = replaced;
  candidate = candidate.replace(/\(\s*\)/g, "").replace(/\s+/g, " ").trim();
  return stripQuotes(candidate);
}

function isPhraseCandidateValid(candidate: string, clue: string, answer: string): boolean {
  const pattern = detectAnswerPattern(answer);
  if (pattern.kind !== "before" && pattern.kind !== "after") {
    return Boolean(normalizeText(candidate));
  }

  const normalizedCandidate = normalizeLooseMatch(candidate);
  if (!normalizedCandidate) return false;

  const tokenVariants = buildTokenVariants(pattern.token);
  const clueWords = extractMeaningfulClueWords(clue);
  const hasClueContext = clueWords.length === 0 || clueWords.some((word) => normalizedCandidate.includes(word));

  const boundaryMatch =
    pattern.kind === "before"
      ? tokenVariants.some(
          (variant) =>
            normalizedCandidate.endsWith(` ${variant}`) ||
            normalizedCandidate === variant ||
            normalizedCandidate.endsWith(variant),
        )
      : tokenVariants.some(
          (variant) =>
            normalizedCandidate.startsWith(`${variant} `) ||
            normalizedCandidate === variant ||
            normalizedCandidate.startsWith(variant),
        );

  if (!boundaryMatch) return false;
  if (clueWords.length > 0 && !hasClueContext) return false;
  return true;
}

function countMentionedClues(text: string, clues: string[]): number {
  const normalizedText = normalizeLooseMatch(text);
  return clues.filter((clue) => {
    const normalizedClue = normalizeLooseMatch(clue);
    return Boolean(normalizedClue && normalizedText.includes(normalizedClue));
  }).length;
}

function buildTurningPointLabel(rawTurningPoint: string | null | undefined, clues: string[]): string {
  const normalized = normalizeText(rawTurningPoint);
  const looseTurningPoint = normalizeLooseMatch(normalized);
  for (const clue of clues) {
    if (!clue) continue;
    const looseClue = normalizeLooseMatch(clue);
    if (looseClue && looseTurningPoint.includes(looseClue)) {
      return `"${clue}"`;
    }
  }

  const visualClue = clues.find((clue) => hasVisualCue(clue));
  if (visualClue && looseTurningPoint) {
    const clueWords = extractMeaningfulClueWords(visualClue);
    if (
      clueWords.some((word) => looseTurningPoint.includes(word)) ||
      looseTurningPoint.includes("emoji") ||
      looseTurningPoint.includes("icon") ||
      looseTurningPoint.includes("symbol")
    ) {
      return `"${visualClue}"`;
    }
  }

  return "a later clue";
}

function turningPointMentionsClue(rawTurningPoint: string | null | undefined, clue: string): boolean {
  const looseTurningPoint = normalizeLooseMatch(normalizeText(rawTurningPoint));
  const looseClue = normalizeLooseMatch(clue);
  return Boolean(looseTurningPoint && looseClue && looseTurningPoint.includes(looseClue));
}

function scoreTurningPointCandidate(
  clue: string,
  index: number,
  detail: { surfaceRead: string; phrase: string; whyItWorks: string },
  rawTurningPoint: string | null | undefined,
  answer: string,
): number {
  const pattern = detectAnswerPattern(answer);
  const combined = normalizeLooseMatch(
    [detail.surfaceRead, detail.phrase, detail.whyItWorks].filter(Boolean).join(" "),
  );
  let score = 0;

  if (turningPointMentionsClue(rawTurningPoint, clue)) {
    score += 6;
  }

  if (index === 2) score += 3;
  else if (index === 1 || index === 3) score += 2;
  else score += 1;

  if (hasVisualCue(clue) || /[()]/.test(clue)) {
    score -= 3;
  }

  if (pattern.kind === "typed-category" || pattern.kind === "category") {
    if (
      /\b(gesture|devotion|devotional|ritual|spiritual|religious|symbol|concept|abstract|celebration|self care|self-care|wellness)\b/.test(
        combined,
      )
    ) {
      score += 4;
    }

    if (
      /\b(type|kind|specific|used in|placed on|classified|classification|small and often|cake|ceremony)\b/.test(
        combined,
      )
    ) {
      score += 2;
    }

    if (
      /\b(scent|smell|fragrance|aroma|odor|relax|relaxation|outdoor|decorative|decoration|gift|gifts|oil|insect|repel)\b/.test(
        combined,
      )
    ) {
      score -= 3;
    }
  }

  return score;
}

function refineTurningPointLabel(
  rawTurningPoint: string | null | undefined,
  currentLabel: string,
  clues: string[],
  clueDetails: Array<{ clue: string; surfaceRead: string; phrase: string; whyItWorks: string }>,
  answer: string,
): string {
  const pattern = detectAnswerPattern(answer);
  if (pattern.kind === "before" || pattern.kind === "after") {
    return currentLabel;
  }

  const byClue = new Map(clueDetails.map((detail) => [detail.clue, detail]));
  let bestClue = "";
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const [index, clue] of clues.entries()) {
    const detail = byClue.get(clue);
    if (!detail) continue;
    const score = scoreTurningPointCandidate(clue, index, detail, rawTurningPoint, answer);
    if (score > bestScore) {
      bestScore = score;
      bestClue = clue;
    }
  }

  if (!bestClue) {
    return currentLabel;
  }

  if (bestScore < 3 && !hasSpecificTurningPointLabel(currentLabel)) {
    return currentLabel;
  }

  return `"${bestClue}"`;
}

function hasSpecificTurningPointLabel(label: string): boolean {
  const normalized = normalizeText(stripQuotes(label));
  return Boolean(normalized && normalizeLooseMatch(normalized) !== "a later clue");
}

function turningPointSubject(label: string): string {
  return hasSpecificTurningPointLabel(label) ? stripQuotes(label) : "A later clue";
}

function turningPointReference(label: string): string {
  return hasSpecificTurningPointLabel(label) ? lowerFirst(stripQuotes(label)) : "a later clue";
}

function looksSuspiciousTurningPointText(value: string | null | undefined): boolean {
  const normalized = normalizeText(value);
  if (!normalized) return true;
  return /\b(pattern click|makes the pattern click|locked in the pattern|form factor|alongside the others|repeating form factor|click into place|connection click)\b/i.test(
    normalized,
  );
}

function buildTurningPointFallbackSentence(label: string, answer: string): string {
  const pattern = detectAnswerPattern(answer);
  if (!hasSpecificTurningPointLabel(label)) {
    return pattern.kind === "before" || pattern.kind === "after"
      ? "A later clue is what finally made the missing word visible."
      : "A later clue is what finally made the answer feel concrete.";
  }

  const subject = turningPointSubject(label);
  return pattern.kind === "before" || pattern.kind === "after"
    ? `${subject} is the clue that finally made the missing word visible.`
    : `${subject} is the clue that finally made the answer feel concrete.`;
}

function normalizeConnectorSummary(value: string | null | undefined, answer: string): string {
  if (isUsableConnectorSummary(value, answer)) {
    return trimTrailingPunctuation(normalizeText(value));
  }
  return buildConnectorSummaryFromAnswer(answer);
}

function normalizePhraseDisplay(phrase: string, answer: string): string {
  const cleaned = stripQuotes(normalizeText(phrase));
  const pattern = detectAnswerPattern(answer);
  if (!cleaned) return cleaned;

  if (pattern.kind === "after") {
    const token = pattern.token.toLowerCase();
    const loosePhrase = normalizeLooseMatch(cleaned);
    if (loosePhrase.startsWith(token)) {
      const parts = cleaned.split(/\s+/);
      if (parts.length >= 2) {
        const rest = parts.slice(1).join(" ").toLowerCase();
        return `${token.charAt(0).toUpperCase()}${token.slice(1)} ${rest}`.trim();
      }
    }
  }

  if (pattern.kind === "before") {
    const token = pattern.token.toLowerCase();
    const parts = cleaned.split(/\s+/);
    if (parts.length >= 2 && parts[parts.length - 1].toLowerCase() === token) {
      return `${parts.slice(0, -1).join(" ")} ${token}`.trim();
    }
  }

  if (pattern.kind === "typed-category") {
    const noun = pattern.singularNoun;
    const loosePhrase = normalizeLooseMatch(cleaned);
    const looseNoun = normalizeLooseMatch(noun);
    if (!loosePhrase.includes(looseNoun)) {
      return "";
    }
  }

  return cleaned;
}

function sharesLooseRoot(a: string, b: string): boolean {
  const left = normalizeLooseMatch(a);
  const right = normalizeLooseMatch(b);
  if (left.length < 5 || right.length < 5) return false;
  return left.slice(0, 5) === right.slice(0, 5);
}

function sanitizeFalseStarts(
  values: string[],
  clues: string[],
  clueDetails: Array<{ surfaceRead: string; phrase: string }>,
  answer: string,
): string[] {
  const candidates = uniqueNonEmpty(values);
  const answerPattern = detectAnswerPattern(answer);
  return candidates.filter((candidate) => {
    const normalizedCandidate = normalizeLooseMatch(candidate);
    if (!normalizedCandidate) return false;
    if (countWords(candidate) <= 1 && normalizedCandidate.length < 6) return false;
    if (/[()/]/.test(candidate) || countWords(candidate) > 3) return false;
    if (/^(brands?|types?|kinds?) of\b/i.test(normalizeText(candidate))) return false;
    if (
      /\b(products?|items?|things?|categories?)\s+for\b/i.test(normalizeText(candidate)) ||
      /\bfor\s+(adults?|kids?|children|men|women|people|beginners|gift giving|gift-giving)\b/i.test(
        normalizeText(candidate),
      ) ||
      /\bretail\b|\becommerce\b|\be-commerce\b/i.test(normalizeText(candidate))
    ) {
      return false;
    }

    if (answerPattern.kind === "category" || answerPattern.kind === "typed-category") {
      const words = normalizeText(candidate).split(/\s+/).filter(Boolean);
      const titleCaseWords = words.filter((word) => /[A-Za-z]/.test(word));
      if (titleCaseWords.length >= 2 && titleCaseWords.every((word) => /^[A-Z]/.test(word))) {
        return false;
      }
    }

    for (const clue of clues) {
      const normalizedClue = normalizeLooseMatch(clue);
      if (!normalizedClue) continue;
      if (normalizedCandidate === normalizedClue || sharesLooseRoot(candidate, clue)) {
        return false;
      }
    }

    for (const detail of clueDetails) {
      if (
        sharesLooseRoot(candidate, detail.surfaceRead) ||
        sharesLooseRoot(candidate, detail.phrase) ||
        normalizedCandidate === normalizeLooseMatch(detail.surfaceRead)
      ) {
        return false;
      }
    }

    return true;
  }).map((candidate) => normalizeGuessLabel(candidate)).filter(Boolean).slice(0, 2);
}

function looksMachineyWrongGuess(value: string | null | undefined): boolean {
  const normalized = normalizeText(value);
  if (!normalized) return true;
  return (
    /^(brands?|types?|kinds?) of\b/i.test(normalized) ||
    /^ways to\b/i.test(normalized) ||
    /\b(items?|things?|objects?|stuff)\b/i.test(normalized) ||
    /\b(products?|items?|things?|categories?)\s+for\b/i.test(normalized) ||
    /\bfor\s+(adults?|kids?|children|men|women|people|beginners)\b/i.test(normalized) ||
    /\bgift (ideas?|items?)\b/i.test(normalized) ||
    /\bvehicle brands?\b/i.test(normalized) ||
    /\bbrands? of vehicles?\b/i.test(normalized) ||
    /\bwarning words?\b/i.test(normalized) ||
    /\bmixed signals?\b/i.test(normalized) ||
    /\bgeneral clues?\b/i.test(normalized)
  );
}

function inferBroadFallbackGuesses(clues: string[]): string[] {
  const clueText = clues.map((clue) => normalizeLooseMatch(clue)).join(" ");
  const guesses: string[] = [];

  if (/\b(gamma|cosmic|electric|optical|atomic|laser|radio|phone|camera|cellular)\b/.test(clueText)) {
    guesses.push("science terms");
  }
  if (/\b(sting|manta|dog|cat|mouse|orca|panda|bird|snake|fish)\b/.test(clueText)) {
    guesses.push("animal names");
  }
  if (/\b(island|bridge|square|park|bay|city|mountain)\b/.test(clueText)) {
    guesses.push("place names");
  }
  if (clues.some((clue) => looksLikeRecognizableTitle(clue))) {
    guesses.push("famous names");
  }

  return uniqueNonEmpty(guesses).slice(0, 2);
}

function buildTypedCategoryFallbackGuesses(answer: string, clues: string[]): string[] {
  const pattern = detectAnswerPattern(answer);
  if (pattern.kind !== "typed-category") return [];

  const noun = pattern.singularNoun.toLowerCase();
  const nounSpecificGuesses: Record<string, string[]> = {
    candle: ["home fragrance", "wellness products"],
    bike: ["outdoor gear", "vehicle brands"],
    bicycle: ["outdoor gear", "vehicle brands"],
    magazine: ["newspapers", "media brands"],
    rose: ["flowers", "gardening terms"],
    ray: ["science terms", "animal names"],
    doll: ["collectibles", "toy brands"],
  };

  const mapped = nounSpecificGuesses[noun];
  if (mapped?.length) {
    return mapped;
  }

  const inferred = inferBroadFallbackGuesses(clues);
  if (inferred.length > 0) {
    return inferred;
  }

  return ["home products", "general consumer goods"];
}

function buildFallbackFalseStarts(answer: string, clues: string[]): string[] {
  const pattern = detectAnswerPattern(answer);
  if (pattern.kind === "before" || pattern.kind === "after") {
    const inferred = inferBroadFallbackGuesses(clues);
    if (inferred.length > 0) return inferred;
    return ["science terms", "animal names"];
  }
  if (pattern.kind === "typed-category") {
    return buildTypedCategoryFallbackGuesses(answer, clues);
  }
  const inferred = inferBroadFallbackGuesses(clues);
  if (inferred.length > 0) return inferred;
  return ["brand names", "place names"];
}

function normalizeSlotClueDetails(
  rawDetails: Array<Partial<SlotClueDetail> | null | undefined> | undefined,
  clues: string[],
  answer: string,
  turningPointLabel: string,
  connectorSummary: string,
) {
  const byClue = new Map<string, Partial<SlotClueDetail>>();
  for (const item of rawDetails ?? []) {
    const clue = normalizeText(item?.clue);
    if (!clue) continue;
    byClue.set(clue.toLowerCase(), item ?? {});
  }

  return clues.map((clue) => {
    const answerPattern = detectAnswerPattern(answer);
    const source = byClue.get(normalizeText(clue).toLowerCase()) ?? {};
    const rawPhrase = normalizeText(source.phrase);
    const titleSafeRawPhrase = simplifyRecognizableTitlePhrase(rawPhrase, clue, answer);
    const normalizedRawPhrase = normalizePhraseDisplay(titleSafeRawPhrase, answer);
    const specialPhrase = buildSpecialPhraseFromClue(clue, answer);
    const fallbackPhrase = buildFallbackPhrase(clue, answer);
    const categoryPhrase =
      answerPattern.kind === "category" &&
      rawPhrase &&
      looksLikeRecognizableTitle(clue) &&
      !sharesMeaningfulClueWord(rawPhrase, clue)
        ? buildReadableCategoryPhrase(clue, answer)
        : "";
    const phraseCandidate =
      categoryPhrase ||
      (isPhraseCandidateValid(normalizedRawPhrase, clue, answer) && normalizedRawPhrase) ||
      (isPhraseCandidateValid(specialPhrase, clue, answer) && normalizePhraseDisplay(specialPhrase, answer)) ||
      fallbackPhrase;
    const phrase = normalizePhraseDisplay(phraseCandidate, answer) || fallbackPhrase;
    const surfaceRead = normalizeText(source.surfaceRead) || `a broader or more distracting read of ${clue}`;
    const turningPointTail = hasSpecificTurningPointLabel(turningPointLabel)
      ? `especially after ${turningPointReference(turningPointLabel)}`
      : "especially after a later clue sharpens the solve";
    const whyItWorks =
      normalizeText(source.whyItWorks) ||
      `${stripQuotes(phrase)} fits once the board is read through ${lowerFirst(connectorSummary)}, ${turningPointTail}.`;

    return {
      clue,
      surfaceRead,
      phrase,
      whyItWorks: ensureSentence(whyItWorks),
      etymology: normalizeText(source.etymology) || undefined,
    };
  });
}

function buildHeroSummary(
  slots: Partial<AIGeneratedSlots>,
  puzzleData: PuzzleDataForAI,
): string {
  const hero = normalizeText(slots.heroIntroSpoilerSafe);
  if (countWords(hero) >= 20 && countMentionedClues(hero, puzzleData.rawWords) >= 2) {
    return ensureSentence(hero);
  }
  const answerPattern = detectAnswerPattern(puzzleData.mainAnswer);
  const cluePreview = puzzleData.rawWords.slice(0, 3).join(", ");
  const frameLabel =
    answerPattern.kind === "before" || answerPattern.kind === "after"
      ? "shared phrase logic"
      : "shared category";
  return ensureSentence(
    `At first glance, ${cluePreview} do not look like one clean set. The solve only tightens once a later clue makes the ${frameLabel} much harder to miss.`,
  );
}

function buildOpeningBoardRead(clues: string[], answer: string): string {
  const preview = formatQuotedList(clues.slice(0, 3));
  const answerPattern = detectAnswerPattern(answer);
  if (answerPattern.kind === "before" || answerPattern.kind === "after") {
    return ensureSentence(
      `${preview} do not immediately line up around one missing word, so the solve starts out looser than it really is.`,
    );
  }
  return ensureSentence(
    `${preview} do not immediately look like the same kind of thing, so the first read can wander in the wrong direction.`,
  );
}

function buildFalseStartLead(falseStarts: string[], answer: string): string {
  const answerPattern = detectAnswerPattern(answer);
  const firstGuess = falseStarts[0];
  if (!firstGuess) {
    return answerPattern.kind === "before" || answerPattern.kind === "after"
      ? "That is why a few loose phrase guesses can hang around before the missing word shows itself."
      : "That is why a broad early guess can feel reasonable before one clue forces a more concrete read.";
  }
  return answerPattern.kind === "before" || answerPattern.kind === "after"
    ? `That is why a first read like "${firstGuess}" can feel plausible before the missing word finally shows itself.`
    : `That is why a first read like "${firstGuess}" can feel plausible before one clue makes the answer feel concrete.`;
}

function buildRepresentativeReadings(
  clueDetails: ReturnType<typeof normalizeSlotClueDetails>,
  answer: string,
  limit = 3,
): string[] {
  const answerPattern = detectAnswerPattern(answer);
  return uniqueNonEmpty(
    clueDetails.slice(0, limit).map((detail) =>
      answerPattern.kind === "before" || answerPattern.kind === "after"
        ? stripQuotes(detail.phrase)
        : stripQuotes(detail.clue),
    ),
  );
}

function buildOverviewResolution(
  connectorSummary: string,
  clueDetails: ReturnType<typeof normalizeSlotClueDetails>,
  answer: string,
): string {
  const answerPattern = detectAnswerPattern(answer);
  const sampleEntries = formatNaturalList(buildRepresentativeReadings(clueDetails, answer));
  if (answerPattern.kind === "before" || answerPattern.kind === "after") {
    return ensureSentence(
      `From there, ${connectorSummary} explains the board cleanly. Readings like ${sampleEntries} stop feeling loose and start sounding exact.`,
    );
  }
  return ensureSentence(
    `From there, ${buildCategoryReading(answer)} explains the board much more cleanly. Entries like ${sampleEntries} stop feeling disconnected and start looking like they belong together.`,
  );
}

function buildAnswerFocusLabel(answer: string): string {
  const pattern = detectAnswerPattern(answer);
  if (pattern.kind === "typed-category") {
    return pattern.noun.toLowerCase();
  }
  return "the real category";
}

function buildResolvedReadingSentence(
  detail: ReturnType<typeof normalizeSlotClueDetails>[number] | undefined,
): string {
  if (!detail) return "";
  const clue = stripQuotes(normalizeText(detail.clue));
  const rawPhrase = stripQuotes(normalizeText(detail.phrase));
  const phrase = looksLikeRecognizableTitle(rawPhrase) ? rawPhrase : lowerFirst(rawPhrase);
  if (!clue || !phrase) return "";
  if (normalizeLooseMatch(clue) === normalizeLooseMatch(phrase)) {
    return ensureSentence(`${clue} fit once I read it through the answer`);
  }
  return ensureSentence(`${clue} made sense as ${withIndefiniteArticle(phrase)}`);
}

function buildDifficultyCloser(answer: string, difficultyReason: string): string {
  const normalizedReason = ensureSentence(difficultyReason);
  if (normalizedReason) return normalizedReason;
  const answerPattern = detectAnswerPattern(answer);
  return answerPattern.kind === "before" || answerPattern.kind === "after"
    ? "The puzzle feels harder than it is because the opening clues stay broad until one clue makes the missing word obvious."
    : "The puzzle feels harder than it is because the clues do not all look like the same kind of thing until the right read appears.";
}

function splitParagraphSentences(paragraph: string): string[] {
  const matches = paragraph.match(/[^.!?]+(?:[.!?]+["')\]]*)?(?=\s+|$)/g);
  return (matches ?? [paragraph]).map((sentence) => sentence.trim()).filter(Boolean);
}

function looksSuspiciousArticleParagraph(paragraph: string, answer: string): boolean {
  const normalized = normalizeText(paragraph).toLowerCase();
  if (!normalized) return true;

  const strongBeat = /^(wrong|wrong again|correct)\.?$/i;
  if (strongBeat.test(normalized)) {
    return false;
  }

  if (countWords(paragraph) <= 3) {
    return true;
  }

  const answerPattern = detectAnswerPattern(answer);
  const genericCategory = answerPattern.kind === "category" || answerPattern.kind === "typed-category";
  const suspiciousPatterns = [
    /\bmaybe even\b/i,
    /\beveryone knows\b/i,
    /\bnow i see the light\b/i,
    /\bgame over\b/i,
    /\bof course\b/i,
    /\bnatural remedies\b/i,
    /\bluxury goods\b/i,
    /\bspa gift set\b/i,
    /\bspa day\b/i,
    /\broom fresheners?\b/i,
    /\bair fresheners?\b/i,
    /\broom decorations?\b/i,
    /\bsome kind of\b/i,
    /\breligious or ceremonial\b/i,
    /\bdifferent kinds? of flames\b/i,
    /\btheme that could tie everything together\b/i,
    /\bfelt like a mix\b/i,
    /\bpointed toward celebrations\b/i,
    /\bthe board started to shift\b/i,
    /\bthe board pivoted\b/i,
    /\bmade the answer feel concrete\b/i,
    /\bthe answer became clear\b/i,
    /\bmakes sense of the whole board\b/i,
    /\bobvious confirmations?\b/i,
    /\bloose associations?\b/i,
    /\bconcrete members? of the same answer\b/i,
    /\beach clue names a common kind of\b/i,
    /\beach clue represents a specific type\b/i,
    /\beach clue corresponds to a specific kind\b/i,
    /\bshould have been my clue\b/i,
    /\bboard makes perfect sense\b/i,
    /\bcore object\b/i,
    /\bwhat'?s on the market\b/i,
    /\bbroader product category\b/i,
    /\bchanged the solve\b/i,
  ];

  if (suspiciousPatterns.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  if (
    genericCategory &&
    (/\bfeels broader than it really is\b/i.test(normalized) ||
      /\bthe whole board feels clean\b/i.test(normalized))
  ) {
    return true;
  }

  return false;
}

function articleBlocksNeedFallback(paragraphs: string[], answer: string): boolean {
  if (paragraphs.length < 6) {
    return true;
  }

  let suspiciousCount = 0;
  let weakGuessCount = 0;
  let weakTransitionCount = 0;
  let reportToneCount = 0;
  let semanticDriftCount = 0;

  for (const paragraph of paragraphs) {
    const normalized = normalizeText(paragraph).toLowerCase();
    if (!normalized) continue;

    if (looksSuspiciousArticleParagraph(paragraph, answer)) {
      suspiciousCount += 1;
    }

    if (
      /\b(luxury goods|spa gift set|gift idea|gift ideas|party supplies|some kind of|room fresheners?|air fresheners?)\b/i.test(
        normalized,
      )
    ) {
      weakGuessCount += 1;
    }

    if (/\b(board pivoted|board started to shift|changed the solve)\b/i.test(normalized)) {
      weakTransitionCount += 1;
    }

    if (
      /\b(different kinds? of flames|religious or ceremonial|core object)\b/i.test(normalized)
    ) {
      semanticDriftCount += 1;
    }

    if (
      /\beach clue names\b/i.test(normalized) ||
      /\beach clue represents a specific type\b/i.test(normalized) ||
      /\bboard makes perfect sense\b/i.test(normalized) ||
      /\bin hindsight\b.*\bshould have been my clue\b/i.test(normalized) ||
      /\bthe trick was seeing past\b/i.test(normalized)
    ) {
      reportToneCount += 1;
    }
  }

  return (
    suspiciousCount >= 2 ||
    weakGuessCount >= 1 ||
    weakTransitionCount >= 1 ||
    reportToneCount >= 1 ||
    semanticDriftCount >= 1
  );
}

function normalizeArticleBlocks(
  providedBlocks: string[] | undefined,
  answer: string,
): string[] {
  const normalized = (providedBlocks ?? [])
    .flatMap((block) => String(block || "").split(/\n{2,}/))
    .map((block) => normalizeText(block))
    .filter(Boolean);

  if (normalized.length === 0) {
    return [];
  }

  const shortened = normalized.flatMap((block) => {
    const sentences = splitParagraphSentences(block);
    if (sentences.length <= 2) {
      return [ensureSentence(block)];
    }
    return sentences
      .reduce<string[]>((acc, sentence, index) => {
        if (index % 2 === 0) {
          acc.push(sentence);
        } else {
          acc[acc.length - 1] = `${acc[acc.length - 1]} ${sentence}`.trim();
        }
        return acc;
      }, [])
      .map((paragraph) => ensureSentence(paragraph))
      .filter(Boolean);
  });

  if (articleBlocksNeedFallback(shortened, answer)) {
    return [];
  }

  const filtered = shortened.filter((paragraph) => !looksSuspiciousArticleParagraph(paragraph, answer));
  if (filtered.length < 6) {
    return [];
  }

  const trimmed = filtered.slice(0, 14);
  const answerMentioned = trimmed.some((paragraph) => {
    const normalizedParagraph = paragraph.toLowerCase();
    const normalizedAnswer = answer.trim().toLowerCase();
    return (
      normalizedParagraph.includes(normalizedAnswer) ||
      normalizedParagraph.includes("the answer is") ||
      normalizedParagraph.includes("the answer was")
    );
  });

  if (!answerMentioned) {
    trimmed.push(`The answer was ${answer}.`);
  }

  return trimmed;
}

function buildArticleBlocks(
  clues: string[],
  falseStarts: string[],
  rejectedGuess: { guess: string; explanation: string } | undefined,
  turningPointLabel: string,
  clueDetails: ReturnType<typeof normalizeSlotClueDetails>,
  answer: string,
  providedBlocks?: string[],
): string[] {
  const normalizedProvided = normalizeArticleBlocks(providedBlocks, answer);
  if (normalizedProvided.length >= 6) {
    return normalizedProvided;
  }

  const answerPattern = detectAnswerPattern(answer);
  const categoryComparison =
    answerPattern.kind === "typed-category"
      ? answerPattern.noun.toLowerCase()
      : answerPattern.kind === "before" || answerPattern.kind === "after"
        ? "one repeated-word pattern"
        : "the final answer";
  const answerFocus = buildAnswerFocusLabel(answer);
  const firstGuess =
    rejectedGuess?.guess ||
    falseStarts[0] ||
    (answerPattern.kind === "before" || answerPattern.kind === "after"
      ? "a loose phrase pattern"
      : "a broad category guess");
  const narrativeGuess = lowerFirst(firstGuess);
  const narrativeAnswerFocus = lowerFirst(answerFocus);
  const firstResolvedReading = buildResolvedReadingSentence(clueDetails[0]);
  const secondResolvedReading = buildResolvedReadingSentence(clueDetails[1]);
  const finalChecks = formatNaturalList(clues.slice(-2).map((clue) => `"${clue}"`));

  const paragraphs =
    answerPattern.kind === "before" || answerPattern.kind === "after"
      ? [
          `At first, this looked more like ${narrativeGuess} than ${categoryComparison}.`,
          `${clues[0]} pushed me in that direction immediately.`,
          `${clues[1] || clues[0]} kept that read alive for a moment, but ${turningPointReference(turningPointLabel)} still did not sound right.`,
          "That was the moment the first idea stopped working.",
          `Then ${turningPointSubject(turningPointLabel)} made the missing word much harder to miss.`,
          `Readings like ${formatNaturalList(buildRepresentativeReadings(clueDetails, answer, 2))} finally sounded exact instead of approximate.`,
          `The answer was ${answer}.`,
          `${finalChecks} then felt like confirmations, not extra mysteries.`,
          "Looking back, the whole pattern feels obvious in the best way.",
        ]
      : [
          `At first, this looked more like ${narrativeGuess} than ${narrativeAnswerFocus}.`,
          `${clues[0]} pushed me in that direction immediately.`,
          `${clues[1] || clues[0]} kept that theory alive for a moment, but ${turningPointReference(turningPointLabel)} still did not quite fit.`,
          "That was the moment the first idea stopped working.",
          `Then ${turningPointSubject(turningPointLabel)} made me stop thinking about ${narrativeGuess} and start thinking about ${narrativeAnswerFocus}.`,
          firstResolvedReading,
          secondResolvedReading,
          `The answer was ${answer}.`,
          `${finalChecks} then felt less surprising and more like the last pieces falling into place.`,
          "Looking back, the answer feels obvious in the best way.",
        ];

  return paragraphs
    .map((paragraph) => ensureSentence(paragraph))
    .filter(Boolean);
}

function buildOverview(
  clues: string[],
  falseStarts: string[],
  turningPointLabel: string,
  connectorSummary: string,
  clueDetails: ReturnType<typeof normalizeSlotClueDetails>,
  difficultyReason: string,
  answer: string,
): string {
  const answerPattern = detectAnswerPattern(answer);
  const answerFocus = buildAnswerFocusLabel(answer);
  const paragraphOne = ensureSentence(
    answerPattern.kind === "before" || answerPattern.kind === "after"
      ? `${buildOpeningBoardRead(clues, answer)} ${buildFalseStartLead(falseStarts, answer)} ${turningPointSubject(turningPointLabel)} is the clue that finally makes the missing word visible.`
      : `${buildOpeningBoardRead(clues, answer)} ${buildFalseStartLead(falseStarts, answer)} ${turningPointSubject(turningPointLabel)} is the clue that finally breaks that first read and makes ${answerFocus} feel concrete.`,
  );
  const turningPointEffect =
    answerPattern.kind === "before" || answerPattern.kind === "after"
      ? `Once ${turningPointReference(turningPointLabel)} makes the missing word visible, the earlier clues stop feeling loose and start sounding exact.`
      : `Once ${turningPointReference(turningPointLabel)} is read the right way, the earlier clues stop pulling in different directions and start behaving like parts of the same answer.`;
  const paragraphTwo = ensureSentence(
    `${buildOverviewResolution(connectorSummary, clueDetails, answer)} ${turningPointEffect} ${buildDifficultyCloser(answer, difficultyReason)}`,
  );

  return `${paragraphOne}\n\n${paragraphTwo}`.trim();
}

function buildSolutionEmergence(
  clues: string[],
  falseStarts: string[],
  rejectedGuess: { guess: string; explanation: string } | undefined,
  turningPointLabel: string,
  clueDetails: ReturnType<typeof normalizeSlotClueDetails>,
  answer: string,
): string {
  const answerPattern = detectAnswerPattern(answer);
  const answerFocus = buildAnswerFocusLabel(answer);
  const firstGuess =
    rejectedGuess?.guess ||
    falseStarts[0] ||
    "a broader category that looked promising at first";
  const openingClues = formatQuotedList(clues.slice(0, 2));
  const paragraphOne = ensureSentence(
    `${openingClues} first pulled me toward ${firstGuess}, so that was the first path I tested. It held together for a moment, but ${turningPointReference(turningPointLabel)} never really fit it. The more I pushed that first read, the more the board sounded stitched together instead of naturally solved.`,
  );
  const paragraphTwo =
    answerPattern.kind === "before" || answerPattern.kind === "after"
      ? ensureSentence(
          `The solve turned when I let ${turningPointReference(turningPointLabel)} lead instead of treating it like an outlier. Once that clue exposed the missing word, readings like ${formatNaturalList(buildRepresentativeReadings(clueDetails, answer, 2))} started to sound exact instead of approximate. That was the point where I could go back across the earlier clues, test the same word in each spot, and feel the answer lock in for real.`,
        )
      : ensureSentence(
          `The solve turned when I stopped treating ${turningPointReference(turningPointLabel)} as just another clue and ${buildCategoryFocusQuestion(answer)}. Once I made that shift, I was no longer thinking about ${firstGuess}; I was checking whether the earlier clues all behaved like parts of the same real set. That was when the answer became clear, because the remaining clues stopped feeling like separate trivia and started reinforcing ${answerFocus}.`,
        );

  return `${paragraphOne}\n\n${paragraphTwo}`.trim();
}

function buildWrongGuesses(
  falseStarts: string[],
  rejectedGuess: { guess: string; explanation: string } | undefined,
  turningPointLabel: string,
) {
  const rows = uniqueNonEmpty([
    rejectedGuess?.guess,
    ...falseStarts,
  ]).slice(0, 2);

  return rows.map((guess, index) => ({
    guess,
    explanation:
      normalizeText(index === 0 ? rejectedGuess?.explanation : "") ||
      ensureSentence(
        `${guess} feels plausible early on, but it falls apart once ${turningPointReference(turningPointLabel)} demands a more exact reading.`,
      ),
  }));
}

function sanitizeRejectedGuess(
  falseStarts: string[],
  rejectedGuess: { guess: string; explanation: string } | undefined,
  turningPointLabel: string,
) {
  const fallbackGuess = falseStarts[0] || "an early category guess";
  const rawGuess = normalizeText(rejectedGuess?.guess);
  const guess = normalizeGuessLabel(rawGuess && !looksMachineyWrongGuess(rawGuess) ? rawGuess : fallbackGuess);
  const explanation =
    normalizeText(rejectedGuess?.explanation) ||
    `${guess} feels plausible early on, but ${turningPointReference(turningPointLabel)} demands a more exact reading.`;

  return {
    guess,
    explanation: ensureSentence(explanation),
  };
}

function buildLessons(
  turningPointLabel: string,
  connectorSummary: string,
  portableTakeaway: string,
  answer: string,
) {
  const answerPattern = detectAnswerPattern(answer);
  const finalTitle =
    answerPattern.kind === "before" || answerPattern.kind === "after"
      ? "Prefer exact phrase logic over loose category logic"
      : "Prefer precise category fit over broad topic logic";
  const defaultTakeaway =
    answerPattern.kind === "before" || answerPattern.kind === "after"
      ? `A strong Pinpoint answer should explain every clue naturally through ${lowerFirst(connectorSummary)}`
      : "A strong Pinpoint answer should explain why every clue belongs in the same category.";
  return [
    {
      title: "Broad clues can create the wrong frame early",
      body: "When the first clues are very open-ended, it is often better to wait for a more specific word before locking in a category.",
    },
    {
      title: "The narrowing clue matters more than the loudest clue",
      body: ensureSentence(
        `${turningPointSubject(turningPointLabel)} is what organizes this board. Once one clue produces a precise natural reading, re-check the earlier clues under that same frame.`,
      ),
    },
    {
      title: finalTitle,
      body: ensureSentence(
        `${portableTakeaway || defaultTakeaway}`,
      ),
    },
  ];
}

function buildFaqs(
  puzzleData: PuzzleDataForAI,
  connectorSummary: string,
  turningPointLabel: string,
  clueDetails: GeneratedClueDetail[],
  difficultyReason: string,
) {
  const answerPattern = detectAnswerPattern(puzzleData.mainAnswer);
  const clueCount = puzzleData.rawWords.length || SLOT_CONTRACT.clueDetailsRequired;
  const turningClue = turningPointSubject(turningPointLabel);
  const normalizedTurningClue = normalizeLooseMatch(turningClue);
  const turningDetail = clueDetails.find((detail) => normalizeLooseMatch(detail.clue) === normalizedTurningClue);
  const turningPhrase = stripQuotes(normalizeText(turningDetail?.phrase));
  const supportingDetails = clueDetails
    .filter((detail) => normalizeLooseMatch(detail.clue) !== normalizedTurningClue)
    .filter((detail) => normalizeText(detail.phrase));
  const supportingExample = supportingDetails[0];
  const supportingPhrase = stripQuotes(normalizeText(supportingExample?.phrase));
  const phraseExamples = formatQuotedList(supportingDetails.slice(0, 2).map((detail) => detail.phrase));
  const connectionAnswer =
    answerPattern.kind === "before" || answerPattern.kind === "after"
      ? `The connection is ${connectorSummary}. The earlier clues resolve as natural phrase readings, and the last clue confirms the same frame in plain language`
      : answerPattern.kind === "typed-category"
        ? `${buildCategoryConnectionAnswer(puzzleData.mainAnswer, clueCount)} ${turningPointSubject(turningPointLabel)} is the clue that makes the category specific enough to verify across the full board`
        : `${buildCategoryConnectionAnswer(puzzleData.mainAnswer, clueCount)} ${turningPointSubject(turningPointLabel)} is what keeps the category reading precise instead of broad`;
  return [
    {
      question: `What is the answer to LinkedIn Pinpoint #${puzzleData.puzzleNumber}?`,
      answer: `The answer is "${puzzleData.mainAnswer}" because that reading explains the full set cleanly, including the final clue.`,
    },
    {
      question: `What is the connection in LinkedIn Pinpoint #${puzzleData.puzzleNumber}?`,
      answer: ensureSentence(
        connectionAnswer,
      ),
    },
    {
      question: `Which clue really unlocks LinkedIn Pinpoint #${puzzleData.puzzleNumber}?`,
      answer: ensureSentence(
        (answerPattern.kind === "before" || answerPattern.kind === "after")
          ? turningPhrase
            ? `${turningClue} is the turning clue because "${turningPhrase}" is an exact, everyday phrase. ${
                phraseExamples
                  ? `With the missing word in place, other clues read cleanly as ${phraseExamples}`
                  : "It makes the missing word visible fast enough to confirm the rest of the board"
              }. ${difficultyReason}`
            : `${turningClue} is the turning clue because it is the first clue that produces an exact, familiar phrase. ${difficultyReason}`
          : turningPhrase && supportingExample && supportingPhrase
            ? `${turningClue} is the turning clue because "${turningPhrase}" makes the shared category frame explicit. It also makes ${supportingExample.clue} read cleanly as "${supportingPhrase}". ${difficultyReason}`
            : turningDetail?.whyItWorks
              ? `${turningClue} is the turning clue because ${stripQuotes(normalizeText(turningDetail.whyItWorks))}. ${difficultyReason}`
              : `${turningClue} is the turning clue because it is the first clue that makes the answer feel concrete enough to test across the full board. ${difficultyReason}`,
      ),
    },
  ];
}

function splitGeneratedParagraphs(value: string | null | undefined): string[] {
  return String(value || "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function inferGeneratedQuestionType(answer: string): PuzzleQuestionType {
  const pattern = detectAnswerPattern(answer);
  if (pattern.kind === "before" || pattern.kind === "after") {
    return "phrase";
  }
  return "category";
}

function inferGeneratedDifficultyBand(
  answer: string,
  falseStarts: string[],
  wrongGuesses: Array<{ guess: string; explanation: string }>,
): PuzzleDifficultyBand {
  if (falseStarts.length >= 2 || wrongGuesses.length >= 2) {
    return "hard";
  }
  if (falseStarts.length === 0 && inferGeneratedQuestionType(answer) !== "association") {
    return "obvious";
  }
  return "medium";
}

function findGeneratedMentionedClue(text: string, clues: string[]): string | null {
  const normalizedText = normalizeLooseMatch(text);
  let matchedClue: string | null = null;
  let matchedIndex = Number.POSITIVE_INFINITY;
  for (const clue of clues) {
    const normalizedClue = normalizeLooseMatch(clue);
    if (!normalizedClue) continue;
    const mentionIndex = normalizedText.indexOf(normalizedClue);
    if (mentionIndex !== -1 && mentionIndex < matchedIndex) {
      matchedClue = clue;
      matchedIndex = mentionIndex;
    }
  }
  return matchedClue;
}

function buildGeneratedTurningPointRecord(
  clues: string[],
  turningPointText: string,
  turningPointLabel: string,
  clueDetails: GeneratedClueDetail[],
  answer: string,
): PuzzleTurningPointRecord | undefined {
  const explicitClue =
    hasSpecificTurningPointLabel(turningPointLabel)
      ? clues.find((clue) => normalizeLooseMatch(clue) === normalizeLooseMatch(stripQuotes(turningPointLabel)))
      : undefined;
  const clue =
    explicitClue ||
    findGeneratedMentionedClue(turningPointText, clues) ||
    clueDetails.find((detail) => turningPointMentionsClue(turningPointText, detail.clue))?.clue ||
    clues[0];
  if (!clue) return undefined;

  const clueDetail = clueDetails.find((detail) => detail.clue === clue);
  const whyDecisive =
    ensureSentence(turningPointText) ||
    clueDetail?.whyItWorks ||
    buildTurningPointFallbackSentence(`"${clue}"`, answer);

  return {
    clue,
    whyDecisive,
    whatChangedAfterIt: ensureSentence(
      detectAnswerPattern(answer).kind === "before" || detectAnswerPattern(answer).kind === "after"
        ? `Once ${clue} made the missing word visible, the earlier clues stopped feeling loose and started sounding exact.`
        : `Once ${clue} landed, the earlier clues stopped pulling in different directions and started reinforcing the same answer.`,
    ),
  };
}

function buildGeneratedSolvePath(
  answer: string,
  overview: string,
  solutionEmergence: string,
  falseStarts: string[],
  wrongGuesses: Array<{ guess: string; explanation: string }>,
  turningPoint: PuzzleTurningPointRecord | undefined,
): PuzzleSolvePathRecord {
  const overviewParagraphs = splitGeneratedParagraphs(overview);
  const solutionParagraphs = splitGeneratedParagraphs(solutionEmergence);
  const wrongGuessReasons = wrongGuesses
    .map((item) => ensureSentence(item.explanation))
    .filter(Boolean)
    .slice(0, Math.max(falseStarts.length, 1));
  const fallbackFalseStartReason =
    wrongGuesses[0]?.explanation ||
    buildFalseStartLead(falseStarts, answer);

  return {
    firstRead:
      overviewParagraphs[0] ||
      solutionParagraphs[0] ||
      "The opening clues support more than one plausible read before a later clue tightens the board.",
    falseStarts,
    whyFalseStartPlausible: wrongGuessReasons.length > 0
      ? wrongGuessReasons
      : [ensureSentence(fallbackFalseStartReason)],
    ...(turningPoint?.clue ? { breakingClue: turningPoint.clue } : {}),
    ...(solutionParagraphs[1] || turningPoint?.whyDecisive
      ? { pivot: solutionParagraphs[1] || turningPoint?.whyDecisive }
      : {}),
    ...(overviewParagraphs[1] || turningPoint?.whatChangedAfterIt
      ? { fullBoardConfirmation: overviewParagraphs[1] || turningPoint?.whatChangedAfterIt }
      : {}),
  };
}

function buildGeneratedClueRows(
  clueDetails: GeneratedClueDetail[],
  wrongGuesses: Array<{ guess: string; explanation: string }>,
): PuzzleClueRowRecord[] {
  const broadMisread = normalizeText(wrongGuesses[0]?.guess);
  const shouldShowBroadMisread =
    !!broadMisread &&
    !looksMachineyWrongGuess(broadMisread) &&
    // Bucket-y labels like "science terms" look awkward when repeated in every row.
    !/\b(terms|names)\b/i.test(broadMisread);
  return clueDetails.map((detail) => ({
    clue: detail.clue,
    ...(shouldShowBroadMisread ? { surfaceMisread: broadMisread } : {}),
    resolvedPhraseOrMember: detail.phrase,
    nonObviousWhy: ensureSentence(detail.whyItWorks),
    ...(detail.etymology || detail.phrase
      ? { searchableContext: detail.etymology || detail.phrase }
      : {}),
  }));
}

function inferGeneratedFaqIntentType(
  question: string,
): PuzzleEvidenceFaqItemRecord["intentType"] {
  const normalized = normalizeLooseMatch(question);
  if (normalized.includes("what is the answer")) return "definition";
  if (normalized.includes("what is the connection")) return "category_context";
  if (normalized.includes("which clue") || normalized.startsWith("why is")) return "clue_background";
  if (normalized.includes("compare") || normalized.includes("difference")) return "comparison";
  return "solve_strategy";
}

function buildGeneratedFaqItems(
  faqs: Array<{ question: string; answer: string }>,
  clues: string[],
): PuzzleEvidenceFaqItemRecord[] {
  return faqs.map((faq) => ({
    intentType: inferGeneratedFaqIntentType(faq.question),
    question: faq.question,
    answer: faq.answer,
    tiedClue: findGeneratedMentionedClue(`${faq.question} ${faq.answer}`, clues),
  }));
}

function buildGeneratedUniquenessSignals(
  connectorSummary: string,
  clueRows: PuzzleClueRowRecord[],
  lessons: Array<{ title: string; body: string }>,
): PuzzleUniquenessSignalsRecord {
  return {
    angle: connectorSummary,
    relatedEntities: clueRows.map((row) => row.resolvedPhraseOrMember).filter(Boolean).slice(0, 5),
    doNotRepeatPatterns: Array.from(
      new Set([
        connectorSummary,
        ...lessons.map((lesson) => lesson.title),
        ...clueRows.map((row) => row.searchableContext || row.resolvedPhraseOrMember),
      ].filter(Boolean)),
    ).slice(0, 6),
  };
}

function buildGeneratedEvidenceFields(input: {
  clues: string[];
  answer: string;
  connectorSummary: string;
  turningPointText: string;
  turningPointLabel: string;
  falseStarts: string[];
  wrongGuesses: Array<{ guess: string; explanation: string }>;
  clueDetails: GeneratedClueDetail[];
  faqs: Array<{ question: string; answer: string }>;
  lessons: Array<{ title: string; body: string }>;
  overview: string;
  solutionEmergence: string;
}) {
  const questionType = inferGeneratedQuestionType(input.answer);
  const difficultyBand = inferGeneratedDifficultyBand(input.answer, input.falseStarts, input.wrongGuesses);
  const turningPoint = buildGeneratedTurningPointRecord(
    input.clues,
    input.turningPointText,
    input.turningPointLabel,
    input.clueDetails,
    input.answer,
  );
  const clueRows = buildGeneratedClueRows(input.clueDetails, input.wrongGuesses);
  return {
    questionType,
    difficultyBand,
    solvePath: buildGeneratedSolvePath(
      input.answer,
      input.overview,
      input.solutionEmergence,
      input.falseStarts,
      input.wrongGuesses,
      turningPoint,
    ),
    turningPoint,
    clueRows,
    faqItems: buildGeneratedFaqItems(input.faqs, input.clues),
    uniquenessSignals: buildGeneratedUniquenessSignals(input.connectorSummary, clueRows, input.lessons),
  };
}

function buildGeneratedEvidenceFromContent(
  content: Partial<Omit<AIGeneratedContent, "slots">> & { slots?: Partial<AIGeneratedSlots> },
  puzzleData?: PuzzleDataForAI,
) {
  const clues =
    puzzleData?.rawWords?.filter(Boolean) ||
    content.sections?.clueDetails?.map((detail) => detail.clue).filter(Boolean) ||
    [];
  const answer = puzzleData?.mainAnswer || "";
  if (!content.sections || !answer || clues.length === 0) {
    return null;
  }

  const clueDetails: GeneratedClueDetail[] = (content.sections.clueDetails || []).map((detail) => ({
    clue: detail.clue,
    surfaceRead: detail.explanation,
    phrase: detail.phrase,
    whyItWorks: detail.explanation,
    etymology: detail.etymology,
  }));
  const lessons = (content.sections.lessons || []).map((lesson, index) =>
    typeof lesson === "string"
      ? { title: `Lesson ${index + 1}`, body: lesson }
      : lesson,
  );
  const faqs = content.sections.faqs || [];
  const connectorSummary =
    content.slots?.connectorSummary ||
    content.uniquenessSignals?.angle ||
    buildConnectorSummaryFromAnswer(answer);
  const turningPointText =
    content.slots?.turningPoint ||
    content.turningPoint?.whyDecisive ||
    content.sections.solutionEmergence ||
    content.sections.overview;
  const turningPointLabel = content.turningPoint?.clue
    ? `"${content.turningPoint.clue}"`
    : buildTurningPointLabel(turningPointText, clues);

  return buildGeneratedEvidenceFields({
    clues,
    answer,
    connectorSummary,
    turningPointText,
    turningPointLabel,
    falseStarts: content.solvePath?.falseStarts || [],
    wrongGuesses: content.sections.wrongGuesses || [],
    clueDetails,
    faqs,
    lessons,
    overview: content.sections.overview,
    solutionEmergence: content.sections.solutionEmergence,
  });
}

export function composeFromSlots(
  slots: Partial<AIGeneratedSlots>,
  puzzleData?: PuzzleDataForAI,
  providedArticleBlocks?: string[],
): AIGeneratedContent {
  const puzzleNumber = puzzleData?.puzzleNumber || 0;
  const clues = puzzleData?.rawWords || [];
  const mainAnswer = puzzleData?.mainAnswer || "";
  const answerPattern = detectAnswerPattern(mainAnswer);
  const connectorSummary = normalizeConnectorSummary(slots.connectorSummary, mainAnswer);
  const turningPoint =
    ensureSentence(slots.turningPoint) ||
    ensureSentence("A later clue is what finally tightens the board.");
  let turningPointLabel = buildTurningPointLabel(turningPoint, clues);
  const difficultyReason =
    ensureSentence(slots.difficultyReason) ||
    (answerPattern.kind === "before" || answerPattern.kind === "after"
      ? "The board feels hard because the opening clues are broad enough to support a few weak categories before a tighter phrase reading appears."
      : "The board feels harder than it is because the clues point to familiar titles from different corners of the same category.");
  const portableTakeaway =
    ensureSentence(slots.portableTakeaway) ||
    "When the early clues feel broad, wait for the word that narrows the pattern before committing.";
  let clueDetails = normalizeSlotClueDetails(
    slots.clueDetails,
    clues,
    mainAnswer,
    turningPointLabel,
    connectorSummary,
  );
  const refinedTurningPointLabel = refineTurningPointLabel(
    turningPoint,
    turningPointLabel,
    clues,
    clueDetails,
    mainAnswer,
  );
  if (refinedTurningPointLabel !== turningPointLabel) {
    turningPointLabel = refinedTurningPointLabel;
    clueDetails = normalizeSlotClueDetails(
      slots.clueDetails,
      clues,
      mainAnswer,
      turningPointLabel,
      connectorSummary,
    );
  }
  const providedFalseStarts = sanitizeFalseStarts(
    uniqueNonEmpty(slots.falseStarts ?? []),
    clues,
    clueDetails,
    mainAnswer,
  );
  const falseStarts =
    providedFalseStarts.length > 0
      ? providedFalseStarts
      : sanitizeFalseStarts(buildFallbackFalseStarts(mainAnswer, clues), clues, clueDetails, mainAnswer);
  const rejectedGuess = sanitizeRejectedGuess(falseStarts, slots.rejectedGuess, turningPointLabel);
  const heroSummary = buildHeroSummary(slots, puzzleData ?? { puzzleNumber, rawWords: clues, mainAnswer });
  const overview = buildOverview(
    clues,
    falseStarts,
    turningPointLabel,
    connectorSummary,
    clueDetails,
    difficultyReason,
    mainAnswer,
  );
  const solutionEmergence = buildSolutionEmergence(
    clues,
    falseStarts,
    rejectedGuess,
    turningPointLabel,
    clueDetails,
    mainAnswer,
  );
  const wrongGuesses = buildWrongGuesses(falseStarts, rejectedGuess, turningPointLabel);
  const lessons = buildLessons(turningPointLabel, connectorSummary, portableTakeaway, mainAnswer);
  const faqs = buildFaqs(
    puzzleData ?? { puzzleNumber, rawWords: clues, mainAnswer },
    connectorSummary,
    turningPointLabel,
    clueDetails,
    difficultyReason,
  );
  const trivia = ensureSentence(
    "Did you know? The cleanest Pinpoint solves usually come from one repeatable reading that makes every clue feel natural, not forced.",
  );
  const articleBlocks = buildArticleBlocks(
    clues,
    falseStarts,
    rejectedGuess,
    turningPointLabel,
    clueDetails,
    mainAnswer,
    providedArticleBlocks,
  );
  const detailedBreakdown = articleBlocks.join("\n\n");
  const evidence = buildGeneratedEvidenceFields({
    clues,
    answer: mainAnswer,
    connectorSummary,
    turningPointText: turningPoint,
    turningPointLabel,
    falseStarts,
    wrongGuesses,
    clueDetails,
    faqs,
    lessons,
    overview,
    solutionEmergence,
  });

  return {
    questionType: evidence.questionType,
    difficultyBand: evidence.difficultyBand,
    sections: {
      articleBlocks,
      overview,
      solutionEmergence,
      wrongGuesses,
      clueDetails: clueDetails.map((detail) => ({
        clue: detail.clue,
        phrase: detail.phrase,
        explanation: detail.whyItWorks,
        etymology: detail.etymology,
      })),
      lessons,
      faqs,
      trivia,
    },
    analysis: {
      detailedBreakdown,
      dailyDebrief: ensureSentence(
        answerPattern.kind === "before" || answerPattern.kind === "after"
          ? `LinkedIn Pinpoint #${puzzleNumber} resolves through ${lowerFirst(connectorSummary)}. The explicit answer is "${mainAnswer}", with ${turningPointReference(turningPointLabel)} serving as the turning point.`
          : `LinkedIn Pinpoint #${puzzleNumber} resolves as a category board. The explicit answer is "${mainAnswer}", with ${turningPointReference(turningPointLabel)} serving as the clue that tightens the frame.`,
      ),
      heroSummary,
      seoTitle: buildPinpointTitle(puzzleNumber, clues),
      seoDescription: buildPinpointDescription(puzzleNumber, clues),
      seoKeywords: [],
      tags: clues.slice(0, 5),
      llmTemplateVersion: LLM_TEMPLATE_VERSION,
    },
    solvePath: evidence.solvePath,
    ...(evidence.turningPoint ? { turningPoint: evidence.turningPoint } : {}),
    clueRows: evidence.clueRows,
    faqItems: evidence.faqItems,
    uniquenessSignals: evidence.uniquenessSignals,
    slots: {
      heroIntroSpoilerSafe: heroSummary,
      connectorSummary,
      turningPoint: ensureSentence(
        !looksSuspiciousTurningPointText(turningPoint) &&
          normalizeLooseMatch(turningPoint).includes(normalizeLooseMatch(stripQuotes(turningPointLabel)))
          ? stripQuotes(turningPoint)
          : buildTurningPointFallbackSentence(turningPointLabel, mainAnswer),
      ),
      falseStarts,
      rejectedGuess,
      clueDetails,
      difficultyReason: stripQuotes(difficultyReason),
      portableTakeaway: stripQuotes(portableTakeaway),
    },
  };
}

export function validateAndFixGeneratedContent(
  parsed: ParsedAIResponse,
  puzzleData?: PuzzleDataForAI,
): AIGeneratedContent {
  const validatedParsed = validateParsedResponseShape(parsed);
  const normalized = validatedParsed.slots
    ? composeFromSlots(
        validateParsedSlotsContract(validatedParsed.slots, puzzleData),
        puzzleData,
        validatedParsed.sections?.articleBlocks,
      )
    : { ...validatedParsed };

  if (!normalized.sections) {
    throw new Error('AI response missing "sections" object');
  }

  const normalizedArticleBlocks = normalizeArticleBlocks(
    normalized.sections.articleBlocks,
    puzzleData?.mainAnswer || "",
  );
  if (normalizedArticleBlocks.length > 0) {
    normalized.sections.articleBlocks = normalizedArticleBlocks;
  } else {
    normalized.sections.articleBlocks = normalizeArticleBlocks(
      [
        String(normalized.analysis?.detailedBreakdown || "").trim(),
        String(normalized.sections.solutionEmergence || "").trim(),
      ].filter(Boolean),
      puzzleData?.mainAnswer || "",
    );
  }

  const requiredSections = ["overview", "solutionEmergence", "clueDetails", "lessons", "faqs"] as const;
  for (const field of requiredSections) {
    if (!normalized.sections[field]) {
      throw new Error(`AI response missing "sections.${field}"`);
    }
  }

  const puzzleNumber = puzzleData?.puzzleNumber || 0;
  const clues = puzzleData?.rawWords || [];
  const mainAnswer = puzzleData?.mainAnswer || "";

  if (!normalized.analysis) {
    normalized.analysis = {
      detailedBreakdown:
        normalized.sections.articleBlocks?.join("\n\n") ||
        normalized.sections.solutionEmergence ||
        "",
      dailyDebrief: `The answer is ${mainAnswer}. The clues ${clues.join(", ")} all point to the same connector.`,
      heroSummary: `LinkedIn Pinpoint #${puzzleNumber} starts wide with ${clues.slice(0, 3).join(", ")}. Use the spoiler-safe clues first, then reveal the final connector when you are ready.`,
      seoTitle: buildPinpointTitle(puzzleNumber, clues),
      seoDescription: buildPinpointDescription(puzzleNumber, clues),
      seoKeywords: [],
      tags: clues.slice(0, 5),
      llmTemplateVersion: LLM_TEMPLATE_VERSION,
    };
  }

  if (!normalized.analysis.seoTitle) {
    normalized.analysis.seoTitle = buildPinpointTitle(puzzleNumber, clues);
  }

  if (!normalized.analysis.seoDescription) {
    normalized.analysis.seoDescription = buildPinpointDescription(puzzleNumber, clues);
  }

  if (!normalized.analysis.heroSummary) {
    normalized.analysis.heroSummary = `LinkedIn Pinpoint #${puzzleNumber} starts broad. Review the spoiler-safe clues first, then reveal the final connector when you are ready.`;
  }

  if (!normalized.analysis.detailedBreakdown) {
    normalized.analysis.detailedBreakdown =
      normalized.sections.articleBlocks?.join("\n\n") ||
      normalized.sections.solutionEmergence ||
      normalized.sections.overview ||
      "";
  }

  if (!normalized.analysis.llmTemplateVersion) {
    normalized.analysis.llmTemplateVersion = LLM_TEMPLATE_VERSION;
  }

  const derivedEvidence = buildGeneratedEvidenceFromContent(normalized, puzzleData);
  if (derivedEvidence) {
    normalized.questionType ||= derivedEvidence.questionType;
    normalized.difficultyBand ||= derivedEvidence.difficultyBand;
    normalized.solvePath ||= derivedEvidence.solvePath;
    normalized.turningPoint ||= derivedEvidence.turningPoint;
    normalized.clueRows ||= derivedEvidence.clueRows;
    normalized.faqItems ||= derivedEvidence.faqItems;
    normalized.uniquenessSignals ||= derivedEvidence.uniquenessSignals;
  }

  return normalized as AIGeneratedContent;
}
