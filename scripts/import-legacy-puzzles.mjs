import { promises as fs } from "node:fs";
import path from "node:path";

const workspaceRoot = path.resolve(process.cwd(), "..");
const legacyDir = path.join(workspaceRoot, "data", "puzzles");
const legacyPendingDir = path.join(workspaceRoot, "data", "pending");
const targetDir = path.join(process.cwd(), "data", "puzzles");
const registryPath = path.join(targetDir, "registry.json");
const minImportablePuzzleNumber = 458;
const maxImportablePuzzleNumber = 674;
const blockedLegacyPuzzleNumbers = new Set([]);
const modernPuzzleDateBaseline = {
  puzzleNumber: 458,
  isoDate: "2025-08-01",
};

function parseRequestedPuzzles(argv) {
  const puzzlesArg = argv
    .find((value) => value.startsWith("--puzzles="))
    ?.slice("--puzzles=".length)
    .trim();

  if (!puzzlesArg) {
    return null;
  }

  const values = puzzlesArg
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value));

  return new Set(values);
}

function isWithinDefaultImportRange(puzzleNumber) {
  return (
    typeof puzzleNumber === "number" &&
    puzzleNumber >= minImportablePuzzleNumber &&
    puzzleNumber <= maxImportablePuzzleNumber
  );
}

function shouldConsiderPuzzleNumber(puzzleNumber, requestedPuzzles) {
  if (blockedLegacyPuzzleNumbers.has(puzzleNumber)) {
    return false;
  }

  if (requestedPuzzles) {
    return requestedPuzzles.has(puzzleNumber);
  }

  return isWithinDefaultImportRange(puzzleNumber);
}

function normalizeIsoTimestamp(value) {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim();
  if (!normalized) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return `${normalized}T00:00:00.000Z`;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized)) {
    return `${normalized}.000Z`;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+$/.test(normalized)) {
    return `${normalized}Z`;
  }

  return normalized;
}

function getExpectedPublishDateForPuzzleNumber(puzzleNumber) {
  if (!Number.isInteger(puzzleNumber) || puzzleNumber < modernPuzzleDateBaseline.puzzleNumber) {
    return "";
  }

  const publishDate = new Date(`${modernPuzzleDateBaseline.isoDate}T00:00:00.000Z`);
  publishDate.setUTCDate(
    publishDate.getUTCDate() + (puzzleNumber - modernPuzzleDateBaseline.puzzleNumber),
  );

  return publishDate.toISOString().slice(0, 10);
}

function decodeHtmlEntities(value) {
  return value
    .replace(/\\u([0-9a-f]{4})/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)));
}

function cleanText(value) {
  if (typeof value !== "string") {
    return "";
  }

  const withBreaks = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ");

  const withoutTags = withBreaks.replace(/<[^>]+>/g, " ");
  const decoded = decodeHtmlEntities(withoutTags);

  return decoded
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeClueText(value) {
  return cleanText(value).replace(/^#\d+\s*/, "").trim();
}

function normalizeGeneratedText(value) {
  return cleanText(value)
    .replace(/(^|[\s([{"'“‘,;:])#\d+\s*(?=[A-Za-z(])/g, "$1")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function truncateSummary(value) {
  if (value.length <= 240) {
    return value;
  }

  const sentenceBreakpoint = Math.max(
    value.lastIndexOf(". ", 240),
    value.lastIndexOf("? ", 240),
    value.lastIndexOf("! ", 240),
  );
  if (sentenceBreakpoint >= 120) {
    return value.slice(0, sentenceBreakpoint + 1).trim();
  }

  const breakpoint = value.lastIndexOf(" ", 220);
  const safeCutoff = breakpoint >= 140 ? breakpoint : 220;
  return `${value.slice(0, safeCutoff).trim()}...`;
}

function buildShortSummary(legacyPuzzle, supportingPuzzles = []) {
  const summaryCandidates = [legacyPuzzle, ...supportingPuzzles]
    .flatMap((puzzle) => [
      puzzle.summary,
      puzzle.sections?.overview,
      puzzle.analysis?.dailyDebrief,
      puzzle.analysis?.detailedBreakdown,
    ])
    .map((candidate) => normalizeGeneratedText(candidate))
    .filter(Boolean);

  const preferredCandidates = [
    ...summaryCandidates.filter((candidate) => !candidate.endsWith("...")),
    ...summaryCandidates.filter((candidate) => candidate.endsWith("...")),
  ];

  for (const candidate of preferredCandidates) {
    const firstShortSentence = candidate
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .find((sentence) => sentence && sentence.length <= 240);

    if (firstShortSentence) {
      return firstShortSentence;
    }
  }

  for (const candidate of preferredCandidates) {
    if (candidate.length <= 240) {
      return candidate;
    }
  }

  for (const candidate of preferredCandidates) {
    if (candidate) {
      return truncateSummary(candidate);
    }
  }

  return "";
}

function getPublishedAtIso(legacyPuzzle) {
  return normalizeIsoTimestamp(
    legacyPuzzle.publishedAtIso
    || legacyPuzzle.publishedAt
    || legacyPuzzle.updatedAtIso
    || legacyPuzzle.analysis?.updatedAt
    || legacyPuzzle.analysis?.createdAt
    || "",
  );
}

function getUpdatedAtIso(legacyPuzzle) {
  return normalizeIsoTimestamp(
    legacyPuzzle.updatedAtIso
    || legacyPuzzle.analysis?.updatedAt
    || legacyPuzzle.publishedAtIso
    || legacyPuzzle.publishedAt
    || legacyPuzzle.analysis?.createdAt
    || "",
  );
}

function getClues(legacyPuzzle) {
  return Array.isArray(legacyPuzzle.rawWords)
    ? legacyPuzzle.rawWords.map((item) => normalizeClueText(item)).filter(Boolean)
    : [];
}

function toDifficultyLevel(rating) {
  if (typeof rating !== "number") {
    return "Moderate";
  }
  if (rating <= 2) {
    return "Easy";
  }
  if (rating === 3) {
    return "Moderate";
  }
  return "Hard";
}

function uniqueParagraphs(values) {
  const seen = new Set();
  const items = [];

  for (const value of values) {
    const normalized = normalizeGeneratedText(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    items.push(normalized);
  }

  return items;
}

function buildWordHints(legacyPuzzle) {
  const detailHints = Array.isArray(legacyPuzzle.sections?.clueDetails)
    ? legacyPuzzle.sections.clueDetails
    : [];

  const mappedHints = Object.fromEntries(
    detailHints
      .map((item) => [normalizeClueText(item.clue), normalizeGeneratedText(item.explanation)])
      .filter(([clue, explanation]) => clue && explanation),
  );

  if (Object.keys(mappedHints).length > 0) {
    return mappedHints;
  }

  const rawHints = legacyPuzzle.wordHints ?? {};
  return Object.fromEntries(
    Object.entries(rawHints)
      .map(([clue, explanation]) => [normalizeClueText(clue), normalizeGeneratedText(String(explanation))])
      .filter(([clue, explanation]) => clue && explanation),
  );
}

function buildLessons(legacyPuzzle) {
  const lessons = Array.isArray(legacyPuzzle.sections?.lessons) ? legacyPuzzle.sections.lessons : [];

  return lessons
    .map((item) => {
      if (typeof item === "string") {
        return normalizeGeneratedText(item);
      }

      const title = normalizeGeneratedText(item.title);
      const body = normalizeGeneratedText(item.body);
      if (title && body) {
        return normalizeGeneratedText(`${title}. ${body}`);
      }
      return normalizeGeneratedText(title || body || "");
    })
    .filter(Boolean);
}

function buildFaqs(legacyPuzzle) {
  const faqs = Array.isArray(legacyPuzzle.sections?.faqs) ? legacyPuzzle.sections.faqs : [];

  return faqs
    .map((item) => ({
      question: normalizeGeneratedText(item.question),
      answer: normalizeGeneratedText(item.answer),
    }))
    .filter((item) => item.question && item.answer);
}

function isImportableLegacyPuzzle(legacyPuzzle, requestedPuzzles) {
  const clues = getClues(legacyPuzzle);
  const summary = buildShortSummary(legacyPuzzle);
  const publishedAtIso = getPublishedAtIso(legacyPuzzle);

  return (
    typeof legacyPuzzle?.puzzleNumber === "number" &&
    shouldConsiderPuzzleNumber(legacyPuzzle.puzzleNumber, requestedPuzzles) &&
    !!publishedAtIso &&
    !!cleanText(legacyPuzzle.mainAnswer) &&
    clues.length >= 5 &&
    !!summary &&
    !!cleanText(legacyPuzzle?.sections?.overview) &&
    !!cleanText(legacyPuzzle?.sections?.solutionEmergence) &&
    Array.isArray(legacyPuzzle?.sections?.clueDetails) &&
    legacyPuzzle.sections.clueDetails.length >= 5 &&
    Array.isArray(legacyPuzzle?.sections?.lessons) &&
    legacyPuzzle.sections.lessons.length >= 2 &&
    Array.isArray(legacyPuzzle?.sections?.faqs) &&
    legacyPuzzle.sections.faqs.length >= 2
  );
}

function scoreLegacyPuzzle(legacyPuzzle) {
  return [
    !!getPublishedAtIso(legacyPuzzle),
    !!cleanText(legacyPuzzle.mainAnswer),
    getClues(legacyPuzzle).length >= 5,
    !!buildShortSummary(legacyPuzzle),
    !!cleanText(legacyPuzzle?.sections?.overview),
    !!cleanText(legacyPuzzle?.sections?.solutionEmergence),
    Array.isArray(legacyPuzzle?.sections?.clueDetails) && legacyPuzzle.sections.clueDetails.length >= 5,
    Array.isArray(legacyPuzzle?.sections?.lessons) && legacyPuzzle.sections.lessons.length >= 2,
    Array.isArray(legacyPuzzle?.sections?.faqs) && legacyPuzzle.sections.faqs.length >= 2,
  ].filter(Boolean).length;
}

function getSourcePriority(fileName) {
  if (/^pinpoint-\d{4}-\d{2}-\d{2}\.json$/.test(fileName) || /^\d{4}-\d{2}-\d{2}\.json$/.test(fileName)) {
    return 3;
  }

  if (/^pinpoint-answer-\d+\.json$/.test(fileName)) {
    return 2;
  }

  return 1;
}

function buildRegistryEntry(legacyPuzzle, supportingPuzzles = []) {
  const publishedAtIso = getPublishedAtIso(legacyPuzzle);
  const puzzleNumber = legacyPuzzle.puzzleNumber;
  const publishDate = getExpectedPublishDateForPuzzleNumber(puzzleNumber) || publishedAtIso.slice(0, 10);
  const slug = `pinpoint-answer-${puzzleNumber}`;
  const category =
    cleanText(legacyPuzzle.analysis?.answerGroups?.[0]?.category) ||
    cleanText(legacyPuzzle.mainAnswer);

  return {
    puzzleNumber,
    slug,
    publishDate,
    status: "archived",
    clues: getClues(legacyPuzzle),
    mainAnswer: normalizeGeneratedText(legacyPuzzle.mainAnswer),
    category,
    difficultyLevel: toDifficultyLevel(legacyPuzzle.analysis?.difficultyRating),
    shortSummary: buildShortSummary(legacyPuzzle, supportingPuzzles),
    updatedAt: getUpdatedAtIso(legacyPuzzle) || publishedAtIso,
  };
}

function buildDetailContent(legacyPuzzle) {
  const slug = `pinpoint-answer-${legacyPuzzle.puzzleNumber}`;

  return {
    slug,
    articleBlocks: uniqueParagraphs([
      legacyPuzzle.sections?.overview,
      legacyPuzzle.sections?.solutionEmergence,
      legacyPuzzle.analysis?.detailedBreakdown,
      legacyPuzzle.analysis?.dailyDebrief,
    ]),
    wordHints: buildWordHints(legacyPuzzle),
    lessons: buildLessons(legacyPuzzle),
    faqs: buildFaqs(legacyPuzzle),
  };
}

async function main() {
  const requestedPuzzles = parseRequestedPuzzles(process.argv.slice(2));
  const registryRaw = await fs.readFile(registryPath, "utf8");
  const currentRegistry = JSON.parse(registryRaw);
  const existingSlugs = new Set(currentRegistry.map((entry) => entry.slug));
  const legacyCandidates = new Map();

  for (const [dirPath, dirLabel] of [
    [legacyDir, "puzzles"],
    [legacyPendingDir, "pending"],
  ]) {
    let fileNames = [];

    try {
      fileNames = await fs.readdir(dirPath);
    } catch {
      continue;
    }

    for (const fileName of fileNames.sort()) {
      if (!fileName.endsWith(".json")) {
        continue;
      }

      const sourcePath = path.join(dirPath, fileName);
      const raw = await fs.readFile(sourcePath, "utf8");
      const legacyPuzzle = JSON.parse(raw);
      const puzzleNumber = typeof legacyPuzzle?.puzzleNumber === "string"
        ? Number.parseInt(legacyPuzzle.puzzleNumber, 10)
        : legacyPuzzle?.puzzleNumber;

      if (!Number.isFinite(puzzleNumber)) {
        continue;
      }

      // Normalise puzzleNumber to integer so downstream functions work correctly
      legacyPuzzle.puzzleNumber = puzzleNumber;

      if (!shouldConsiderPuzzleNumber(puzzleNumber, requestedPuzzles)) {
        continue;
      }

      const candidate = {
        fileName,
        sourcePath,
        sourceLabel: dirLabel,
        legacyPuzzle,
        score: scoreLegacyPuzzle(legacyPuzzle),
        priority: getSourcePriority(fileName) + (dirLabel === "puzzles" ? 1 : 0),
      };
      const current = legacyCandidates.get(puzzleNumber);

      if (!current) {
        legacyCandidates.set(puzzleNumber, {
          selected: candidate,
          candidates: [candidate],
        });
        continue;
      }

      current.candidates.push(candidate);

      if (
        candidate.score > current.selected.score ||
        (candidate.score === current.selected.score && candidate.priority > current.selected.priority)
      ) {
        current.selected = candidate;
      }
    }
  }

  const importedEntries = [];

  for (const puzzleNumber of Array.from(legacyCandidates.keys()).sort((left, right) => left - right)) {
    const { selected, candidates } = legacyCandidates.get(puzzleNumber);
    const { fileName, sourceLabel, legacyPuzzle } = selected;
    const supportingPuzzles = candidates
      .map((candidate) => candidate.legacyPuzzle)
      .filter((candidate) => candidate !== legacyPuzzle);

    if (!isImportableLegacyPuzzle(legacyPuzzle, requestedPuzzles)) {
      console.log(`Skipped #${puzzleNumber} (${sourceLabel}/${fileName}) because the legacy source is still incomplete.`);
      continue;
    }

    const registryEntry = buildRegistryEntry(legacyPuzzle, supportingPuzzles);
    if (existingSlugs.has(registryEntry.slug)) {
      console.log(`Skipped #${puzzleNumber} because ${registryEntry.slug} already exists in the new site registry.`);
      continue;
    }

    const detailContent = buildDetailContent(legacyPuzzle);
    await fs.writeFile(
      path.join(targetDir, `${registryEntry.slug}.json`),
      `${JSON.stringify(detailContent, null, 2)}\n`,
      "utf8",
    );

    importedEntries.push(registryEntry);
    existingSlugs.add(registryEntry.slug);
    console.log(`Imported #${puzzleNumber} from ${sourceLabel}/${fileName}.`);
  }

  const nextRegistry = [...currentRegistry, ...importedEntries].sort(
    (left, right) => right.puzzleNumber - left.puzzleNumber,
  );

  await fs.writeFile(registryPath, `${JSON.stringify(nextRegistry, null, 2)}\n`, "utf8");

  console.log(`Imported ${importedEntries.length} legacy puzzles into the new site registry.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
