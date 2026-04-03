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

function hasVisualCue(value: string): boolean {
  return /[^\p{L}\p{N}\s()'"&,-]/u.test(value);
}

function isVisualCategoryBoard(kind: FallbackPatternKind, clues: string[]): boolean {
  if (kind !== "category") return false;
  const visualCueCount = clues.filter((clue) => hasVisualCue(clue)).length;
  return visualCueCount >= Math.max(2, Math.ceil(clues.length / 2));
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

  if (kind === "typed-category") {
    const categoryTarget = answer.replace(/^"?Types of\s+/i, "").replace(/^"?Kinds of\s+/i, "").replace(/"?$/, "").trim();
    const singularTarget = categoryTarget.replace(/\b([A-Za-z]+)s\b/i, "$1") || categoryTarget;
    return [
      `At first, ${first} and ${second} can feel like they belong to a broad topic instead of one exact family, which is why typed-category boards often look looser than they really are at the start.`,
      `The turn came with "${turningPoint}" because that clue finally made it easier to ask what kind of ${singularTarget.toLowerCase()} each entry could be describing instead of treating the board like a vague umbrella theme.`,
      `Once that question became the frame, ${connectorSummary} stopped sounding generic and started behaving like a real category test.`,
      `Examples like ${sampleReadText} then read like recognizable members of the same set rather than isolated references that merely share the same mood.`,
      `The answer was ${answer}.`,
      `${finalCheckText} work best as full-board confirmation because they show the same category can stay precise all the way through, not just around the opening clues.`,
    ];
  }

  if (kind === "association") {
    return [
      `At first, ${first} and ${second} can point toward several broad buckets, because association boards often mix places, objects, and references from the same world instead of presenting one obvious category label up front.`,
      `The turn came with "${turningPoint}", which gave the board a stronger anchor and made it easier to test one shared context instead of bouncing between unrelated guesses.`,
      `From there, ${connectorSummary} explains the board more cleanly because the clues start behaving like references inside one shared world, not like five separate trivia facts.`,
      `Examples like ${sampleReadText} stop feeling disconnected once that context is in place, because they each point back to the same subject from a different angle.`,
      `The answer was ${answer}.`,
      `${finalCheckText} then feel less like extra guesses and more like confirmation that the same subject really can hold the full board together.`,
    ];
  }

  if (isVisualCategoryBoard(kind, clues)) {
    return [
      `At first, ${first} and ${second} can look like a random visual cluster, which is why emoji and symbol boards often tempt you into reading mood, tone, or internet shorthand before the real set appears.`,
      `The turn came with "${turningPoint}". That clue made it easier to treat the board as one visual family instead of a pile of unrelated icons.`,
      `Once I read the set through ${connectorSummary}, examples like ${sampleReadText} stopped feeling decorative and started behaving like recognizable members of the same visual system.`,
      `That is also why the board works better as a coherent visual set than as a loose emoji mood list: every clue strengthens the same read instead of introducing a second theme.`,
      `The answer was ${answer}.`,
      `${finalCheckText} then land as final confirmation because they extend that same visual sequence instead of breaking it.`,
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

  if (kind === "typed-category") {
    return [
      {
        title: "Ask what type each clue could really be",
        body: "Typed-category boards become easier once you stop sorting by vibe and start asking what kind of thing each clue specifically names.",
      },
      {
        title: "The category noun should sharpen the board",
        body: "A good category answer does more than group the clues loosely. It should make each clue sound like a recognizable member of the same family.",
      },
      {
        title: "Use the anchor clue to set the category level",
        body: `Once "${turningPoint}" lands, check whether the rest of the clues fit that same category at the same level of precision.`,
      },
    ];
  }

  if (kind === "association") {
    return [
      {
        title: "Look for one shared world, not one shared label",
        body: "Association boards often mix clue types, so the right solve can be a common context instead of a tidy dictionary category.",
      },
      {
        title: "The anchor clue should reduce the search space fast",
        body: "The best association clue is the one that collapses several broad guesses into one testable subject.",
      },
      {
        title: "Validate by context, not by surface similarity",
        body: `Once "${turningPoint}" gives you the right subject, make sure the other clues point back to that same world for specific reasons.`,
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
  clues?: string[];
}): FaqItem[] {
  const { puzzleNumber, kind, answer, turningPoint, connectorSummary, turningPhrase, clues = [] } = input;
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

  if (kind === "typed-category") {
    return [
      {
        question: `What is the answer to LinkedIn Pinpoint #${puzzleNumber}?`,
        answer: `The answer is ${answer}. That reading is the first one that turns the clues into recognizable members of the same typed category instead of one loose topic bucket.`,
      },
      {
        question: `What is the connection in LinkedIn Pinpoint #${puzzleNumber}?`,
        answer: `The connection is ${connectorSummary}. The board gets easier once you ask what kind of thing each clue could specifically be, not just what they vaguely remind you of.`,
      },
      {
        question: `Which clue really sets the category in LinkedIn Pinpoint #${puzzleNumber}?`,
        answer: `"${turningPoint}" is the anchor clue because it sharpens the board into one exact type-level answer and makes the earlier clues easier to re-check under the same category noun.`,
      },
    ];
  }

  if (kind === "association") {
    return [
      {
        question: `What is the answer to LinkedIn Pinpoint #${puzzleNumber}?`,
        answer: `The answer is ${answer}. That reading works because the clues all point back to the same subject or context, even if they do not all look like the same kind of clue on first read.`,
      },
      {
        question: `What is the connection in LinkedIn Pinpoint #${puzzleNumber}?`,
        answer: `The connection is ${connectorSummary}. This board solves better by shared context than by forcing all 5 clues into one literal category label.`,
      },
      {
        question: `Which clue gives the strongest anchor in LinkedIn Pinpoint #${puzzleNumber}?`,
        answer: `"${turningPoint}" matters most because it gives the board one clear subject to test, which is what lets the remaining clues stop feeling scattered.`,
      },
    ];
  }

  if (isVisualCategoryBoard(kind, clues)) {
    return [
      {
        question: `What is the answer to LinkedIn Pinpoint #${puzzleNumber}?`,
        answer: `The answer is ${answer}. That read works because the symbols form one recognizable visual family rather than a loose set of emoji reactions.`,
      },
      {
        question: `What is the connection in LinkedIn Pinpoint #${puzzleNumber}?`,
        answer: `The connection is ${connectorSummary}. The right way to solve boards like this is to ask what visual system the clues belong to, not just what mood they suggest.`,
      },
      {
        question: `Which clue makes the visual set click in LinkedIn Pinpoint #${puzzleNumber}?`,
        answer: `"${turningPoint}" is the clue that turns the board from a random icon cluster into one testable visual category.`,
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
  clues?: string[];
}): string[] {
  const { kind, wrongGuess, turningPoint, clues = [] } = input;
  if (isPhrasePattern(kind)) {
    const positionText = phrasePositionText(kind);
    return [
      `I first tried ${wrongGuess}, because the opening clues were broad enough to support a few loose phrase reads. But none of those guesses made "${turningPoint}" feel exact enough.`,
      `Once "${turningPoint}" clicked, the phrase pattern was finally clear. The same word fit ${positionText} the earlier clues without forcing any of them, which was when the answer stopped feeling speculative and started feeling confirmed.`,
      "After that, I could go back through the board and watch the early clues turn into ordinary language instead of near misses.",
    ];
  }

  if (kind === "typed-category") {
    return [
      `I first drifted toward ${wrongGuess}, because the early clues were broad enough to sit inside a bigger umbrella topic. That read still felt too loose once "${turningPoint}" showed up.`,
      `The solve improved once I stopped asking what the clues vaguely had in common and started asking what type of thing each clue could specifically be. "${turningPoint}" was the clue that made that shift feel worth testing.`,
      "After that, the board stopped behaving like a loose topic list and started reading like one exact typed category with members you could actually name.",
    ];
  }

  if (kind === "association") {
    return [
      `I first leaned toward ${wrongGuess}, but that still treated the board like a literal category and never gave "${turningPoint}" enough weight as an anchor clue.`,
      `The turn came when I let "${turningPoint}" define the context. Once the board had one stable subject behind it, the earlier clues stopped feeling scattered and started behaving like references from the same world.`,
      "That was the point where the solve stopped depending on loose overlap and started feeling like one coherent picture.",
    ];
  }

  if (isVisualCategoryBoard(kind, clues)) {
    return [
      `I first drifted toward ${wrongGuess}, because symbol-heavy boards can look like a loose mood or reaction set before the real category appears. That read never made "${turningPoint}" feel specific enough.`,
      `The turn came when I treated "${turningPoint}" as part of one visual family instead of one isolated icon. That made it much easier to re-check the earlier clues as members of the same set.`,
      "Once the board looked like one visual sequence instead of a random emoji pile, the answer stopped feeling speculative and started feeling testable.",
    ];
  }

  return [
    `I did not have a clean answer from the first clue. I initially drifted toward ${wrongGuess}, but that line of thinking never explained "${turningPoint}" cleanly enough.`,
    `The turn came when I let "${turningPoint}" lead the solve. Once the answer sharpened, the earlier clues stopped feeling broad and started reading like parts of one real set.`,
  ];
}
