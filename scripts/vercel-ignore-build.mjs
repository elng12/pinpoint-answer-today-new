#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const SAFE_PREFIXES = [
  ".claude/",
  ".github/",
  ".vscode/",
  "docs/",
  "tmp/",
  "worker/",
];

const SAFE_EXACT_FILES = new Set([
  "AGENTS.md",
  "README.md",
]);

function readEnv(name) {
  return String(process.env[name] || "").trim();
}

function normalizePath(filePath) {
  return String(filePath || "").replace(/^[.][/\\]/, "").trim();
}

function isSafeFile(filePath) {
  const normalized = normalizePath(filePath);
  if (!normalized) return true;
  if (SAFE_EXACT_FILES.has(normalized)) return true;
  return SAFE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function logList(title, files) {
  console.log(title);
  for (const file of files) {
    console.log(`- ${file}`);
  }
}

function continueBuild(message, files = []) {
  console.log(message);
  if (files.length > 0) {
    logList("Build-triggering files:", files);
  }
  process.exit(1);
}

function skipBuild(message, files = []) {
  console.log(message);
  if (files.length > 0) {
    logList("Ignored files:", files);
  }
  process.exit(0);
}

function gitCommitExists(commitish) {
  try {
    execFileSync("git", ["rev-parse", "--verify", `${commitish}^{commit}`], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function getChangedFilesBetween(from, to) {
  const output = execFileSync("git", ["diff", "--name-only", from, to], {
    encoding: "utf8",
  });

  return output
    .split("\n")
    .map(normalizePath)
    .filter(Boolean);
}

function getChangedFilesFromVercelRange() {
  const currentSha = readEnv("VERCEL_GIT_COMMIT_SHA");
  const previousSha = readEnv("VERCEL_GIT_PREVIOUS_SHA");

  if (!currentSha && !previousSha) {
    return null;
  }

  if (!currentSha || !previousSha) {
    continueBuild("Vercel did not provide a full commit range, so Vercel should build.");
  }

  if (!gitCommitExists(previousSha) || !gitCommitExists(currentSha)) {
    continueBuild("The Vercel commit range is unavailable in this checkout, so Vercel should build.");
  }

  console.log(`Comparing Vercel commit range: ${previousSha}..${currentSha}`);
  return getChangedFilesBetween(previousSha, currentSha);
}

function isProductionDeployment() {
  const env = (readEnv("VERCEL_ENV") || readEnv("VERCEL_TARGET_ENV")).toLowerCase();
  return env === "production";
}

let changedFiles = process.argv.slice(2).map(normalizePath).filter(Boolean);

if (changedFiles.length === 0) {
  if (isProductionDeployment()) {
    continueBuild("Production deployment detected, so Vercel should build.");
  }

  changedFiles = getChangedFilesFromVercelRange();

  if (changedFiles === null) {
    continueBuild("Vercel commit SHAs are unavailable, so Vercel should build.");
  }
}

if (changedFiles.length === 0) {
  skipBuild("No changed files were detected for this Vercel deployment, so Vercel can skip this build.");
}

const buildTriggerFiles = changedFiles.filter((file) => !isSafeFile(file));

if (buildTriggerFiles.length > 0) {
  continueBuild("Site-affecting changes were detected, so Vercel should build.", buildTriggerFiles);
}

skipBuild("Only non-site files changed, so Vercel can skip this build.", changedFiles);
