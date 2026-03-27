import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { puzzleDetailContentSchema, registrySchema } from "../lib/puzzles/schema.shared.mjs";

const htmlTagPattern = /<\/?[a-z][^>]*>/i;
const adjacentQuotePattern = /["“”]{2,}/;
const minFullAnalysisWords = 80;
const minShortModeFullAnalysisWords = 60;
const legacyTemplateMarkers = [
  "same category reading",
  "same shared frame",
  "same frame as the rest of the board",
  "specific enough to trust",
  "tightens once this pattern becomes visible",
  "category board focused on thank",
  "shared idea concrete enough to test",
  "same specific category",
  "one clean set",
  "too loose to trust",
  "same shelf",
];
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

function assertNoLegacyTemplate(label, value) {
  const normalized = String(value || "").toLowerCase();
  const matched = legacyTemplateMarkers.find((marker) => normalized.includes(marker));
  if (matched) {
    throw new Error(`${label} still contains legacy template phrasing: "${matched}"`);
  }
}

function assertNoAdjacentQuotes(label, value) {
  if (adjacentQuotePattern.test(String(value || ""))) {
    throw new Error(`${label} contains malformed adjacent quote characters.`);
  }
}

function assertNoWrappedQuotedAnswer(label, value, answer) {
  const text = String(value || "");
  const normalizedAnswer = String(answer || "").trim();
  if (!normalizedAnswer || !/["“”]/.test(normalizedAnswer)) {
    return;
  }

  const wrappedVariants = [
    `"${normalizedAnswer}"`,
    `“${normalizedAnswer}”`,
  ];

  if (wrappedVariants.some((variant) => text.includes(variant))) {
    throw new Error(`${label} wraps an answer that already contains its own quotes.`);
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
  const detailAnswer = typeof detail.answer === "string" ? detail.answer : "";
  const hintKeys = Object.keys(detail.wordHints);
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
  const minRequiredFullAnalysisWords =
    detail.bodyMode === "short" ? minShortModeFullAnalysisWords : minFullAnalysisWords;
  if (fullAnalysisWordCount < minRequiredFullAnalysisWords) {
    throw new Error(
      `${entry.slug} fullAnalysis is too thin (${fullAnalysisWordCount} words; expected at least ${minRequiredFullAnalysisWords}).`,
    );
  }

  detail.fullAnalysis.forEach((paragraph, index) => {
    assertNoHtml(`${entry.slug} fullAnalysis[${index}]`, paragraph);
    assertNoLegacyTemplate(`${entry.slug} fullAnalysis[${index}]`, paragraph);
    assertNoAdjacentQuotes(`${entry.slug} fullAnalysis[${index}]`, paragraph);
    assertNoWrappedQuotedAnswer(`${entry.slug} fullAnalysis[${index}]`, paragraph, detailAnswer);
  });

  detail.articleBlocks?.forEach((paragraph, index) => {
    assertNoHtml(`${entry.slug} articleBlocks[${index}]`, paragraph);
    assertNoLegacyTemplate(`${entry.slug} articleBlocks[${index}]`, paragraph);
    assertNoAdjacentQuotes(`${entry.slug} articleBlocks[${index}]`, paragraph);
    assertNoWrappedQuotedAnswer(`${entry.slug} articleBlocks[${index}]`, paragraph, detailAnswer);
  });

  detail.solutionNarrative?.forEach((paragraph, index) => {
    assertNoHtml(`${entry.slug} solutionNarrative[${index}]`, paragraph);
    assertNoLegacyTemplate(`${entry.slug} solutionNarrative[${index}]`, paragraph);
    assertNoAdjacentQuotes(`${entry.slug} solutionNarrative[${index}]`, paragraph);
    assertNoWrappedQuotedAnswer(`${entry.slug} solutionNarrative[${index}]`, paragraph, detailAnswer);
  });

  Object.entries(detail.wordHints).forEach(([clue, hint]) => {
    assertNoHtml(`${entry.slug} wordHints.${clue}`, hint);
    assertNoLegacyTemplate(`${entry.slug} wordHints.${clue}`, hint);
  });

  Object.entries(detail.spoilerHints || {}).forEach(([clue, hint]) => {
    assertNoHtml(`${entry.slug} spoilerHints.${clue}`, hint);
    assertNoLegacyTemplate(`${entry.slug} spoilerHints.${clue}`, hint);
  });

  detail.lessons.forEach((lesson, index) => {
    if (typeof lesson === "string") {
      assertNoHtml(`${entry.slug} lessons[${index}]`, lesson);
      assertNoLegacyTemplate(`${entry.slug} lessons[${index}]`, lesson);
      return;
    }

    assertNoHtml(`${entry.slug} lessons[${index}].title`, lesson.title);
    assertNoHtml(`${entry.slug} lessons[${index}].body`, lesson.body);
    assertNoLegacyTemplate(`${entry.slug} lessons[${index}].title`, lesson.title);
    assertNoLegacyTemplate(`${entry.slug} lessons[${index}].body`, lesson.body);
  });

  detail.faqs.forEach((faq, index) => {
    assertNoHtml(`${entry.slug} faqs[${index}].question`, faq.question);
    assertNoHtml(`${entry.slug} faqs[${index}].answer`, faq.answer);
    assertNoLegacyTemplate(`${entry.slug} faqs[${index}].question`, faq.question);
    assertNoLegacyTemplate(`${entry.slug} faqs[${index}].answer`, faq.answer);
    assertNoAdjacentQuotes(`${entry.slug} faqs[${index}].question`, faq.question);
    assertNoAdjacentQuotes(`${entry.slug} faqs[${index}].answer`, faq.answer);
    assertNoWrappedQuotedAnswer(`${entry.slug} faqs[${index}].answer`, faq.answer, detailAnswer);
  });

  if (detail.display) {
    assertNoLegacyTemplate(`${entry.slug} display.connectorSummary`, detail.display.connectorSummary);
    assertNoLegacyTemplate(`${entry.slug} display.fastStrategy`, detail.display.fastStrategy);
    detail.display.clueTableRows.forEach((row, index) => {
      assertNoAdjacentQuotes(`${entry.slug} display.clueTableRows[${index}].examplePhrase`, row.examplePhrase);
      assertNoLegacyTemplate(`${entry.slug} display.clueTableRows[${index}].connectionExplained`, row.connectionExplained);
    });
  }
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
