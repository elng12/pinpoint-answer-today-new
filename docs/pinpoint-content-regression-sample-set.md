# Pinpoint Content Regression Sample Set

This sample set is the minimum board mix to re-test after any change to the
Pinpoint content generator, semantic lint rules, or publish gating.

## Core Set

### 682 - Category board with mixed cultural contexts
- File: `data/puzzles/pinpoint-answer-682.json`
- Answer type: typed category (`Types of dolls`)
- Why it matters:
  - Catches the old failure mode where category boards get written like phrase boards.
  - Verifies that clue labels stay natural (`Ball-jointed doll`, `Voodoo doll`, `Barbie doll`).
  - Verifies that FAQ and summary talk about category fit instead of "connector" language.

### 683 - Words that come after
- File: `data/puzzles/pinpoint-answer-683.json`
- Answer type: phrase pattern (`Words that come after "false"`)
- Why it matters:
  - Verifies spoiler-safe hero copy.
  - Verifies turning point quality on a suffix-style board.
  - Verifies answer repetition stays controlled.

### 684 - Words that come before
- File: `data/puzzles/pinpoint-answer-684.json`
- Answer type: phrase pattern (`Words that come before "roses"`)
- Why it matters:
  - Verifies clue-by-clue explanation stays concrete instead of templated.
  - Verifies idiom-based final clue handling.
  - Verifies phrase boards do not regress back to `X connects to...` writing.

### 678 - Phrase board across eras
- File: `data/puzzles/pinpoint-answer-678.json`
- Answer type: phrase pattern (`Words that come before phone`)
- Why it matters:
  - Verifies mixed-era clues still resolve cleanly.
  - Good at catching shallow summaries that ignore clue breadth.

### 679 - Franchise category board
- File: `data/puzzles/pinpoint-answer-679.json`
- Answer type: category (`Characters in Super Mario`)
- Why it matters:
  - Verifies category boards that are not `Types of X`.
  - Good at catching over-narrow answers such as heroes-only or villains-only.

### 681 - Phrase board with symbol clue
- File: `data/puzzles/pinpoint-answer-681.json`
- Answer type: phrase pattern (`Words that come before mouse`)
- Why it matters:
  - Verifies icon or partial-phrase clues.
  - Good at catching weak narrative handling around visual clues.

## Extended Set

### 674 - Category board with place-based reasoning
- File: `data/puzzles/pinpoint-answer-674.json`
- Answer type: category (`Places with benches`)
- Why it matters:
  - Verifies concrete object/location reasoning.
  - Good at catching vague category summaries.

### 680 - Modifier-based color category
- File: `data/puzzles/pinpoint-answer-680.json`
- Answer type: category (`Shades of blue`)
- Why it matters:
  - Verifies modifier-based boards that look like phrase boards at first glance.
  - Good at catching wrong template selection.

## Pass Criteria

Every regenerated draft in the sample set should pass these checks:

1. The hero intro stays spoiler-safe and does not directly reveal the exact answer.
2. The intro mentions enough clue context to avoid sounding generic.
3. Phrase boards use phrase logic; category boards use category-fit language.
4. The turning point feels like a real clue, not a recycled explanation sentence.
5. `clueDetails` use natural labels, not invented or awkward phrasing.
6. FAQ answers are puzzle-specific and do not collapse into generic strategy filler.
7. The exact answer does not get over-repeated in the visible body copy.

## Quick Run Order

If time is tight, run in this order:

1. 683
2. 682
3. 684
4. 679

That four-board slice is the fastest way to catch the biggest regressions:
- phrase-after
- typed category
- phrase-before
- non-typed category
