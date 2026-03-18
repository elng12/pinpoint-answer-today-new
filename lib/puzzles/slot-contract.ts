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

export type SlotContractIssueLevel = "error" | "warning";

export type SlotContractIssue = {
  level: SlotContractIssueLevel;
  code: string;
  message: string;
  field?: string;
};

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

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function countWords(value: string | null | undefined): number {
  return normalizeText(value).match(/\S+/g)?.length ?? 0;
}

function normalizeLoose(value: string | null | undefined): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/["“”'’()\-_,!?:.;/]+/g, " ")
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

  const difficultyReason = normalizeText(slots.difficultyReason);
  if (!difficultyReason || countWords(difficultyReason) < SLOT_CONTRACT.difficultyReasonMinWords) {
    issues.push({
      level: "warning",
      code: "slots.difficultyReason.tooShort",
      message: `difficultyReason should be at least ${SLOT_CONTRACT.difficultyReasonMinWords} words`,
      field: "slots.difficultyReason",
    });
  }
  if (difficultyReason && containsExactAnswer(difficultyReason, answer)) {
    issues.push({
      level: "warning",
      code: "slots.difficultyReason.answerLeak",
      message: "difficultyReason should explain difficulty without repeating the exact answer",
      field: "slots.difficultyReason",
    });
  }

  const portableTakeaway = normalizeText(slots.portableTakeaway);
  const portableTakeawayWords = countWords(portableTakeaway);
  if (
    !portableTakeaway ||
    portableTakeawayWords < SLOT_CONTRACT.portableTakeawayMinWords ||
    portableTakeawayWords > SLOT_CONTRACT.portableTakeawayMaxWords
  ) {
    issues.push({
      level: "warning",
      code: "slots.portableTakeaway.wordCount",
      message: `portableTakeaway should stay between ${SLOT_CONTRACT.portableTakeawayMinWords} and ${SLOT_CONTRACT.portableTakeawayMaxWords} words`,
      field: "slots.portableTakeaway",
    });
  }

  return issues;
}
