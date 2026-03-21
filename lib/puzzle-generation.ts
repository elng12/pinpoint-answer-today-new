import { appLogger } from "@/lib/logger";
import { normalizeClueForAI } from "@/lib/puzzles/clue-normalizer";
import {
  SLOT_CONTRACT,
  type PuzzleSlotClueDetail,
  type PuzzleSlotContractData,
  validateSlotContract,
} from "@/lib/puzzles/slot-contract";
import { buildPinpointDescription, buildPinpointTitle } from "@/lib/seo/pinpoint";
import { z } from "zod";

export interface PuzzleDataForAI {
  puzzleNumber: number;
  rawWords: string[];
  mainAnswer: string;
}

export type AIGeneratedSlots = PuzzleSlotContractData;

type SlotClueDetail = PuzzleSlotClueDetail;

export interface AIGeneratedContent {
  sections: {
    articleBlocks?: string[];
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

const ParsedRejectedGuessSchema = z.object({
  guess: z.string().trim().min(1),
  explanation: z.string().trim().min(1),
});

const ParsedSlotClueDetailSchema = z.object({
  clue: z.string().trim().min(1),
  surfaceRead: z.string().trim().min(1),
  phrase: z.string().trim().min(1),
  whyItWorks: z.string().trim().min(1),
  etymology: z.string().trim().min(1).optional(),
});

const ParsedSlotsSchema = z.object({
  heroIntroSpoilerSafe: z.string().trim().min(1).optional(),
  connectorSummary: z.string().trim().min(1).optional(),
  turningPoint: z.string().trim().min(1).optional(),
  falseStarts: z.array(z.string().trim().min(1)).optional(),
  rejectedGuess: ParsedRejectedGuessSchema.optional(),
  clueDetails: z.array(ParsedSlotClueDetailSchema).optional(),
  difficultyReason: z.string().trim().min(1).optional(),
  portableTakeaway: z.string().trim().min(1).optional(),
});

const ParsedSectionsSchema = z.object({
  articleBlocks: z.array(z.string().trim().min(1)).optional(),
  overview: z.string().trim().min(1).optional(),
  solutionEmergence: z.string().trim().min(1).optional(),
  wrongGuesses: z.array(z.object({
    guess: z.string().trim().min(1),
    explanation: z.string().trim().min(1),
  })).optional(),
  clueDetails: z.array(z.object({
    clue: z.string().trim().min(1),
    phrase: z.string().trim().min(1),
    explanation: z.string().trim().min(1),
    etymology: z.string().trim().min(1).optional(),
  })).optional(),
  lessons: z.array(z.object({
    title: z.string().trim().min(1),
    body: z.string().trim().min(1),
  })).optional(),
  faqs: z.array(z.object({
    question: z.string().trim().min(1),
    answer: z.string().trim().min(1),
  })).optional(),
  trivia: z.string().trim().min(1).optional(),
}).optional();

const ParsedAnalysisSchema = z.object({
  detailedBreakdown: z.string().trim().min(1).optional(),
  dailyDebrief: z.string().trim().min(1).optional(),
  heroSummary: z.string().trim().min(1).optional(),
  seoTitle: z.string().trim().min(1).optional(),
  seoDescription: z.string().trim().min(1).optional(),
  seoKeywords: z.array(z.string().trim().min(1)).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  llmTemplateVersion: z.string().trim().min(1).optional(),
}).optional();

const ParsedAIResponseSchema = z.object({
  slots: ParsedSlotsSchema.optional(),
  sections: ParsedSectionsSchema,
  analysis: ParsedAnalysisSchema,
}).refine((value) => Boolean(value.slots || value.sections), {
  message: 'AI response must include either "slots" or "sections".',
  path: ["slots"],
});

export type PuzzleGenerationOptions = {
  model?: string;
  apiEndpoint?: string;
  provider?: "openai" | "anthropic" | "zhipu" | "azure";
  apiVersion?: string;
};

const DEBUG = process.env.NODE_ENV === "development" || process.env.DEBUG_AI === "true";
const LLM_TEMPLATE_VERSION = "pinpoint-v9";
const AI_MAX_RETRIES = 3;
const AI_RETRY_BASE_DELAY_MS = 800;
const AI_REQUEST_TIMEOUT_MS = 30_000;
const LLM_SYSTEM_PROMPT = [
  'You write archive content for "Pinpoint Answer Today".',
  "Write like a sharp human solver replaying how the answer became clear.",
  "Do not sound like a teacher, analyst, glossary, or SEO filler writer.",
  "Prefer concrete solve-story language over abstract category language.",
  "Return JSON only.",
].join(" ");

function debugInfo(message: string, details?: Record<string, unknown>) {
  if (!DEBUG) return;
  appLogger.info(message, { component: "puzzle-generation", ...details });
}

function debugError(message: string, details?: Record<string, unknown>) {
  if (!DEBUG) return;
  appLogger.error(message, { component: "puzzle-generation", ...details });
}

function formatZodIssues(issues: z.ZodIssue[]): string {
  return issues
    .slice(0, 6)
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function isRetryableFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  if (error.name === "AbortError") return true;
  return (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("aborted") ||
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("econnreset") ||
    message.includes("socket hang up") ||
    message.includes("temporary")
  );
}

async function waitForRetry(attempt: number, context: Record<string, unknown>): Promise<void> {
  const delayMs = AI_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
  debugInfo("Retrying AI request", { ...context, attempt, delayMs });
  await sleep(delayMs);
}

async function fetchTextWithRetry(
  url: string,
  init: RequestInit,
  context: Record<string, unknown>,
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
          debugInfo("AI request recovered after retry", { ...context, attempt });
        }
        return responseText;
      }

      const error = new Error(
        `AI API Error: ${response.status} ${responseText.slice(0, 500)}`.trim(),
      );
      const retryable = isRetryableStatus(response.status);
      debugError("AI API error response", {
        ...context,
        attempt,
        status: response.status,
        retryable,
        errorTextHead: responseText.slice(0, 500),
      });

      if (!retryable || attempt === AI_MAX_RETRIES) {
        throw error;
      }

      lastError = error;
      await waitForRetry(attempt, context);
    } catch (error) {
      clearTimeout(timeoutId);
      const timedOut = controller.signal.aborted;
      const wrappedError =
        timedOut
          ? new Error(`AI request timed out after ${AI_REQUEST_TIMEOUT_MS}ms`)
          : error instanceof Error
            ? error
            : new Error(String(error));
      const retryable = timedOut || isRetryableFetchError(wrappedError);

      if (!retryable || attempt === AI_MAX_RETRIES) {
        throw wrappedError;
      }

      lastError = wrappedError;
      debugError("AI request failed before response completed", {
        ...context,
        attempt,
        retryable,
        error: wrappedError.message,
      });
      await waitForRetry(attempt, context);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError ?? new Error("AI request failed after retries");
}

function stripMarkdownCodeFence(content: string): string {
  let text = content.trim().replace(/^\uFEFF/, "");
  if (text.startsWith("```json")) {
    text = text.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  } else if (text.startsWith("```")) {
    text = text.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }
  return text.trim();
}

function resolveDefaultModel(provider: PuzzleGenerationOptions["provider"], endpoint?: string): string {
  if (provider === "anthropic") {
    return "claude-3-5-sonnet-20241022";
  }
  if (provider === "zhipu") {
    return "glm-4-plus";
  }
  if (provider === "azure") {
    return "gpt-4.1-mini";
  }
  return endpoint ? "google/gemini-2.0-flash-001" : "gpt-4.1-mini";
}

function ensureProviderModelCompatibility(
  provider: PuzzleGenerationOptions["provider"],
  model: string,
  endpoint?: string,
): void {
  const normalizedModel = normalizeText(model).toLowerCase();
  if (!normalizedModel) return;
  if (provider === "openai" && !endpoint) {
    const clearlyNonOpenAIModel =
      normalizedModel.startsWith("google/") ||
      normalizedModel.startsWith("gemini") ||
      normalizedModel.startsWith("anthropic/") ||
      normalizedModel.startsWith("claude") ||
      normalizedModel.startsWith("glm-");
    if (clearlyNonOpenAIModel) {
      throw new Error(
        `Model "${model}" is not compatible with the official OpenAI endpoint. Set an OpenAI-compatible base URL or switch to a gpt-* model.`,
      );
    }
  }
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
      if (start === -1) {
        start = index;
      }
      depth += 1;
      continue;
    }

    if (char === "}" && start !== -1) {
      depth -= 1;
      if (depth === 0) {
        return content.slice(start, index + 1);
      }
    }
  }

  return null;
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
- connectorSummary should be a short spoiler-safe category bridge, not a vague slogan.
- connectorSummary must stay plain and natural. Do NOT use slashes, parentheses, stacked qualifiers, or over-explained labels.
- connectorSummary must sound like a plain UI label, not a joke, twist, contrast line, or conversational aside.
- clueDetails.phrase should usually be a natural member label inside the category.
- If the answer is "Types of X", clueDetails.phrase should usually end with the category noun when natural.
- If a clue is already a recognizable title, brand, publication, or named entity, keep clueDetails.phrase close to that clue instead of swapping in a generic subtype label.
- whyItWorks should explain why each clue belongs in the category.
- falseStarts must be broad, realistic category guesses like newspapers, media brands, travel publications, or nature media. Do NOT use city names, one-off titles, or long awkward labels.
- falseStarts must not sound like retail taxonomy, ecommerce filters, or audience segments. Avoid phrases like gifts for adults, products for..., items for..., or categories for...
- If three or more clues already point toward the same everyday category, keep the solve narrative calm and straightforward instead of forcing extra drama.
`.trim();

  return `
You are a senior content writer for "Pinpoint Answer Today". Use the V9 Article Slot Template.

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
  },
  "sections": {
    "articleBlocks": ["...", "..."]
  }
}

Hard requirements:
1. heroIntroSpoilerSafe is the pre-reveal intro shown before the user chooses to reveal the answer.
2. heroIntroSpoilerSafe must be ${SLOT_CONTRACT.heroIntroMinWords} to ${SLOT_CONTRACT.heroIntroMaxWords} words and must NOT include the exact answer text: ${puzzleData.mainAnswer}
3. connectorSummary must be a short spoiler-safe label, ${SLOT_CONTRACT.connectorSummaryMinWords} to ${SLOT_CONTRACT.connectorSummaryMaxWords} words, and must NOT equal or quote the exact answer text.
4. turningPoint must name the clue or clue combination that forces the mental pivot, in one plain human sentence.
5. falseStarts must contain 1 or 2 plausible wrong reads or weak categories.
6. rejectedGuess.explanation must explain why that guess falls short.
7. Include exactly ${SLOT_CONTRACT.clueDetailsRequired} clueDetails items, one for each original clue in this exact set: ${originalClues}
8. Each clueDetails.clue must match one original clue exactly as written.
9. Each clueDetails.phrase must be a natural phrase or category reading that is different from the clue.
10. Each clueDetails.whyItWorks must explain specific logic, not just restate the final answer.
11. difficultyReason must explain why the board feels tricky without directly repeating the exact answer.
12. portableTakeaway must be one short practical lesson the solver can reuse tomorrow.
13. sections.articleBlocks must contain 8 to 14 short paragraphs.
14. Most articleBlocks paragraphs should be one sentence. Some can be two sentences. Avoid long blocks.
15. articleBlocks must include one believable wrong read, one clean turning clue, one explicit answer reveal, and a resolved closing line.
16. Output raw JSON only, no markdown.

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
- Puzzle #${puzzleData.puzzleNumber}
- Clues (normalized for reasoning): ${clues}
- Original clues (must preserve for SEO fields): ${originalClues}
- Answer: ${puzzleData.mainAnswer}
`.trim();
}

export async function generatePuzzleContent(
  puzzleData: PuzzleDataForAI,
  apiKey: string,
  options: PuzzleGenerationOptions = {},
): Promise<AIGeneratedContent> {
  return generatePuzzleContentFromPrompt(buildPuzzlePrompt(puzzleData), apiKey, options, puzzleData);
}

export function buildDeterministicPuzzleContent(
  puzzleData: PuzzleDataForAI,
  slots: Partial<AIGeneratedSlots> = {},
): AIGeneratedContent {
  return composeFromSlots(slots, puzzleData);
}

export async function generatePuzzleContentFromPrompt(
  prompt: string,
  apiKey: string,
  options: PuzzleGenerationOptions = {},
  puzzleData?: PuzzleDataForAI,
): Promise<AIGeneratedContent> {
  const { provider = "openai", apiEndpoint } = options;
  const model = normalizeText(options.model) || resolveDefaultModel(provider, apiEndpoint);
  ensureProviderModelCompatibility(provider, model, apiEndpoint);

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
    const azureUrl = new URL(
      `/openai/deployments/${model}/chat/completions`,
      endpoint.endsWith("/") ? endpoint : `${endpoint}/`,
    );
    azureUrl.searchParams.set("api-version", apiVersion);
    apiUrl = azureUrl.toString();
    headers["api-key"] = apiKey;
  } else {
    headers.authorization = `Bearer ${apiKey}`;
    if (endpoint) {
      const baseUrl = new URL(endpoint.endsWith("/") ? endpoint : `${endpoint}/`);
      apiUrl = baseUrl.pathname.endsWith("/chat/completions")
        ? baseUrl.toString()
        : new URL("chat/completions", baseUrl).toString();
    }
  }

  const requestBody: Record<string, unknown> = {
    messages: [
      {
        role: "system",
        content: LLM_SYSTEM_PROMPT,
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
  const responseText = await fetchTextWithRetry(
    apiUrl,
    {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    },
    { provider, model, apiUrl },
  );
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
  const responseText = await fetchTextWithRetry(
    endpoint,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: LLM_SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      }),
    },
    { provider: "anthropic", model, apiUrl: endpoint },
  );

  const data = JSON.parse(responseText) as { content?: Array<{ text?: string }> };
  const content = data.content?.[0]?.text;
  if (!content) {
    throw new Error("No content from Anthropic");
  }

  return validateAndFixGeneratedContent(parseAIResponse(content), puzzleData);
}

function parseAIResponse(content: string): ParsedAIResponse {
  const cleaned = stripMarkdownCodeFence(content);
  const extractedObject = extractFirstJSONObject(cleaned);
  const candidates = extractedObject && extractedObject !== cleaned ? [cleaned, extractedObject] : [cleaned];
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as ParsedAIResponse;
    } catch (error) {
      lastError = error;
    }
  }

  debugError("Failed to parse AI JSON", {
    error: lastError instanceof Error ? lastError.message : String(lastError),
    preview: cleaned.slice(0, 1000),
    extractedPreview: extractedObject?.slice(0, 1000),
  });
  throw new Error(`Failed to parse JSON content: ${(lastError as Error)?.message ?? "unknown"}`);
}

function validateParsedResponseShape(parsed: ParsedAIResponse): ParsedAIResponse {
  const result = ParsedAIResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`AI response shape invalid: ${formatZodIssues(result.error.issues)}`);
  }
  return result.data as ParsedAIResponse;
}

function validateParsedSlotsContract(
  parsedSlots: Partial<AIGeneratedSlots>,
  puzzleData?: PuzzleDataForAI,
): Partial<AIGeneratedSlots> {
  const result = ParsedSlotsSchema.safeParse(parsedSlots);
  if (!result.success) {
    throw new Error(`AI slots shape invalid: ${formatZodIssues(result.error.issues)}`);
  }

  if (!puzzleData) {
    return result.data as Partial<AIGeneratedSlots>;
  }

  const slotIssues = validateSlotContract({
    rawWords: puzzleData.rawWords,
    mainAnswer: puzzleData.mainAnswer,
    slots: result.data as Partial<AIGeneratedSlots>,
  });
  if (slotIssues.length > 0) {
    debugInfo("AI slots contract issues", {
      issues: slotIssues.map((issue) => `${issue.level}:${issue.code}:${issue.field ?? "root"}`),
      puzzleNumber: puzzleData.puzzleNumber,
    });
  }

  return result.data as Partial<AIGeneratedSlots>;
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

function detectAnswerPattern(answer: string): AnswerPattern {
  const before = answer.match(/^Words that come before\s+["“]?(.+?)["”]?$/i);
  if (before?.[1]) return { kind: "before", token: before[1] };
  const after = answer.match(/^Words that come after\s+["“]?(.+?)["”]?$/i);
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
    return "a repeated-word phrase pattern with one missing term";
  }
  if (pattern.kind === "typed-category") {
    return "different forms of one everyday object";
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
  if (looksSuspiciousConnectorSummary(text)) return false;
  if (connectorSummaryLeaksAnswer(text, answer)) return false;
  return true;
}

function buildCategoryReading(answer: string): string {
  const pattern = detectAnswerPattern(answer);
  if (pattern.kind === "typed-category") {
    return `reading them as ${pattern.noun.toLowerCase()}`;
  }
  const displayLabel = extractCategoryDisplayLabel(answer);
  if (displayLabel) {
    return `reading them as ${displayLabel}`;
  }
  return "reading them as one clean category";
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
  const displayLabel = extractCategoryDisplayLabel(answer);
  if (displayLabel) {
    return `The connection is that ${cluePhrase} fit under ${displayLabel}.`;
  }
  return `The connection is that ${cluePhrase} belong in the same category.`;
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
  const displayLabel = extractCategoryDisplayLabel(answer);
  return displayLabel || "one specific category";
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
    `${openingClues} first pulled me toward ${firstGuess}, so that was the first path I tested. It held together for a moment, but ${turningPointReference(turningPointLabel)} never really fit it.`,
  );
  const paragraphTwo =
    answerPattern.kind === "before" || answerPattern.kind === "after"
      ? ensureSentence(
          `The solve turned when I let ${turningPointReference(turningPointLabel)} lead instead of treating it like an outlier. Once that clue exposed the missing word, readings like ${formatNaturalList(buildRepresentativeReadings(clueDetails, answer, 2))} started to sound exact, which was when the answer locked in.`,
        )
      : ensureSentence(
          `The solve turned when I stopped treating ${turningPointReference(turningPointLabel)} as just another clue and ${buildCategoryFocusQuestion(answer)}. Once I made that shift, I was no longer thinking about ${firstGuess}; I was thinking about ${answerFocus}. That was when the answer became clear.`,
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
  difficultyReason: string,
) {
  const answerPattern = detectAnswerPattern(puzzleData.mainAnswer);
  const clueCount = puzzleData.rawWords.length || SLOT_CONTRACT.clueDetailsRequired;
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
        `${turningPointSubject(turningPointLabel)} is the turning point because it narrows the board enough to make the earlier clues read cleanly instead of loosely. ${difficultyReason}`,
      ),
    },
  ];
}

function composeFromSlots(
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

  return {
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

function validateAndFixGeneratedContent(
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

  return normalized as AIGeneratedContent;
}
