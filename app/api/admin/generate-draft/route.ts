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
  return { kind: "category" };
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
  next.sections = nextSections;
  next.analysis = nextAnalysis;

  const puzzleNumber = Number(puzzleData.puzzleNumber);
  const label = normalizeAnswerLabel(puzzleData.mainAnswer) || "the shared idea";

  if (!asString(nextAnalysis.llmTemplateVersion)) nextAnalysis.llmTemplateVersion = LLM_TEMPLATE_VERSION;
  if (!asString(nextAnalysis.seoTitle)) {
    nextAnalysis.seoTitle = buildPinpointTitle(puzzleNumber, puzzleData.rawWords);
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
        `Once I verified all five clues, I knew ${label} was the correct final connector.`,
      ],
    );
  }

  const seoDescription = asString(nextAnalysis.seoDescription)
    ? normalizeWhitespace(asString(nextAnalysis.seoDescription)!)
    : "";
  if (seoDescription.length < CONTENT_CONTRACT.metaDescriptionMinChars) {
    nextAnalysis.seoDescription = buildPinpointDescription(puzzleNumber, puzzleData.rawWords);
  } else {
    nextAnalysis.seoDescription = clampToMaxChars(seoDescription, CONTENT_CONTRACT.metaDescriptionMaxChars);
  }

  if (!Array.isArray(nextAnalysis.seoKeywords) || nextAnalysis.seoKeywords.length > 0) {
    nextAnalysis.seoKeywords = [];
  }

  const heroSummary = asString(nextAnalysis.heroSummary) ?? "";
  const normalizedLabel = normalizeAnswerLabel(puzzleData.mainAnswer);
  const normalizedHeroSummary = normalizeWhitespace(heroSummary).replace(/["“”]/g, "");
  if (
    !heroSummary ||
    (normalizedLabel && normalizedHeroSummary.toLowerCase().includes(normalizedLabel.toLowerCase()))
  ) {
    nextAnalysis.heroSummary =
      `LinkedIn Pinpoint #${puzzleNumber} opens with broad clues. Start with the spoiler-safe hints first, then reveal the final connector when you want the full solve.`;
  }

  if (!asString(nextSections.trivia)) {
    nextSections.trivia =
      "Did you know? Connector puzzles often depend on one repeatable rule that makes every clue read naturally.";
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
