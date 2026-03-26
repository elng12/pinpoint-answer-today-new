export type FallbackPatternKind =
  | "before"
  | "after"
  | "typed-category"
  | "category"
  | "association";

type LessonItem = { title: string; body: string };
type FaqItem = { question: string; answer: string };

function quoteJoin(values: string[]): string {
  return values.map((value) => `"${value}"`).join(" and ");
}

function isPhrasePattern(kind: FallbackPatternKind): boolean {
  return kind === "before" || kind === "after";
}

export function buildSharedFallbackArticleBlocks(input: {
  kind: FallbackPatternKind;
  clues: string[];
  answer: string;
  turningPoint: string;
  connectorSummary: string;
  sampleReads: string[];
  finalChecks: string[];
}): string[] {
  const { kind, clues, answer, turningPoint, connectorSummary, sampleReads, finalChecks } = input;
  const first = clues[0] ?? "the first clue";
  const second = clues[1] ?? "the second clue";
  const sampleReadText = quoteJoin(sampleReads.slice(0, 2));
  const finalCheckText = quoteJoin(finalChecks.slice(0, 2));

  if (isPhrasePattern(kind)) {
    return [
      `At first, ${first} and ${second} could have pulled toward a few different phrase guesses.`,
      `"${turningPoint}" was the clue that made the missing word much easier to spot.`,
      `Once phrases like ${sampleReadText} appeared, the board stopped feeling scattered.`,
      `The answer was ${answer}.`,
      `${finalCheckText} then felt like the last clean checks on the same pattern.`,
    ];
  }

  return [
    `At first, ${first} and ${second} pointed in a few different directions.`,
    `The turn came with "${turningPoint}".`,
    `That clue made the answer feel concrete enough to test across the full board.`,
    `Once I read the set through ${connectorSummary}, examples like ${sampleReadText} stopped feeling loose and started landing cleanly.`,
    `The answer was ${answer}.`,
    `${finalCheckText} then felt like the last confirmations, not separate guesses.`,
  ];
}

export function buildSharedFallbackLessons(input: {
  kind: FallbackPatternKind;
  turningPoint: string;
}): LessonItem[] {
  const { kind, turningPoint } = input;
  if (isPhrasePattern(kind)) {
    return [
      {
        title: "Wait for the clue that makes the missing word obvious",
        body: "When the opening clues feel broad, look for the clue that turns a loose phrase guess into one exact expression.",
      },
      {
        title: "Prefer familiar phrases over vague overlap",
        body: "A strong Pinpoint answer should produce natural expressions and common terms, not just words that feel loosely related.",
      },
      {
        title: "Re-check the first clues once the pattern appears",
        body: `Once "${turningPoint}" lands, go back and test the earlier clues against the same missing word before locking the answer.`,
      },
    ];
  }

  return [
    {
      title: "Wait for the clue that makes the set concrete",
      body: "When the opening clues feel broad, wait for the clue that turns one fuzzy theme into a testable answer.",
    },
    {
      title: "Prefer exact fits over vague overlap",
      body: "A strong Pinpoint answer should explain why every clue belongs, not just why the words feel loosely related.",
    },
    {
      title: "Re-check the early clues once the answer sharpens",
      body: `Once "${turningPoint}" lands, go back and test the earlier clues under that same answer before locking it in.`,
    },
  ];
}

export function buildSharedFallbackFaqs(input: {
  puzzleNumber: number;
  kind: FallbackPatternKind;
  answer: string;
  turningPoint: string;
  connectorSummary: string;
  turningPhrase?: string;
}): FaqItem[] {
  const { puzzleNumber, kind, answer, turningPoint, connectorSummary, turningPhrase } = input;
  if (isPhrasePattern(kind)) {
    return [
      {
        question: `What is the answer to LinkedIn Pinpoint #${puzzleNumber}?`,
        answer: `The answer is ${answer}. That reading is the first one that explains the full set cleanly, including "${turningPoint}".`,
      },
      {
        question: `What is the connection in LinkedIn Pinpoint #${puzzleNumber}?`,
        answer: `The connection is ${connectorSummary}. Each clue becomes a familiar phrase or common term once the same missing word is in place.`,
      },
      {
        question: `Which clue really unlocks LinkedIn Pinpoint #${puzzleNumber}?`,
        answer: `"${turningPoint}" is the strongest clue because ${turningPhrase ? `"${turningPhrase}" makes the missing word feel exact instead of improvised.` : "it makes the missing word feel exact instead of improvised."}`,
      },
    ];
  }

  return [
    {
      question: `What is the answer to LinkedIn Pinpoint #${puzzleNumber}?`,
      answer: `The answer is ${answer}. That reading is the first one that explains the whole set without forcing any clue.`,
    },
    {
      question: `What is the connection in LinkedIn Pinpoint #${puzzleNumber}?`,
      answer: `The connection is ${connectorSummary}. The clues read more cleanly once they are tested under that same idea instead of as a loose theme.`,
    },
    {
      question: `Which clue really unlocks LinkedIn Pinpoint #${puzzleNumber}?`,
      answer: `"${turningPoint}" is the turning point because it makes the answer concrete enough to test across all five clues.`,
    },
  ];
}

export function buildSharedFallbackSolutionNarrative(input: {
  kind: FallbackPatternKind;
  wrongGuess: string;
  turningPoint: string;
}): string[] {
  const { kind, wrongGuess, turningPoint } = input;
  if (isPhrasePattern(kind)) {
    return [
      `I did not have a stable missing word from the first clue. I initially drifted toward ${wrongGuess}, but that reading never explained "${turningPoint}" cleanly enough.`,
      `The solve turned when I let "${turningPoint}" lead. Once one exact phrase landed, the earlier clues started behaving like natural fits instead of isolated prompts.`,
    ];
  }

  return [
    `I did not have a clean answer from the first clue. I initially drifted toward ${wrongGuess}, but that line of thinking never explained "${turningPoint}" cleanly enough.`,
    `The turn came when I let "${turningPoint}" lead the solve. Once the answer sharpened, the earlier clues stopped feeling broad and started reading like parts of one real set.`,
  ];
}
