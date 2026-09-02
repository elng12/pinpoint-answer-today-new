/**
 * Worker-side LLM module for puzzle enrichment.
 *
 * Call LLM APIs directly from the Worker so the 30-55s await fetch() wall
 * time does not count against Vercel Fluid CPU.
 *
 * This module is self-contained (no Node.js deps) so it runs in a Worker.
 * The prompt template, answer-pattern detection, and clue normalizer are
 * inlined from the Vercel lib/ tree.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnrichInput {
  puzzleNumber: number;
  rawWords: string[];
  mainAnswer: string;
}

export interface LLMOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export const LLM_MAX_OUTPUT_TOKENS = 8_192;

// ---------------------------------------------------------------------------
// Inlined from lib/puzzle-generation/answer-pattern.ts
// ---------------------------------------------------------------------------

type AnswerPattern =
  | { kind: "before"; token: string }
  | { kind: "after"; token: string }
  | { kind: "typed-category"; noun: string; singularNoun: string }
  | { kind: "category"; label: string };

function stripQuotes(value: string): string {
  return value.replace(/[""“”]/g, "");
}

function detectAnswerPattern(answer: string): AnswerPattern {
  const before = answer.match(/^Words that come before\s+["""]?(.+?)["""]?$/i);
  if (before?.[1]) return { kind: "before", token: before[1] };

  const after = answer.match(/^Words that come after\s+["""]?(.+?)["""]?$/i);
  if (after?.[1]) return { kind: "after", token: after[1] };

  const typedCategory = answer.match(/^(Types|Kinds)\s+of\s+(.+)$/i);
  if (typedCategory?.[2]) {
    const noun = typedCategory[2].replace(/["""]/g, "").trim();
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

    const singularNoun = [...words.slice(0, -1), singularLastWord].join(" ").trim();
    return { kind: "typed-category", noun, singularNoun: singularNoun || noun };
  }

  return { kind: "category", label: stripQuotes(answer).trim() || "the shared category" };
}

// ---------------------------------------------------------------------------
// Inlined from lib/puzzles/clue-normalizer.ts
// ---------------------------------------------------------------------------

interface NormalizedClue {
  original: string;
  normalized: string;
}

function normalizeClueForAI(clue: string): NormalizedClue {
  const original = clue.trim();
  let normalized = original;

  if (/\([^)]+\)/.test(normalized)) {
    normalized = normalized
      .replace(/\(like /gi, "similar to ")
      .replace(/\(such as /gi, "including ")
      .replace(/\(e\.g\. /gi, "for example ")
      .replace(/\(i\.e\. /gi, "that is ")
      .replace(/\(or /gi, "or ")
      .replace(/ \/ /g, " or ")
      .replace(/\|/g, " or ")
      .replace(/[()]/g, "");
  }

  normalized = normalized.replace(/^#(\d+)([A-Z])/, "#$1 $2");
  normalized = normalized.replace(/\s+/g, " ").trim();

  return { original, normalized };
}

// ---------------------------------------------------------------------------
// Constants inlined from lib/puzzles/slot-contract.ts and
// lib/puzzle-generation/prompt-builder.ts
// ---------------------------------------------------------------------------

const LLM_TEMPLATE_VERSION = "pinpoint-v9";

const LLM_SYSTEM_PROMPT = [
  'You write archive content for "Pinpoint Answer Today".',
  "Write like a sharp human solver replaying how the answer became clear.",
  "Do not sound like a teacher, analyst, glossary, or SEO filler writer.",
  "Prefer concrete solve-story language over abstract category language.",
  "Return JSON only.",
].join(" ");

const SLOT_CONTRACT = {
  heroIntroMinWords: 20,
  heroIntroMaxWords: 45,
  connectorSummaryMinWords: 6,
  connectorSummaryMaxWords: 16,
  clueDetailsRequired: 5,
} as const;

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

export function buildPuzzlePrompt(input: EnrichInput): string {
  const normalizedClues = input.rawWords.map((clue) => normalizeClueForAI(clue));
  const clues = normalizedClues.map((item) => item.normalized).join(", ");
  const originalClues = input.rawWords.join(", ");
  const answerPattern = detectAnswerPattern(input.mainAnswer);

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
- connectorSummary should be a short spoiler-safe category bridge, not a vague slogan.
- connectorSummary must stay plain and natural. Do NOT use slashes, parentheses, stacked qualifiers, or over-explained labels.
- connectorSummary must sound like a plain UI label, not a joke, twist, contrast line, or conversational aside.
- clueDetails.phrase should usually be a short Phrase / Example label inside the category, not just the clue repeated.
- If the answer is "Types of X", clueDetails.phrase should usually end with the category noun when natural.
- If a clue is already a recognizable title, brand, publication, or named entity, keep clueDetails.phrase close to that clue instead of swapping in a generic subtype label.
- whyItWorks should explain why each clue belongs in the category.
- falseStarts must be broad, realistic category guesses like newspapers, media brands, travel publications, or nature media. Do NOT use city names, one-off titles, or long awkward labels.
- falseStarts must not sound like retail taxonomy, ecommerce filters, or audience segments. Avoid phrases like gifts for adults, products for..., items for..., or categories for...
- If three or more clues already point toward the same everyday category, keep the solve narrative calm and straightforward instead of forcing extra drama.
`.trim();

  return `
You are a senior content writer for "Pinpoint Answer Today". Use the V9 Article Slot Template.

Output ONLY a valid JSON object.

Minimum required shape:
{
  "pageExperienceMode": "full-analysis",
  "wrongGuessCandidates": [
    {
      "label": "...",
      "whyPlausible": "...",
      "whyRejected": "..."
    }
  ],
  "setValidationSummary": "...",
  "categoryPrecisionNote": "...",
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
  },
  "sections": {
    "articleBlocks": ["...", "..."]
  }
}

Required structured publish fields at the root:
- "pageExperienceMode"
- "wrongGuessCandidates"
- "setValidationSummary"
- "categoryPrecisionNote"

Also include these v2 evidence fields at the root when you can fill them cleanly:
- "questionType"
- "difficultyBand"
- "solvePath"
- "turningPoint"
- "clueRows"
- "faqItems"
- "uniquenessSignals"

For each clueRows item, include clue, surfaceMisread, resolvedPhraseOrMember, phraseExample, nonObviousWhy, and searchableContext. phraseExample should be a short phrase or example that proves the clue fit, such as "apple tree", "chestnut tree", or "moss on tree bark"; do not simply repeat the clue.

Hard requirements:
1. heroIntroSpoilerSafe is the pre-reveal intro shown before the user chooses to reveal the answer.
2. heroIntroSpoilerSafe must be ${SLOT_CONTRACT.heroIntroMinWords} to ${SLOT_CONTRACT.heroIntroMaxWords} words and must NOT include the exact answer text: ${input.mainAnswer}
3. connectorSummary must be a short spoiler-safe label, ${SLOT_CONTRACT.connectorSummaryMinWords} to ${SLOT_CONTRACT.connectorSummaryMaxWords} words, and must NOT equal or quote the exact answer text.
4. turningPoint must name the clue or clue combination that forces the mental pivot, in one plain human sentence.
5. falseStarts must contain 1 or 2 plausible wrong reads or weak categories.
6. rejectedGuess.explanation must explain why that guess falls short.
7. Include exactly ${SLOT_CONTRACT.clueDetailsRequired} clueDetails items, one for each original clue in this exact set: ${originalClues}
8. Each clueDetails.clue must match one original clue exactly as written.
9. Each clueDetails.phrase must be a natural short phrase/example or category reading that is different from the clue when possible.
10. Each clueDetails.whyItWorks must explain specific logic, not just restate the final answer.
11. difficultyReason must explain why the board feels tricky without directly repeating the exact answer.
12. portableTakeaway must be one short practical lesson the solver can reuse tomorrow.
13. sections.articleBlocks must contain 8 to 14 short paragraphs.
14. Most articleBlocks paragraphs should be one sentence. Some can be two sentences. Avoid long blocks.
15. articleBlocks must include one believable wrong read, one clean turning clue, one explicit answer reveal, and a resolved closing line.
16. pageExperienceMode should be "full-analysis" for this long-form draft.
17. wrongGuessCandidates must describe believable nearby reads:
   - if difficultyBand is "obvious", include at least 1 candidate
   - if difficultyBand is "medium" or "hard", include at least 2 candidates
   - each candidate needs label and whyPlausible, and whyRejected when it helps
18. wrongGuessCandidates.label must sound like a human's early guess in 2 to 6 plain words. Do not use machine labels like "broader umbrella topic" or "one-clue surface theme".
19. If you include root turningPoint, turningPoint.whyDecisive and turningPoint.whatChangedAfterIt must each be at least 8 words.
20. setValidationSummary must explain why the full clue set confirms one answer more cleanly than the nearby wrong reads.
21. categoryPrecisionNote must explain the exact level of precision, not just repeat the answer.
22. Output raw JSON only, no markdown.

Primary writing goal:
- Build the source material for a short archive article, not a report.
- Think in this order: first impression -> wrong direction -> contradiction -> turning clue -> answer -> hindsight clarity.

Writing rules:
- Separate page reveal from explanation. The reveal card owns the first clear answer reveal on-page.
- Treat heroIntroSpoilerSafe as the short intro shown before the user chooses to reveal the answer.
- Do not sneak the exact answer into heroIntroSpoilerSafe, connectorSummary, turningPoint, difficultyReason, or falseStarts.
- Make the slots useful enough that a program can build a short article with believable movement.
- sections.articleBlocks should already read like a short article, not like analysis bullets.
- overview and solutionEmergence must feel different:
  - overview explains why the puzzle shape is misleading and why the final read is cleaner than nearby alternatives
  - solutionEmergence replays one believable solve path in first person
- The solve path should feel like a human replay:
  - one plausible early read
  - one moment where a later clue weakens that read
  - one turning clue that makes the answer concrete
- Prefer concrete language:
  - say "I first thought..." not "the board felt broad"
  - say "that theory broke" not "the frame shifted"
  - say "then X changed the solve" not "the category became specific enough"
- Write natural phrases a real solver might think of.
- Keep falseStarts concrete and everyday, not academic or machiney.
- Do not write teaser copy, hype copy, or ad-style openers.
- Avoid filler lines like:
  - X connects to...
  - X fits the theme
  - The clues all share this connection
  - Difficulty varies
  - This is the hallmark of a well-crafted puzzle
- Avoid overusing abstract words like board, frame, connector, category, pattern in every field.
- Prefer concrete phrase logic over broad vague category talk.

Slot guidance:
- heroIntroSpoilerSafe: a spoiler-safe hook about why the opening clues can mislead, without sounding generic.
- connectorSummary: a plain, compact bridge label the UI can use later. Keep it human.
- connectorSummary: write it like a calm editor label, not like copywriting.
- turningPoint: name the clue that forces the mental pivot. Keep it plain. Avoid phrases like "pattern click", "form factor", "alongside the others", or other writerly meta language.
- falseStarts: broad but believable wrong reads a person would really try first.
- rejectedGuess.explanation: explain why that guess breaks once the turning clue appears.
- clueDetails.surfaceRead: describe the distracting first impression of the clue in plain language.
- clueDetails.phrase: give the clean resolved phrase or category reading.
- clueDetails.whyItWorks: explain the fit specifically and concretely.
- sections.articleBlocks: write the actual article body in short paragraphs. Keep the voice human and specific.

${patternSpecificRules}

Input data:
- Puzzle #${input.puzzleNumber}
- Clues (normalized for reasoning): ${clues}
- Original clues (must preserve for SEO fields): ${originalClues}
- Answer: ${input.mainAnswer}
`.trim();
}

// ---------------------------------------------------------------------------
// LLM API client (OpenAI-compatible)
// ---------------------------------------------------------------------------

const AI_MAX_RETRIES = 3;
const AI_EMPTY_CONTENT_MAX_ATTEMPTS = 2;
const AI_RETRY_BASE_DELAY_MS = 800;
const AI_REQUEST_TIMEOUT_MS = 45_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTextWithRetry(
  url: string,
  init: RequestInit,
  debugLog?: (msg: string) => void,
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= AI_MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const responseText = await response.text();
      clearTimeout(timeoutId);

      if (response.ok) {
        if (attempt > 1) {
          debugLog?.(`[enrich-llm] AI request recovered after retry (attempt ${attempt})`);
        }
        return responseText;
      }

      const retryable =
        response.status === 408 ||
        response.status === 409 ||
        response.status === 425 ||
        response.status === 429 ||
        response.status >= 500;

      const error = new Error(
        `AI API Error: ${response.status} ${responseText.slice(0, 500)}`.trim(),
      );

      if (!retryable || attempt === AI_MAX_RETRIES) {
        throw error;
      }

      lastError = error;
      debugLog?.(`[enrich-llm] AI API error (attempt ${attempt}/${AI_MAX_RETRIES}): ${response.status}`);
      await sleep(AI_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    } catch (error) {
      clearTimeout(timeoutId);

      if (!(error instanceof Error)) {
        throw error;
      }

      const timedOut = controller.signal.aborted;
      const retryable =
        timedOut ||
        error.name === "AbortError" ||
        /timeout|timed out|aborted|network|fetch failed/i.test(error.message);

      if (!retryable || attempt === AI_MAX_RETRIES) {
        throw timedOut
          ? new Error(`AI request timed out after ${AI_REQUEST_TIMEOUT_MS}ms`)
          : error;
      }

      lastError = error;
      debugLog?.(`[enrich-llm] AI request failed (attempt ${attempt}/${AI_MAX_RETRIES}): ${error.message}`);
      await sleep(AI_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError ?? new Error("AI request failed after retries");
}

export async function callLLM(
  prompt: string,
  options: LLMOptions,
  debugLog?: (msg: string) => void,
): Promise<string> {
  const { apiKey, model, baseUrl } = options;

  let apiUrl = "https://api.openai.com/v1/chat/completions";
  if (baseUrl) {
    const parsed = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    apiUrl = parsed.pathname.endsWith("/chat/completions")
      ? parsed.toString()
      : new URL("chat/completions", parsed).toString();
  } else {
    apiUrl = "https://api.openai.com/v1/chat/completions";
  }

  const requestBody = buildLLMRequestBody(prompt, model);

  for (let contentAttempt = 1; contentAttempt <= AI_EMPTY_CONTENT_MAX_ATTEMPTS; contentAttempt += 1) {
    debugLog?.(
      `[enrich-llm] Calling AI API: ${apiUrl} model=${model}`,
    );

    const responseText = await fetchTextWithRetry(
      apiUrl,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      },
      debugLog,
    );

    let data: {
      choices?: Array<{
        finish_reason?: string | null;
        message?: { content?: string };
      }>;
    };
    try {
      data = JSON.parse(responseText) as typeof data;
    } catch (error) {
      throw new Error(
        `Failed to parse AI API response as JSON: ${
          (error as Error)?.message ?? "unknown"
        }. First 500 chars: ${responseText.slice(0, 500)}`,
      );
    }

    const choice = data.choices?.[0];
    if (choice?.finish_reason === "length") {
      throw new Error(
        `AI response was truncated at max_tokens=${LLM_MAX_OUTPUT_TOKENS}`,
      );
    }

    const content = choice?.message?.content;
    if (content && content.trim()) {
      return content;
    }

    if (contentAttempt < AI_EMPTY_CONTENT_MAX_ATTEMPTS) {
      debugLog?.(`[enrich-llm] Empty AI content returned; retrying (${contentAttempt}/${AI_EMPTY_CONTENT_MAX_ATTEMPTS})`);
      await sleep(AI_RETRY_BASE_DELAY_MS * contentAttempt);
      continue;
    }
  }

  throw new Error("No content returned from AI");
}

function isDeepSeekV4Model(model: string): boolean {
  return /^deepseek-v4-(?:flash|pro)(?:$|-)/i.test(model.trim());
}

export function buildLLMRequestBody(
  prompt: string,
  model: string,
): Record<string, unknown> {
  const requestBody: Record<string, unknown> = {
    messages: [
      { role: "system", content: LLM_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    max_tokens: LLM_MAX_OUTPUT_TOKENS,
    temperature: 0.7,
    model,
    stream: false,
  };

  // OpenAI-compatible models that we use in production support JSON object mode.
  if (
    model.includes("gpt-") ||
    model.includes("glm-") ||
    model.includes("gemini") ||
    model.includes("deepseek/") ||
    isDeepSeekV4Model(model) ||
    model.includes("llama")
  ) {
    requestBody.response_format = { type: "json_object" };
  }

  if (isDeepSeekV4Model(model)) {
    requestBody.thinking = { type: "disabled" };
  }

  return requestBody;
}

// ---------------------------------------------------------------------------
// JSON response parser (inlined from lib/puzzle-generation/response-parser.ts)
// ---------------------------------------------------------------------------

function stripMarkdownCodeFence(content: string): string {
  let text = content.trim().replace(/^﻿/, "");
  if (text.startsWith("```json")) {
    text = text.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  } else if (text.startsWith("```")) {
    text = text.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }
  return text.trim();
}

function extractFirstJSONObject(content: string): string | null {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (start === -1) start = index;
      depth += 1;
      continue;
    }

    if (char === "}" && start !== -1) {
      depth -= 1;
      if (depth === 0) return content.slice(start, index + 1);
    }
  }

  return null;
}

export function parseAIJsonResponse(content: string): Record<string, unknown> {
  const cleaned = stripMarkdownCodeFence(content);
  const extractedObject = extractFirstJSONObject(cleaned);
  const candidates =
    extractedObject && extractedObject !== cleaned
      ? [cleaned, extractedObject]
      : [cleaned];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as Record<string, unknown>;
    } catch {
      // try next candidate
    }
  }

  throw new Error(
    `Failed to parse AI response as JSON. First 500 chars: ${cleaned.slice(0, 500)}`,
  );
}

// ---------------------------------------------------------------------------
// Repair prompt builder
// ---------------------------------------------------------------------------

export function buildRepairPrompt(
  input: EnrichInput,
  previousResponse: Record<string, unknown>,
  issues: Array<{ message: string }>,
): string {
  const issueLines = issues.map((issue) => `- ${issue.message}`).join("\n");
  const previousJson = JSON.stringify(previousResponse, null, 2);
  const clues = input.rawWords.join(", ");

  return `
You are a senior content writer for "Pinpoint Answer Today". Use the V9 Article Slot Template.

The previous JSON failed validation for LinkedIn Pinpoint #${input.puzzleNumber}.

Fix these issues:
${issueLines}

Hard rules:
1. Output ONLY a valid JSON object.
2. Keep the puzzle data consistent:
   - Clues: ${clues}
   - Answer: ${input.mainAnswer}
3. overview must be at least 45 words.
4. solutionEmergence must be at least 40 words and use first-person voice.
5. sections.articleBlocks must contain 8 to 14 short paragraphs that read like a natural article.
6. seoTitle must include all five clues and not the answer.
7. seoDescription must include all five clues.
8. clueDetails must include exactly 5 items.
9. analysis.heroSummary must stay spoiler-safe and must not include the exact answer text.
10. overview must not open with the exact answer text or with "The answer is".
11. analysis.llmTemplateVersion must be "${LLM_TEMPLATE_VERSION}".
12. Include pageExperienceMode, wrongGuessCandidates, setValidationSummary, and categoryPrecisionNote at the root.
13. pageExperienceMode should stay "full-analysis" for this long-form repair.
14. If difficultyBand is "obvious", include at least 1 wrongGuessCandidates item. If difficultyBand is "medium" or "hard", include at least 2. Every item needs label and whyPlausible, and whyRejected when it helps.
15. Include questionType, difficultyBand, solvePath, turningPoint, clueRows, faqItems, and uniquenessSignals.
16. turningPoint.clue must name a real clue, clueRows must stay in clue order, and at least one faqItems entry must be clue-specific with tiedClue.
17. Each clueRows item should include phraseExample, and phraseExample should be a short fit-check phrase/example rather than the clue repeated.
18. wrongGuessCandidates.label must sound like a human's early guess in 2 to 6 plain words. Do not use machine labels like "broader umbrella topic" or "one-clue surface theme".
19. turningPoint.whyDecisive and turningPoint.whatChangedAfterIt must each be at least 8 words.
20. Keep the prose natural and article-like, not robotic or overly analytical.
21. Prefer one believable wrong read, one clear turning clue, and one explicit answer reveal in the body.

Previous JSON:
${previousJson}
`.trim();
}

// ---------------------------------------------------------------------------
// Top-level: generate a puzzle draft from the Worker
// ---------------------------------------------------------------------------

export interface EnrichResult {
  data: Record<string, unknown>;
  templateVersion: string;
}

export async function generatePuzzleDraft(
  input: EnrichInput,
  options: LLMOptions,
  debugLog?: (msg: string) => void,
): Promise<EnrichResult> {
  const prompt = buildPuzzlePrompt(input);
  const rawContent = await callLLM(prompt, options, debugLog);
  const data = parseAIJsonResponse(rawContent);

  return { data, templateVersion: LLM_TEMPLATE_VERSION };
}

export async function regeneratePuzzleDraft(
  input: EnrichInput,
  previousResponse: Record<string, unknown>,
  issues: Array<{ message: string }>,
  options: LLMOptions,
  debugLog?: (msg: string) => void,
): Promise<EnrichResult> {
  const repairPrompt = buildRepairPrompt(input, previousResponse, issues);
  const rawContent = await callLLM(repairPrompt, options, debugLog);
  const data = parseAIJsonResponse(rawContent);

  return { data, templateVersion: LLM_TEMPLATE_VERSION };
}
