import assert from "node:assert/strict";
import { generateMetadata as generateAboutMetadata } from "@/app/(site)/about-us/page";
import { generateMetadata as generateContactMetadata } from "@/app/(site)/contact-us/page";
import type { ArchiveEntry } from "@/lib/puzzles/data";
import { CONTENT_CONTRACT } from "@/lib/puzzles/content-contract";
import { buildArchiveStructuredData } from "@/lib/seo/archive-structured-data";
import {
  buildPuzzleSeoDescription,
  buildPuzzleSeoTitle,
} from "@/lib/seo/metadata";
import {
  buildPinpointDescription,
  buildPinpointTitle,
} from "@/lib/seo/pinpoint";

const PAGE_TITLE_MAX_LENGTH = 110;
const PAGE_DESCRIPTION_MIN_LENGTH = CONTENT_CONTRACT.metaDescriptionMinChars;
const PAGE_DESCRIPTION_MAX_LENGTH = CONTENT_CONTRACT.metaDescriptionMaxChars;
const PAGE_DESCRIPTION_INDEX_MAX = CONTENT_CONTRACT.metaDescriptionIndexMaxChars;
const ARCHIVE_SCHEMA_FIXTURE_COUNT = 60;

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeForMatch(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/["“”'`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countContainedClues(text: string, clues: string[]): number {
  const normalizedText = normalizeForMatch(text);
  return clues.filter((clue) => normalizedText.includes(normalizeForMatch(clue))).length;
}

function checkDraftSeoBuildersKeepAllClues() {
  const puzzleNumber = 812;
  const clues = [
    "  International   Space Station ",
    "Constellation Map",
    "Gravitational   Lensing",
    "Planetary Alignment",
    "Astrophotography ",
  ].map(normalizeText);

  const title = buildPinpointTitle(puzzleNumber, clues);
  const description = buildPinpointDescription(puzzleNumber, clues);

  assert.equal(
    countContainedClues(title, clues),
    clues.length,
    "draft SEO title should preserve all five clues for the content contract",
  );
  assert.equal(
    countContainedClues(description, clues),
    clues.length,
    "draft SEO description should preserve all five clues for the content contract",
  );
  assert.ok(
    description.length >= CONTENT_CONTRACT.metaDescriptionMinChars,
    `draft SEO description should be at least ${CONTENT_CONTRACT.metaDescriptionMinChars} characters`,
  );
  assert.ok(
    description.length <= CONTENT_CONTRACT.metaDescriptionMaxChars,
    `draft SEO description should stay within ${CONTENT_CONTRACT.metaDescriptionMaxChars} characters`,
  );
}

function checkPageSeoBuildersStaySnippetSized() {
  const puzzleNumber = 812;
  const clues = [
    "International Space Station",
    "Constellation Map",
    "Gravitational Lensing",
    "Planetary Alignment",
    "Astrophotography",
  ];

  const title = buildPuzzleSeoTitle(puzzleNumber, clues);
  const description = buildPuzzleSeoDescription(puzzleNumber, clues, "Astronomy themes");

  assert.ok(
    title.length <= PAGE_TITLE_MAX_LENGTH,
    `page SEO title should stay within the absolute ${PAGE_TITLE_MAX_LENGTH}-character cap`,
  );

  // Answer-aware descriptions may exceed 160 chars total, but the SERP-visible
  // portion (before "Answer:") must stay within snippet range, and the full
  // text must stay within the index cap.
  if (description.includes("Answer: ")) {
    const serpVisibleLen = description.indexOf("Answer: ");
    assert.ok(
      serpVisibleLen >= PAGE_DESCRIPTION_MIN_LENGTH - 10,
      `answer-aware SERP-visible portion should be near ${PAGE_DESCRIPTION_MIN_LENGTH} characters (got ${serpVisibleLen})`,
    );
    assert.ok(
      description.length <= PAGE_DESCRIPTION_INDEX_MAX,
      `answer-aware description should stay within ${PAGE_DESCRIPTION_INDEX_MAX}-character index cap (got ${description.length})`,
    );
  } else {
    assert.ok(
      description.length >= PAGE_DESCRIPTION_MIN_LENGTH,
      `page SEO description should be at least ${PAGE_DESCRIPTION_MIN_LENGTH} characters`,
    );
    assert.ok(
      description.length <= PAGE_DESCRIPTION_MAX_LENGTH,
      `page SEO description should stay within ${PAGE_DESCRIPTION_MAX_LENGTH} characters`,
    );
  }

  assert.ok(
    countContainedClues(title, clues) < clues.length,
    "page SEO title should be allowed to trim clues when the full set cannot fit",
  );
  assert.ok(
    countContainedClues(description, clues) < clues.length,
    "page SEO description should be allowed to trim clues when the full set cannot fit",
  );
}

function checkPageSeoDescriptionCanExposeAnswer() {
  const description = buildPuzzleSeoDescription(
    688,
    ["Comet", "Orbit", "Telescope", "Meteor", "Galaxy"],
    "Space terms",
  );

  assert.ok(
    description.includes("Answer: Space terms."),
    "page SEO description should include the answer after the SERP-visible portion",
  );
  // The answer text must appear beyond the 160-char SERP snippet boundary
  const answerPos = description.indexOf("Answer: ");
  assert.ok(
    answerPos > 110,
    `answer should appear after the SERP-visible portion (at char ${answerPos})`,
  );
}

function checkPageSeoDescriptionFallbackStaysInRange() {
  const description = buildPuzzleSeoDescription(
    524,
    ["A", "B", "C", "D", "E"],
    "X",
  );

  // Short-answer descriptions may also exceed 160 if answer is appended;
  // the total must stay within the index cap.
  if (description.includes("Answer: ")) {
    assert.ok(
      description.length <= PAGE_DESCRIPTION_INDEX_MAX,
      `fallback answer-aware description should stay within ${PAGE_DESCRIPTION_INDEX_MAX}-character index cap`,
    );
  } else {
    assert.ok(
      description.length >= PAGE_DESCRIPTION_MIN_LENGTH,
      `fallback page SEO description should be at least ${PAGE_DESCRIPTION_MIN_LENGTH} characters`,
    );
    assert.ok(
      description.length <= PAGE_DESCRIPTION_MAX_LENGTH,
      `fallback page SEO description should stay within ${PAGE_DESCRIPTION_MAX_LENGTH} characters`,
    );
  }
}

function buildArchiveEntryFixture(number: number): ArchiveEntry {
  return {
    number,
    slug: `pinpoint-answer-${number}`,
    title: `LinkedIn Pinpoint ${number}: Alpha, Beta, Gamma, Delta, Epsilon`,
    date: `04/${String(number % 28 || 1).padStart(2, "0")}/2026`,
    isoDate: `2026-04-${String(number % 28 || 1).padStart(2, "0")}`,
    clues: ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"],
    shortSummary: `Archive fixture for Pinpoint ${number}.`,
    answer: "Fixture answer",
    category: "Fixture category",
    difficulty: "Medium",
    updatedAt: `2026-04-${String(number % 28 || 1).padStart(2, "0")}T00:00:00.000Z`,
    status: number === 725 ? "live" : "archived",
  };
}

function getStructuredDataByType(items: Record<string, unknown>[], type: string): Record<string, unknown> {
  const item = items.find((candidate) => candidate["@type"] === type);
  assert.ok(item, `archive structured data should include ${type}`);
  return item;
}

function checkArchiveStructuredDataUsesLightweightItemList() {
  const entries = Array.from({ length: ARCHIVE_SCHEMA_FIXTURE_COUNT }, (_, index) =>
    buildArchiveEntryFixture(725 - index),
  );
  const structuredData = buildArchiveStructuredData(entries);
  const collectionPage = getStructuredDataByType(structuredData, "CollectionPage");
  const itemList = getStructuredDataByType(structuredData, "ItemList");
  const breadcrumbList = getStructuredDataByType(structuredData, "BreadcrumbList");
  const collectionParts = collectionPage.hasPart;
  const listElements = itemList.itemListElement;

  assert.ok(Array.isArray(collectionParts), "archive CollectionPage.hasPart should be an array");
  assert.equal(collectionParts.length, 20, "archive CollectionPage.hasPart should stay capped at 20");
  assert.ok(Array.isArray(listElements), "archive ItemList.itemListElement should be an array");
  assert.equal(
    itemList.numberOfItems,
    entries.length,
    "archive ItemList.numberOfItems should report the full archive count",
  );
  assert.equal(
    listElements.length,
    entries.length,
    "archive ItemList should include all visible archive entries as lightweight ListItems",
  );

  const firstListItem = listElements[0] as Record<string, unknown>;
  assert.deepEqual(
    Object.keys(firstListItem).sort(),
    ["@type", "name", "position", "url"].sort(),
    "archive ItemList entries should stay lightweight and avoid nested Article payloads",
  );
  assert.equal(firstListItem["@type"], "ListItem", "archive ItemList entries should be ListItem nodes");
  assert.equal(firstListItem.position, 1, "archive ItemList positions should start at 1");
  assert.equal(typeof firstListItem.url, "string", "archive ItemList entries should expose a URL");
  assert.equal(typeof firstListItem.name, "string", "archive ItemList entries should expose a name");
  assert.equal(
    JSON.stringify(itemList).includes('"@type":"Article"'),
    false,
    "archive ItemList should not embed full Article objects",
  );
  assert.ok(
    JSON.stringify(itemList).length < entries.length * 220,
    "archive ItemList JSON-LD should remain compact per entry",
  );
  assert.ok(
    Array.isArray(breadcrumbList.itemListElement),
    "archive structured data should keep the BreadcrumbList",
  );
}

function assertTrustPageMetadataIsIndexable(label: string, metadata: ReturnType<typeof generateContactMetadata>) {
  const robots = metadata.robots;

  assert.ok(
    robots && typeof robots === "object" && !Array.isArray(robots),
    `${label} page should expose explicit robots metadata`,
  );
  assert.equal(
    (robots as { index?: boolean }).index,
    true,
    `${label} page should stay indexable as a trust page`,
  );
  assert.ok(metadata.alternates, `indexable ${label} page should keep a canonical URL`);
  assert.ok(metadata.openGraph, `indexable ${label} page should keep Open Graph metadata`);
  assert.ok(metadata.twitter, `indexable ${label} page should keep Twitter metadata`);
}

function checkTrustPageMetadataIsIndexable() {
  assertTrustPageMetadataIsIndexable("about", generateAboutMetadata());
  assertTrustPageMetadataIsIndexable("contact", generateContactMetadata());
}

function main() {
  checkDraftSeoBuildersKeepAllClues();
  console.log("ok: draft SEO builders preserve all clues");

  checkPageSeoBuildersStaySnippetSized();
  console.log("ok: page SEO builders respect title and description caps");

  checkPageSeoDescriptionCanExposeAnswer();
  console.log("ok: page SEO description can expose answer when it fits");

  checkPageSeoDescriptionFallbackStaysInRange();
  console.log("ok: page SEO description fallback stays in range");

  checkArchiveStructuredDataUsesLightweightItemList();
  console.log("ok: archive structured data keeps lightweight full ItemList");

  checkTrustPageMetadataIsIndexable();
  console.log("ok: trust page metadata stays indexable");

  console.log("Pinpoint SEO builder guardrails passed.");
}

main();
