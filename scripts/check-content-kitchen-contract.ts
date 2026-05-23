import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
  console.log(`content-kitchen contract fixtures passed (${fileNames.length} fixtures)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
