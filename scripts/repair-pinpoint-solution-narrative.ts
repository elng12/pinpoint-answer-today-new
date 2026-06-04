import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { detectAnswerPattern } from "../lib/puzzle-generation/answer-pattern";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const REGISTRY_PATH = resolve(ROOT, "data", "puzzles", "registry.json");
const PUBLIC_STATUSES = new Set(["live", "archived"]);
const PUBLIC_DETAIL_STATES = new Set(["published", "fallback_full"]);

type Args = {
  slug?: string;
  dryRun: boolean;
  json: boolean;
  reason?: string;
  help: boolean;
};

type RegistryEntry = {
  puzzleNumber: number;
  slug: string;
  publishDate: string;
  status: string;
  detailState?: string;
  clues?: string[];
  mainAnswer?: string | null;
  category?: string | null;
};

type ClueRow = {
  clue: string;
  phrase: string;
  note: string;
};

type DetailRecord = Record<string, unknown> & {
  slug?: string;
  puzzleNumber?: number;
  answer?: string;
  mainAnswer?: string;
  category?: string;
  clues?: string[];
  solutionNarrative?: string[];
  solvePath?: Record<string, unknown>;
  turningPoint?: Record<string, unknown>;
  clueRows?: Array<Record<string, unknown>>;
  display?: {
    clueTableRows?: Array<Record<string, unknown>>;
  };
  wrongGuessCandidates?: Array<Record<string, unknown>>;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dryRun: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--slug") {
      const value = argv[index + 1];
      if (!value) throw new Error("--slug requires a value");
      args.slug = value;
      index += 1;
    } else if (arg.startsWith("--slug=")) {
      args.slug = arg.slice("--slug=".length);
    } else if (arg === "--reason") {
      const value = argv[index + 1];
      if (!value) throw new Error("--reason requires a value");
      args.reason = value;
      index += 1;
    } else if (arg.startsWith("--reason=")) {
      args.reason = arg.slice("--reason=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Usage:
  npm run pinpoint:repair-solution-narrative
  npm run pinpoint:repair-solution-narrative -- --slug pinpoint-answer-765
  npm run pinpoint:repair-solution-narrative -- --dry-run --json

What it changes:
  - latest public puzzle detail JSON, or the --slug detail JSON
  - solutionNarrative
  - solvePath.pivot when solvePath exists
`.trim());
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
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

function isPublicEntry(entry: RegistryEntry): boolean {
  const detailState = asText(entry.detailState || "published");
  return PUBLIC_STATUSES.has(entry.status) && PUBLIC_DETAIL_STATES.has(detailState);
}

function resolveRegistryEntry(registry: RegistryEntry[], slug?: string): RegistryEntry {
  if (slug) {
    const entry = registry.find((item) => item.slug === slug);
    if (!entry) throw new Error(`No registry entry found for ${slug}`);
    return entry;
  }

  const entry = registry
    .filter(isPublicEntry)
    .sort((left, right) => right.puzzleNumber - left.puzzleNumber)[0];
  if (!entry) throw new Error("No public registry entry found");
  return entry;
}

function detailPathFor(slug: string): string {
  return resolve(ROOT, "data", "puzzles", `${slug}.json`);
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

function answerFor(entry: RegistryEntry, detail: DetailRecord): string {
  return asText(detail.answer) || asText(detail.mainAnswer) || asText(entry.mainAnswer) || asText(detail.category) || asText(entry.category);
}

function cluesFor(entry: RegistryEntry, detail: DetailRecord): string[] {
  const detailClues = Array.isArray(detail.clues) ? detail.clues.map(asText).filter(Boolean) : [];
  const entryClues = Array.isArray(entry.clues) ? entry.clues.map(asText).filter(Boolean) : [];
  const clues = detailClues.length === 5 ? detailClues : entryClues;
  if (clues.length !== 5) throw new Error(`${entry.slug} needs exactly 5 clues to repair the solve narrative`);
  return clues;
}

function buildFallbackPhrase(clue: string, answer: string): string {
  const pattern = detectAnswerPattern(answer);
  if (pattern.kind === "before") return `${clue} ${pattern.token}`.trim();
  if (pattern.kind === "after") return `${pattern.token} ${clue}`.trim();
  if (pattern.kind === "typed-category") return `${clue} as a ${pattern.singularNoun}`.trim();
  return clue;
}

function rowsFromDetail(detail: DetailRecord, clues: string[], answer: string): ClueRow[] {
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

function resolveBreakingClue(detail: DetailRecord, rows: ClueRow[]): string {
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

function readableFalseStart(detail: DetailRecord, clues: string[]): string {
  const candidates = Array.isArray(detail.wrongGuessCandidates) ? detail.wrongGuessCandidates : [];
  const firstCandidate = candidates
    .map((item) => asText(item.label))
    .find((label) => label && !/^(types?|kinds?) of\b/i.test(label));
  if (firstCandidate) return firstCandidate;
  return `a surface read of ${listItems(clues.slice(0, 2))}`;
}

function buildNarrative(entry: RegistryEntry, detail: DetailRecord): string[] {
  const answer = answerFor(entry, detail);
  if (!answer) throw new Error(`${entry.slug} is missing the official answer`);

  const clues = cluesFor(entry, detail);
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
    : `I then checked the remaining clues one by one.`;
  const clueNames = listItems(clues);

  return [
    `I first read ${listItems(clues.slice(0, 2))} too literally and drifted toward ${falseStart}. ${firstClueLine || `Those clues had a few tempting surface meanings`}, so the board still felt open instead of solved.`,
    `${breakingRow.clue} changed the direction because ${quote(breakingRow.phrase)} gave me a testable phrase, not just a loose topic. Once that line worked, I had a fixed place to put the repeated word and could go back through the earlier clues with a clearer target.`,
    `${confirmationLine} Those checks mattered because each one landed as ordinary wording on its own, so I was not forcing five separate hints into one bag. The board started to behave like one phrase pattern across ${clueNames}.`,
    `That left very little room for the earlier false start. The answer was ${quote(answer)}, and the last step was simply making sure every clue used that same reading cleanly before treating the solve as finished.`,
  ];
}

function repairDetail(detail: DetailRecord, narrative: string[]): DetailRecord {
  const nextDetail: DetailRecord = {
    ...detail,
    solutionNarrative: narrative,
  };

  if (detail.solvePath && typeof detail.solvePath === "object" && !Array.isArray(detail.solvePath)) {
    nextDetail.solvePath = {
      ...detail.solvePath,
      pivot: narrative.join("\n\n"),
    };
  }

  return nextDetail;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const registry = readJson<RegistryEntry[]>(REGISTRY_PATH);
  const entry = resolveRegistryEntry(registry, args.slug);
  const detailPath = detailPathFor(entry.slug);
  if (!existsSync(detailPath)) throw new Error(`Missing detail file: ${detailPath}`);

  const detail = readJson<DetailRecord>(detailPath);
  const narrative = buildNarrative(entry, detail);
  const repaired = repairDetail(detail, narrative);

  if (!args.dryRun) {
    writeFileSync(detailPath, `${JSON.stringify(repaired, null, 2)}\n`, "utf8");
  }

  const result = {
    status: args.dryRun ? "dry_run" : "repaired",
    slug: entry.slug,
    puzzleNumber: entry.puzzleNumber,
    reason: args.reason || null,
    changedFields: ["solutionNarrative", ...(detail.solvePath ? ["solvePath.pivot"] : [])],
    solutionNarrative: narrative,
  };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${args.dryRun ? "Would repair" : "Repaired"} ${entry.slug} solutionNarrative.`);
    console.log(`Reason: ${args.reason || "manual"}`);
  }
}

main();
