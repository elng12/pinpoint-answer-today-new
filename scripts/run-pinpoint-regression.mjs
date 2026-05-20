import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const PORT = Number(process.env.PINPOINT_REGRESSION_PORT || 3004);
const BASE_URL = process.env.PINPOINT_REGRESSION_BASE_URL || `http://127.0.0.1:${PORT}`;
const ADMIN_TOKEN =
  process.env.PINPOINT_REGRESSION_ADMIN_TOKEN ||
  process.env.DEV_ADMIN_TOKEN ||
  process.env.ADMIN_PASSPHRASE ||
  "admin-secret-dev";

const SAMPLE_SETS = {
  quick: [683, 682, 684, 679],
  core: [682, 683, 684, 678, 679, 681],
  extended: [674, 680],
};

const GENERIC_PATTERN_SNIPPETS = [
  "x connects to",
  "fits the theme",
  "the clues all share this connection",
  "difficulty varies",
  "hallmark of a well-crafted puzzle",
];

let registryIndexPromise;

function parseArgs(argv) {
  const args = { set: "quick", samples: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--set" && argv[index + 1]) {
      args.set = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--samples" && argv[index + 1]) {
      args.samples = argv[index + 1]
        .split(",")
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isFinite(item));
      index += 1;
      continue;
    }
  }
  return args;
}

function unique(values) {
  return [...new Set(values)];
}

function resolveSampleNumbers(args) {
  if (args.samples?.length) {
    return unique(args.samples);
  }
  if (args.set === "all") {
    return unique([...SAMPLE_SETS.core, ...SAMPLE_SETS.extended]);
  }
  const selected = SAMPLE_SETS[args.set];
  if (selected?.length) {
    return selected;
  }
  throw new Error(`Unknown sample set "${args.set}". Use quick, core, extended, or all.`);
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForMatch(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/["“”'’`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countOccurrences(haystack, needle) {
  if (!haystack || !needle) return 0;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = haystack.match(new RegExp(`\\b${escaped}\\b`, "g"));
  return matches?.length ?? 0;
}

function stripQuotes(value) {
  return normalizeText(value).replace(/^["“”'`]+|["“”'`]+$/g, "");
}

function detectAnswerPattern(answer) {
  const normalized = normalizeText(answer);
  const before = normalized.match(/^Words that come before\s+["“]?([^"”]+)["”]?$/i);
  if (before?.[1]) {
    return { kind: "before", token: normalizeForMatch(before[1]) };
  }
  const after = normalized.match(/^Words that come after\s+["“]?([^"”]+)["”]?$/i);
  if (after?.[1]) {
    return { kind: "after", token: normalizeForMatch(after[1]) };
  }
  const typedCategory = normalized.match(/^(?:Types|Kinds) of\s+(.+)$/i);
  if (typedCategory?.[1]) {
    const pluralNoun = normalizeForMatch(typedCategory[1]);
    const singularNoun = pluralNoun.replace(/s$/i, "");
    return { kind: "typed-category", noun: singularNoun || pluralNoun };
  }
  return { kind: "category" };
}

function countClueMentions(summary, clues) {
  const normalizedSummary = normalizeForMatch(summary);
  return clues.filter((clue) => {
    const normalizedClue = normalizeForMatch(clue);
    if (!normalizedClue) return false;
    return normalizedSummary.includes(normalizedClue);
  }).length;
}

function buildVisibleBody(result) {
  const sections = result?.sections || {};
  const analysis = result?.analysis || {};
  const chunks = [
    analysis.heroSummary,
    sections.overview,
    sections.solutionEmergence,
    ...(sections.wrongGuesses || []).flatMap((item) => [item?.guess, item?.explanation]),
    ...(sections.clueDetails || []).flatMap((item) => [item?.phrase, item?.explanation]),
    ...(sections.lessons || []).flatMap((item) => [item?.title, item?.body]),
    ...(sections.faqs || []).flatMap((item) => [item?.question, item?.answer]),
  ];
  return chunks.map((chunk) => normalizeText(chunk)).filter(Boolean).join("\n");
}

function containsGenericFiller(result) {
  const body = buildVisibleBody(result).toLowerCase();
  return GENERIC_PATTERN_SNIPPETS.find((snippet) => body.includes(snippet));
}

function phraseCheck(pattern, clueDetail) {
  const phrase = normalizeForMatch(clueDetail?.phrase);
  const clue = normalizeForMatch(clueDetail?.clue);
  if (!phrase) return false;
  if (pattern.kind === "before") {
    return (
      phrase.endsWith(` ${pattern.token}`) ||
      phrase === pattern.token ||
      (clue ? phrase === `${clue}${pattern.token}` : false)
    );
  }
  if (pattern.kind === "after") {
    return (
      phrase.startsWith(`${pattern.token} `) ||
      phrase === pattern.token ||
      (clue ? phrase === `${pattern.token}${clue}` : false)
    );
  }
  return true;
}

function isVisualConfirmationClue(clueDetail, pattern) {
  const clue = String(clueDetail?.clue || "");
  const phrase = normalizeForMatch(clueDetail?.phrase);
  const whyItWorks = normalizeForMatch(clueDetail?.explanation);
  if (!clue || !phrase || !whyItWorks) return false;

  const hasSymbolClue = /[^\p{L}\p{N}\s()'"&,-]/u.test(clue);
  if (!hasSymbolClue) return false;

  if (pattern.kind === "before" || pattern.kind === "after") {
    const normalizedClue = normalizeForMatch(clue);
    const mirrorsClue = phrase === normalizedClue;
    const mentionsPattern =
      whyItWorks.includes(pattern.token) ||
      whyItWorks.includes("shared word") ||
      whyItWorks.includes("common word") ||
      whyItWorks.includes("final confirmation");
    return mirrorsClue && mentionsPattern;
  }

  return true;
}

function phraseLogicStatus(pattern, clueDetails) {
  const strictMatches = [];
  const visualConfirmations = [];
  const failures = [];

  for (const item of clueDetails) {
    if (phraseCheck(pattern, item)) {
      strictMatches.push(item?.phrase || item?.clue || "(missing)");
      continue;
    }

    if (isVisualConfirmationClue(item, pattern)) {
      visualConfirmations.push(item?.clue || "(missing)");
      continue;
    }

    failures.push(item?.phrase || item?.clue || "(missing)");
  }

  return {
    pass: failures.length === 0 && strictMatches.length >= Math.max(1, clueDetails.length - 1),
    detail: [
      strictMatches.length ? `strict: ${strictMatches.join(" | ")}` : "",
      visualConfirmations.length ? `visual: ${visualConfirmations.join(" | ")}` : "",
      failures.length ? `failed: ${failures.join(" | ")}` : "",
    ]
      .filter(Boolean)
      .join(" ; "),
  };
}

function typedCategoryCoverage(pattern, clueDetails, connectorSummary) {
  if (pattern.kind !== "typed-category") return true;
  const noun = pattern.noun;
  const phraseHits = clueDetails.filter((item) => normalizeForMatch(item?.phrase).includes(noun)).length;
  const connectorHit = normalizeForMatch(connectorSummary).includes(noun);
  return phraseHits >= 3 && connectorHit;
}

function turningPointMatches(turningPoint, clues) {
  const normalizedTurningPoint = normalizeForMatch(turningPoint);
  if (!normalizedTurningPoint) return false;
  return clues.some((clue) => {
    const normalizedClue = normalizeForMatch(clue);
    return normalizedClue && normalizedTurningPoint.includes(normalizedClue);
  });
}

function collectChecks(sample, result, issues) {
  const clues = sample.clues || [];
  const answer = sample.answer || sample.mainAnswer || sample.category || "";
  const pattern = detectAnswerPattern(answer);
  const sections = result?.sections || {};
  const analysis = result?.analysis || {};
  const clueDetails = Array.isArray(sections.clueDetails) ? sections.clueDetails : [];
  const normalizedAnswer = normalizeForMatch(answer);
  const visibleBody = buildVisibleBody(result);
  const answerMentions = countOccurrences(normalizeForMatch(visibleBody), normalizedAnswer);
  const clueMentions = countClueMentions(analysis.heroSummary, clues);
  const fillerHit = containsGenericFiller(result);

  const checks = [
    {
      label: "hero spoiler-safe",
      pass: !normalizeForMatch(analysis.heroSummary).includes(normalizedAnswer),
      detail: analysis.heroSummary || "(empty)",
    },
    {
      label: "hero grounded",
      pass: clueMentions >= 2,
      detail: `${clueMentions} clue mentions`,
    },
    {
      label: "turning point",
      pass: turningPointMatches(result?.slots?.turningPoint || analysis.dailyDebrief, clues),
      detail: result?.slots?.turningPoint || "(missing)",
    },
    {
      label: "answer repetition",
      pass: answerMentions <= 3,
      detail: `${answerMentions} exact mentions`,
    },
    {
      label: "generic filler",
      pass: !fillerHit,
      detail: fillerHit || "clean",
    },
    {
      label: "contract warnings",
      pass: (issues || []).every((issue) => issue.level !== "error"),
      detail: `${(issues || []).length} issue(s)`,
    },
  ];

  if (pattern.kind === "before" || pattern.kind === "after") {
    const phraseStatus = phraseLogicStatus(pattern, clueDetails);
    checks.push({
      label: "phrase logic",
      pass: phraseStatus.pass,
      detail: phraseStatus.detail,
    });
  }

  if (pattern.kind === "typed-category") {
    checks.push({
      label: "category-fit wording",
      pass: typedCategoryCoverage(pattern, clueDetails, result?.slots?.connectorSummary || ""),
      detail: clueDetails.map((item) => item?.phrase).join(" | "),
    });
  }

  return {
    checks,
    answerMentions,
    clueMentions,
    turningPoint: result?.slots?.turningPoint || "(missing)",
    connectorSummary: result?.slots?.connectorSummary || "(missing)",
  };
}

async function readPuzzleSample(puzzleNumber) {
  const registryIndex = await readRegistryIndex();
  const filePath = path.join(ROOT, "data", "puzzles", `pinpoint-answer-${puzzleNumber}.json`);
  const raw = await readFile(filePath, "utf8");
  const detail = JSON.parse(raw);
  const registryEntry = registryIndex.get(puzzleNumber) || {};

  return {
    ...registryEntry,
    ...detail,
    puzzleNumber,
    slug: detail.slug || registryEntry.slug || `pinpoint-answer-${puzzleNumber}`,
    clues: detail.clues || registryEntry.clues || [],
    answer:
      detail.answer ||
      detail.mainAnswer ||
      detail.category ||
      registryEntry.mainAnswer ||
      registryEntry.category ||
      "",
  };
}

async function readRegistryIndex() {
  if (!registryIndexPromise) {
    registryIndexPromise = readFile(path.join(ROOT, "data", "puzzles", "registry.json"), "utf8")
      .then((raw) => JSON.parse(raw))
      .then((rows) => {
        const index = new Map();
        for (const row of Array.isArray(rows) ? rows : []) {
          const puzzleNumber = Number(row?.puzzleNumber);
          if (Number.isFinite(puzzleNumber)) {
            index.set(puzzleNumber, row);
          }
        }
        return index;
      });
  }
  return registryIndexPromise;
}

async function canReachServer() {
  try {
    const response = await fetch(`${BASE_URL}/`, { redirect: "manual", signal: AbortSignal.timeout(2000) });
    return response.ok || response.status === 307 || response.status === 308;
  } catch {
    return false;
  }
}

async function waitForServer() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60000) {
    if (await canReachServer()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for local app at ${BASE_URL}`);
}

function startDevServer() {
  const child = spawn("npm", ["run", "dev"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      DEV_ADMIN_TOKEN: process.env.DEV_ADMIN_TOKEN || ADMIN_TOKEN,
      FORCE_COLOR: "0",
    },
  });

  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  return child;
}

async function ensureServer() {
  if (await canReachServer()) {
    return { child: null, startedHere: false };
  }

  const child = startDevServer();
  try {
    await waitForServer();
    return { child, startedHere: true };
  } catch (error) {
    child.kill("SIGTERM");
    throw error;
  }
}

async function generateDraft(sample) {
  const response = await fetch(`${BASE_URL}/api/admin/generate-draft`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-pass": ADMIN_TOKEN,
    },
    body: JSON.stringify({
      puzzleNumber: sample.puzzleNumber,
      rawWords: sample.clues,
      mainAnswer: sample.answer || sample.mainAnswer || sample.category,
    }),
    signal: AbortSignal.timeout(120000),
  });

  const payload = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, payload };
}

function logSampleResult(sampleNumber, sample, report, issues) {
  const failingChecks = report.checks.filter((check) => !check.pass);
  const label = failingChecks.length === 0 ? "PASS" : "FAIL";
  console.log(`\n[${label}] #${sampleNumber} ${sample.slug}`);
  console.log(`  - turning point: ${report.turningPoint}`);
  console.log(`  - connector summary: ${report.connectorSummary}`);
  console.log(`  - hero clue mentions: ${report.clueMentions}`);
  console.log(`  - exact answer mentions: ${report.answerMentions}`);

  for (const check of report.checks) {
    const status = check.pass ? "ok" : "bad";
    console.log(`  - ${status}: ${check.label} -> ${check.detail}`);
  }

  if ((issues || []).length > 0) {
    const issueSummary = issues
      .map((issue) => `${issue.level || "warn"}:${issue.code || issue.message}`)
      .slice(0, 5)
      .join(" | ");
    console.log(`  - route issues: ${issueSummary}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const puzzleNumbers = resolveSampleNumbers(args);
  const server = await ensureServer();
  let failed = false;

  console.log(`Running Pinpoint regression on ${puzzleNumbers.join(", ")} via ${BASE_URL}`);

  try {
    for (const puzzleNumber of puzzleNumbers) {
      const sample = await readPuzzleSample(puzzleNumber);
      const draft = await generateDraft(sample);

      if (!draft.ok || !draft.payload?.success) {
        failed = true;
        console.log(`\n[FAIL] #${puzzleNumber} ${sample.slug}`);
        console.log(`  - request status: ${draft.status}`);
        console.log(`  - message: ${draft.payload?.message || "unknown error"}`);
        continue;
      }

      const report = collectChecks(sample, draft.payload.data, draft.payload.issues || []);
      logSampleResult(puzzleNumber, sample, report, draft.payload.issues || []);
      if (report.checks.some((check) => !check.pass)) {
        failed = true;
      }
    }
  } finally {
    if (server.startedHere && server.child) {
      server.child.kill("SIGTERM");
    }
  }

  if (failed) {
    console.log("\nPinpoint regression finished with failures.");
    process.exitCode = 1;
    return;
  }

  console.log("\nPinpoint regression passed.");
}

main().catch((error) => {
  console.error(`Pinpoint regression failed to run: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
