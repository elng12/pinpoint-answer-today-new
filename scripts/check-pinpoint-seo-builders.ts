import assert from "node:assert/strict";
import buildSitemap from "@/app/sitemap";
import { generateMetadata as generateHomeMetadata } from "@/app/(site)/(home)/page";
import { generateMetadata as generateAboutMetadata } from "@/app/(site)/about-us/page";
import { generateMetadata as generateContactMetadata } from "@/app/(site)/contact-us/page";
import type { ArchiveEntry } from "@/lib/puzzles/data";
import { CONTENT_CONTRACT } from "@/lib/puzzles/content-contract";
import { routes } from "@/lib/paths/routes";
import { buildArchiveStructuredData } from "@/lib/seo/archive-structured-data";
import { buildHomeStructuredData } from "@/lib/seo/home-structured-data";
import {
  buildPuzzleSeoDescription,
  buildPuzzleSeoTitle,
  HOME_SEO_DESCRIPTION,
  HOME_SEO_TITLE,
} from "@/lib/seo/metadata";
import { buildPuzzleDetailStructuredData } from "@/lib/seo/puzzle-detail-structured-data";
import {
  buildPinpointDescription,
  buildPinpointTitle,
} from "@/lib/seo/pinpoint";

const PAGE_TITLE_MAX_LENGTH = 110;
const PAGE_DESCRIPTION_MIN_LENGTH = CONTENT_CONTRACT.metaDescriptionMinChars;
const PAGE_DESCRIPTION_MAX_LENGTH = CONTENT_CONTRACT.metaDescriptionMaxChars;
const PAGE_DESCRIPTION_INDEX_MAX = CONTENT_CONTRACT.metaDescriptionIndexMaxChars;
const ARCHIVE_SCHEMA_FIXTURE_COUNT = 120;
const ARCHIVE_ITEM_LIST_EXPECTED_COUNT = 100;
const UNSUPPORTED_RICH_RESULT_TYPES = ["HowTo"];

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

function checkPageSeoDescriptionVersioning() {
  const defaultDescription = buildPuzzleSeoDescription(
    688,
    ["Comet", "Orbit", "Telescope", "Meteor", "Galaxy"],
    "Space terms",
  );
  const legacyDescription = buildPuzzleSeoDescription(
    688,
    ["Comet", "Orbit", "Telescope", "Meteor", "Galaxy"],
    "Space terms",
    "serp-v1",
  );

  assert.ok(
    legacyDescription.includes("Answer: Space terms."),
    "serp-v1 should preserve the answer-aware control description",
  );
  assert.equal(
    defaultDescription,
    legacyDescription,
    "pages without a stored SEO version must keep the serp-v1 control description",
  );
  assert.equal(/\bverified\b/i.test(legacyDescription), false, "detail descriptions must not claim verification");
  const answerPos = legacyDescription.indexOf("Answer: ");
  assert.ok(
    answerPos > 110,
    `serp-v1 answer should appear after the SERP-visible portion (at char ${answerPos})`,
  );

  const canaryDescription = buildPuzzleSeoDescription(
    688,
    ["Comet", "Orbit", "Telescope", "Meteor", "Galaxy"],
    "Space terms",
    "serp-v2",
  );
  assert.equal(canaryDescription.includes("Answer: "), false, "serp-v2 must not append the answer");
  assert.equal(canaryDescription.includes("Space terms"), false, "serp-v2 must not expose the answer text");
  assert.equal(/\bverified\b/i.test(canaryDescription), false, "serp-v2 must not claim verification");
  assert.throws(
    () => buildPuzzleSeoDescription(688, ["A", "B", "C", "D", "E"], "X", "serp-v3" as never),
    /Unsupported Pinpoint SEO template version/,
    "unknown SEO template versions must fail closed",
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

function getTopLevelSchemaTypes(items: Record<string, unknown>[]): string[] {
  return items.map((item) => {
    const schemaType = item["@type"];
    if (typeof schemaType !== "string") {
      assert.fail("structured data item should expose a string @type");
    }
    return schemaType;
  });
}

function collectSchemaTypes(value: unknown, schemaTypes = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectSchemaTypes(item, schemaTypes);
    }
    return schemaTypes;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const schemaType = record["@type"];
    if (typeof schemaType === "string") {
      schemaTypes.add(schemaType);
    }
    for (const nested of Object.values(record)) {
      collectSchemaTypes(nested, schemaTypes);
    }
  }

  return schemaTypes;
}

function assertUnsupportedRichResultSchemasAbsent(label: string, items: Record<string, unknown>[]) {
  const schemaTypes = collectSchemaTypes(items);
  for (const schemaType of UNSUPPORTED_RICH_RESULT_TYPES) {
    assert.equal(
      schemaTypes.has(schemaType),
      false,
      `${label} structured data should not include unsupported ${schemaType} markup`,
    );
  }
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
    ARCHIVE_ITEM_LIST_EXPECTED_COUNT,
    "archive ItemList.numberOfItems should report the capped structured list count",
  );
  assert.equal(
    listElements.length,
    ARCHIVE_ITEM_LIST_EXPECTED_COUNT,
    "archive ItemList should cap structured entries",
  );
  assert.ok(
    entries.length > listElements.length,
    "archive fixture should prove ItemList truncation while HTML/sitemap paths preserve the full archive",
  );

  const firstListItem = listElements[0] as Record<string, unknown>;
  assert.deepEqual(
    Object.keys(firstListItem).sort(),
    ["@type", "position", "url"].sort(),
    "archive ItemList entries should stay lightweight and follow Google's summary-page shape",
  );
  assert.equal(firstListItem["@type"], "ListItem", "archive ItemList entries should be ListItem nodes");
  assert.equal(firstListItem.position, 1, "archive ItemList positions should start at 1");
  assert.equal(typeof firstListItem.url, "string", "archive ItemList entries should expose a URL");
  assert.equal(
    JSON.stringify(itemList).includes('"@type":"Article"'),
    false,
    "archive ItemList should not embed full Article objects",
  );
  assert.ok(
    JSON.stringify(itemList).length < 20_000,
    "archive ItemList JSON-LD should stay below the 20KB archive budget",
  );
  assert.ok(
    Array.isArray(breadcrumbList.itemListElement),
    "archive structured data should keep the BreadcrumbList",
  );
}

function checkPublicStructuredDataUsesSupportedSchemaTypes() {
  const homePuzzle = {
    number: 812,
    slug: "pinpoint-answer-812",
    clues: [
      "International Space Station",
      "Constellation Map",
      "Gravitational Lensing",
      "Planetary Alignment",
      "Astrophotography",
    ],
    answer: "Astronomy themes",
    updatedAt: "2026-04-20T00:00:00.000Z",
  };
  const homeStructuredData = buildHomeStructuredData(homePuzzle, [
    buildArchiveEntryFixture(811),
    buildArchiveEntryFixture(810),
  ]);
  assert.deepEqual(
    getTopLevelSchemaTypes(homeStructuredData),
    ["Organization", "WebSite", "Game", "WebPage", "FAQPage", "ItemList"],
    "home structured data should expose site, game, answer, FAQ, and recent-answer schema",
  );
  assertUnsupportedRichResultSchemasAbsent("home", homeStructuredData);

  const homeWebPage = getStructuredDataByType(homeStructuredData, "WebPage");
  assert.equal(
    (homeWebPage.mainEntity as Record<string, unknown> | undefined)?.["@type"],
    "Question",
    "home WebPage should expose the current answer as the main question",
  );
  assert.equal(
    ((homeWebPage.mainEntity as Record<string, unknown>).acceptedAnswer as Record<string, unknown>).text,
    homePuzzle.answer,
    "home acceptedAnswer should expose today's answer",
  );

  const detailStructuredData = buildPuzzleDetailStructuredData({
    puzzle: {
      number: 812,
      slug: "pinpoint-answer-812",
      clues: [
        "International Space Station",
        "Constellation Map",
        "Gravitational Lensing",
        "Planetary Alignment",
        "Astrophotography",
      ],
      answer: "Astronomy themes",
      isoDate: "2026-04-20",
      seoTemplateVersion: "serp-v1",
      updatedAt: "2026-04-20T00:00:00.000Z",
    },
    recentPuzzles: [
      { number: 812, slug: "pinpoint-answer-812" },
      { number: 811, slug: "pinpoint-answer-811" },
    ],
  });

  assert.deepEqual(
    getTopLevelSchemaTypes(detailStructuredData),
    ["Article", "Game", "ItemList", "BreadcrumbList"],
    "detail structured data should stay limited to supported puzzle-page schema",
  );
  assertUnsupportedRichResultSchemasAbsent("detail", detailStructuredData);
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

function checkHomepageSeoCopyIsLocked() {
  const metadata = generateHomeMetadata();

  assert.equal(metadata.title, HOME_SEO_TITLE, "home metadata title should use the locked homepage SEO title");
  assert.equal(
    metadata.description,
    HOME_SEO_DESCRIPTION,
    "home metadata description should use the locked homepage SEO description",
  );
  assert.equal(
    /Puzzle\s*#?\d+/i.test(`${metadata.title ?? ""} ${metadata.description ?? ""}`),
    false,
    "home SEO title and description should not include the daily puzzle number",
  );
}

async function checkSitemapExcludesNoindexLegalPages() {
  const sitemap = await buildSitemap();
  const sitemapPaths = new Set(sitemap.map((entry) => new URL(entry.url).pathname));

  assert.equal(
    sitemapPaths.has(routes.privacy),
    false,
    "sitemap should not include the noindex privacy page",
  );
  assert.equal(
    sitemapPaths.has(routes.terms),
    false,
    "sitemap should not include the noindex terms page",
  );
  assert.equal(
    sitemapPaths.has(routes.disclaimer),
    true,
    "sitemap should keep the indexable disclaimer page",
  );
}

async function main() {
  checkDraftSeoBuildersKeepAllClues();
  console.log("ok: draft SEO builders preserve all clues");

  checkPageSeoBuildersStaySnippetSized();
  console.log("ok: page SEO builders respect title and description caps");

  checkPageSeoDescriptionVersioning();
  console.log("ok: page SEO description versions separate control and no-answer canary copy");

  checkPageSeoDescriptionFallbackStaysInRange();
  console.log("ok: page SEO description fallback stays in range");

  checkArchiveStructuredDataUsesLightweightItemList();
  console.log("ok: archive structured data keeps lightweight capped ItemList");

  checkPublicStructuredDataUsesSupportedSchemaTypes();
  console.log("ok: public structured data excludes unsupported rich-result schema");

  checkTrustPageMetadataIsIndexable();
  console.log("ok: trust page metadata stays indexable");

  checkHomepageSeoCopyIsLocked();
  console.log("ok: homepage SEO copy stays locked and number-free");

  await checkSitemapExcludesNoindexLegalPages();
  console.log("ok: sitemap excludes noindex legal pages");

  console.log("Pinpoint SEO builder guardrails passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
