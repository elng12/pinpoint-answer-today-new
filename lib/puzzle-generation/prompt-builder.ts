import type { PuzzleDataForAI } from "@/lib/puzzle-generation/types";
import { detectAnswerPattern } from "@/lib/puzzle-generation/answer-pattern";
import { normalizeClueForAI } from "@/lib/puzzles/clue-normalizer";
import { SLOT_CONTRACT } from "@/lib/puzzles/slot-contract";

export const LLM_TEMPLATE_VERSION = "pinpoint-v9";

export const LLM_SYSTEM_PROMPT = [
  'You write archive content for "Pinpoint Answer Today".',
  "Write like a sharp human solver replaying how the answer became clear.",
  "Do not sound like a teacher, analyst, glossary, or SEO filler writer.",
  "Prefer concrete solve-story language over abstract category language.",
  "Return JSON only.",
].join(" ");

export function buildPuzzlePrompt(puzzleData: PuzzleDataForAI): string {
  const normalizedClues = (puzzleData.rawWords || []).map((clue) => normalizeClueForAI(clue));
  const clues = normalizedClues.map((item) => item.normalized).join(", ");
  const originalClues = (puzzleData.rawWords || []).join(", ");
  const answerPattern = detectAnswerPattern(puzzleData.mainAnswer);
  const patternSpecificRules =
    answerPattern.kind === "before" || answerPattern.kind === "after"
      ? `
Pattern-specific rules:
- This is a phrase-pattern board, not a broad category board.
- connectorSummary should stay spoiler-safe and concise, like a phrase pattern label rather than the exact answer.
- clueDetails.phrase should be the exact natural phrase that fits each clue.
- whyItWorks should explain why that phrase is a clean fit.
`.trim()
      : `
Pattern-specific rules:
- This is a category board, not a before/after phrase board.
- connectorSummary should be a short spoiler-safe category bridge, not a vague slogan.
- connectorSummary must stay plain and natural. Do NOT use slashes, parentheses, stacked qualifiers, or over-explained labels.
- connectorSummary must sound like a plain UI label, not a joke, twist, contrast line, or conversational aside.
- clueDetails.phrase should usually be a natural member label inside the category.
- If the answer is "Types of X", clueDetails.phrase should usually end with the category noun when natural.
- If a clue is already a recognizable title, brand, publication, or named entity, keep clueDetails.phrase close to that clue instead of swapping in a generic subtype label.
- whyItWorks should explain why each clue belongs in the category.
- falseStarts must be broad, realistic category guesses like newspapers, media brands, travel publications, or nature media. Do NOT use city names, one-off titles, or long awkward labels.
- falseStarts must not sound like retail taxonomy, ecommerce filters, or audience segments. Avoid phrases like gifts for adults, products for..., items for..., or categories for...
- If three or more clues already point toward the same everyday category, keep the solve narrative calm and straightforward instead of forcing extra drama.
`.trim();

  return `
You are a senior content writer for "Pinpoint Answer Today". Use the V9 Article Slot Template.

Output ONLY a valid JSON object.

Minimum required shape:
{
  "pageExperienceMode": "full-analysis",
  "wrongGuessCandidates": [
    {
      "label": "...",
      "whyPlausible": "...",
      "whyRejected": "..."
    }
  ],
  "setValidationSummary": "...",
  "categoryPrecisionNote": "...",
  "slots": {
    "heroIntroSpoilerSafe": "...",
    "connectorSummary": "...",
    "turningPoint": "...",
    "falseStarts": ["...", "..."],
    "rejectedGuess": { "guess": "...", "explanation": "..." },
    "clueDetails": [
      {
        "clue": "...",
        "surfaceRead": "...",
        "phrase": "...",
        "whyItWorks": "...",
        "etymology": "..."
      }
    ],
    "difficultyReason": "...",
    "portableTakeaway": "..."
  },
  "sections": {
    "articleBlocks": ["...", "..."]
  }
}

Required structured publish fields at the root:
- "pageExperienceMode"
- "wrongGuessCandidates"
- "setValidationSummary"
- "categoryPrecisionNote"

Also include these v2 evidence fields at the root when you can fill them cleanly:
- "questionType"
- "difficultyBand"
- "solvePath"
- "turningPoint"
- "clueRows"
- "faqItems"
- "uniquenessSignals"

Hard requirements:
1. heroIntroSpoilerSafe is the pre-reveal intro shown before the user chooses to reveal the answer.
2. heroIntroSpoilerSafe must be ${SLOT_CONTRACT.heroIntroMinWords} to ${SLOT_CONTRACT.heroIntroMaxWords} words and must NOT include the exact answer text: ${puzzleData.mainAnswer}
3. connectorSummary must be a short spoiler-safe label, ${SLOT_CONTRACT.connectorSummaryMinWords} to ${SLOT_CONTRACT.connectorSummaryMaxWords} words, and must NOT equal or quote the exact answer text.
4. turningPoint must name the clue or clue combination that forces the mental pivot, in one plain human sentence.
5. falseStarts must contain 1 or 2 plausible wrong reads or weak categories.
6. rejectedGuess.explanation must explain why that guess falls short.
7. Include exactly ${SLOT_CONTRACT.clueDetailsRequired} clueDetails items, one for each original clue in this exact set: ${originalClues}
8. Each clueDetails.clue must match one original clue exactly as written.
9. Each clueDetails.phrase must be a natural phrase or category reading that is different from the clue.
10. Each clueDetails.whyItWorks must explain specific logic, not just restate the final answer.
11. difficultyReason must explain why the board feels tricky without directly repeating the exact answer.
12. portableTakeaway must be one short practical lesson the solver can reuse tomorrow.
13. sections.articleBlocks must contain 8 to 14 short paragraphs.
14. Most articleBlocks paragraphs should be one sentence. Some can be two sentences. Avoid long blocks.
15. articleBlocks must include one believable wrong read, one clean turning clue, one explicit answer reveal, and a resolved closing line.
16. pageExperienceMode should be "full-analysis" for this long-form draft.
17. wrongGuessCandidates must describe believable nearby reads:
   - if difficultyBand is "obvious", include at least 1 candidate
   - if difficultyBand is "medium" or "hard", include at least 2 candidates
   - each candidate needs label and whyPlausible, and whyRejected when it helps
18. setValidationSummary must explain why the full clue set confirms one answer more cleanly than the nearby wrong reads.
19. categoryPrecisionNote must explain the exact level of precision, not just repeat the answer.
20. Output raw JSON only, no markdown.

Primary writing goal:
- Build the source material for a short archive article, not a report.
- Think in this order: first impression -> wrong direction -> contradiction -> turning clue -> answer -> hindsight clarity.

Writing rules:
- Separate page reveal from explanation. The reveal card owns the first clear answer reveal on-page.
- Treat heroIntroSpoilerSafe as the short intro shown before the user chooses to reveal the answer.
- Do not sneak the exact answer into heroIntroSpoilerSafe, connectorSummary, turningPoint, difficultyReason, or falseStarts.
- Make the slots useful enough that a program can build a short article with believable movement.
- sections.articleBlocks should already read like a short article, not like analysis bullets.
- overview and solutionEmergence must feel different:
  - overview explains why the puzzle shape is misleading and why the final read is cleaner than nearby alternatives
  - solutionEmergence replays one believable solve path in first person
- The solve path should feel like a human replay:
  - one plausible early read
  - one moment where a later clue weakens that read
  - one turning clue that makes the answer concrete
- Prefer concrete language:
  - say "I first thought..." not "the board felt broad"
  - say "that theory broke" not "the frame shifted"
  - say "then X changed the solve" not "the category became specific enough"
- Write natural phrases a real solver might think of.
- Keep falseStarts concrete and everyday, not academic or machiney.
- Do not write teaser copy, hype copy, or ad-style openers.
- Avoid filler lines like:
  - X connects to...
  - X fits the theme
  - The clues all share this connection
  - Difficulty varies
  - This is the hallmark of a well-crafted puzzle
- Avoid overusing abstract words like board, frame, connector, category, pattern in every field.
- Prefer concrete phrase logic over broad vague category talk.

Slot guidance:
- heroIntroSpoilerSafe: a spoiler-safe hook about why the opening clues can mislead, without sounding generic.
- connectorSummary: a plain, compact bridge label the UI can use later. Keep it human.
- connectorSummary: write it like a calm editor label, not like copywriting.
- turningPoint: name the clue that forces the mental pivot. Keep it plain. Avoid phrases like "pattern click", "form factor", "alongside the others", or other writerly meta language.
- falseStarts: broad but believable wrong reads a person would really try first.
- rejectedGuess.explanation: explain why that guess breaks once the turning clue appears.
- clueDetails.surfaceRead: describe the distracting first impression of the clue in plain language.
- clueDetails.phrase: give the clean resolved phrase or category reading.
- clueDetails.whyItWorks: explain the fit specifically and concretely.
- sections.articleBlocks: write the actual article body in short paragraphs. Keep the voice human and specific.

${patternSpecificRules}

Input data:
- Puzzle #${puzzleData.puzzleNumber}
- Clues (normalized for reasoning): ${clues}
- Original clues (must preserve for SEO fields): ${originalClues}
- Answer: ${puzzleData.mainAnswer}
`.trim();
}
