import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";

const CANDIDATE_PREFIX = "pinpoint/candidate";

function hasFlag(name) {
  return process.argv.includes(name);
}

function readArg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  if (result.status !== 0) {
    const detail = options.inherit
      ? `${command} failed`
      : String(result.stderr || result.stdout || `${command} failed`).trim();
    throw new Error(`${command} ${args.join(" ")} failed: ${detail}`);
  }
  return options.inherit ? "" : String(result.stdout || "").trim();
}

function git(args, options) {
  return run("git", args, options);
}

function gitMaybe(args) {
  return spawnSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function statusLines() {
  return git(["status", "--short"])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function ensureCleanWorktree() {
  const lines = statusLines();
  if (lines.length > 0) {
    throw new Error(`Working tree must be clean before recovery starts: ${lines.join(", ")}`);
  }
}

function currentHeadSha() {
  return git(["rev-parse", "HEAD"]);
}

function fetchOriginMain() {
  git(["fetch", "origin", "+main:refs/remotes/origin/main"]);
}

function exitOk(payload) {
  console.log(JSON.stringify({ ok: true, ...payload }, null, 2));
}

function resolveChangedDetailPath(changedFiles) {
  const detailFiles = changedFiles.filter((file) => /^data\/puzzles\/pinpoint-answer-\d+\.json$/.test(file));
  if (detailFiles.length !== 1) {
    throw new Error(`Expected exactly one repaired detail JSON, got: ${detailFiles.join(", ") || "(none)"}`);
  }
  const disallowed = changedFiles.filter((file) => file !== detailFiles[0]);
  if (disallowed.length > 0) {
    throw new Error(`Main recovery may only change one detail JSON file, got extra changes: ${disallowed.join(", ")}`);
  }
  return detailFiles[0];
}

function publicRegistryEntryFor(slug) {
  const registry = readJson("data/puzzles/registry.json");
  const entry = Array.isArray(registry)
    ? registry.find((item) => String(item?.slug || "") === slug)
    : null;
  if (!entry) throw new Error(`registry.json does not contain ${slug}`);
  if (String(entry.status || "") !== "live") {
    throw new Error(`Main recovery only handles the current live entry; ${slug} status is ${entry.status || "(missing)"}`);
  }
  const detailState = String(entry.detailState || "published");
  if (detailState !== "published" && detailState !== "fallback_full") {
    throw new Error(`Main recovery only handles public details; ${slug} detailState is ${detailState}`);
  }
  const publishDate = String(entry.publishDate || "").trim();
  if (!publishDate) throw new Error(`registry entry for ${slug} is missing publishDate`);
  return { entry, publishDate };
}

function remoteBranchExists(branch) {
  return gitMaybe(["ls-remote", "--exit-code", "--heads", "origin", branch]).status === 0;
}

function main() {
  const dryRun = hasFlag("--dry-run");
  const requireOriginMain = hasFlag("--require-origin-main");
  const branchOverride = readArg("--branch", "");

  ensureCleanWorktree();
  if (requireOriginMain) {
    fetchOriginMain();
    const head = currentHeadSha();
    const originMain = git(["rev-parse", "origin/main"]);
    if (head !== originMain) {
      exitOk({
        status: "skipped",
        reason: "checked-out commit is no longer origin/main",
        head,
        originMain,
      });
      return;
    }
  }

  try {
    run("npm", ["run", "validate:data:auto-repair"], { inherit: true });
  } catch (error) {
    exitOk({
      status: "skipped",
      reason: `auto-repair did not produce a valid repair: ${error instanceof Error ? error.message : String(error)}`,
    });
    return;
  }

  const changedFiles = statusLines()
    .map((line) => line.replace(/^[ MARC?UAD]{1,2}\s+/, ""))
    .filter(Boolean);
  if (changedFiles.length === 0) {
    exitOk({
      status: "skipped",
      reason: "validate:data:auto-repair did not change any files",
    });
    return;
  }

  const detailPath = resolveChangedDetailPath(changedFiles);
  const detail = readJson(detailPath);
  const slug = String(detail.slug || detailPath.match(/(pinpoint-answer-\d+)\.json$/)?.[1] || "").trim();
  if (!slug) throw new Error(`Could not resolve slug from ${detailPath}`);

  const { publishDate } = publicRegistryEntryFor(slug);
  const branch = branchOverride || `${CANDIDATE_PREFIX}/${publishDate}-${slug}`;
  if (!/^pinpoint\/candidate\/\d{4}-\d{2}-\d{2}-pinpoint-answer-\d+$/.test(branch)) {
    throw new Error(`Recovery branch name is not allowed: ${branch}`);
  }

  run("npm", ["run", "validate:data"], { inherit: true });

  if (remoteBranchExists(branch)) {
    exitOk({
      status: "skipped",
      reason: "candidate branch already exists",
      branch,
      slug,
    });
    return;
  }

  if (dryRun) {
    exitOk({
      status: "dry_run",
      branch,
      slug,
      changedFiles,
    });
    return;
  }

  git(["checkout", "-B", branch]);
  git(["add", detailPath]);
  git(["commit", "-m", `fix: recover ${slug} content gate`], { inherit: true });
  git(["push", "origin", `HEAD:${branch}`], { inherit: true });

  exitOk({
    status: "candidate_pushed",
    branch,
    slug,
    changedFiles,
  });
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
