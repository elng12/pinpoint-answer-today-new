import { z } from "zod";

type DebugLogger = (message: string, details?: Record<string, unknown>) => void;

function stripMarkdownCodeFence(content: string): string {
  let text = content.trim().replace(/^\uFEFF/, "");
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
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
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

export function formatZodIssues(issues: z.ZodIssue[]): string {
  return issues
    .slice(0, 6)
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export function parseAIJsonResponse<T>(content: string, debugError?: DebugLogger): T {
  const cleaned = stripMarkdownCodeFence(content);
  const extractedObject = extractFirstJSONObject(cleaned);
  const candidates = extractedObject && extractedObject !== cleaned ? [cleaned, extractedObject] : [cleaned];
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch (error) {
      lastError = error;
    }
  }

  debugError?.("Failed to parse AI JSON", {
    error: lastError instanceof Error ? lastError.message : String(lastError),
    preview: cleaned.slice(0, 1000),
    extractedPreview: extractedObject?.slice(0, 1000),
  });
  throw new Error(`Failed to parse JSON content: ${(lastError as Error)?.message ?? "unknown"}`);
}

export function validateZodShape<T>(
  schema: z.ZodType<T>,
  value: unknown,
  errorPrefix: string,
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`${errorPrefix}: ${formatZodIssues(result.error.issues)}`);
  }
  return result.data;
}
