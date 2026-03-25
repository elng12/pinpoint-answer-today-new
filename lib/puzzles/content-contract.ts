import {
  collectSemanticLintIssues,
  PUBLISH_BLOCKING_SEMANTIC_CODES,
} from "@/lib/puzzles/semantic-lint";

export const CONTENT_CONTRACT = {
  overviewMinWords: 65,
  solutionEmergenceMinWords: 90,
  shortOverviewMinWords: 40,
  shortSolutionEmergenceMinWords: 70,
  summaryMinWords: 20,
  metaDescriptionMinChars: 115,
  metaDescriptionMaxChars: 165,
  clueDetailsRequired: 5,
  lessonsMin: 3,
  faqsMin: 3,
} as const;

export type ContentContractIssueLevel = "error" | "warning";

export type ContentContractIssue = {
  level: ContentContractIssueLevel;
  code: string;
  message: string;
  field?: string;
};

export type ContentContractInput = {
  puzzleNumber?: number;
  bodyMode?: "short" | "standard" | "deep" | null;
  locale?: string | null;
  rawWords?: string[];
  mainAnswer?: string | null;
  summary?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  overview?: string | null;
  solutionEmergence?: string | null;
  articleBlocks?: string[] | null;
  wrongGuesses?: Array<{ guess?: string | null; explanation?: string | null }> | null;
  clueDetails?: Array<{ clue?: string | null; phrase?: string | null; explanation?: string | null }> | null;
  lessons?: Array<{ title?: string | null; body?: string | null }> | null;
  faqs?: Array<{ question?: string | null; answer?: string | null }> | null;
  trivia?: string | null;
  llmTemplateVersion?: string | null;
};

const ACCEPTED_TEMPLATE_VERSIONS = new Set(["pinpoint-v5", "pinpoint-v6", "pinpoint-v7", "pinpoint-v8", "pinpoint-v9"]);

export function countWords(text: string | null | undefined): number {
  return (text?.trim().match(/\S+/g) ?? []).length;
}

function pluralizeLastWord(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const words = trimmed.split(/\s+/);
  const lastWord = words[words.length - 1] || trimmed;
  const irregularPlurals: Record<string, string> = {
    mouse: "mice",
    goose: "geese",
    tooth: "teeth",
    foot: "feet",
    man: "men",
    woman: "women",
    person: "people",
    child: "children",
  };

  let pluralLastWord = lastWord;
  const lowerLastWord = lastWord.toLowerCase();
  if (irregularPlurals[lowerLastWord]) {
    pluralLastWord = irregularPlurals[lowerLastWord];
  } else if (/ies$/i.test(lastWord) || /s$/i.test(lastWord)) {
    pluralLastWord = lastWord;
  } else if (/[^aeiou]y$/i.test(lastWord)) {
    pluralLastWord = `${lastWord.slice(0, -1)}ies`;
  } else if (/(ch|sh|x|z|s)$/i.test(lastWord)) {
    pluralLastWord = `${lastWord}es`;
  } else {
    pluralLastWord = `${lastWord}s`;
  }

  return [...words.slice(0, -1), pluralLastWord].join(" ").trim();
}

export function normalizeAnswerLabel(answer: string | null | undefined): string {
  const normalized = (answer ?? "")
    .replace(/["“”]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/, "");
  const typedCategory = normalized.match(/^(Types|Kinds)\s+of\s+(.+)$/i);
  if (!typedCategory?.[2]) {
    return normalized;
  }
  const prefix = typedCategory[1];
  const noun = typedCategory[2].trim();
  return `${prefix} of ${pluralizeLastWord(noun)}`.trim();
}

function normalizeText(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function normalizeForMatch(text: string | null | undefined): string {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveContentBodyMode(input: ContentContractInput): "short" | "standard" | "deep" {
  if (input.bodyMode === "short" || input.bodyMode === "standard" || input.bodyMode === "deep") {
    return input.bodyMode;
  }

  const articleBlockCount = Array.isArray(input.articleBlocks) ? input.articleBlocks.filter(Boolean).length : 0;
  if (articleBlockCount > 0 && articleBlockCount <= 6) {
    return "short";
  }

  return "standard";
}

export function getContentContractThresholds(input: ContentContractInput) {
  const bodyMode = resolveContentBodyMode(input);
  return {
    bodyMode,
    overviewMinWords:
      bodyMode === "short" ? CONTENT_CONTRACT.shortOverviewMinWords : CONTENT_CONTRACT.overviewMinWords,
    solutionEmergenceMinWords:
      bodyMode === "short"
        ? CONTENT_CONTRACT.shortSolutionEmergenceMinWords
        : CONTENT_CONTRACT.solutionEmergenceMinWords,
  };
}

export function validateContentContract(input: ContentContractInput): ContentContractIssue[] {
  const issues: ContentContractIssue[] = [];
  const thresholds = getContentContractThresholds(input);
  const puzzleNumber = input.puzzleNumber ?? 0;
  const rawWords = (input.rawWords ?? []).map((word) => normalizeText(word)).filter(Boolean);
  const mainAnswer = normalizeAnswerLabel(input.mainAnswer ?? "");

  if (puzzleNumber <= 0) {
    issues.push({
      level: "error",
      code: "puzzleNumber.missing",
      message: "Puzzle number is missing or invalid",
      field: "puzzleNumber",
    });
  }

  if (rawWords.length !== 5) {
    issues.push({
      level: "error",
      code: "rawWords.count",
      message: "Exactly 5 clues are required",
      field: "rawWords",
    });
  } else if (new Set(rawWords.map((word) => word.toLowerCase())).size !== 5) {
    issues.push({
      level: "error",
      code: "rawWords.duplicate",
      message: "Clues must be unique",
      field: "rawWords",
    });
  }

  if (!mainAnswer) {
    issues.push({
      level: "error",
      code: "mainAnswer.missing",
      message: "Main answer is required",
      field: "mainAnswer",
    });
  }

  const overviewWords = countWords(input.overview);
  if (overviewWords < thresholds.overviewMinWords) {
    issues.push({
      level: "error",
      code: "overview.tooShort",
      message: `Overview too short: ${overviewWords}`,
      field: "overview",
    });
  }

  const solutionWords = countWords(input.solutionEmergence);
  if (solutionWords < thresholds.solutionEmergenceMinWords) {
    issues.push({
      level: "error",
      code: "solutionEmergence.tooShort",
      message: `Solution emergence too short: ${solutionWords}`,
      field: "solutionEmergence",
    });
  } else if (thresholds.bodyMode !== "short" && !/\bI\b/.test(normalizeText(input.solutionEmergence))) {
    issues.push({
      level: "warning",
      code: "solutionEmergence.voice",
      message: 'Solution emergence should use first-person voice with "I"',
      field: "solutionEmergence",
    });
  }

  const seoTitle = normalizeText(input.seoTitle);
  if (!seoTitle) {
    issues.push({
      level: "error",
      code: "seoTitle.missing",
      message: "SEO title is required",
      field: "seoTitle",
    });
  } else {
    const normalizedTitle = normalizeForMatch(seoTitle);
    const missingTitleClues = rawWords.filter((word) => !normalizedTitle.includes(normalizeForMatch(word)));
    if (missingTitleClues.length > 0) {
      issues.push({
        level: "error",
        code: "seoTitle.missingClues",
        message: `SEO title is missing clues: ${missingTitleClues.join(", ")}`,
        field: "seoTitle",
      });
    }
  }

  const seoDescription = normalizeText(input.seoDescription);
  if (!seoDescription) {
    issues.push({
      level: "error",
      code: "seoDescription.missing",
      message: "SEO description is required",
      field: "seoDescription",
    });
  } else {
    const len = seoDescription.length;
    if (len < CONTENT_CONTRACT.metaDescriptionMinChars) {
      issues.push({
        level: "error",
        code: "seoDescription.tooShort",
        message: `SEO description too short: ${len}`,
        field: "seoDescription",
      });
    }
    const normalizedDesc = normalizeForMatch(seoDescription);
    const missingDescClues = rawWords.filter((word) => !normalizedDesc.includes(normalizeForMatch(word)));
    if (missingDescClues.length > 0) {
      issues.push({
        level: "error",
        code: "seoDescription.missingClues",
        message: `SEO description is missing clues: ${missingDescClues.join(", ")}`,
        field: "seoDescription",
      });
    }
  }

  const clueDetails = input.clueDetails ?? null;
  if (!Array.isArray(clueDetails) || clueDetails.length !== CONTENT_CONTRACT.clueDetailsRequired) {
    issues.push({
      level: "error",
      code: "clueDetails.count",
      message: `Exactly ${CONTENT_CONTRACT.clueDetailsRequired} clue details are required`,
      field: "clueDetails",
    });
  } else {
    const missingAny = clueDetails.some((detail) => {
      const clue = normalizeText(detail?.clue);
      const phrase = normalizeText(detail?.phrase);
      const explanation = normalizeText(detail?.explanation);
      return !clue || !phrase || !explanation;
    });
    if (missingAny) {
      issues.push({
        level: "error",
        code: "clueDetails.missingFields",
        message: "Each clue detail must include clue, phrase, and explanation",
        field: "clueDetails",
      });
    }
  }

  if (input.llmTemplateVersion && !ACCEPTED_TEMPLATE_VERSIONS.has(input.llmTemplateVersion)) {
    issues.push({
      level: "warning",
      code: "llmTemplateVersion.mismatch",
      message: `Unexpected template version: ${input.llmTemplateVersion}`,
      field: "llmTemplateVersion",
    });
  }

  const semanticIssues = collectSemanticLintIssues({
    locale: input.locale,
    mainAnswer: input.mainAnswer,
    summary: input.summary,
    seoDescription: input.seoDescription,
    overview: input.overview,
    solutionEmergence: input.solutionEmergence,
    articleBlocks: input.articleBlocks ?? null,
    wrongGuesses: input.wrongGuesses ?? null,
    faqs: input.faqs ?? null,
    clueDetails: input.clueDetails ?? null,
    lessons: input.lessons ?? null,
  });

  semanticIssues.forEach((issue) => {
    issues.push({
      level: "warning",
      code: issue.code,
      message: issue.message,
      field: issue.field,
    });
  });

  return issues;
}

export function promotePublishBlockingIssues(
  issues: ContentContractIssue[],
): ContentContractIssue[] {
  return issues.map((issue) => {
    if (issue.level === "warning" && PUBLISH_BLOCKING_SEMANTIC_CODES.has(issue.code)) {
      return {
        ...issue,
        level: "error",
      };
    }
    return issue;
  });
}
