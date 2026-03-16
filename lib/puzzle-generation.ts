import { appLogger } from "@/lib/logger";
import { normalizeClueForAI } from "@/lib/puzzles/clue-normalizer";
import { buildPinpointDescription, buildPinpointTitle } from "@/lib/seo/pinpoint";

export interface PuzzleDataForAI {
  puzzleNumber: number;
  rawWords: string[];
  mainAnswer: string;
}

export interface AIGeneratedSlots {
  heroIntroSpoilerSafe: string;
  connectorSummary: string;
  turningPoint: string;
  falseStarts: string[];
  rejectedGuess?: { guess: string; explanation: string };
  clueDetails: Array<{
    clue: string;
    surfaceRead: string;
    phrase: string;
    whyItWorks: string;
    etymology?: string;
  }>;
  difficultyReason: string;
  portableTakeaway: string;
}

type SlotClueDetail = AIGeneratedSlots["clueDetails"][number];

export interface AIGeneratedContent {
  sections: {
    overview: string;
    solutionEmergence: string;
    wrongGuesses: Array<{ guess: string; explanation: string }>;
    clueDetails: Array<{ clue: string; phrase: string; explanation: string; etymology?: string }>;
    lessons: Array<{ title: string; body: string }>;
    faqs: Array<{ question: string; answer: string }>;
    trivia?: string;
  };
  analysis: {
    detailedBreakdown: string;
    dailyDebrief: string;
    heroSummary: string;
    seoTitle: string;
    seoDescription: string;
    seoKeywords: string[];
    tags: string[];
    llmTemplateVersion: string;
  };
  slots?: AIGeneratedSlots;
}

type ParsedAIResponse = Partial<Omit<AIGeneratedContent, "slots">> & {
  slots?: Partial<AIGeneratedSlots>;
};

export type PuzzleGenerationOptions = {
  model?: string;
  apiEndpoint?: string;
  provider?: "openai" | "anthropic" | "zhipu" | "azure";
  apiVersion?: string;
};

const DEBUG = process.env.NODE_ENV === "development" || process.env.DEBUG_AI === "true";
const LLM_TEMPLATE_VERSION = "pinpoint-v7";

function debugInfo(message: string, details?: Record<string, unknown>) {
  if (!DEBUG) return;
  appLogger.info(message, { component: "puzzle-generation", ...details });
}

function debugError(message: string, details?: Record<string, unknown>) {
  if (!DEBUG) return;
  appLogger.error(message, { component: "puzzle-generation", ...details });
}

export function buildPuzzlePrompt(puzzleData: PuzzleDataForAI): string {
  const normalizedClues = (puzzleData.rawWords || []).map((clue) => normalizeClueForAI(clue));
  const clues = normalizedClues.map((item) => item.normalized).join(", ");
  const originalClues = (puzzleData.rawWords || []).join(", ");
  const answerPattern = detectAnswerPattern(puzzleData.mainAnswer);
  const patternSpecificRules =
    answerPattern.kind === "before" || answerPattern.kind === "after"
      ? `
Pattern-specific rules:
- This is a phrase-pattern board, not a broad category board.
- connectorSummary should stay spoiler-safe and concise, like a phrase pattern label rather than the exact answer.
- clueDetails.phrase should be the exact natural phrase that fits each clue.
- whyItWorks should explain why that phrase is a clean fit.
`.trim()
      : `
Pattern-specific rules:
- This is a category board, not a before/after phrase board.
- connectorSummary should be a spoiler-safe category bridge, not a vague slogan.
- clueDetails.phrase should usually be a natural member label inside the category.
- If the answer is "Types of X", clueDetails.phrase should usually end with the category noun when natural.
- whyItWorks should explain why each clue belongs in the category.
`.trim();

  return `
You are a senior content writer for "Pinpoint Answer Today". Use the V7 Slot Template.

Output ONLY a valid JSON object with this exact shape:
{
  "slots": {
    "heroIntroSpoilerSafe": "...",
    "connectorSummary": "...",
    "turningPoint": "...",
    "falseStarts": ["...", "..."],
    "rejectedGuess": { "guess": "...", "explanation": "..." },
    "clueDetails": [
      {
        "clue": "...",
        "surfaceRead": "...",
        "phrase": "...",
        "whyItWorks": "...",
        "etymology": "..."
      }
    ],
    "difficultyReason": "...",
    "portableTakeaway": "..."
  }
}

Hard requirements:
1. heroIntroSpoilerSafe is the pre-reveal intro shown before the user chooses to reveal the answer.
2. heroIntroSpoilerSafe must be 20 to 45 words and must NOT include the exact answer text: ${puzzleData.mainAnswer}
3. connectorSummary must be a short spoiler-safe label, 6 to 16 words, and must NOT equal or quote the exact answer text.
4. turningPoint must name the clue or clue combination that makes the pattern click, in one clear sentence.
5. falseStarts must contain 1 or 2 plausible wrong reads or weak categories.
6. rejectedGuess.explanation must explain why that guess falls short.
7. Include exactly 5 clueDetails items, one for each original clue in this exact set: ${originalClues}
8. Each clueDetails.clue must match one original clue exactly as written.
9. Each clueDetails.phrase must be a natural phrase or category reading that is different from the clue.
10. Each clueDetails.whyItWorks must explain specific logic, not just restate the final answer.
11. difficultyReason must explain why the board feels tricky without directly repeating the exact answer.
12. portableTakeaway must be one short practical lesson the solver can reuse tomorrow.
13. Output raw JSON only, no markdown.

Writing rules:
- Separate page reveal from explanation. The reveal card owns the first clear answer reveal on-page.
- Treat heroIntroSpoilerSafe as the short intro shown before the user chooses to reveal the answer.
- Do not sneak the exact answer into heroIntroSpoilerSafe, connectorSummary, turningPoint, difficultyReason, or falseStarts.
- Make the clueDetails useful enough that a program can build overview, solve narrative, FAQ, and lessons from them.
- Avoid filler lines like:
  - X connects to...
  - X fits the theme
  - The clues all share this connection
  - Difficulty varies
  - This is the hallmark of a well-crafted puzzle
- Prefer concrete phrase logic over broad vague category talk.

${patternSpecificRules}

Input data:
- Puzzle #${puzzleData.puzzleNumber}
- Clues (normalized for reasoning): ${clues}
- Original clues (must preserve for SEO fields): ${originalClues}
- Answer: ${puzzleData.mainAnswer}
`.trim();
}

export async function generatePuzzleContent(
  puzzleData: PuzzleDataForAI,
  apiKey: string,
  options: PuzzleGenerationOptions,
): Promise<AIGeneratedContent> {
  return generatePuzzleContentFromPrompt(buildPuzzlePrompt(puzzleData), apiKey, options, puzzleData);
}

export async function generatePuzzleContentFromPrompt(
  prompt: string,
  apiKey: string,
  options: PuzzleGenerationOptions,
  puzzleData?: PuzzleDataForAI,
): Promise<AIGeneratedContent> {
  const { provider = "openai", model = "google/gemini-2.0-flash-001", apiEndpoint } = options;

  if (provider === "anthropic") {
    return callAnthropicAPI(prompt, apiKey, model, apiEndpoint, puzzleData);
  }
  return callOpenAICompatible(
    prompt,
    apiKey,
    provider,
    model,
    apiEndpoint,
    options.apiVersion,
    puzzleData,
  );
}

async function callOpenAICompatible(
  prompt: string,
  apiKey: string,
  provider: string,
  model: string,
  endpoint?: string,
  apiVersion = "2024-02-15-preview",
  puzzleData?: PuzzleDataForAI,
): Promise<AIGeneratedContent> {
  let apiUrl = "https://api.openai.com/v1/chat/completions";
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (provider === "zhipu") {
    apiUrl = endpoint || "https://open.bigmodel.cn/api/paas/v4/chat/completions";
    headers.authorization = `Bearer ${apiKey}`;
  } else if (provider === "azure") {
    if (!endpoint) throw new Error("Azure endpoint required");
    apiUrl = `${endpoint.replace(/\/$/, "")}/openai/deployments/${model}/chat/completions?api-version=${apiVersion}`;
    headers["api-key"] = apiKey;
  } else {
    headers.authorization = `Bearer ${apiKey}`;
    if (endpoint) {
      const baseUrl = endpoint.replace(/\/$/, "");
      apiUrl = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;
    }
  }

  const requestBody: Record<string, unknown> = {
    messages: [
      {
        role: "system",
        content: "You are a content writer for Pinpoint Answer Today. Return JSON only.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.7,
  };

  if (provider !== "azure") {
    requestBody.model = model;
  }
  if ((provider === "openai" || provider === "zhipu") && (model.includes("gpt-") || model.includes("glm-"))) {
    requestBody.response_format = { type: "json_object" };
  }

  debugInfo("AI API request", { provider, model, apiUrl });

  const response = await fetch(apiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errText = await response.text();
    debugError("AI API error response", { status: response.status, errorTextHead: errText.slice(0, 500) });
    throw new Error(`AI API Error (${provider}): ${response.status} ${errText.slice(0, 500)}`);
  }

  const responseText = await response.text();
  let data: { choices?: Array<{ message?: { content?: string } }> };
  try {
    data = JSON.parse(responseText) as { choices?: Array<{ message?: { content?: string } }> };
  } catch (error) {
    throw new Error(
      `Failed to parse AI API response as JSON: ${(error as Error)?.message ?? "unknown"}. First 500 chars: ${responseText.slice(0, 500)}`,
    );
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("No content returned from AI");
  }

  return validateAndFixGeneratedContent(parseAIResponse(content), puzzleData);
}

async function callAnthropicAPI(
  prompt: string,
  apiKey: string,
  model: string,
  endpoint = "https://api.anthropic.com/v1/messages",
  puzzleData?: PuzzleDataForAI,
): Promise<AIGeneratedContent> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic Error: ${response.status} ${errText}`);
  }

  const data = (await response.json()) as { content?: Array<{ text?: string }> };
  const content = data.content?.[0]?.text;
  if (!content) {
    throw new Error("No content from Anthropic");
  }

  return validateAndFixGeneratedContent(parseAIResponse(content), puzzleData);
}

function parseAIResponse(content: string): ParsedAIResponse {
  let jsonContent = content.trim();

  if (jsonContent.startsWith("```json")) {
    jsonContent = jsonContent.replace(/^```json\n?/, "").replace(/\n?```$/, "");
  } else if (jsonContent.startsWith("```")) {
    jsonContent = jsonContent.replace(/^```\n?/, "").replace(/\n?```$/, "");
  }

  try {
    return JSON.parse(jsonContent) as ParsedAIResponse;
  } catch (error) {
    debugError("Failed to parse AI JSON", {
      error: error instanceof Error ? error.message : String(error),
      preview: jsonContent.slice(0, 1000),
    });
    throw new Error(`Failed to parse JSON content: ${(error as Error)?.message ?? "unknown"}`);
  }
}

type AnswerPattern =
  | { kind: "before"; token: string }
  | { kind: "after"; token: string }
  | { kind: "typed-category"; noun: string; singularNoun: string }
  | { kind: "category"; label: string };

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

function detectAnswerPattern(answer: string): AnswerPattern {
  const before = answer.match(/^Words that come before\s+"([^"]+)"$/i);
  if (before?.[1]) return { kind: "before", token: before[1] };
  const after = answer.match(/^Words that come after\s+"([^"]+)"$/i);
  if (after?.[1]) return { kind: "after", token: after[1] };
  const typedCategory = answer.match(/^(Types|Kinds)\s+of\s+(.+)$/i);
  if (typedCategory?.[2]) {
    const noun = typedCategory[2].replace(/["“”]/g, "").trim();
    const words = noun.split(/\s+/);
    const lastWord = words[words.length - 1] || noun;
    let singularLastWord = lastWord;
    if (/ies$/i.test(lastWord)) {
      singularLastWord = `${lastWord.slice(0, -3)}y`;
    } else if (/s$/i.test(lastWord) && !/ss$/i.test(lastWord)) {
      singularLastWord = lastWord.slice(0, -1);
    }
    const singularNoun = [...words.slice(0, -1), singularLastWord].join(" ").trim();
    return { kind: "typed-category", noun, singularNoun: singularNoun || noun };
  }
  return { kind: "category", label: stripQuotes(answer).trim() || "the shared category" };
}

function buildConnectorSummaryFromAnswer(answer: string): string {
  const pattern = detectAnswerPattern(answer);
  if (pattern.kind === "before" || pattern.kind === "after") {
    return `a phrase pattern built around ${pattern.token}`;
  }
  if (pattern.kind === "typed-category") {
    return `a category board about ${pattern.noun}`;
  }
  return "a shared category board";
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

function normalizeLooseMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/["“”'’()\-_,!?:.;/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  for (const clue of clues) {
    if (!clue) continue;
    if (!clue) continue;
    const looseClue = normalizeLooseMatch(clue);
    const looseTurningPoint = normalizeLooseMatch(normalized);
    if (looseClue && looseTurningPoint.includes(looseClue)) {
      return `"${clue}"`;
    }
  }
  return `"${clues[2] || clues[0] || "the key clue"}"`;
}

function normalizeConnectorSummary(value: string | null | undefined, answer: string): string {
  const pattern = detectAnswerPattern(answer);
  if (pattern.kind === "before" || pattern.kind === "after" || pattern.kind === "typed-category") {
    return buildConnectorSummaryFromAnswer(answer);
  }
  const text = trimTrailingPunctuation(normalizeText(value));
  if (!text) return buildConnectorSummaryFromAnswer(answer);
  return text;
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
): string[] {
  const candidates = uniqueNonEmpty(values);
  return candidates.filter((candidate) => {
    const normalizedCandidate = normalizeLooseMatch(candidate);
    if (!normalizedCandidate) return false;
    if (countWords(candidate) <= 1 && normalizedCandidate.length < 6) return false;

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
  }).slice(0, 2);
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
    const source = byClue.get(normalizeText(clue).toLowerCase()) ?? {};
    const rawPhrase = normalizeText(source.phrase) || buildFallbackPhrase(clue, answer);
    const phrase = normalizePhraseDisplay(rawPhrase, answer) || buildFallbackPhrase(clue, answer);
    const surfaceRead = normalizeText(source.surfaceRead) || `a broader or more distracting read of ${clue}`;
    const whyItWorks =
      normalizeText(source.whyItWorks) ||
      `${stripQuotes(phrase)} fits once the board is read through ${lowerFirst(connectorSummary)}, especially after ${lowerFirst(stripQuotes(turningPointLabel))}.`;

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
    `At first glance, ${cluePreview} do not suggest one clean pattern. The board only tightens once a later clue makes the ${frameLabel} feel much more specific.`,
  );
}

function buildOverview(
  heroSummary: string,
  falseStarts: string[],
  turningPointLabel: string,
  connectorSummary: string,
  clueDetails: ReturnType<typeof normalizeSlotClueDetails>,
  difficultyReason: string,
  answer: string,
): string {
  const falseStartText =
    falseStarts.length > 0
      ? `That is why guesses like ${falseStarts.map((item) => `"${item}"`).join(" and ")} can feel plausible at the start.`
      : "That is why the set feels broad before a tighter reading appears.";

  const samplePhrases = uniqueNonEmpty(
    clueDetails.slice(0, 3).map((detail) => stripQuotes(detail.phrase)),
  ).join(", ");

  const paragraphOne = ensureSentence(
    `${heroSummary} ${falseStartText} The clue that changes the frame is ${turningPointLabel}`,
  );
  const answerPattern = detectAnswerPattern(answer);
  const closingText =
    answerPattern.kind === "before" || answerPattern.kind === "after"
      ? `Once that frame clicks, readings like ${samplePhrases} stop feeling random and start feeling exact.`
      : `Once that frame clicks, entries like ${samplePhrases} stop feeling scattered and start feeling like members of the same family.`;
  const paragraphTwo = ensureSentence(
    `From there, ${connectorSummary} explains the board more cleanly than broader labels. ${closingText} ${difficultyReason}`,
  );

  return `${paragraphOne}\n\n${paragraphTwo}`.trim();
}

function buildSolutionEmergence(
  falseStarts: string[],
  rejectedGuess: { guess: string; explanation: string } | undefined,
  turningPointLabel: string,
  connectorSummary: string,
  clueDetails: ReturnType<typeof normalizeSlotClueDetails>,
  answer: string,
): string {
  const firstGuess =
    rejectedGuess?.guess ||
    falseStarts[0] ||
    "a broader category that looked promising at first";
  const rejection =
    lowerFirst(normalizeText(rejectedGuess?.explanation)) ||
    `That line of thinking never explained ${stripQuotes(turningPointLabel)} cleanly enough.`;
  const phraseExamples = uniqueNonEmpty(
    clueDetails.slice(0, 2).map((detail) => stripQuotes(detail.phrase)),
  ).join(" and ");

  const answerPattern = detectAnswerPattern(answer);
  const categoryLine =
    answerPattern.kind === "before" || answerPattern.kind === "after"
      ? "clues that had seemed broad started reading like natural phrases"
      : "clues that had seemed broad started feeling like members of the same category";
  const paragraphOne = ensureSentence(
    `I did not have a clean category from the first clue. I initially drifted toward ${firstGuess}, which felt plausible for a moment, but ${rejection}`,
  );
  const paragraphTwo = ensureSentence(
    `The turn came when I let ${lowerFirst(stripQuotes(turningPointLabel))} lead the solve instead of treating it like an outlier. Once I read the board through ${lowerFirst(connectorSummary)}, ${categoryLine}, especially ${phraseExamples}. At that point, the final connector was the only reading that explained the full set without stretching anything.`,
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
        `${guess} feels plausible early on, but it falls apart once ${lowerFirst(stripQuotes(turningPointLabel))} demands a more exact reading.`,
      ),
  }));
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
  return [
    {
      title: "Broad clues can create the wrong frame early",
      body: "When the first clues are very open-ended, it is often better to wait for a more specific word before locking in a category.",
    },
    {
      title: "The narrowing clue matters more than the loudest clue",
      body: ensureSentence(
        `${stripQuotes(turningPointLabel)} is what organizes this board. Once one clue produces a precise natural reading, re-check the earlier clues under that same frame.`,
      ),
    },
    {
      title: finalTitle,
      body: ensureSentence(
        `${portableTakeaway || `A strong Pinpoint answer should explain every clue naturally through ${lowerFirst(connectorSummary)}`}`,
      ),
    },
  ];
}

function buildFaqs(
  puzzleData: PuzzleDataForAI,
  connectorSummary: string,
  turningPointLabel: string,
  difficultyReason: string,
) {
  const answerPattern = detectAnswerPattern(puzzleData.mainAnswer);
  const connectionAnswer =
    answerPattern.kind === "before" || answerPattern.kind === "after"
      ? `The connection is ${connectorSummary}. The earlier clues resolve as natural phrase readings, and the last clue confirms the same frame in plain language`
      : answerPattern.kind === "typed-category"
        ? `The connection is ${connectorSummary}. Each clue points to a recognizable type of ${answerPattern.singularNoun}, with one later clue making the category feel much more obvious`
        : `The connection is ${connectorSummary}. Each clue belongs inside the same category once the board is read in the right frame`;
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
        `${stripQuotes(turningPointLabel)} is the turning point because it narrows the board enough to make the earlier clues read cleanly instead of loosely. ${difficultyReason}`,
      ),
    },
  ];
}

function composeFromSlots(
  slots: Partial<AIGeneratedSlots>,
  puzzleData?: PuzzleDataForAI,
): AIGeneratedContent {
  const puzzleNumber = puzzleData?.puzzleNumber || 0;
  const clues = puzzleData?.rawWords || [];
  const mainAnswer = puzzleData?.mainAnswer || "";
  const connectorSummary = normalizeConnectorSummary(slots.connectorSummary, mainAnswer);
  const turningPoint =
    ensureSentence(slots.turningPoint) ||
    ensureSentence(`${clues[2] || clues[0] || "the later clue"} is the clue that tightens the board.`);
  const turningPointLabel = buildTurningPointLabel(turningPoint, clues);
  const difficultyReason =
    ensureSentence(slots.difficultyReason) ||
    "The board feels hard because the opening clues are broad enough to support a few weak categories before a tighter phrase reading appears.";
  const portableTakeaway =
    ensureSentence(slots.portableTakeaway) ||
    "When the early clues feel broad, wait for the word that narrows the pattern before committing.";
  const clueDetails = normalizeSlotClueDetails(
    slots.clueDetails,
    clues,
    mainAnswer,
    turningPointLabel,
    connectorSummary,
  );
  const falseStarts = sanitizeFalseStarts(uniqueNonEmpty(slots.falseStarts ?? []), clues, clueDetails);
  const heroSummary = buildHeroSummary(slots, puzzleData ?? { puzzleNumber, rawWords: clues, mainAnswer });
  const overview = buildOverview(
    heroSummary,
    falseStarts,
    turningPointLabel,
    connectorSummary,
    clueDetails,
    difficultyReason,
    mainAnswer,
  );
  const solutionEmergence = buildSolutionEmergence(
    falseStarts,
    slots.rejectedGuess,
    turningPointLabel,
    connectorSummary,
    clueDetails,
    mainAnswer,
  );
  const wrongGuesses = buildWrongGuesses(falseStarts, slots.rejectedGuess, turningPointLabel);
  const lessons = buildLessons(turningPointLabel, connectorSummary, portableTakeaway, mainAnswer);
  const faqs = buildFaqs(
    puzzleData ?? { puzzleNumber, rawWords: clues, mainAnswer },
    connectorSummary,
    turningPointLabel,
    difficultyReason,
  );
  const trivia = ensureSentence(
    "Did you know? The cleanest Pinpoint solves usually come from one repeatable reading that makes every clue feel natural, not forced.",
  );

  return {
    sections: {
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
      detailedBreakdown: `${overview}\n\n${solutionEmergence}`.trim(),
      dailyDebrief: ensureSentence(
        `LinkedIn Pinpoint #${puzzleNumber} resolves through ${lowerFirst(connectorSummary)}. The explicit answer is "${mainAnswer}", with ${lowerFirst(stripQuotes(turningPointLabel))} serving as the turning point.`,
      ),
      heroSummary,
      seoTitle: buildPinpointTitle(puzzleNumber, clues),
      seoDescription: buildPinpointDescription(puzzleNumber, clues),
      seoKeywords: [],
      tags: clues.slice(0, 5),
      llmTemplateVersion: LLM_TEMPLATE_VERSION,
    },
    slots: {
      heroIntroSpoilerSafe: heroSummary,
      connectorSummary,
      turningPoint: stripQuotes(turningPoint),
      falseStarts,
      rejectedGuess: slots.rejectedGuess,
      clueDetails,
      difficultyReason: stripQuotes(difficultyReason),
      portableTakeaway: stripQuotes(portableTakeaway),
    },
  };
}

function validateAndFixGeneratedContent(
  parsed: ParsedAIResponse,
  puzzleData?: PuzzleDataForAI,
): AIGeneratedContent {
  const normalized = parsed.slots ? composeFromSlots(parsed.slots, puzzleData) : { ...parsed };

  if (!normalized.sections) {
    throw new Error('AI response missing "sections" object');
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
      detailedBreakdown: normalized.sections.solutionEmergence || "",
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

  if (!normalized.analysis.llmTemplateVersion) {
    normalized.analysis.llmTemplateVersion = LLM_TEMPLATE_VERSION;
  }

  return normalized as AIGeneratedContent;
}
