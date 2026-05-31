import { getArchiveEntries, getPuzzleBySlug } from "../lib/puzzles/data";
import {
  buildReasoningArticleDraft,
  validateReasoningArticleDraft,
  type ReasoningArticleQualityIssue,
} from "../lib/puzzles/reasoning-article";

type CliOptions = {
  limit: number;
  slug: string | null;
};

type ScopedIssue = ReasoningArticleQualityIssue & {
  slug: string;
};

function parseArgs(argv: string[]): CliOptions {
  let limit = Number.POSITIVE_INFINITY;
  let slug: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--limit") {
      const next = argv[index + 1];
      index += 1;
      limit = next ? Number.parseInt(next, 10) : Number.NaN;
    } else if (arg === "--slug") {
      slug = argv[index + 1] ?? null;
      index += 1;
    }
  }

  if (!Number.isFinite(limit) && limit !== Number.POSITIVE_INFINITY) {
    throw new Error("--limit must be a number.");
  }

  return { limit, slug };
}

function formatIssue(issue: ScopedIssue): string {
  return `- ${issue.slug}: [${issue.severity}] ${issue.code}: ${issue.message}`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const archiveEntries = await getArchiveEntries({ allowLiveWorkerFallback: false });
  const selectedEntries = archiveEntries
    .filter((entry) => (options.slug ? entry.slug === options.slug : true))
    .slice(0, options.limit);

  if (selectedEntries.length === 0) {
    throw new Error(options.slug ? `No puzzle found for slug ${options.slug}.` : "No public puzzles found.");
  }

  const issues: ScopedIssue[] = [];

  for (const entry of selectedEntries) {
    const puzzle = await getPuzzleBySlug(entry.slug, { allowLiveWorkerFallback: false });
    if (!puzzle) {
      issues.push({
        code: "detail-missing",
        message: "Puzzle detail could not be loaded.",
        severity: "hard",
        slug: entry.slug,
      });
      continue;
    }
    const draft = buildReasoningArticleDraft(puzzle);
    const draftIssues = validateReasoningArticleDraft(draft, puzzle);
    issues.push(...draftIssues.map((issue) => ({ ...issue, slug: puzzle.slug })));
  }

  const hardIssues = issues.filter((issue) => issue.severity === "hard");
  const warnings = issues.filter((issue) => issue.severity === "warn");

  if (hardIssues.length > 0) {
    console.error("Pinpoint reasoning article check failed:");
    hardIssues.slice(0, 40).forEach((issue) => console.error(formatIssue(issue)));
    if (hardIssues.length > 40) {
      console.error(`...and ${hardIssues.length - 40} more hard issues.`);
    }
    if (warnings.length > 0) {
      console.error(`Warnings also found: ${warnings.length}`);
    }
    process.exit(1);
  }

  console.log(`ok: reasoning article drafts passed hard checks for ${selectedEntries.length} Pinpoint pages`);
  if (warnings.length > 0) {
    console.log(`warn: ${warnings.length} soft quality notes found`);
    warnings.slice(0, 12).forEach((issue) => console.log(formatIssue(issue)));
    if (warnings.length > 12) {
      console.log(`...and ${warnings.length - 12} more warnings.`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
