import assert from "node:assert/strict";
import { CONTENT_CONTRACT } from "@/lib/puzzles/content-contract";
import {
  buildPuzzleSeoDescription,
  buildPuzzleSeoTitle,
} from "@/lib/seo/metadata";
import {
  buildPinpointDescription,
  buildPinpointTitle,
} from "@/lib/seo/pinpoint";

const PAGE_TITLE_MAX_LENGTH = 60;
const PAGE_DESCRIPTION_MAX_LENGTH = 160;

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
    `page SEO title should stay within ${PAGE_TITLE_MAX_LENGTH} characters`,
  );
  assert.ok(
    description.length <= PAGE_DESCRIPTION_MAX_LENGTH,
    `page SEO description should stay within ${PAGE_DESCRIPTION_MAX_LENGTH} characters`,
  );
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
    "page SEO description should include the answer when the answer-aware template fits",
  );
}

function main() {
  checkDraftSeoBuildersKeepAllClues();
  console.log("ok: draft SEO builders preserve all clues");

  checkPageSeoBuildersStaySnippetSized();
  console.log("ok: page SEO builders stay snippet-sized");

  checkPageSeoDescriptionCanExposeAnswer();
  console.log("ok: page SEO description can expose answer when it fits");

  console.log("Pinpoint SEO builder guardrails passed.");
}

main();
