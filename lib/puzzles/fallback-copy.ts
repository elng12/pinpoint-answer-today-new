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

function phrasePositionText(kind: FallbackPatternKind): string {
  return kind === "before" ? "after" : "before";
}

function phraseAnswerSlot(kind: FallbackPatternKind): string {
  return kind === "before" ? "ending word" : "first word";
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
    const positionText = phrasePositionText(kind);
    const answerSlot = phraseAnswerSlot(kind);
    return [
      `The first clues make it clear this is a shared-word phrase puzzle, but not which ${answerSlot} belongs ${positionText} every clue without forcing the read.`,
      `"${turningPoint}" narrows that down quickly because it points to one phrase that feels exact right away.`,
      `Once that phrase appears, examples like ${sampleReadText} stop feeling guessed and start reading like ordinary language.`,
      `The answer was ${answer}.`,
      `${finalCheckText} then work as clean confirmations that the same word belongs ${positionText} the remaining clues too and keeps the pattern stable.`,
    ];
  }

  return [
    `At first, ${first} and ${second} pointed in a few different directions, so the board still felt wider than one exact category.`,
    `The turn came with "${turningPoint}".`,
    `That clue made the answer feel concrete enough to test across the full board instead of leaving the solve at vibe level.`,
    `Once I read the set through ${connectorSummary}, examples like ${sampleReadText} stopped feeling loose and started landing cleanly.`,
    `The answer was ${answer}.`,
    `${finalCheckText} then felt like the last confirmations, not separate guesses, because they supported that answer without any stretching.`,
  ];
}

export function buildSharedFallbackLessons(input: {
  kind: FallbackPatternKind;
  turningPoint: string;
}): LessonItem[] {
  const { kind, turningPoint } = input;
  if (isPhrasePattern(kind)) {
    const positionText = phrasePositionText(kind);
    return [
      {
        title: "Let the clearest phrase lead",
        body: "In shared-word puzzles, the best clue is usually the one that produces the least flexible phrase.",
      },
      {
        title: "Prefer everyday language over loose overlap",
        body: "A good answer should create phrases people actually say, not just words that seem related from a distance.",
      },
      {
        title: "Use the easiest clue as confirmation",
        body: `Once "${turningPoint}" lands, place the same word ${positionText} the other clues and make sure they read naturally right away.`,
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
    const positionText = phrasePositionText(kind);
    return [
      {
        question: `What is the answer to LinkedIn Pinpoint #${puzzleNumber}?`,
        answer: `The answer is ${answer}. That reading is the first one that turns all five clues into familiar phrases or common terms.`,
      },
      {
        question: `What is the connection in LinkedIn Pinpoint #${puzzleNumber}?`,
        answer: `The connection is ${connectorSummary}. The same word fits ${positionText} every clue to create familiar phrases or everyday terms.`,
      },
      {
        question: `Which clue is decisive in LinkedIn Pinpoint #${puzzleNumber}?`,
        answer: `"${turningPoint}" is the strongest clue because ${turningPhrase ? `"${turningPhrase}" points to one exact phrase much faster than the earlier clues do.` : "it points to one exact phrase much faster than the earlier clues do."}`,
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
    const positionText = phrasePositionText(kind);
    return [
      `I first tried ${wrongGuess}, because the opening clues were broad enough to support a few loose phrase reads. But none of those guesses made "${turningPoint}" feel exact enough.`,
      `Once "${turningPoint}" clicked, the phrase pattern was finally clear. The same word fit ${positionText} the earlier clues without forcing any of them, which was when the answer stopped feeling speculative and started feeling confirmed.`,
      "After that, I could go back through the board and watch the early clues turn into ordinary language instead of near misses.",
    ];
  }

  return [
    `I did not have a clean answer from the first clue. I initially drifted toward ${wrongGuess}, but that line of thinking never explained "${turningPoint}" cleanly enough.`,
    `The turn came when I let "${turningPoint}" lead the solve. Once the answer sharpened, the earlier clues stopped feeling broad and started reading like parts of one real set.`,
  ];
}
