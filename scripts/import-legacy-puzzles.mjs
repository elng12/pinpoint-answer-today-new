import { promises as fs } from "node:fs";
import path from "node:path";

const workspaceRoot = path.resolve(process.cwd(), "..");
const legacyDir = path.join(workspaceRoot, "data", "puzzles");
const targetDir = path.join(process.cwd(), "data", "puzzles");
const registryPath = path.join(targetDir, "registry.json");

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
    const normalized = typeof value === "string" ? value.trim() : "";
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
      .map((item) => [item.clue?.trim(), item.explanation?.trim()])
      .filter(([clue, explanation]) => clue && explanation),
  );

  if (Object.keys(mappedHints).length > 0) {
    return mappedHints;
  }

  const rawHints = legacyPuzzle.wordHints ?? {};
  return Object.fromEntries(
    Object.entries(rawHints)
      .map(([clue, explanation]) => [clue.trim(), String(explanation).trim()])
      .filter(([clue, explanation]) => clue && explanation),
  );
}

function buildLessons(legacyPuzzle) {
  const lessons = Array.isArray(legacyPuzzle.sections?.lessons) ? legacyPuzzle.sections.lessons : [];

  return lessons
    .map((item) => {
      const title = item.title?.trim();
      const body = item.body?.trim();
      if (title && body) {
        return `${title}. ${body}`;
      }
      return title || body || "";
    })
    .filter(Boolean);
}

function buildFaqs(legacyPuzzle) {
  const faqs = Array.isArray(legacyPuzzle.sections?.faqs) ? legacyPuzzle.sections.faqs : [];

  return faqs
    .map((item) => ({
      question: item.question?.trim(),
      answer: item.answer?.trim(),
    }))
    .filter((item) => item.question && item.answer);
}

function isImportableLegacyPuzzle(legacyPuzzle) {
  return (
    typeof legacyPuzzle?.puzzleNumber === "number" &&
    legacyPuzzle.puzzleNumber >= 524 &&
    legacyPuzzle.puzzleNumber <= 674 &&
    typeof legacyPuzzle?.publishedAtIso === "string" &&
    typeof legacyPuzzle?.mainAnswer === "string" &&
    legacyPuzzle.mainAnswer.trim() &&
    Array.isArray(legacyPuzzle?.rawWords) &&
    legacyPuzzle.rawWords.length >= 5 &&
    typeof legacyPuzzle?.summary === "string" &&
    legacyPuzzle.summary.trim() &&
    typeof legacyPuzzle?.sections?.overview === "string" &&
    legacyPuzzle.sections.overview.trim() &&
    typeof legacyPuzzle?.sections?.solutionEmergence === "string" &&
    legacyPuzzle.sections.solutionEmergence.trim() &&
    Array.isArray(legacyPuzzle?.sections?.clueDetails) &&
    legacyPuzzle.sections.clueDetails.length >= 5 &&
    Array.isArray(legacyPuzzle?.sections?.lessons) &&
    legacyPuzzle.sections.lessons.length >= 2 &&
    Array.isArray(legacyPuzzle?.sections?.faqs) &&
    legacyPuzzle.sections.faqs.length >= 2
  );
}

function buildRegistryEntry(legacyPuzzle) {
  const publishDate = legacyPuzzle.publishedAtIso.slice(0, 10);
  const puzzleNumber = legacyPuzzle.puzzleNumber;
  const slug = `pinpoint-answer-${puzzleNumber}`;
  const category =
    legacyPuzzle.analysis?.answerGroups?.[0]?.category?.trim() ||
    legacyPuzzle.mainAnswer.trim();

  return {
    puzzleNumber,
    slug,
    publishDate,
    status: "archived",
    clues: legacyPuzzle.rawWords.map((item) => item.trim()).filter(Boolean),
    mainAnswer: legacyPuzzle.mainAnswer.trim(),
    category,
    difficultyLevel: toDifficultyLevel(legacyPuzzle.analysis?.difficultyRating),
    shortSummary: legacyPuzzle.summary.trim(),
    updatedAt: legacyPuzzle.publishedAtIso,
  };
}

function buildDetailContent(legacyPuzzle) {
  const slug = `pinpoint-answer-${legacyPuzzle.puzzleNumber}`;

  return {
    slug,
    fullAnalysis: uniqueParagraphs([
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
  const registryRaw = await fs.readFile(registryPath, "utf8");
  const currentRegistry = JSON.parse(registryRaw);
  const existingSlugs = new Set(currentRegistry.map((entry) => entry.slug));

  const legacyFiles = (await fs.readdir(legacyDir))
    .filter((file) => /^pinpoint-answer-\d+\.json$/.test(file))
    .sort((left, right) => Number(left.match(/(\d+)/)[1]) - Number(right.match(/(\d+)/)[1]));

  const importedEntries = [];

  for (const file of legacyFiles) {
    const sourcePath = path.join(legacyDir, file);
    const raw = await fs.readFile(sourcePath, "utf8");
    const legacyPuzzle = JSON.parse(raw);

    if (!isImportableLegacyPuzzle(legacyPuzzle)) {
      continue;
    }

    const registryEntry = buildRegistryEntry(legacyPuzzle);
    if (existingSlugs.has(registryEntry.slug)) {
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
