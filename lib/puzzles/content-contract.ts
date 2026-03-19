import {
  collectSemanticLintIssues,
  PUBLISH_BLOCKING_SEMANTIC_CODES,
} from "@/lib/puzzles/semantic-lint";

export const CONTENT_CONTRACT = {
  overviewMinWords: 65,
  solutionEmergenceMinWords: 90,
  summaryMinWords: 20,
  metaDescriptionMinChars: 115,
  metaDescriptionMaxChars: 165,
  clueDetailsRequired: 5,
  lessonsMin: 3,
  faqsMin: 3,
} as const;

export const SLOT_CONTRACT = {
  heroIntroMinWords: 20,
  heroIntroMaxWords: 45,
  connectorSummaryMinWords: 6,
  connectorSummaryMaxWords: 16,
  falseStartsMin: 1,
  falseStartsMax: 2,
  clueDetailsRequired: 5,
  difficultyReasonMinWords: 10,
  portableTakeawayMinWords: 6,
  portableTakeawayMaxWords: 28,
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
  locale?: string | null;
  rawWords?: string[];
  mainAnswer?: string | null;
  summary?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  overview?: string | null;
  solutionEmergence?: string | null;
  wrongGuesses?: Array<{ guess?: string | null; explanation?: string | null }> | null;
  clueDetails?: Array<{ clue?: string | null; phrase?: string | null; explanation?: string | null }> | null;
  lessons?: Array<{ title?: string | null; body?: string | null }> | null;
  faqs?: Array<{ question?: string | null; answer?: string | null }> | null;
  trivia?: string | null;
  llmTemplateVersion?: string | null;
};

export type SlotContractIssueLevel = ContentContractIssueLevel;
export type SlotContractIssue = ContentContractIssue;

export type PuzzleSlotRejectedGuess = {
  guess: string;
  explanation: string;
};

export type PuzzleSlotClueDetail = {
  clue: string;
  surfaceRead: string;
  phrase: string;
  whyItWorks: string;
  etymology?: string;
};

export type PuzzleSlotContractData = {
  heroIntroSpoilerSafe: string;
  connectorSummary: string;
  turningPoint: string;
  falseStarts: string[];
  rejectedGuess?: PuzzleSlotRejectedGuess;
  clueDetails: PuzzleSlotClueDetail[];
  difficultyReason: string;
  portableTakeaway: string;
};

export type SlotContractInput = {
  rawWords?: string[] | null;
  mainAnswer?: string | null;
  slots?: Partial<PuzzleSlotContractData> | null;
};

const ACCEPTED_TEMPLATE_VERSIONS = new Set(["pinpoint-v5", "pinpoint-v6", "pinpoint-v7"]);

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

function normalizeLoose(text: string | null | undefined): string {
  return normalizeText(text)
    .toLowerCase()
    .replace(/["“”'’()\-_,!?:.;/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForMatch(text: string | null | undefined): string {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsExactAnswer(text: string | null | undefined, answer: string | null | undefined): boolean {
  const normalizedText = normalizeLoose(text);
  const normalizedAnswer = normalizeLoose(answer);
  if (!normalizedText || !normalizedAnswer) return false;
  return normalizedText.includes(normalizedAnswer);
}

function countMentionedClues(text: string | null | undefined, clues: string[]): number {
  const normalizedText = normalizeLoose(text);
  if (!normalizedText) return 0;

  return clues.filter((clue) => {
    const normalizedClue = normalizeLoose(clue);
    return Boolean(normalizedClue && normalizedText.includes(normalizedClue));
  }).length;
}

function mentionsAnyClue(text: string | null | undefined, clues: string[]): boolean {
  return countMentionedClues(text, clues) > 0;
}

export function validateSlotContract(input: SlotContractInput): SlotContractIssue[] {
  const issues: SlotContractIssue[] = [];
  const clues = (input.rawWords ?? []).map((item) => normalizeText(item)).filter(Boolean);
  const answer = normalizeText(input.mainAnswer);
  const slots = input.slots;

  if (!slots) return issues;

  const heroIntro = normalizeText(slots.heroIntroSpoilerSafe);
  if (!heroIntro) {
    issues.push({
      level: "error",
      code: "slots.heroIntro.missing",
      message: "heroIntroSpoilerSafe is required",
      field: "slots.heroIntroSpoilerSafe",
    });
  } else {
    const words = countWords(heroIntro);
    if (words < SLOT_CONTRACT.heroIntroMinWords || words > SLOT_CONTRACT.heroIntroMaxWords) {
      issues.push({
        level: "error",
        code: "slots.heroIntro.wordCount",
        message: `heroIntroSpoilerSafe should stay between ${SLOT_CONTRACT.heroIntroMinWords} and ${SLOT_CONTRACT.heroIntroMaxWords} words`,
        field: "slots.heroIntroSpoilerSafe",
      });
    }
    if (clues.length > 0 && countMentionedClues(heroIntro, clues) < 2) {
      issues.push({
        level: "warning",
        code: "slots.heroIntro.clueCoverage",
        message: "heroIntroSpoilerSafe should mention at least two clue words",
        field: "slots.heroIntroSpoilerSafe",
      });
    }
    if (containsExactAnswer(heroIntro, answer)) {
      issues.push({
        level: "error",
        code: "slots.heroIntro.answerLeak",
        message: "heroIntroSpoilerSafe should stay spoiler-safe and must not include the exact answer",
        field: "slots.heroIntroSpoilerSafe",
      });
    }
  }

  const connectorSummary = normalizeText(slots.connectorSummary);
  if (!connectorSummary) {
    issues.push({
      level: "error",
      code: "slots.connectorSummary.missing",
      message: "connectorSummary is required",
      field: "slots.connectorSummary",
    });
  } else {
    const words = countWords(connectorSummary);
    if (words < SLOT_CONTRACT.connectorSummaryMinWords || words > SLOT_CONTRACT.connectorSummaryMaxWords) {
      issues.push({
        level: "error",
        code: "slots.connectorSummary.wordCount",
        message: `connectorSummary should stay between ${SLOT_CONTRACT.connectorSummaryMinWords} and ${SLOT_CONTRACT.connectorSummaryMaxWords} words`,
        field: "slots.connectorSummary",
      });
    }
    if (containsExactAnswer(connectorSummary, answer)) {
      issues.push({
        level: "error",
        code: "slots.connectorSummary.answerLeak",
        message: "connectorSummary must not repeat the exact answer text",
        field: "slots.connectorSummary",
      });
    }
  }

  const turningPoint = normalizeText(slots.turningPoint);
  if (!turningPoint) {
    issues.push({
      level: "error",
      code: "slots.turningPoint.missing",
      message: "turningPoint is required",
      field: "slots.turningPoint",
    });
  } else if (clues.length > 0 && !mentionsAnyClue(turningPoint, clues)) {
    issues.push({
      level: "warning",
      code: "slots.turningPoint.generic",
      message: "turningPoint should name a real clue or clue combination",
      field: "slots.turningPoint",
    });
  }

  const falseStarts = Array.isArray(slots.falseStarts)
    ? slots.falseStarts.map((item) => normalizeText(item)).filter(Boolean)
    : [];
  if (
    falseStarts.length < SLOT_CONTRACT.falseStartsMin ||
    falseStarts.length > SLOT_CONTRACT.falseStartsMax
  ) {
    issues.push({
      level: "error",
      code: "slots.falseStarts.count",
      message: `falseStarts should contain ${SLOT_CONTRACT.falseStartsMin} to ${SLOT_CONTRACT.falseStartsMax} plausible wrong reads`,
      field: "slots.falseStarts",
    });
  }

  const rejectedGuess = slots.rejectedGuess;
  if (rejectedGuess) {
    if (!normalizeText(rejectedGuess.guess) || !normalizeText(rejectedGuess.explanation)) {
      issues.push({
        level: "warning",
        code: "slots.rejectedGuess.incomplete",
        message: "rejectedGuess should include both guess and explanation",
        field: "slots.rejectedGuess",
      });
    }
  }

  const clueDetails = Array.isArray(slots.clueDetails) ? slots.clueDetails : [];
  if (clueDetails.length !== SLOT_CONTRACT.clueDetailsRequired) {
    issues.push({
      level: "error",
      code: "slots.clueDetails.count",
      message: `slots.clueDetails must include exactly ${SLOT_CONTRACT.clueDetailsRequired} items`,
      field: "slots.clueDetails",
    });
  } else {
    const seen = new Set<string>();
    clueDetails.forEach((detail, index) => {
      const clue = normalizeText(detail?.clue);
      const surfaceRead = normalizeText(detail?.surfaceRead);
      const phrase = normalizeText(detail?.phrase);
      const whyItWorks = normalizeText(detail?.whyItWorks);
      const expectedClue = clues[index] || "";

      if (!clue || !surfaceRead || !phrase || !whyItWorks) {
        issues.push({
          level: "error",
          code: "slots.clueDetails.missingFields",
          message: "Each slot clue detail must include clue, surfaceRead, phrase, and whyItWorks",
          field: `slots.clueDetails[${index}]`,
        });
        return;
      }

      if (expectedClue && clue !== expectedClue) {
        issues.push({
          level: "error",
          code: "slots.clueDetails.clueMismatch",
          message: `slots.clueDetails[${index}] should preserve the original clue "${expectedClue}"`,
          field: `slots.clueDetails[${index}].clue`,
        });
      }

      const clueKey = clue.toLowerCase();
      if (seen.has(clueKey)) {
        issues.push({
          level: "error",
          code: "slots.clueDetails.duplicate",
          message: "slots.clueDetails must not repeat clues",
          field: `slots.clueDetails[${index}].clue`,
        });
      }
      seen.add(clueKey);

      if (normalizeLoose(phrase) === normalizeLoose(clue)) {
        issues.push({
          level: "warning",
          code: "slots.clueDetails.phraseTooClose",
          message: "clueDetails.phrase should add a real resolved phrase or type, not just repeat the clue",
          field: `slots.clueDetails[${index}].phrase`,
        });
      }
    });
  }

  return issues;
}

export function validateContentContract(input: ContentContractInput): ContentContractIssue[] {
  const issues: ContentContractIssue[] = [];
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
  if (overviewWords < CONTENT_CONTRACT.overviewMinWords) {
    issues.push({
      level: "error",
      code: "overview.tooShort",
      message: `Overview too short: ${overviewWords}`,
      field: "overview",
    });
  }

  const solutionWords = countWords(input.solutionEmergence);
  if (solutionWords < CONTENT_CONTRACT.solutionEmergenceMinWords) {
    issues.push({
      level: "error",
      code: "solutionEmergence.tooShort",
      message: `Solution emergence too short: ${solutionWords}`,
      field: "solutionEmergence",
    });
  } else if (!/\bI\b/.test(normalizeText(input.solutionEmergence))) {
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
