// @ts-nocheck — This build-time validation script accesses raw JSON fields
// (e.g. detail.answer, detail.fullAnalysis) that exist on the parsed data
// but are not represented in the Zod-inferred PuzzleDetailContentRecord type.
// The runtime behavior is correct; the type gaps are schema-only.
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { validateEvidenceContract } from "../lib/puzzles/evidence-contract.shared.mjs";
import {
  formatPublishGateIssues,
  validatePublishEligibility,
} from "../lib/puzzles/publish-eligibility.shared.mjs";
import { puzzleDetailContentSchema, registrySchema } from "../lib/puzzles/schema.shared.mjs";
import {
  CONTENT_CONTRACT,
  promotePublishBlockingIssues,
  validateContentContract,
} from "../lib/puzzles/content-contract";
import { buildPuzzleSeoDescription } from "../lib/seo/metadata";
import { buildPinpointDescription, buildPinpointTitle } from "../lib/seo/pinpoint";
import type { PuzzleRegistryEntryRecord, PuzzleDetailContentRecord } from "../lib/puzzles/schema";

const htmlTagPattern = /<\/?[a-z][^>]*>/i;
const adjacentQuoteRunPattern = /["“”]{2,}/g;
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
const phase1StructuredBaselinePuzzleNumber = 704;
const publishedContractBacklogLimits = new Map(
  Object.entries({
    "faqs.genericQuestion": 0,
    "clueDetails.count": 192,
    "seoTitle.missingClues": 173,
    "seoDescription.missingClues": 161,
    "answer.alternateRestatement": 87,
    "faqs.firstAnswerMissingExactAnswer": 87,
    "overview.tooShort": 75,
    "solutionEmergence.genericPivot": 8,
    "lessons.genericTitle": 1,
    "answer.overused": 49,
    "solutionEmergence.tooShort": 41,
    "summary.answerSpoiler": 38,
    "sections.sharedPhrasing": 24,
    "sections.overlap": 17,
    "answer.semanticNarrowing": 14,
    "spoilerHints.genericHint": 0,
    "mainAnswer.suspiciousCategoryLabel": 5,
    "summary.promotionalTone": 4,
  }),
);
const publishedContractBacklogCounts = new Map<string, number>();
const publishedContractBacklogSamples = new Map<string, string[]>();
const publishedLessonTitleOccurrences = new Map<string, string[]>();
const genericSpoilerHintPatterns = [
  /\bTreat this as one member of a narrower category\b/i,
  /\bThis clue becomes useful once you stop reading it literally\b/i,
  /\bLook for the cleaner category fit instead of the first broad topic\b/i,
  /\bmakes the category specific enough to test instead of staying broad\b/i,
];
const publicDetailStates = new Set(["published", "fallback_full"]);
const publicRegistryStatuses = new Set(["live", "archived"]);
const recentContinuityWindow = 30;
const allowedRecentContinuityGaps = new Map<number, string>([]);

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function assertNoHtml(label: string, value: string) {
  if (htmlTagPattern.test(value)) {
    throw new Error(`${label} contains HTML markup and must be plain text.`);
  }
}

function assertNoLegacyTemplate(label: string, value: string) {
  const normalized = String(value || "").toLowerCase();
  const matched = legacyTemplateMarkers.find((marker) => normalized.includes(marker));
  if (matched) {
    throw new Error(`${label} still contains legacy template phrasing: "${matched}"`);
  }
}

function assertNoAdjacentQuotes(label: string, value: string) {
  const text = String(value || "");
  const malformedRun = Array.from(text.matchAll(adjacentQuoteRunPattern)).some(([run]) => {
    return run !== "”\"" && run !== "””";
  });
  if (malformedRun) {
    throw new Error(`${label} contains malformed adjacent quote characters.`);
  }
}

function assertNoWrappedQuotedAnswer(label: string, value: string, answer: string) {
  const text = String(value || "");
  const normalizedAnswer = String(answer || "").trim();
  if (!normalizedAnswer || !/["“”]/.test(normalizedAnswer)) {
    return;
  }
  if (/^Words that come (?:before|after)\s+“[^”]+”$/i.test(normalizedAnswer)) {
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

function recordPublishedContractBacklog(code: string, sample: string) {
  publishedContractBacklogCounts.set(code, (publishedContractBacklogCounts.get(code) || 0) + 1);
  const samples = publishedContractBacklogSamples.get(code) || [];
  if (sample && samples.length < 5) {
    samples.push(sample);
    publishedContractBacklogSamples.set(code, samples);
  }
}

function assertPublishedContractBacklogLimits() {
  for (const [code, count] of publishedContractBacklogCounts.entries()) {
    const limit = publishedContractBacklogLimits.get(code);
    if (limit == null) {
      throw new Error(
        `Published content contract found new blocking issue "${code}" (${count}). Samples: ${(publishedContractBacklogSamples.get(code) || []).join(" | ")}`,
      );
    }
    if (count > limit) {
      throw new Error(
        `Published content contract issue "${code}" increased to ${count}; allowed current backlog is ${limit}. Samples: ${(publishedContractBacklogSamples.get(code) || []).join(" | ")}`,
      );
    }
  }
}

function normalizeRepeatedLessonTitle(title: string) {
  return String(title || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getRenderedLessonTitle(lesson: string | { title?: string; body?: string } | null) {
  if (!lesson) {
    return "";
  }
  if (typeof lesson === "string") {
    const dotIdx = lesson.indexOf(". ");
    return dotIdx > 0 ? lesson.slice(0, dotIdx).trim() : "";
  }
  return String(lesson.title || "").trim();
}

function recordPublishedLessonTitle(entry: PuzzleRegistryEntryRecord, lesson: string | { title?: string; body?: string } | null, index: number) {
  const title = getRenderedLessonTitle(lesson);
  const normalizedTitle = normalizeRepeatedLessonTitle(title);
  if (!normalizedTitle) {
    return;
  }
  const locations = publishedLessonTitleOccurrences.get(normalizedTitle) || [];
  locations.push(`${entry.slug} lessons[${index}].title: ${title}`);
  publishedLessonTitleOccurrences.set(normalizedTitle, locations);
}

function assertNoRepeatedPublishedLessonTitles() {
  const repeated = Array.from(publishedLessonTitleOccurrences.entries())
    .filter(([, locations]) => locations.length > 1)
    .sort((left, right) => right[1].length - left[1].length);

  if (repeated.length === 0) {
    return;
  }

  const samples = repeated
    .slice(0, 5)
    .map(([, locations]) => locations.slice(0, 3).join(" | "))
    .join(" || ");
  throw new Error(`Published lesson titles must be page-specific; repeated titles found. Samples: ${samples}`);
}

function normalizeLessonsForContract(lessons: PuzzleDetailContentRecord["lessons"]) {
  return (lessons || []).map((lesson) => {
    if (typeof lesson === "string") {
      const title = getRenderedLessonTitle(lesson);
      const body = title && lesson.startsWith(`${title}. `)
        ? lesson.slice(title.length + 2).trim()
        : lesson;
      return { title, body };
    }
    return {
      title: typeof lesson?.title === "string" ? lesson.title : "",
      body: typeof lesson?.body === "string" ? lesson.body : "",
    };
  });
}

function toContractClueDetails(detail: PuzzleDetailContentRecord) {
  return Array.isArray(detail.clueRows)
    ? detail.clueRows.map((row) => ({
        clue: row?.clue,
        phrase: row?.resolvedPhraseOrMember,
        explanation: row?.nonObviousWhy,
      }))
    : [];
}

function toContractFaqs(detail: PuzzleDetailContentRecord) {
  const source = Array.isArray(detail.faqItems) && detail.faqItems.length > 0
    ? detail.faqItems
    : detail.faqs;
  return (source || []).map((faq) => ({
    question: faq?.question,
    answer: faq?.answer,
  }));
}

function validatePageSeoDescription(entry: PuzzleRegistryEntryRecord) {
  const pageSeoDescription = buildPuzzleSeoDescription(
    entry.puzzleNumber,
    entry.clues,
    entry.mainAnswer,
    entry.seoTemplateVersion ?? "serp-v1",
  );
  const len = pageSeoDescription.length;
  if (pageSeoDescription.includes("Answer: ")) {
    const serpVisibleLen = pageSeoDescription.indexOf("Answer: ");
    if (
      serpVisibleLen < CONTENT_CONTRACT.metaDescriptionMinChars - 10 ||
      serpVisibleLen > CONTENT_CONTRACT.metaDescriptionMaxChars + 5 ||
      len > CONTENT_CONTRACT.metaDescriptionIndexMaxChars
    ) {
      throw new Error(
        `${entry.slug} generated answer-aware page SEO description length is ${len} with ${serpVisibleLen} visible chars; expected visible ${CONTENT_CONTRACT.metaDescriptionMinChars - 10}-${CONTENT_CONTRACT.metaDescriptionMaxChars + 5} and total <= ${CONTENT_CONTRACT.metaDescriptionIndexMaxChars}.`,
      );
    }
    return;
  }

  if (len < CONTENT_CONTRACT.metaDescriptionMinChars || len > CONTENT_CONTRACT.metaDescriptionMaxChars) {
    throw new Error(
      `${entry.slug} generated page SEO description length is ${len}; expected ${CONTENT_CONTRACT.metaDescriptionMinChars}-${CONTENT_CONTRACT.metaDescriptionMaxChars}.`,
    );
  }
}

function validatePublishedContentContract(entry: PuzzleRegistryEntryRecord, detail: PuzzleDetailContentRecord, bodyParagraphs: string[]) {
  validatePageSeoDescription(entry);
  const solutionNarrative = Array.isArray(detail.solutionNarrative) ? detail.solutionNarrative : [];
  const contractInput = {
    puzzleNumber: entry.puzzleNumber,
    bodyMode: detail.bodyMode,
    locale: "en",
    rawWords: entry.clues,
    mainAnswer: entry.mainAnswer,
    summary: entry.shortSummary,
    seoTitle: buildPinpointTitle(entry.puzzleNumber, entry.clues),
    seoDescription: buildPinpointDescription(entry.puzzleNumber, entry.clues),
    overview: bodyParagraphs[0] || entry.shortSummary,
    solutionEmergence: solutionNarrative.join(" ") || bodyParagraphs.slice(1, 3).join(" "),
    articleBlocks: bodyParagraphs,
    wrongGuesses: detail.wrongGuessCandidates,
    clueDetails: toContractClueDetails(detail),
    lessons: normalizeLessonsForContract(detail.lessons),
    faqs: toContractFaqs(detail),
    llmTemplateVersion: detail.llmTemplateVersion,
  };
  const issues = promotePublishBlockingIssues(validateContentContract(contractInput))
    .filter((issue) => issue.level === "error");
  const newBlockingIssues = [];

  issues.forEach((issue) => {
    const sample = `${entry.slug}${issue.field ? ` ${issue.field}` : ""}: ${issue.message}`;
    if (publishedContractBacklogLimits.has(issue.code)) {
      recordPublishedContractBacklog(issue.code, sample);
    } else {
      newBlockingIssues.push(`${issue.code}${issue.field ? ` (${issue.field})` : ""}: ${issue.message}`);
    }
  });

  if (newBlockingIssues.length > 0) {
    throw new Error(`${entry.slug} published content contract failed: ${newBlockingIssues.join(", ")}`);
  }
}

function getExpectedPublishDateForPuzzleNumber(puzzleNumber: number) {
  if (!Number.isInteger(puzzleNumber) || puzzleNumber < modernPuzzleDateBaseline.puzzleNumber) {
    return "";
  }

  const publishDate = new Date(`${modernPuzzleDateBaseline.isoDate}T00:00:00.000Z`);
  publishDate.setUTCDate(
    publishDate.getUTCDate() + (puzzleNumber - modernPuzzleDateBaseline.puzzleNumber),
  );

  return publishDate.toISOString().slice(0, 10);
}

function requiresPhase1StructuredValidation(entry: PuzzleRegistryEntryRecord, detail: PuzzleDetailContentRecord) {
  const pageExperienceMode =
    detail.pageExperienceMode === "light-explainer" || detail.bodyMode === "short"
      ? "light-explainer"
      : "full-analysis";
  const isPublicDetail =
    detail.detailState === "published" || detail.detailState === "fallback_full" || !detail.detailState;

  return (
    isPublicDetail &&
    pageExperienceMode === "full-analysis" &&
    Number.isInteger(entry.puzzleNumber) &&
    entry.puzzleNumber >= phase1StructuredBaselinePuzzleNumber
  );
}

function resolveRegistryDetailState(entry: PuzzleRegistryEntryRecord) {
  if (entry.detailState) {
    return entry.detailState;
  }

  return entry.status === "draft" || entry.status === "preview" ? "draft" : "published";
}

function isPublicRegistryEntry(entry: PuzzleRegistryEntryRecord) {
  return (
    publicRegistryStatuses.has(entry.status) &&
    publicDetailStates.has(resolveRegistryDetailState(entry)) &&
    Boolean(entry.mainAnswer) &&
    Boolean(entry.category)
  );
}

async function readPublicDetailFileSlugs(dataDir: string) {
  const fileNames = await readdir(dataDir);
  const publicSlugs = [];

  for (const fileName of fileNames) {
    if (!/^pinpoint-answer-\d+\.json$/.test(fileName)) {
      continue;
    }

    const rawDetail = await readFile(resolve(dataDir, fileName), "utf8");
    const detail = puzzleDetailContentSchema.parse(JSON.parse(rawDetail));
    const detailState = detail.detailState || "published";

    if (publicDetailStates.has(detailState)) {
      publicSlugs.push(detail.slug || fileName.replace(/\.json$/, ""));
    }
  }

  return publicSlugs.sort();
}

function assertPublicDetailsAreRegistered(publicDetailSlugs: string[], registrySlugs: Set<string>) {
  const missing = publicDetailSlugs.filter((slug) => !registrySlugs.has(slug));

  if (missing.length > 0) {
    throw new Error(
      `Public detail JSON missing from registry: ${missing.slice(0, 20).join(", ")}${missing.length > 20 ? `, ... (${missing.length} total)` : ""}`,
    );
  }
}

function assertRecentPublicRegistryContinuity(registry: PuzzleRegistryEntryRecord[]) {
  const publicNumbers = registry
    .filter(isPublicRegistryEntry)
    .map((entry) => entry.puzzleNumber)
    .filter((value) => Number.isInteger(value))
    .sort((left, right) => right - left);
  const latestNumber = publicNumbers[0];

  if (!latestNumber) {
    throw new Error("Expected at least one public registry entry for continuity validation.");
  }

  const publicNumberSet = new Set(publicNumbers);
  const missing = [];
  for (let number = latestNumber; number > latestNumber - recentContinuityWindow; number -= 1) {
    if (!publicNumberSet.has(number) && !allowedRecentContinuityGaps.has(number)) {
      missing.push(number);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Recent public registry puzzle numbers must be continuous for the latest ${recentContinuityWindow}; missing ${missing.join(", ")}. If a gap is intentional, add it to allowedRecentContinuityGaps with a reason.`,
    );
  }
}

function validateDetailContent(entry: PuzzleRegistryEntryRecord, detail: PuzzleDetailContentRecord) {
  if (detail.publishMode || entry.publishMode) {
    const eligibility = validatePublishEligibility({
      slug: entry.slug,
      registryEntry: entry,
      detail,
      expectedMode: detail.publishMode === "answer-first" ? "answer-first" : "full-analysis",
      answerFirstPublicEnabled: false,
    });
    if (!eligibility.ok) {
      throw new Error(`${entry.slug} failed publish eligibility: ${formatPublishGateIssues(eligibility.issues)}`);
    }
  }

  const detailAnswer = typeof detail.answer === "string" ? detail.answer : "";
  const requiresStructuredValidation = requiresPhase1StructuredValidation(entry, detail);
  const articleBlocks = Array.isArray(detail.articleBlocks) ? detail.articleBlocks : [];
  const fullAnalysis = Array.isArray(detail.fullAnalysis) ? detail.fullAnalysis : [];
  if (fullAnalysis.length > 0 && articleBlocks.length === 0) {
    throw new Error(`${entry.slug} has legacy fullAnalysis without articleBlocks; migrate fullAnalysis to articleBlocks and remove fullAnalysis.`);
  }
  if (fullAnalysis.length > 0) {
    throw new Error(`${entry.slug} still has fullAnalysis field; remove the legacy duplicate fullAnalysis.`);
  }

  const bodyParagraphs = articleBlocks.length > 0 ? articleBlocks : [];
  const bodyLabel = "articleBlocks";
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

  const bodyWordCount = countWords(bodyParagraphs.join(" "));
  const minRequiredFullAnalysisWords =
    detail.bodyMode === "short" ? minShortModeFullAnalysisWords : minFullAnalysisWords;
  if (bodyWordCount < minRequiredFullAnalysisWords) {
    throw new Error(
      `${entry.slug} ${bodyLabel} is too thin (${bodyWordCount} words; expected at least ${minRequiredFullAnalysisWords}).`,
    );
  }

  articleBlocks.forEach((paragraph, index) => {
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
    if (genericSpoilerHintPatterns.some((pattern) => pattern.test(hint))) {
      recordPublishedContractBacklog(
        "spoilerHints.genericHint",
        `${entry.slug} spoilerHints.${clue}: spoiler hint is still generic`,
      );
    }
  });

  detail.lessons.forEach((lesson, index) => {
    recordPublishedLessonTitle(entry, lesson, index);
    if (typeof lesson === "string") {
      if (requiresStructuredValidation) {
        throw new Error(`${entry.slug} lessons[${index}] must use {title, body}; string lessons are no longer allowed for structured public pages.`);
      }
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

  const evidenceErrors = validateEvidenceContract(
    {
      rawWords: entry.clues,
      mainAnswer: entry.mainAnswer,
      questionType: detail.questionType,
      difficultyBand: detail.difficultyBand,
      solvePath: detail.solvePath,
      turningPoint: detail.turningPoint,
      clueRows: detail.clueRows,
      faqItems: detail.faqItems,
      uniquenessSignals: detail.uniquenessSignals,
    },
    { requireEvidenceFields: false },
  ).filter((issue) => issue.level === "error");

  if (evidenceErrors.length > 0) {
    throw new Error(
      `${entry.slug} evidence contract failed: ${evidenceErrors
        .map((issue) => `${issue.code}${issue.field ? ` (${issue.field})` : ""}`)
        .join(", ")}`,
    );
  }

  validatePublishedContentContract(entry, detail, bodyParagraphs);

  if (!requiresStructuredValidation) {
    return;
  }

  const wrongGuessCandidates = Array.isArray(detail.wrongGuessCandidates) ? detail.wrongGuessCandidates : [];
  const requiredWrongGuessCount = detail.difficultyBand === "obvious" ? 1 : 2;
  if (wrongGuessCandidates.length < requiredWrongGuessCount) {
    throw new Error(
      `${entry.slug} is missing required wrongGuessCandidates (${wrongGuessCandidates.length}; expected at least ${requiredWrongGuessCount}).`,
    );
  }

  wrongGuessCandidates.forEach((candidate, index) => {
    if (!candidate?.label?.trim()) {
      throw new Error(`${entry.slug} wrongGuessCandidates[${index}].label must be non-empty.`);
    }
    if (!candidate?.whyPlausible?.trim()) {
      throw new Error(`${entry.slug} wrongGuessCandidates[${index}].whyPlausible must be non-empty.`);
    }
    if (candidate.whyRejected != null && !String(candidate.whyRejected).trim()) {
      throw new Error(`${entry.slug} wrongGuessCandidates[${index}].whyRejected cannot be blank when present.`);
    }
  });

  if (!String(detail.setValidationSummary || "").trim()) {
    throw new Error(`${entry.slug} is missing setValidationSummary for full-analysis mode.`);
  }

  if (!String(detail.categoryPrecisionNote || "").trim()) {
    throw new Error(`${entry.slug} is missing categoryPrecisionNote for full-analysis mode.`);
  }
}

async function main() {
  const dataDir = resolve(process.cwd(), "data", "puzzles");
  const registryPath = resolve(dataDir, "registry.json");
  const rawRegistry = await readFile(registryPath, "utf8");
  const registry = registrySchema.parse(JSON.parse(rawRegistry));
  const publicDetailSlugs = await readPublicDetailFileSlugs(dataDir);

  const numbers = new Set<number>();
  const slugs = new Set<string>();
  const publicRegistrySlugs = new Set<string>();
  const dates = new Set<string>();
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
    if (isPublicRegistryEntry(entry)) {
      publicRegistrySlugs.add(entry.slug);
    }

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

  assertPublicDetailsAreRegistered(publicDetailSlugs, publicRegistrySlugs);
  assertRecentPublicRegistryContinuity(registry);

  assertPublishedContractBacklogLimits();
  assertNoRepeatedPublishedLessonTitles();

  console.log(`Validated ${registry.length} registry records successfully.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
