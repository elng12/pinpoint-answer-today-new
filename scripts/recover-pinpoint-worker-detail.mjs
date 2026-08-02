import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

import { buildTemplateFallbackDetailRecord } from "../worker/src/index.ts";

const WORKER_BASE_URL = "https://pinpoint-worker.2296744453m.workers.dev";

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
}

function fail(message) {
  throw new Error(message);
}

async function main() {
  const puzzleDate = readArg("--date");
  const puzzleNumber = Number.parseInt(readArg("--number"), 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(puzzleDate)) {
    fail("--date must be YYYY-MM-DD");
  }
  if (!Number.isInteger(puzzleNumber) || puzzleNumber <= 0) {
    fail("--number must be a positive integer");
  }

  const sourceUrl = `${WORKER_BASE_URL}/api/pinpoint/today?d=${encodeURIComponent(puzzleDate)}`;
  const result = spawnSync("curl", ["--fail", "--silent", "--show-error", sourceUrl], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    fail(`Worker history request failed for ${puzzleDate}: ${String(result.stderr || result.stdout || "curl failed").trim()}`);
  }
  let doc;
  try {
    doc = JSON.parse(result.stdout);
  } catch (error) {
    fail(`Worker history returned invalid JSON for ${puzzleDate}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (doc.puzzleDate !== puzzleDate) {
    fail(`Worker history date mismatch: expected ${puzzleDate}, got ${String(doc.puzzleDate || "missing")}`);
  }
  if (typeof doc.mainAnswer !== "string" || !doc.mainAnswer.trim()) {
    fail(`Worker history is missing mainAnswer for ${puzzleDate}`);
  }
  if (typeof doc.fetchedAt !== "string" || !Number.isFinite(Date.parse(doc.fetchedAt))) {
    fail(`Worker history is missing a valid fetchedAt for ${puzzleDate}`);
  }
  if (typeof doc.checksum !== "string" || !doc.checksum.startsWith("sha256:")) {
    fail(`Worker history is missing its source checksum for ${puzzleDate}`);
  }

  const answers = Array.isArray(doc.answers) ? doc.answers : [];
  const words = answers
    .map((answer) => typeof answer === "object" && answer !== null ? String(answer.word || "").trim() : "")
    .filter(Boolean);
  if (words.length !== 5) {
    fail(`Worker history must contain exactly 5 real clues; got ${words.length} for ${puzzleDate}`);
  }

  const detail = buildTemplateFallbackDetailRecord(
    WORKER_BASE_URL,
    puzzleDate,
    doc,
    puzzleNumber,
    words,
  );
  const outputPath = resolve(`data/puzzles/pinpoint-answer-${puzzleNumber}.json`);
  if (existsSync(outputPath) && !process.argv.includes("--force")) {
    fail(`${outputPath} already exists; refusing to overwrite it without --force`);
  }

  writeFileSync(outputPath, `${JSON.stringify(detail, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    ok: true,
    puzzleNumber,
    puzzleDate,
    sourceUrl,
    fetchedAt: doc.fetchedAt,
    checksum: doc.checksum,
    outputPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
