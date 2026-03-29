import type { PuzzleProvider } from "@/lib/puzzle-generation/types";

type DebugLogger = (message: string, details?: Record<string, unknown>) => void;

type RequestAIResponseArgs = {
  prompt: string;
  apiKey: string;
  provider: PuzzleProvider;
  model: string;
  endpoint?: string;
  apiVersion?: string;
  systemPrompt: string;
  debugInfo?: DebugLogger;
  debugError?: DebugLogger;
};

const AI_MAX_RETRIES = 3;
const AI_RETRY_BASE_DELAY_MS = 800;
const AI_REQUEST_TIMEOUT_MS = 30_000;

function normalizeProviderText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
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

async function waitForRetry(
  attempt: number,
  context: Record<string, unknown>,
  debugInfo?: DebugLogger,
): Promise<void> {
  const delayMs = AI_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
  debugInfo?.("Retrying AI request", { ...context, attempt, delayMs });
  await sleep(delayMs);
}

async function fetchTextWithRetry(
  url: string,
  init: RequestInit,
  context: Record<string, unknown>,
  debugInfo?: DebugLogger,
  debugError?: DebugLogger,
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
          debugInfo?.("AI request recovered after retry", { ...context, attempt });
        }
        return responseText;
      }

      const error = new Error(`AI API Error: ${response.status} ${responseText.slice(0, 500)}`.trim());
      const retryable = isRetryableStatus(response.status);
      debugError?.("AI API error response", {
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
      await waitForRetry(attempt, context, debugInfo);
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
      debugError?.("AI request failed before response completed", {
        ...context,
        attempt,
        retryable,
        error: wrappedError.message,
      });
      await waitForRetry(attempt, context, debugInfo);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError ?? new Error("AI request failed after retries");
}

export function resolveDefaultModel(provider: PuzzleProvider, endpoint?: string): string {
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

export function ensureProviderModelCompatibility(
  provider: PuzzleProvider,
  model: string,
  endpoint?: string,
): void {
  const normalizedModel = normalizeProviderText(model).toLowerCase();
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

async function requestOpenAICompatibleContent({
  prompt,
  apiKey,
  provider,
  model,
  endpoint,
  apiVersion = "2024-02-15-preview",
  systemPrompt,
  debugInfo,
  debugError,
}: RequestAIResponseArgs): Promise<string> {
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
        content: systemPrompt,
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

  debugInfo?.("AI API request", { provider, model, apiUrl });
  const responseText = await fetchTextWithRetry(
    apiUrl,
    {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    },
    { provider, model, apiUrl },
    debugInfo,
    debugError,
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

  return content;
}

async function requestAnthropicContent({
  prompt,
  apiKey,
  model,
  endpoint = "https://api.anthropic.com/v1/messages",
  systemPrompt,
  debugInfo,
  debugError,
}: RequestAIResponseArgs): Promise<string> {
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
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
      }),
    },
    { provider: "anthropic", model, apiUrl: endpoint },
    debugInfo,
    debugError,
  );

  const data = JSON.parse(responseText) as { content?: Array<{ text?: string }> };
  const content = data.content?.[0]?.text;
  if (!content) {
    throw new Error("No content from Anthropic");
  }

  return content;
}

export async function requestAIResponseContent(args: RequestAIResponseArgs): Promise<string> {
  if (args.provider === "anthropic") {
    return requestAnthropicContent(args);
  }
  return requestOpenAICompatibleContent(args);
}
