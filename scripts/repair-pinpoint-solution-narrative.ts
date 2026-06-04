import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  repairSolutionNarrative,
  type RepairablePuzzleDetail,
} from "../lib/puzzles/solution-narrative-repair";

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

type DetailRecord = RepairablePuzzleDetail;

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
  const repair = repairSolutionNarrative({ summary: entry, detail });

  if (!args.dryRun) {
    writeFileSync(detailPath, `${JSON.stringify(repair.detail, null, 2)}\n`, "utf8");
  }

  const result = {
    status: args.dryRun ? "dry_run" : "repaired",
    slug: entry.slug,
    puzzleNumber: entry.puzzleNumber,
    reason: args.reason || null,
    changedFields: repair.changedFields,
    solutionNarrative: repair.narrative,
  };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${args.dryRun ? "Would repair" : "Repaired"} ${entry.slug} solutionNarrative.`);
    console.log(`Reason: ${args.reason || "manual"}`);
  }
}

main();
