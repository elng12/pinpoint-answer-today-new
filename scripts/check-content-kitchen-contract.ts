import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCategoryMembershipEvidenceRecords,
  dictionaryDiffRequiresReviewArtifacts,
  lookupAliases,
  lookupCategoryMembership,
  readContentKitchenDictionaries,
  readContentKitchenDictionaryDiffs,
} from "../lib/puzzles/content-kitchen/dictionary";
import { hashInputSnapshot } from "../lib/puzzles/content-kitchen/identity";
import {
  CONTENT_KITCHEN_ISSUE_REGISTRY,
  getIssueDefinition,
  getPr6P0IssueCodes,
  getPr7IssueCodes,
} from "../lib/puzzles/content-kitchen/issue-registry";
import { buildReviewArtifactV0, shouldCreateReviewArtifact } from "../lib/puzzles/content-kitchen/review-artifact";
import { validateCandidate } from "../lib/puzzles/content-kitchen/validate-candidate";
import type {
  ContentKitchenIssueCode,
  L1PuzzleInput,
  ValidateCandidateInput,
  ValidationOutcome,
  ValidationPolicies,
} from "../lib/puzzles/content-kitchen/types";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const FIXTURE_DIR = resolve(ROOT, "lib", "puzzles", "content-kitchen", "fixtures");
const EXAMPLE_DIR = resolve(ROOT, "lib", "puzzles", "content-kitchen", "examples");

type Fixture = {
  name: string;
  input: ValidateCandidateInput;
  expected: {
    outcome: ValidationOutcome;
    policies?: Partial<ValidationPolicies>;
    issueCodes?: ContentKitchenIssueCode[];
    mustCreateArtifact?: boolean;
  };
};

function cloneFixtureInput(input: ValidateCandidateInput): ValidateCandidateInput {
  return JSON.parse(JSON.stringify(input)) as ValidateCandidateInput;
}

function hydrateFixtureInput(input: ValidateCandidateInput): ValidateCandidateInput {
  const hydrated = cloneFixtureInput(input);
  if (
    hydrated.l1Input &&
    hydrated.candidate &&
    hydrated.candidate.inputSnapshotHash === "__HASH_L1__"
  ) {
    hydrated.candidate.inputSnapshotHash = hashInputSnapshot(hydrated.l1Input);
  }
  return hydrated;
}

async function readFixture(fileName: string): Promise<Fixture> {
  const raw = await readFile(resolve(FIXTURE_DIR, fileName), "utf8");
  return JSON.parse(raw) as Fixture;
}

function assertPolicySubset(
  fileName: string,
  actual: ValidationPolicies,
  expected: Partial<ValidationPolicies> | undefined,
) {
  if (!expected) return;

  for (const [key, expectedValue] of Object.entries(expected) as Array<
    [keyof ValidationPolicies, ValidationPolicies[keyof ValidationPolicies]]
  >) {
    assert.deepEqual(
      actual[key],
      expectedValue,
      `${fileName}: policy ${key} should be ${String(expectedValue)}`,
    );
  }
}

function assertIssueCodes(
  fileName: string,
  actualCodes: ContentKitchenIssueCode[],
  expectedCodes: ContentKitchenIssueCode[] = [],
) {
  assert.deepEqual(
    actualCodes,
    expectedCodes,
    `${fileName}: issue codes should match expected order`,
  );
}

function assertIssuesAreRegistered(fileName: string, issueCodes: ContentKitchenIssueCode[]) {
  for (const issueCode of issueCodes) {
    assert.doesNotThrow(() => getIssueDefinition(issueCode), `${fileName}: ${issueCode} should be registered`);
  }
}

function assertReviewArtifactBehavior(fileName: string, fixture: Fixture, actual: ReturnType<typeof validateCandidate>) {
  const hydratedInput = hydrateFixtureInput(fixture.input);
  const artifact = buildReviewArtifactV0({
    validationInput: hydratedInput,
    validationOutput: actual,
    createdAt: "2026-05-23T00:00:00.000Z",
  });

  const shouldCreate = shouldCreateReviewArtifact(actual);
  assert.equal(Boolean(artifact), shouldCreate, `${fileName}: artifact creation should follow validation outcome`);

  if (fixture.expected.mustCreateArtifact != null) {
    assert.equal(Boolean(artifact), fixture.expected.mustCreateArtifact, `${fileName}: mustCreateArtifact should match`);
  }

  if (!artifact) return;

  assert.equal(artifact.artifactVersion, "content-kitchen-review-artifact-v0", `${fileName}: artifact version should be stable`);
  assert.equal(artifact.validation.outcome, actual.outcome, `${fileName}: artifact outcome should match validation`);
  assert.deepEqual(
    artifact.validation.issueCodes,
    actual.issues.map((issue) => issue.issueCode),
    `${fileName}: artifact issue codes should match validation`,
  );
  assert.ok(artifact.allowedReviewerActions.length > 0, `${fileName}: artifact should include reviewer actions`);

  const serialized = JSON.stringify(artifact);
  if (typeof hydratedInput.renderedHtml === "string" && hydratedInput.renderedHtml.trim()) {
    assert.ok(
      !serialized.includes(hydratedInput.renderedHtml),
      `${fileName}: artifact must not include raw rendered HTML content`,
    );
  }
  assert.ok(!serialized.includes("secret"), `${fileName}: artifact must not include obvious secret strings`);
}

function assertPr6P0Coverage(fixtures: Fixture[]) {
  const negativeIssueCodes = new Set<ContentKitchenIssueCode>();

  for (const fixture of fixtures) {
    if (fixture.expected.outcome === "pass_answer_first" || fixture.expected.outcome === "pass_full_analysis") {
      continue;
    }

    for (const issueCode of fixture.expected.issueCodes ?? []) {
      negativeIssueCodes.add(issueCode);
    }
  }

  const missing = getPr6P0IssueCodes().filter((issueCode) => !negativeIssueCodes.has(issueCode));
  assert.deepEqual(missing, [], "every PR6 P0 issue code should have at least one negative fixture");
}

function assertPr7Coverage(fixtures: Fixture[]) {
  const negativeIssueCodes = new Set<ContentKitchenIssueCode>();

  for (const fixture of fixtures) {
    if (fixture.expected.outcome === "pass_answer_first" || fixture.expected.outcome === "pass_full_analysis") {
      continue;
    }

    for (const issueCode of fixture.expected.issueCodes ?? []) {
      negativeIssueCodes.add(issueCode);
    }
  }

  const missing = getPr7IssueCodes().filter((issueCode) => !negativeIssueCodes.has(issueCode));
  assert.deepEqual(missing, [], "every PR7 issue code should have at least one negative fixture");
}

function assertIssueRegistryIsStable() {
  const seen = new Set<ContentKitchenIssueCode>();
  for (const definition of CONTENT_KITCHEN_ISSUE_REGISTRY) {
    assert.ok(!seen.has(definition.code), `duplicate issue code in registry: ${definition.code}`);
    seen.add(definition.code);
    assert.ok(definition.description.trim(), `${definition.code}: description is required`);
  }
}

async function assertExamplesAreValidJson() {
  const fileNames = (await readdir(EXAMPLE_DIR)).filter((fileName) => fileName.endsWith(".json")).sort();
  assert.ok(fileNames.length >= 2, "content kitchen should include stable PR6C JSON examples");

  for (const fileName of fileNames) {
    const raw = await readFile(resolve(EXAMPLE_DIR, fileName), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    assert.ok(parsed && typeof parsed === "object", `${fileName}: example should parse as a JSON object`);
    assert.ok(!raw.includes("<main"), `${fileName}: examples should not include raw rendered HTML`);
  }
}

async function assertDictionariesAreReadable() {
  const dictionaries = await readContentKitchenDictionaries(ROOT);
  const dictionaryDiffs = await readContentKitchenDictionaryDiffs(ROOT);

  assert.equal(
    dictionaries.categoryMembership.versionId,
    "category_membership_2026_05_23",
    "category membership dictionary version should be stable",
  );
  assert.equal(
    dictionaries.aliasDictionary.versionId,
    "alias_dictionary_2026_05_23",
    "alias dictionary version should be stable",
  );
  assert.ok(dictionaryDiffs.length >= 2, "dictionary diffs should record checked-in dictionary changes");

  const categoryDiff = dictionaryDiffs.find((diff) => diff.toVersion === dictionaries.categoryMembership.versionId);
  assert.ok(categoryDiff, "category membership dictionary should have a matching diff record");
  assert.equal(categoryDiff.dictionaryName, "category_membership", "category diff should identify its dictionary");
  assert.equal(categoryDiff.changes.length, 5, "category seed diff should record five additions");
  assert.equal(
    dictionaryDiffRequiresReviewArtifacts(categoryDiff),
    false,
    "low-risk seed category diff should not require review artifacts",
  );

  const aliasDiff = dictionaryDiffs.find((diff) => diff.toVersion === dictionaries.aliasDictionary.versionId);
  assert.ok(aliasDiff, "alias dictionary should have a matching diff record");
  assert.equal(aliasDiff.dictionaryName, "alias_dictionary", "alias diff should identify its dictionary");
  assert.equal(aliasDiff.changes.length, 3, "alias seed diff should record three additions");
  assert.equal(
    dictionaryDiffRequiresReviewArtifacts(aliasDiff),
    false,
    "low-risk seed alias diff should not require review artifacts",
  );

  for (const member of ["Bass", "Classical", "Electric", "Acoustic", "Steel"]) {
    assert.ok(
      lookupCategoryMembership(dictionaries.categoryMembership, {
        category: "Types of guitar",
        member,
      }),
      `category_membership should include ${member} as a Types of guitar member`,
    );
  }

  const categoryAliases = lookupAliases(dictionaries.aliasDictionary, {
    alias: "guitar types",
    aliasType: "category",
  });
  assert.equal(categoryAliases.length, 1, "alias_dictionary should resolve category aliases");
  assert.equal(categoryAliases[0]?.canonicalValue, "Types of guitar", "category alias should point to canonical value");

  const fixture = await readFixture("full-analysis-cumulative-confirmation.valid.json");
  const hydratedInput = hydrateFixtureInput(fixture.input);
  assert.ok(hydratedInput.l1Input, "dictionary evidence fixture should include L1 input");
  assert.ok(hydratedInput.candidate, "dictionary evidence fixture should include a candidate");
  const l1Input = hydratedInput.l1Input as L1PuzzleInput;

  const evidenceRecords = buildCategoryMembershipEvidenceRecords({
    l1Input,
    category: "Types of guitar",
    dictionary: dictionaries.categoryMembership,
    evidenceIdPrefix: "ev",
  });

  assert.equal(evidenceRecords.length, 5, "category membership dictionary should produce five L2 evidence records");
  assert.ok(
    evidenceRecords.every((record) => {
      return record.sourceLevel === "L2" &&
        record.sourceType === "category_membership" &&
        record.supportKind === "fit" &&
        record.lookupVersion === dictionaries.categoryMembership.versionId;
    }),
    "dictionary-built evidence records should be reviewed L2 fit evidence",
  );

  const actual = validateCandidate({
    ...hydratedInput,
    evidenceRecords,
  });
  assert.equal(actual.outcome, "pass_full_analysis", "dictionary-built evidence should support full-analysis validation");

  const dictionaryDerived = validateCandidate({
    ...hydratedInput,
    candidate: {
      ...hydratedInput.candidate,
      answerCategory: "Types of guitar",
    },
    evidenceRecords: undefined,
    dictionaries,
  });
  assert.equal(
    dictionaryDerived.outcome,
    "pass_full_analysis",
    "validator should derive category-membership evidence from reviewed dictionaries",
  );
}

function checkHashExcludesVolatileFields() {
  const base = {
    puzzleId: "pinpoint-900-2026-05-23",
    puzzleNumber: 900,
    logicalGameDate: "2026-05-23",
    source: "official_capture",
    capturedAt: "2026-05-23T08:00:00.000Z",
    inputSnapshotHash: "old-self-hash",
    answer: "Types of guitar",
    clues: [
      { clueId: "clue-1", text: "Bass", position: 1 },
      { clueId: "clue-2", text: "Classical", position: 2 },
      { clueId: "clue-3", text: "Electric", position: 3 },
      { clueId: "clue-4", text: "Acoustic", position: 4 },
      { clueId: "clue-5", text: "Steel", position: 5 },
    ],
  };

  const changedOnlyInExcludedFields = {
    ...base,
    capturedAt: "2026-05-23T09:30:00.000Z",
    inputSnapshotHash: "new-self-hash",
  };

  const changedClueOrder = {
    ...base,
    clues: [...base.clues].reverse(),
  };

  assert.equal(
    hashInputSnapshot(base),
    hashInputSnapshot(changedOnlyInExcludedFields),
    "hashInputSnapshot should ignore inputSnapshotHash and capturedAt",
  );
  assert.notEqual(
    hashInputSnapshot(base),
    hashInputSnapshot(changedClueOrder),
    "hashInputSnapshot should change when clue order changes",
  );
}

async function main() {
  const fileNames = (await readdir(FIXTURE_DIR)).filter((fileName) => fileName.endsWith(".json")).sort();
  assert.ok(fileNames.length >= 6, "content kitchen should have at least 6 fixtures");
  const fixtures: Fixture[] = [];

  for (const fileName of fileNames) {
    const fixture = await readFixture(fileName);
    fixtures.push(fixture);
    const actual = validateCandidate(hydrateFixtureInput(fixture.input));
    assert.equal(actual.outcome, fixture.expected.outcome, `${fileName}: outcome should match`);
    assertPolicySubset(fileName, actual.policies, fixture.expected.policies);
    assertIssueCodes(
      fileName,
      actual.issues.map((issue) => issue.issueCode),
      fixture.expected.issueCodes,
    );
    assertIssuesAreRegistered(fileName, actual.issues.map((issue) => issue.issueCode));
    assertReviewArtifactBehavior(fileName, fixture, actual);
  }

  checkHashExcludesVolatileFields();
  assertIssueRegistryIsStable();
  assertPr6P0Coverage(fixtures);
  assertPr7Coverage(fixtures);
  await assertExamplesAreValidJson();
  await assertDictionariesAreReadable();
  console.log(`content-kitchen contract fixtures passed (${fileNames.length} fixtures)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
