import { detectAnswerPattern } from "../puzzle-generation/answer-pattern";

export type RepairablePuzzleSummary = {
  slug?: string;
  puzzleNumber?: number;
  clues?: unknown;
  answer?: unknown;
  mainAnswer?: unknown;
  category?: unknown;
};

export type RepairablePuzzleDetail = Record<string, unknown> & {
  slug?: string;
  puzzleNumber?: number;
  bodyMode?: "short" | "standard" | "deep" | null;
  answer?: string;
  mainAnswer?: string;
  category?: string;
  clues?: string[];
  articleBlocks?: string[];
  solutionNarrative?: string[];
  solvePath?: Record<string, unknown>;
  turningPoint?: Record<string, unknown>;
  clueRows?: Array<Record<string, unknown>>;
  display?: {
    clueTableRows?: Array<Record<string, unknown>>;
  };
  wrongGuessCandidates?: Array<Record<string, unknown>>;
};

type ClueRow = {
  clue: string;
  phrase: string;
  note: string;
};

export type SolutionNarrativeRepairResult<T extends RepairablePuzzleDetail> = {
  detail: T;
  narrative: string[];
  changedFields: string[];
};

function asText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function countWords(text: string): number {
  return text.trim().match(/\S+/g)?.length ?? 0;
}

function normalizeForMatch(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/["“”'`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeForOverlap(value: string): string[] {
  return normalizeForMatch(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 4);
}

function overlapRatio(left: string, right: string): number {
  const leftTokens = new Set(tokenizeForOverlap(left));
  const rightTokens = new Set(tokenizeForOverlap(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }

  return overlap / Math.min(leftTokens.size, rightTokens.size);
}

function longestSharedTokenRun(left: string, right: string): number {
  const leftTokens = tokenizeForOverlap(left);
  const rightTokens = tokenizeForOverlap(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;

  const matrix = Array.from({ length: leftTokens.length + 1 }, () => new Array<number>(rightTokens.length + 1).fill(0));
  let longest = 0;

  for (let i = 1; i <= leftTokens.length; i += 1) {
    for (let j = 1; j <= rightTokens.length; j += 1) {
      if (leftTokens[i - 1] === rightTokens[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1] + 1;
        if (matrix[i][j] > longest) longest = matrix[i][j];
      }
    }
  }

  return longest;
}

function uniqueTexts(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values.map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function listItems(values: string[]): string {
  const items = values.filter(Boolean);
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function answerFor(summary: RepairablePuzzleSummary | undefined, detail: RepairablePuzzleDetail): string {
  return (
    asText(detail.answer) ||
    asText(detail.mainAnswer) ||
    asText(summary?.answer) ||
    asText(summary?.mainAnswer) ||
    asText(detail.category) ||
    asText(summary?.category)
  );
}

function cluesFor(summary: RepairablePuzzleSummary | undefined, detail: RepairablePuzzleDetail): string[] {
  const detailClues = Array.isArray(detail.clues) ? detail.clues.map(asText).filter(Boolean) : [];
  const summaryClues = Array.isArray(summary?.clues) ? summary.clues.map(asText).filter(Boolean) : [];
  const clues = detailClues.length === 5 ? detailClues : summaryClues;
  const slug = asText(detail.slug) || asText(summary?.slug) || "puzzle detail";
  if (clues.length !== 5) throw new Error(`${slug} needs exactly 5 clues to repair the solve narrative`);
  return clues;
}

function buildFallbackPhrase(clue: string, answer: string): string {
  const pattern = detectAnswerPattern(answer);
  if (pattern.kind === "before") return `${clue} ${pattern.token}`.trim();
  if (pattern.kind === "after") return `${pattern.token} ${clue}`.trim();
  if (pattern.kind === "typed-category") return `${clue} as a ${pattern.singularNoun}`.trim();
  return clue;
}

function rowsFromDetail(detail: RepairablePuzzleDetail, clues: string[], answer: string): ClueRow[] {
  const clueRows = Array.isArray(detail.clueRows) ? detail.clueRows : [];
  const displayRows = Array.isArray(detail.display?.clueTableRows) ? detail.display.clueTableRows : [];

  return clues.map((clue, index) => {
    const clueRow = clueRows.find((row) => asText(row.clue).toLowerCase() === clue.toLowerCase()) || clueRows[index];
    const displayRow = displayRows.find((row) => asText(row.clue).toLowerCase() === clue.toLowerCase()) || displayRows[index];
    const phrase =
      asText(clueRow?.resolvedPhraseOrMember) ||
      asText(clueRow?.phraseExample) ||
      asText(displayRow?.examplePhrase) ||
      buildFallbackPhrase(clue, answer);
    const note =
      asText(clueRow?.nonObviousWhy) ||
      asText(displayRow?.connectionExplained) ||
      `${phrase} is the cleaner fit once the answer frame is tested.`;
    return { clue, phrase, note };
  });
}

function resolveBreakingClue(detail: RepairablePuzzleDetail, rows: ClueRow[]): string {
  const explicit =
    asText(detail.turningPoint?.clue) ||
    asText(detail.solvePath?.breakingClue) ||
    asText(detail.solvePath?.pivot);
  if (explicit) {
    const matched = rows.find((row) => explicit.toLowerCase().includes(row.clue.toLowerCase()));
    if (matched) return matched.clue;
  }
  return rows[rows.length - 1]?.clue || rows[0]?.clue || "";
}

function readableFalseStart(detail: RepairablePuzzleDetail, clues: string[]): string {
  const candidates = Array.isArray(detail.wrongGuessCandidates) ? detail.wrongGuessCandidates : [];
  const firstCandidate = candidates
    .map((item) => asText(item.label))
    .find((label) => label && !/^(types?|kinds?) of\b/i.test(label));
  if (firstCandidate) return firstCandidate;
  return `a surface read of ${listItems(clues.slice(0, 2))}`;
}

const GENERIC_CATEGORY_PIVOT_PATTERNS = [
  /\bwhat kind of source or title it was\b/i,
  /\bwhat kind of item each clue described\b/i,
  /\bwhat kind of item it was\b/i,
  /\bstopped feeling broad and started reading like parts of one real set\b/i,
];

export function shouldRepairSolutionNarrative(detail: RepairablePuzzleDetail): boolean {
  const narrativeText = Array.isArray(detail.solutionNarrative)
    ? detail.solutionNarrative.map(asText).filter(Boolean).join(" ")
    : "";
  if (!narrativeText) return true;

  const minWords = detail.bodyMode === "short" ? 70 : 90;
  if (countWords(narrativeText) < minWords) return true;

  if (detail.bodyMode !== "short" && !/\bI\b/.test(narrativeText)) {
    return true;
  }

  if (GENERIC_CATEGORY_PIVOT_PATTERNS.some((pattern) => pattern.test(narrativeText))) {
    return true;
  }

  const overviewText = Array.isArray(detail.articleBlocks) ? asText(detail.articleBlocks[0]) : "";
  if (!overviewText) return false;

  return overlapRatio(overviewText, narrativeText) >= 0.6 || longestSharedTokenRun(overviewText, narrativeText) >= 7;
}

export function buildRepairedSolutionNarrative(input: {
  summary?: RepairablePuzzleSummary;
  detail: RepairablePuzzleDetail;
}): string[] {
  const { summary, detail } = input;
  const answer = answerFor(summary, detail);
  const slug = asText(detail.slug) || asText(summary?.slug) || "puzzle detail";
  if (!answer) throw new Error(`${slug} is missing the official answer`);

  const clues = cluesFor(summary, detail);
  const rows = rowsFromDetail(detail, clues, answer);
  const falseStart = readableFalseStart(detail, clues);
  const firstRows = rows.slice(0, 2);
  const breakingClue = resolveBreakingClue(detail, rows);
  const breakingRow = rows.find((row) => row.clue === breakingClue) || rows[rows.length - 1];
  const confirmationRows = uniqueTexts(rows
    .filter((row) => row.clue !== breakingRow.clue)
    .map((row) => row.phrase))
    .slice(0, 4);
  const firstClueLine = firstRows
    .map((row) => `${row.clue} could be read as ${quote(row.phrase)}`)
    .join(", while ");
  const confirmationLine = confirmationRows.length > 0
    ? `I then checked ${listItems(confirmationRows.map(quote))}.`
    : "I then checked the remaining clues one by one.";
  const clueNames = listItems(clues);

  return [
    `I first read ${listItems(clues.slice(0, 2))} too literally and drifted toward ${falseStart}. ${firstClueLine || "Those clues had a few tempting surface meanings"}, so the board still felt open instead of solved.`,
    `${breakingRow.clue} changed the direction because ${quote(breakingRow.phrase)} gave me a testable phrase, not just a loose topic. Once that line worked, I had a fixed place to put the repeated word and could go back through the earlier clues with a clearer target.`,
    `${confirmationLine} Those checks mattered because each one landed as ordinary wording on its own, so I was not forcing five separate hints into one bag. The board started to behave like one phrase pattern across ${clueNames}.`,
    `That left very little room for the earlier false start. The answer was ${quote(answer)}, and the last step was simply making sure every clue used that same reading cleanly before treating the solve as finished.`,
  ];
}

export function repairSolutionNarrative<T extends RepairablePuzzleDetail>(input: {
  summary?: RepairablePuzzleSummary;
  detail: T;
}): SolutionNarrativeRepairResult<T> {
  const narrative = buildRepairedSolutionNarrative(input);
  const nextDetail = {
    ...input.detail,
    solutionNarrative: narrative,
  } as T;
  const changedFields = ["solutionNarrative"];

  if (input.detail.solvePath && typeof input.detail.solvePath === "object" && !Array.isArray(input.detail.solvePath)) {
    nextDetail.solvePath = {
      ...input.detail.solvePath,
      pivot: narrative.join("\n\n"),
    };
    changedFields.push("solvePath.pivot");
  }

  return {
    detail: nextDetail,
    narrative,
    changedFields,
  };
}
