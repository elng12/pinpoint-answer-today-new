import { appLogger } from "@/lib/logger";
import { normalizeClueForAI } from "@/lib/puzzles/clue-normalizer";

export interface PuzzleDataForAI {
  puzzleNumber: number;
  rawWords: string[];
  mainAnswer: string;
}

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
}

export type PuzzleGenerationOptions = {
  model?: string;
  apiEndpoint?: string;
  provider?: "openai" | "anthropic" | "zhipu" | "azure";
  apiVersion?: string;
};

const DEBUG = process.env.NODE_ENV === "development" || process.env.DEBUG_AI === "true";

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

  return `
You are a senior content writer for "Pinpoint Answer Today". Use the V4 Standard Template.

Output ONLY a valid JSON object with this exact shape:
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
    "seoTitle": "LinkedIn Pinpoint #${puzzleData.puzzleNumber}: ${originalClues}",
    "seoDescription": "...",
    "seoKeywords": [],
    "tags": ["...", "...", "...", "...", "..."],
    "llmTemplateVersion": "pinpoint-v4"
  }
}

Hard requirements:
1. overview must be at least 65 words.
2. solutionEmergence must be at least 90 words and use first-person voice with "I".
3. Include exactly 5 clueDetails items and each phrase must be different from the clue.
4. Include at least 3 lessons and 3 FAQs.
5. The first FAQ question must be "What is the answer to LinkedIn Pinpoint #${puzzleData.puzzleNumber}?"
6. The first FAQ answer must explicitly include the exact answer: ${puzzleData.mainAnswer}
7. seoTitle and seoDescription must include all 5 original clues exactly as written: ${originalClues}
8. seoKeywords must be an empty array.
9. Output raw JSON only, no markdown.

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
  const { provider = "openai", model = "gpt-4o-mini", apiEndpoint } = options;

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

function parseAIResponse(content: string): AIGeneratedContent {
  let jsonContent = content.trim();

  if (jsonContent.startsWith("```json")) {
    jsonContent = jsonContent.replace(/^```json\n?/, "").replace(/\n?```$/, "");
  } else if (jsonContent.startsWith("```")) {
    jsonContent = jsonContent.replace(/^```\n?/, "").replace(/\n?```$/, "");
  }

  try {
    return JSON.parse(jsonContent) as AIGeneratedContent;
  } catch (error) {
    debugError("Failed to parse AI JSON", {
      error: error instanceof Error ? error.message : String(error),
      preview: jsonContent.slice(0, 1000),
    });
    throw new Error(`Failed to parse JSON content: ${(error as Error)?.message ?? "unknown"}`);
  }
}

function validateAndFixGeneratedContent(
  parsed: Partial<AIGeneratedContent>,
  puzzleData?: PuzzleDataForAI,
): AIGeneratedContent {
  if (!parsed.sections) {
    throw new Error('AI response missing "sections" object');
  }

  const requiredSections = ["overview", "solutionEmergence", "clueDetails", "lessons", "faqs"] as const;
  for (const field of requiredSections) {
    if (!parsed.sections[field]) {
      throw new Error(`AI response missing "sections.${field}"`);
    }
  }

  const puzzleNumber = puzzleData?.puzzleNumber || 0;
  const clues = puzzleData?.rawWords || [];
  const mainAnswer = puzzleData?.mainAnswer || "";

  if (!parsed.analysis) {
    parsed.analysis = {
      detailedBreakdown: parsed.sections.solutionEmergence || "",
      dailyDebrief: `The answer is ${mainAnswer}. The clues ${clues.join(", ")} all point to the same connector.`,
      heroSummary: `Looking for LinkedIn Pinpoint #${puzzleNumber}? Here are spoiler-safe hints for ${clues.slice(0, 3).join(", ")}.`,
      seoTitle: `LinkedIn Pinpoint #${puzzleNumber}: ${clues.join(", ")}`,
      seoDescription: `LinkedIn Pinpoint #${puzzleNumber} clues: ${clues.join(", ")}. Spoiler-safe hints and a walkthrough are included.`,
      seoKeywords: [],
      tags: clues.slice(0, 5),
      llmTemplateVersion: "pinpoint-v4",
    };
  }

  if (!parsed.analysis.seoTitle) {
    parsed.analysis.seoTitle = `LinkedIn Pinpoint #${puzzleNumber}: ${clues.join(", ")}`;
  }

  if (!parsed.analysis.seoDescription) {
    parsed.analysis.seoDescription = `LinkedIn Pinpoint #${puzzleNumber} clues: ${clues.join(", ")}. Spoiler-safe hints and a walkthrough are included.`;
  }

  return parsed as AIGeneratedContent;
}

