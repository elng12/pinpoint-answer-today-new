import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { puzzleDetailContentSchema, registrySchema } from "../../lib/puzzles/schema.shared.mjs";

const htmlTagPattern = /<\/?[a-z][^>]*>/i;
const minFullAnalysisWords = 80;
const modernPuzzleDateBaseline = {
  puzzleNumber: 458,
  isoDate: "2025-08-01",
};

function countWords(value) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function assertNoHtml(label, value) {
  if (htmlTagPattern.test(value)) {
    throw new Error(`${label} contains HTML markup and must be plain text.`);
  }
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

function validateDetailContent(entry, detail) {
  const hintKeys = Object.keys(detail.wordHints);
  const spoilerHintKeys = detail.spoilerHints ? Object.keys(detail.spoilerHints) : [];
  const missingHintKeys = entry.clues.filter((clue) => !hintKeys.includes(clue));
  const extraHintKeys = hintKeys.filter((key) => !entry.clues.includes(key));

  if (missingHintKeys.length > 0 || extraHintKeys.length > 0) {
    const parts = [];
    if (missingHintKeys.length > 0) {
      parts.push(`missing hints for [${missingHintKeys.join(", ")}]`);
    }
    if (extraHintKeys.length > 0) {
      parts.push(`unexpected hint keys [${extraHintKeys.join(", ")}]`);
    }
    throw new Error(`wordHints clue mismatch for ${entry.slug}: ${parts.join("; ")}`);
  }

  const orderMismatchIndex = entry.clues.findIndex((clue, index) => clue !== hintKeys[index]);
  if (orderMismatchIndex !== -1) {
    throw new Error(
      `wordHints clue order mismatch for ${entry.slug}: expected "${entry.clues[orderMismatchIndex]}", received "${hintKeys[orderMismatchIndex]}" at position ${orderMismatchIndex + 1}`,
    );
  }

  const fullAnalysisWordCount = countWords(detail.fullAnalysis.join(" "));
  if (fullAnalysisWordCount < minFullAnalysisWords) {
    throw new Error(
      `${entry.slug} fullAnalysis is too thin (${fullAnalysisWordCount} words; expected at least ${minFullAnalysisWords}).`,
    );
  }

  detail.fullAnalysis.forEach((paragraph, index) => {
    assertNoHtml(`${entry.slug} fullAnalysis[${index}]`, paragraph);
  });

  detail.solutionNarrative?.forEach((paragraph, index) => {
    assertNoHtml(`${entry.slug} solutionNarrative[${index}]`, paragraph);
  });

  Object.entries(detail.wordHints).forEach(([clue, hint]) => {
    assertNoHtml(`${entry.slug} wordHints.${clue}`, hint);
  });

  if (detail.spoilerHints) {
    const missingSpoilerHintKeys = entry.clues.filter((clue) => !spoilerHintKeys.includes(clue));
    const extraSpoilerHintKeys = spoilerHintKeys.filter((key) => !entry.clues.includes(key));

    if (missingSpoilerHintKeys.length > 0 || extraSpoilerHintKeys.length > 0) {
      const parts = [];
      if (missingSpoilerHintKeys.length > 0) {
        parts.push(`missing spoiler hints for [${missingSpoilerHintKeys.join(", ")}]`);
      }
      if (extraSpoilerHintKeys.length > 0) {
        parts.push(`unexpected spoiler hint keys [${extraSpoilerHintKeys.join(", ")}]`);
      }
      throw new Error(`spoilerHints clue mismatch for ${entry.slug}: ${parts.join("; ")}`);
    }

    const spoilerOrderMismatchIndex = entry.clues.findIndex(
      (clue, index) => clue !== spoilerHintKeys[index],
    );
    if (spoilerOrderMismatchIndex !== -1) {
      throw new Error(
        `spoilerHints clue order mismatch for ${entry.slug}: expected "${entry.clues[spoilerOrderMismatchIndex]}", received "${spoilerHintKeys[spoilerOrderMismatchIndex]}" at position ${spoilerOrderMismatchIndex + 1}`,
      );
    }

    Object.entries(detail.spoilerHints).forEach(([clue, hint]) => {
      assertNoHtml(`${entry.slug} spoilerHints.${clue}`, hint);
    });
  }

  detail.lessons.forEach((lesson, index) => {
    if (typeof lesson === "string") {
      assertNoHtml(`${entry.slug} lessons[${index}]`, lesson);
      return;
    }

    assertNoHtml(`${entry.slug} lessons[${index}].title`, lesson.title);
    assertNoHtml(`${entry.slug} lessons[${index}].body`, lesson.body);
  });

  detail.faqs.forEach((faq, index) => {
    assertNoHtml(`${entry.slug} faqs[${index}].question`, faq.question);
    assertNoHtml(`${entry.slug} faqs[${index}].answer`, faq.answer);
  });
}

async function main() {
  const dataDir = resolve(process.cwd(), "data", "puzzles");
  const registryPath = resolve(dataDir, "registry.json");
  const rawRegistry = await readFile(registryPath, "utf8");
  const registry = registrySchema.parse(JSON.parse(rawRegistry));

  const numbers = new Set();
  const slugs = new Set();
  const dates = new Set();
  let liveCount = 0;
  let previewCount = 0;

  for (const entry of registry) {
    if (numbers.has(entry.puzzleNumber)) {
      throw new Error(`Duplicate puzzleNumber detected: ${entry.puzzleNumber}`);
    }
    if (slugs.has(entry.slug)) {
      throw new Error(`Duplicate slug detected: ${entry.slug}`);
    }
    if (dates.has(entry.publishDate)) {
      throw new Error(`Duplicate publishDate detected: ${entry.publishDate}`);
    }

    const expectedPublishDate = getExpectedPublishDateForPuzzleNumber(entry.puzzleNumber);
    if (expectedPublishDate && entry.publishDate !== expectedPublishDate) {
      throw new Error(
        `Unexpected publishDate for ${entry.slug}: received ${entry.publishDate}, expected ${expectedPublishDate}`,
      );
    }

    numbers.add(entry.puzzleNumber);
    slugs.add(entry.slug);
    dates.add(entry.publishDate);

    if (entry.status === "live") {
      liveCount += 1;
    }
    if (entry.status === "preview") {
      previewCount += 1;
    }

    if ((entry.status === "live" || entry.status === "archived") && (!entry.mainAnswer || !entry.category)) {
      throw new Error(`Published puzzle is missing answer/category: ${entry.slug}`);
    }

    if (entry.status === "live" || entry.status === "archived") {
      const detailPath = resolve(dataDir, `${entry.slug}.json`);
      if (!existsSync(detailPath)) {
        throw new Error(`Missing detail file for ${entry.slug}`);
      }
      const rawDetail = await readFile(detailPath, "utf8");
      const detail = puzzleDetailContentSchema.parse(JSON.parse(rawDetail));
      if (detail.slug !== entry.slug) {
        throw new Error(`Detail file slug mismatch for ${entry.slug}`);
      }
      validateDetailContent(entry, detail);
    }
  }

  if (liveCount !== 1) {
    throw new Error(`Expected exactly one live puzzle, received ${liveCount}`);
  }

  if (previewCount > 1) {
    throw new Error(`Expected at most one preview puzzle, received ${previewCount}`);
  }

  console.log(`Validated ${registry.length} registry records successfully.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
