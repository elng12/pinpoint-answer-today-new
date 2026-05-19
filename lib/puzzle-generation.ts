import {
  ensureProviderModelCompatibility,
  requestAIResponseContent,
  resolveDefaultModel,
} from "@/lib/puzzle-generation/provider-client";
import { parseAIJsonResponse } from "@/lib/puzzle-generation/response-parser";
import type {
  AIGeneratedContent,
  AIGeneratedSlots,
  ParsedAIResponse,
  PuzzleDataForAI,
  PuzzleGenerationOptions,
} from "@/lib/puzzle-generation/types";
import { debugError, debugInfo } from "@/lib/puzzle-generation/debug";
import { composeFromSlots, validateAndFixGeneratedContent } from "@/lib/puzzle-generation/content-composer";
import { buildPuzzlePrompt, LLM_SYSTEM_PROMPT } from "@/lib/puzzle-generation/prompt-builder";

export type {
  AIGeneratedContent,
  AIGeneratedSlots,
  PuzzleDataForAI,
  PuzzleGenerationOptions,
} from "@/lib/puzzle-generation/types";

export { buildPuzzlePrompt };

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export async function generatePuzzleContent(
  puzzleData: PuzzleDataForAI,
  apiKey: string,
  options: PuzzleGenerationOptions = {},
): Promise<AIGeneratedContent> {
  return generatePuzzleContentFromPrompt(
    buildPuzzlePrompt(puzzleData),
    apiKey,
    options,
    puzzleData,
  );
}

export function buildDeterministicPuzzleContent(
  puzzleData: PuzzleDataForAI,
  slots: Partial<AIGeneratedSlots> = {},
): AIGeneratedContent {
  return composeFromSlots(slots, puzzleData);
}

export function normalizeGeneratedPuzzleContent(
  parsed: unknown,
  puzzleData?: PuzzleDataForAI,
): AIGeneratedContent {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AI response missing JSON object");
  }

  return validateAndFixGeneratedContent(parsed as ParsedAIResponse, puzzleData);
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

  const content = await requestAIResponseContent({
    prompt,
    apiKey,
    provider,
    model,
    endpoint: apiEndpoint,
    apiVersion: options.apiVersion,
    systemPrompt: LLM_SYSTEM_PROMPT,
    debugInfo,
    debugError,
  });

  return validateAndFixGeneratedContent(
    parseAIJsonResponse<ParsedAIResponse>(content, debugError),
    puzzleData,
  );
}
