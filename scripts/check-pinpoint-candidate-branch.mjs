import { spawnSync } from "node:child_process";
import process from "node:process";

function readArg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function runGit(args) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "git failed").trim();
    throw new Error(`git ${args.join(" ")} failed: ${detail}`);
  }
  return String(result.stdout || "").trim();
}

function readJsonFromRef(ref, filePath) {
  const raw = runGit(["show", `${ref}:${filePath}`]);
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Could not parse ${filePath} from ${ref}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const base = readArg("--base", "origin/main");
const head = readArg("--head", "HEAD");
const branch = readArg("--branch", process.env.GITHUB_REF_NAME || "");
const branchMatch = branch.match(/^pinpoint\/candidate\/(\d{4}-\d{2}-\d{2})-(pinpoint-answer-\d+)$/);

if (!branchMatch) {
  throw new Error(`Candidate branch name is not allowed: ${branch || "(missing)"}`);
}

const [, publishDate, slug] = branchMatch;

const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", base, head], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
if (ancestor.status !== 0) {
  throw new Error(`Candidate branch must be a fast-forward from ${base}; rebase or recreate the candidate branch.`);
}

const changedFiles = runGit(["diff", "--name-only", `${base}..${head}`])
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const allowedPuzzlePath = `data/puzzles/${slug}.json`;
const allowed = new Set([allowedPuzzlePath, "data/puzzles/registry.json"]);
const disallowed = changedFiles.filter((file) => !allowed.has(file));
if (disallowed.length > 0) {
  throw new Error(`Candidate branch contains disallowed file changes: ${disallowed.join(", ")}`);
}

if (!changedFiles.includes(allowedPuzzlePath)) {
  throw new Error(`Candidate branch is missing required file change: ${allowedPuzzlePath}`);
}

const baseRegistry = readJsonFromRef(base, "data/puzzles/registry.json");
const baseEntry = Array.isArray(baseRegistry)
  ? baseRegistry.find((item) => String(item?.slug || "") === slug)
  : null;
const baseAlreadyPublishesSlug =
  String(baseEntry?.publishDate || "") === publishDate &&
  String(baseEntry?.status || "") === "live" &&
  (String(baseEntry?.detailState || "published") === "published" ||
    String(baseEntry?.detailState || "published") === "fallback_full");

if (!baseAlreadyPublishesSlug && !changedFiles.includes("data/puzzles/registry.json")) {
  throw new Error("Candidate branch is missing required file change: data/puzzles/registry.json");
}

const puzzle = readJsonFromRef(head, allowedPuzzlePath);
const registry = readJsonFromRef(head, "data/puzzles/registry.json");
const entry = Array.isArray(registry)
  ? registry.find((item) => String(item?.slug || "") === slug)
  : null;

if (!entry) {
  throw new Error(`registry.json does not contain ${slug}`);
}

if (String(entry.publishDate || "") !== publishDate) {
  throw new Error(`registry publishDate mismatch for ${slug}: expected ${publishDate}, got ${entry.publishDate || "(missing)"}`);
}

if (String(entry.status || "") !== "live") {
  throw new Error(`registry entry for ${slug} must be live before candidate promotion`);
}

if (String(entry.detailState || "") !== "published" && String(entry.detailState || "") !== "fallback_full") {
  throw new Error(`registry entry for ${slug} has non-public detailState: ${entry.detailState || "(missing)"}`);
}

if (String(puzzle.slug || "") !== slug) {
  throw new Error(`detail JSON slug mismatch: expected ${slug}, got ${puzzle.slug || "(missing)"}`);
}

if (String(puzzle.detailState || "") !== "published" && String(puzzle.detailState || "") !== "fallback_full") {
  throw new Error(`detail JSON for ${slug} has non-public detailState: ${puzzle.detailState || "(missing)"}`);
}

console.log(`ok: ${branch} only updates ${allowedPuzzlePath} and data/puzzles/registry.json`);
