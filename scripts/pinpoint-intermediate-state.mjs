#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const INTERMEDIATE_STATES = new Set(["generating", "validated", "failed"]);
const PUBLIC_STATES = new Set(["published", "fallback_full"]);
const PUZZLE_DETAIL_RE = /^data\/puzzles\/pinpoint-answer-(\d+)\.json$/;
const REGISTRY_PATH = "data/puzzles/registry.json";

function normalizePath(filePath) {
  return String(filePath || "").replace(/^[.][/\\]/, "").trim();
}

function readEnv(name) {
  return String(process.env[name] || "").trim();
}

function git(args, options = {}) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
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
  const output = git(["diff", "--name-only", from, to]);
  return output.split("\n").map(normalizePath).filter(Boolean);
}

function getGitHubPushRange() {
  const before = readEnv("GITHUB_EVENT_BEFORE");
  const after = readEnv("GITHUB_SHA") || readEnv("GITHUB_EVENT_AFTER");

  if (!before || !after) return null;
  if (/^0+$/.test(before)) return null;
  if (!gitCommitExists(before) || !gitCommitExists(after)) return null;

  return { before, after };
}

function getVercelRange() {
  const before = readEnv("VERCEL_GIT_PREVIOUS_SHA");
  const after = readEnv("VERCEL_GIT_COMMIT_SHA");

  if (!before || !after) return null;
  if (!gitCommitExists(before) || !gitCommitExists(after)) return null;

  return { before, after };
}

function getDefaultRange() {
  const range = getGitHubPushRange() || getVercelRange();
  if (range) return range;

  const head = git(["rev-parse", "HEAD"]);
  const parent = git(["rev-parse", "HEAD^"], { stdio: ["ignore", "pipe", "ignore"] });
  return { before: parent, after: head };
}

function parseJson(raw, label) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readFileAt(commitish, filePath) {
  try {
    return git(["show", `${commitish}:${filePath}`]);
  } catch {
    return "";
  }
}

function getCurrentFile(filePath) {
  return readFileSync(filePath, "utf8");
}

function detailStateOf(value) {
  return String(value || "").trim().toLowerCase();
}

function registryEntryFor(registry, puzzleNumber) {
  if (!Array.isArray(registry)) return null;
  return registry.find((entry) => Number(entry?.puzzleNumber) === puzzleNumber) || null;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isOnlyLiveEntryTransition(beforeEntry, afterEntry, puzzleNumber, afterState) {
  if (!beforeEntry || !afterEntry) return false;

  const normalizedBefore = { ...beforeEntry };
  const normalizedAfter = { ...afterEntry };

  if (Number(normalizedAfter.puzzleNumber) !== puzzleNumber) return false;
  if (detailStateOf(normalizedAfter.detailState) !== afterState) return false;
  if (String(normalizedAfter.status || "") !== "live") return false;

  delete normalizedBefore.detailState;
  delete normalizedBefore.updatedAt;
  delete normalizedAfter.detailState;
  delete normalizedAfter.updatedAt;

  return sameJson(normalizedBefore, normalizedAfter);
}

function withoutUpdatedAt(entry) {
  const copy = { ...entry };
  delete copy.updatedAt;
  return copy;
}

function isSameExistingRegistryEntry(beforeEntry, afterEntry, puzzleNumber, afterState) {
  if (Number(afterEntry?.puzzleNumber) === puzzleNumber) {
    return isOnlyLiveEntryTransition(beforeEntry, afterEntry, puzzleNumber, afterState);
  }

  const normalizedBefore = withoutUpdatedAt(beforeEntry);
  const normalizedAfter = withoutUpdatedAt(afterEntry);

  if (String(normalizedBefore.status || "") === "live" && String(normalizedAfter.status || "") === "archived") {
    normalizedBefore.status = "archived";
  }

  return sameJson(normalizedBefore, normalizedAfter);
}

function isRegistryIntermediateTransition(beforeRegistry, afterRegistry, puzzleNumber, afterState) {
  if (!Array.isArray(beforeRegistry) || !Array.isArray(afterRegistry)) return false;

  const beforeByNumber = new Map(beforeRegistry.map((entry) => [Number(entry?.puzzleNumber), entry]));
  const afterByNumber = new Map(afterRegistry.map((entry) => [Number(entry?.puzzleNumber), entry]));
  const beforeEntry = beforeByNumber.get(puzzleNumber) || null;
  const afterEntry = afterByNumber.get(puzzleNumber) || null;

  if (!afterEntry) return false;
  if (detailStateOf(afterEntry.detailState) !== afterState) return false;
  if (String(afterEntry.status || "") !== "live") return false;

  for (const beforeNumber of beforeByNumber.keys()) {
    if (!afterByNumber.has(beforeNumber)) return false;
  }

  for (const afterNumber of afterByNumber.keys()) {
    if (!beforeByNumber.has(afterNumber) && afterNumber !== puzzleNumber) return false;
  }

  if (!beforeEntry) {
    const newEntry = withoutUpdatedAt(afterEntry);
    const expectedNewEntry = {
      puzzleNumber,
      slug: `pinpoint-answer-${puzzleNumber}`,
      status: "live",
      detailState: afterState,
    };

    for (const [key, value] of Object.entries(expectedNewEntry)) {
      if (newEntry[key] !== value) return false;
    }
  }

  for (const [beforeNumber, beforeEntryValue] of beforeByNumber.entries()) {
    const afterEntryValue = afterByNumber.get(beforeNumber);
    if (!isSameExistingRegistryEntry(beforeEntryValue, afterEntryValue, puzzleNumber, afterState)) {
      return false;
    }
  }

  return true;
}

function analyzeIntermediateStateCommit({ before, after, files }) {
  const changedFiles = files.map(normalizePath).filter(Boolean);
  const detailFiles = changedFiles.filter((file) => PUZZLE_DETAIL_RE.test(file));
  const allowedFiles = new Set([...detailFiles, REGISTRY_PATH]);

  if (detailFiles.length !== 1) {
    return {
      isIntermediateStateOnly: false,
      reason: `expected exactly one Pinpoint detail file, found ${detailFiles.length}`,
      changedFiles,
    };
  }

  const unexpectedFiles = changedFiles.filter((file) => !allowedFiles.has(file));
  if (unexpectedFiles.length > 0) {
    return {
      isIntermediateStateOnly: false,
      reason: "commit changes files outside the allowed intermediate-state set",
      changedFiles,
      unexpectedFiles,
    };
  }

  const detailPath = detailFiles[0];
  const puzzleNumber = Number(detailPath.match(PUZZLE_DETAIL_RE)?.[1]);
  const beforeDetailRaw = readFileAt(before, detailPath);
  const afterDetailRaw = readFileAt(after, detailPath) || getCurrentFile(detailPath);

  if (!afterDetailRaw) {
    return {
      isIntermediateStateOnly: false,
      reason: `${detailPath} is missing after commit`,
      changedFiles,
    };
  }

  const beforeDetail = beforeDetailRaw ? parseJson(beforeDetailRaw, `${before}:${detailPath}`) : null;
  const afterDetail = parseJson(afterDetailRaw, `${after}:${detailPath}`);
  const beforeState = detailStateOf(beforeDetail?.detailState);
  const afterState = detailStateOf(afterDetail?.detailState);

  if (!INTERMEDIATE_STATES.has(afterState)) {
    return {
      isIntermediateStateOnly: false,
      reason: `after detailState is ${afterState || "missing"}, not an intermediate state`,
      changedFiles,
      detailPath,
      puzzleNumber,
      beforeState,
      afterState,
    };
  }

  if (PUBLIC_STATES.has(beforeState)) {
    return {
      isIntermediateStateOnly: false,
      reason: `refusing to skip a regression from public detailState ${beforeState} to ${afterState}`,
      changedFiles,
      detailPath,
      puzzleNumber,
      beforeState,
      afterState,
    };
  }

  if (changedFiles.includes(REGISTRY_PATH)) {
    const beforeRegistry = parseJson(readFileAt(before, REGISTRY_PATH) || "[]", `${before}:${REGISTRY_PATH}`);
    const afterRegistry = parseJson(readFileAt(after, REGISTRY_PATH) || getCurrentFile(REGISTRY_PATH), `${after}:${REGISTRY_PATH}`);

    if (!isRegistryIntermediateTransition(beforeRegistry, afterRegistry, puzzleNumber, afterState)) {
      return {
        isIntermediateStateOnly: false,
        reason: "registry changed beyond the live entry detailState/updatedAt transition",
        changedFiles,
        detailPath,
        puzzleNumber,
        beforeState,
        afterState,
      };
    }
  }

  return {
    isIntermediateStateOnly: true,
    reason: `Pinpoint #${puzzleNumber} is a non-public ${afterState} state-only commit`,
    changedFiles,
    detailPath,
    puzzleNumber,
    beforeState,
    afterState,
  };
}

function printResult(result) {
  console.log(JSON.stringify(result, null, 2));
}

function main() {
  const command = process.argv[2] || "check";
  const rangeArg = process.argv.find((arg) => arg.startsWith("--range="));
  const filesArg = process.argv.find((arg) => arg.startsWith("--files="));
  const range = rangeArg
    ? (() => {
        const [before, after] = rangeArg.slice("--range=".length).split("..");
        if (!before || !after) throw new Error("--range must be formatted as before..after");
        return { before, after };
      })()
    : getDefaultRange();
  const files = filesArg
    ? filesArg.slice("--files=".length).split(",").map(normalizePath).filter(Boolean)
    : getChangedFilesBetween(range.before, range.after);

  const result = analyzeIntermediateStateCommit({ ...range, files });

  if (command === "json") {
    printResult(result);
    return;
  }

  if (command === "skip-if-intermediate") {
    if (result.isIntermediateStateOnly) {
      console.log(result.reason);
      process.exit(0);
    }
    console.log(result.reason);
    process.exit(1);
  }

  printResult(result);
  process.exit(result.isIntermediateStateOnly ? 0 : 1);
}

main();
