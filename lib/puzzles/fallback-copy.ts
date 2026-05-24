export type FallbackPatternKind =
  | "before"
  | "after"
  | "typed-category"
  | "category"
  | "association";

type LessonItem = { title: string; body: string };
type FaqItem = { question: string; answer: string };
type WrongGuessCandidate = {
  label: string;
  whyPlausible: string;
  whyRejected?: string;
};

function quoteJoin(values: string[]): string {
  return values.map((value) => `"${value}"`).join(" and ");
}

function stripFallbackQuotes(value: string): string {
  return value.replace(/["\u201c\u201d]/g, "");
}

function singularizeFallbackTail(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  const lower = trimmed.toLowerCase();
  const irregular: Record<string, string> = {
    mice: "mouse",
    geese: "goose",
    teeth: "tooth",
    feet: "foot",
    men: "man",
    women: "woman",
    people: "person",
    children: "child",
  };
  if (irregular[lower]) return irregular[lower];
  if (/ies$/i.test(trimmed)) return `${trimmed.slice(0, -3)}y`;
  if (/(ches|shes|xes|zes|sses)$/i.test(trimmed)) return trimmed.slice(0, -2);
  if (/[aeiou]ves$/i.test(trimmed)) return trimmed.slice(0, -1);
  if (/ives$/i.test(trimmed)) return `${trimmed.slice(0, -3)}fe`;
  if (/s$/i.test(trimmed) && !/ss$/i.test(trimmed)) return trimmed.slice(0, -1);
  return trimmed;
}

function singularizeFallbackNounPhrase(value: string): string {
  const cleaned = stripFallbackQuotes(value)
    .replace(/\s*\([^)]*\)\s*$/, "")
    .split(/\s+[—–-]\s+/)[0]
    ?.replace(/[.!?]+$/, "")
    .replace(/\s+/g, " ")
    .trim() ?? "";
  if (!cleaned) return "";

  const words = cleaned.split(/\s+/);
  const prepositionIndex = words.findIndex((word, index) =>
    index > 0 && /^(in|on|at|for|from|with|of)$/i.test(word),
  );
  const headWords = prepositionIndex === -1 ? words : words.slice(0, prepositionIndex);
  const tailWords = prepositionIndex === -1 ? [] : words.slice(prepositionIndex);
  const headLastIndex = headWords.length - 1;
  if (headLastIndex < 0) return cleaned.toLowerCase();

  const singularHead = [
    ...headWords.slice(0, headLastIndex),
    singularizeFallbackTail(headWords[headLastIndex] ?? ""),
  ];
  return [...singularHead, ...tailWords].join(" ").toLowerCase();
}

function detectFallbackNoun(answer: string): string {
  const match = stripFallbackQuotes(answer).match(/^(?:Types|Kinds)\s+of\s+(.+)$/i);
  if (match?.[1]) return singularizeFallbackNounPhrase(match[1]);
  const typed = answer.match(/^(.+?)\s+\((.+?)\)/);
  if (typed?.[2]) return singularizeFallbackNounPhrase(typed[2]);
  return "";
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

function buildFallbackAnswerFaqQuestion(input: {
  puzzleNumber: number;
  kind: FallbackPatternKind;
  clues: string[];
}) {
  const { puzzleNumber, kind, clues } = input;
  const firstClue = stripFallbackQuotes(clues[0] || "");
  const secondClue = stripFallbackQuotes(clues[1] || "");
  if (!firstClue || !secondClue) {
    return `What final answer fits this LinkedIn Pinpoint #${puzzleNumber} board?`;
  }

  if (isPhrasePattern(kind)) {
    return `What shared word links "${firstClue}" and "${secondClue}" in LinkedIn Pinpoint #${puzzleNumber}?`;
  }
  if (kind === "typed-category") {
    return `Which type-level category connects "${firstClue}" and "${secondClue}" in LinkedIn Pinpoint #${puzzleNumber}?`;
  }
  if (kind === "association") {
    return `What shared subject links "${firstClue}" and "${secondClue}" in LinkedIn Pinpoint #${puzzleNumber}?`;
  }
  if (isVisualCategoryBoard(kind, clues)) {
    return `What visual category connects "${firstClue}" and "${secondClue}" in LinkedIn Pinpoint #${puzzleNumber}?`;
  }
  return `What final category connects "${firstClue}" and "${secondClue}" in LinkedIn Pinpoint #${puzzleNumber}?`;
}

function getFallbackWrongGuessPair(
  candidates: WrongGuessCandidate[] | undefined,
  fallbackPrimary: string,
  fallbackSecondary: string,
): [WrongGuessCandidate, WrongGuessCandidate | null] {
  const normalized = Array.isArray(candidates)
    ? candidates.filter((candidate) => candidate?.label && candidate?.whyPlausible).slice(0, 2)
    : [];
  const primary = normalized[0] ?? {
    label: fallbackPrimary,
    whyPlausible: `The opening clues can support ${fallbackPrimary} before the board narrows into a cleaner read.`,
  };
  const secondary = normalized[1] ?? (fallbackSecondary
    ? {
        label: fallbackSecondary,
        whyPlausible: `A nearby read like ${fallbackSecondary} can also feel plausible until the full board is checked together.`,
      }
    : null);
  return [primary, secondary];
}

function buildPrecisionCloser(
  answer: string,
  categoryPrecisionNote: string | undefined,
  wrongGuessCandidates: WrongGuessCandidate[],
): string {
  const comparisons = wrongGuessCandidates
    .map((candidate) => candidate.label)
    .filter(Boolean)
    .slice(0, 2);

  if (categoryPrecisionNote && comparisons.length > 0) {
    return `The answer was ${answer}. More precisely, the board resolves as ${categoryPrecisionNote}, which is why ${answer} fits better than ${comparisons.map((item) => `"${item}"`).join(" or ")} once the full set is checked.`;
  }

  if (categoryPrecisionNote) {
    return `The answer was ${answer}. More precisely, the board resolves as ${categoryPrecisionNote}.`;
  }

  return `The answer was ${answer}.`;
}

export function buildSharedFallbackArticleBlocks(input: {
  kind: FallbackPatternKind;
  clues: string[];
  answer: string;
  turningPoint: string;
  connectorSummary: string;
  sampleReads: string[];
  finalChecks: string[];
  wrongGuessCandidates?: WrongGuessCandidate[];
  setValidationSummary?: string;
  categoryPrecisionNote?: string;
}): string[] {
  const {
    kind,
    clues,
    answer,
    turningPoint,
    connectorSummary,
    sampleReads,
    finalChecks,
    wrongGuessCandidates = [],
    setValidationSummary,
    categoryPrecisionNote,
  } = input;
  const first = clues[0] ?? "the first clue";
  const second = clues[1] ?? "the second clue";
  const sampleReadText = quoteJoin(sampleReads.slice(0, 2));
  const finalCheckText = quoteJoin(finalChecks.slice(0, 2));
  const precisionCloser = buildPrecisionCloser(answer, categoryPrecisionNote, wrongGuessCandidates);

  if (isPhrasePattern(kind)) {
    const positionText = phrasePositionText(kind);
    const answerSlot = phraseAnswerSlot(kind);
    const [primaryWrongGuess, secondaryWrongGuess] = getFallbackWrongGuessPair(
      wrongGuessCandidates,
      "loose phrase guesses",
      "standalone clue meanings",
    );
    return [
      `The first clues make it clear this is a shared-word phrase puzzle, but not which ${answerSlot} belongs ${positionText} every clue without forcing the read.`,
      `A nearby read was "${primaryWrongGuess.label}". ${primaryWrongGuess.whyPlausible} ${primaryWrongGuess.whyRejected ?? `"${turningPoint}" is the clue that keeps the board from staying at that broader phrase level.`}`,
      secondaryWrongGuess
        ? `Another easy trap was "${secondaryWrongGuess.label}". ${secondaryWrongGuess.whyPlausible} ${secondaryWrongGuess.whyRejected ?? "That line never explains the strongest clue cleanly enough."}`
        : `"${turningPoint}" narrows the slot down quickly because it points to one phrase that feels exact right away.`,
      `Once that phrase appears, examples like ${sampleReadText} stop feeling guessed and start reading like ordinary language under ${connectorSummary}.`,
      setValidationSummary
        ? setValidationSummary
        : `${finalCheckText} then work as clean confirmations that the same word belongs ${positionText} the remaining clues too and keeps the pattern stable.`,
      precisionCloser,
    ];
  }

  if (kind === "typed-category") {
    const categoryTarget = answer.replace(/^"?Types of\s+/i, "").replace(/^"?Kinds of\s+/i, "").replace(/"?$/, "").trim();
    const singularTarget = categoryTarget.replace(/\b([A-Za-z]+)s\b/i, "$1") || categoryTarget;
    const [primaryWrongGuess, secondaryWrongGuess] = getFallbackWrongGuessPair(
      wrongGuessCandidates,
      "a broader umbrella topic",
      "a loose mascot or named-entity cluster",
    );
    return [
      `At first, ${first} and ${second} can feel like they belong to a broad topic instead of one exact family, which is why typed-category boards often look looser than they really are at the start.`,
      `One tempting read was "${primaryWrongGuess.label}". ${primaryWrongGuess.whyPlausible} ${primaryWrongGuess.whyRejected ?? `"${turningPoint}" is the clue that finally pushes the board down to one exact type-level category.`}`,
      secondaryWrongGuess
        ? `Another nearby bucket was "${secondaryWrongGuess.label}". ${secondaryWrongGuess.whyPlausible} ${secondaryWrongGuess.whyRejected ?? "That read stays too broad once the full board is checked at the same category level."}`
        : `The turn came with "${turningPoint}" because that clue finally made it easier to ask what kind of ${singularTarget.toLowerCase()} each entry could be describing instead of treating the board like a vague umbrella theme.`,
      `Once the board turned into a question about what kind of ${singularTarget.toLowerCase()} each clue could be, ${connectorSummary} stopped sounding generic and started behaving like a real category test. Examples like ${sampleReadText} then read like recognizable members of the same set rather than isolated references that merely share the same mood.`,
      setValidationSummary
        ? setValidationSummary
        : `${finalCheckText} work best as full-board confirmation because they show the same category can stay precise all the way through, not just around the opening clues.`,
      precisionCloser,
    ];
  }

  if (kind === "association") {
    const [primaryWrongGuess, secondaryWrongGuess] = getFallbackWrongGuessPair(
      wrongGuessCandidates,
      "a literal category label",
      "five unrelated references",
    );
    return [
      `At first, ${first} and ${second} can point toward several broad buckets, because association boards often mix places, objects, and references from the same world instead of presenting one obvious category label up front.`,
      `A tempting early label was "${primaryWrongGuess.label}". ${primaryWrongGuess.whyPlausible} ${primaryWrongGuess.whyRejected ?? `"${turningPoint}" works better as the anchor into one shared world than as proof of a literal category.`}`,
      secondaryWrongGuess
        ? `Another nearby read was "${secondaryWrongGuess.label}". ${secondaryWrongGuess.whyPlausible} ${secondaryWrongGuess.whyRejected ?? "That interpretation leaves too many clues floating on their own."}`
        : `The turn came with "${turningPoint}", which gave the board a stronger anchor and made it easier to test one shared context instead of bouncing between unrelated guesses.`,
      `From there, ${connectorSummary} explains the board more cleanly because the clues start behaving like references inside one shared world, not like five separate trivia facts. Examples like ${sampleReadText} stop feeling disconnected once that context is in place, because they each point back to the same subject from a different angle.`,
      setValidationSummary
        ? setValidationSummary
        : `${finalCheckText} then feel less like extra guesses and more like confirmation that the same subject really can hold the full board together.`,
      precisionCloser,
    ];
  }

  if (isVisualCategoryBoard(kind, clues)) {
    const [primaryWrongGuess, secondaryWrongGuess] = getFallbackWrongGuessPair(
      wrongGuessCandidates,
      "a loose emoji mood list",
      "general internet symbols",
    );
    return [
      `At first, ${first} and ${second} can look like a random visual cluster, which is why emoji and symbol boards often tempt you into reading mood, tone, or internet shorthand before the real set appears.`,
      `One tempting read was "${primaryWrongGuess.label}". ${primaryWrongGuess.whyPlausible} ${primaryWrongGuess.whyRejected ?? `"${turningPoint}" is the clue that turns the board into one testable visual family instead of a random icon pile.`}`,
      secondaryWrongGuess
        ? `Another nearby bucket was "${secondaryWrongGuess.label}". ${secondaryWrongGuess.whyPlausible} ${secondaryWrongGuess.whyRejected ?? "That read stays too generic once the symbols are tested as one complete sequence."}`
        : `The turn came with "${turningPoint}". That clue made it easier to treat the board as one visual family instead of a pile of unrelated icons.`,
      `Once I read the set through ${connectorSummary}, examples like ${sampleReadText} stopped feeling decorative and started behaving like recognizable members of the same visual system.`,
      setValidationSummary
        ? setValidationSummary
        : `${finalCheckText} then land as final confirmation because they extend that same visual sequence instead of breaking it.`,
      precisionCloser,
    ];
  }

  const [primaryWrongGuess, secondaryWrongGuess] = getFallbackWrongGuessPair(
    wrongGuessCandidates,
    "a broader umbrella topic",
    "a one-clue surface theme",
  );
  return [
    `At first, ${first} and ${second} pointed in a few different directions, so the board still felt wider than one exact category.`,
    `One tempting read was "${primaryWrongGuess.label}". ${primaryWrongGuess.whyPlausible} ${primaryWrongGuess.whyRejected ?? `"${turningPoint}" is the clue that makes the answer concrete enough to test across the full board.`}`,
    secondaryWrongGuess
      ? `Another nearby read was "${secondaryWrongGuess.label}". ${secondaryWrongGuess.whyPlausible} ${secondaryWrongGuess.whyRejected ?? "That read never gives the board a precise enough edge."}`
      : `The turn came with "${turningPoint}".`,
    `Once I read the set through ${connectorSummary}, examples like ${sampleReadText} stopped feeling loose and started landing cleanly.`,
    setValidationSummary
      ? setValidationSummary
      : `${finalCheckText} then felt like the last confirmations, not separate guesses, because they supported that answer without any stretching.`,
    precisionCloser,
  ];
}

export function buildSharedFallbackLessons(input: {
  kind: FallbackPatternKind;
  turningPoint: string;
  clues?: string[];
  answer?: string;
}): LessonItem[] {
  const { kind, turningPoint, clues = [], answer = "" } = input;
  const firstClue = stripFallbackQuotes(clues[0] || "");
  const secondClue = stripFallbackQuotes(clues[1] || "");
  const answerLabel = stripFallbackQuotes(answer);

  if (isPhrasePattern(kind)) {
    const positionText = phrasePositionText(kind);
    return [
      {
        title: firstClue && secondClue
          ? `"${firstClue}" and "${secondClue}" do not immediately line up around one missing word`
          : "Let the clearest phrase lead",
        body: firstClue && secondClue
          ? `"${firstClue}" and "${secondClue}" each work in multiple phrase frames, so it is better to wait for a clue that forces one exact missing word before committing.`
          : "In shared-word puzzles, the best clue is usually the one that produces the least flexible phrase.",
      },
      {
        title: `"${turningPoint}" is what finally makes the missing word visible`,
        body: `Once "${turningPoint}" lands, place the same word ${positionText} the other clues and make sure they read naturally right away.`,
      },
      {
        title: `Every clue should read as an everyday phrase once the answer is in place`,
        body: "A good answer should create phrases people actually say, not just words that seem related from a distance.",
      },
    ];
  }

  if (kind === "typed-category") {
    const noun = detectFallbackNoun(answer);
    return [
      {
        title: firstClue && secondClue
          ? `"${firstClue}" and "${secondClue}" can look like they belong to different categories at first`
          : "Ask what type each clue could really be",
        body: "Typed-category boards become easier once you stop sorting by vibe and start asking what kind of thing each clue specifically names.",
      },
      {
        title: noun
          ? `"${turningPoint}" is what makes the category feel concrete instead of broad`
          : "The category noun should sharpen the board",
        body: "A good category answer does more than group the clues loosely. It should make each clue sound like a recognizable member of the same family.",
      },
      {
        title: noun
          ? `Every clue should name a specific kind of ${noun} once the category sharpens`
          : "Use the anchor clue to set the category level",
        body: `Once "${turningPoint}" lands, check whether the rest of the clues fit that same category at the same level of precision.`,
      },
    ];
  }

  if (kind === "association") {
    return [
      {
        title: firstClue && secondClue
          ? `"${firstClue}" and "${secondClue}" can look like they belong to different categories at first`
          : "Look for one shared world, not one shared label",
        body: "Association boards often mix clue types, so the right solve can be a common context instead of a tidy dictionary category.",
      },
      {
        title: `"${turningPoint}" is what makes the answer feel concrete instead of broad`,
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
      title: firstClue && secondClue
        ? `"${firstClue}" and "${secondClue}" can look like they belong to different categories at first`
        : answerLabel
          ? `Use "${turningPoint}" to test ${answerLabel}`
          : `"${turningPoint}" is the clue that makes the set concrete`,
      body: "When the opening clues feel broad, wait for the clue that turns one fuzzy theme into a testable answer.",
    },
    {
      title: `"${turningPoint}" is what makes the answer feel concrete instead of broad`,
      body: "A strong Pinpoint answer should explain why every clue belongs, not just why the words feel loosely related.",
    },
    {
      title: `Re-check the early clues once "${turningPoint}" sharpens the answer`,
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
  const firstClue = stripFallbackQuotes(clues[0] || "");
  const secondClue = stripFallbackQuotes(clues[1] || "");

  const connectionQuestion = firstClue && secondClue
    ? `How do "${firstClue}" and "${secondClue}" connect in LinkedIn Pinpoint #${puzzleNumber}?`
    : `What is the connection in LinkedIn Pinpoint #${puzzleNumber}?`;

  const turningClueQuestion = `Why is "${turningPoint}" the key clue in LinkedIn Pinpoint #${puzzleNumber}?`;
  const answerQuestion = buildFallbackAnswerFaqQuestion({ puzzleNumber, kind, clues });

  if (isPhrasePattern(kind)) {
    const positionText = phrasePositionText(kind);
    return [
      {
        question: answerQuestion,
        answer: `The answer is ${answer}. That reading is the first one that turns all five clues into familiar phrases or common terms.`,
      },
      {
        question: connectionQuestion,
        answer: `The connection is ${connectorSummary}. The same word fits ${positionText} every clue to create familiar phrases or everyday terms.`,
      },
      {
        question: turningClueQuestion,
        answer: `"${turningPoint}" is the strongest clue because ${turningPhrase ? `"${turningPhrase}" points to one exact phrase much faster than the earlier clues do.` : "it points to one exact phrase much faster than the earlier clues do."}`,
      },
    ];
  }

  if (kind === "typed-category") {
    const noun = detectFallbackNoun(answer);
    return [
      {
        question: answerQuestion,
        answer: `The answer is ${answer}. That reading is the first one that turns the clues into recognizable members of the same typed category instead of one loose topic bucket.`,
      },
      {
        question: connectionQuestion,
        answer: `The connection is ${connectorSummary}. The board gets easier once you ask what kind of thing each clue could specifically be, not just what they vaguely remind you of.`,
      },
      {
        question: turningClueQuestion,
        answer: `"${turningPoint}" is the anchor clue because it sharpens the board into one exact type-level answer and makes the earlier clues easier to re-check under the same category noun.`,
      },
      ...(firstClue && noun ? [{
        question: `How does "${firstClue}" fit as ${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun} in LinkedIn Pinpoint #${puzzleNumber}?`,
        answer: `"${firstClue}" is a recognizable ${noun}, which keeps the board specific instead of broadly themed.`,
      }] : []),
    ];
  }

  if (kind === "association") {
    return [
      {
        question: answerQuestion,
        answer: `The answer is ${answer}. That reading works because the clues all point back to the same subject or context, even if they do not all look like the same kind of clue on first read.`,
      },
      {
        question: connectionQuestion,
        answer: `The connection is ${connectorSummary}. This board solves better by shared context than by forcing all 5 clues into one literal category label.`,
      },
      {
        question: turningClueQuestion,
        answer: `"${turningPoint}" matters most because it gives the board one clear subject to test, which is what lets the remaining clues stop feeling scattered.`,
      },
    ];
  }

  if (isVisualCategoryBoard(kind, clues)) {
    return [
      {
        question: answerQuestion,
        answer: `The answer is ${answer}. That read works because the symbols form one recognizable visual family rather than a loose set of emoji reactions.`,
      },
      {
        question: connectionQuestion,
        answer: `The connection is ${connectorSummary}. The right way to solve boards like this is to ask what visual system the clues belong to, not just what mood they suggest.`,
      },
      {
        question: turningClueQuestion,
        answer: `"${turningPoint}" is the clue that turns the board from a random icon cluster into one testable visual category.`,
      },
    ];
  }

  return [
    {
      question: answerQuestion,
      answer: `The answer is ${answer}. That reading is the first one that explains the whole set without forcing any clue.`,
    },
    {
      question: connectionQuestion,
      answer: `The connection is ${connectorSummary}. The clues read more cleanly once they are tested under that same idea instead of as a loose theme.`,
    },
    {
      question: turningClueQuestion,
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
  const earlyCheckText = clues
    .map(stripFallbackQuotes)
    .filter((clue) => clue && clue !== stripFallbackQuotes(turningPoint))
    .slice(0, 2)
    .join(" and ");
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
    earlyCheckText
      ? `The turn came when I let "${turningPoint}" lead the solve. After that, ${earlyCheckText} had to earn their place under the same answer instead of just sharing a loose surface feel.`
      : `The turn came when I let "${turningPoint}" lead the solve. That clue gave me a concrete check on the rest of the board instead of a loose theme.`,
  ];
}
