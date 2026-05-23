import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashInputSnapshot } from "../lib/puzzles/content-kitchen/identity";
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

type Fixture = {
  name: string;
  input: ValidateCandidateInput;
  expected: {
    outcome: ValidationOutcome;
    policies?: Partial<ValidationPolicies>;
    issueCodes?: ContentKitchenIssueCode[];
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

  for (const fileName of fileNames) {
    const fixture = await readFixture(fileName);
    const actual = validateCandidate(hydrateFixtureInput(fixture.input));
    assert.equal(actual.outcome, fixture.expected.outcome, `${fileName}: outcome should match`);
    assertPolicySubset(fileName, actual.policies, fixture.expected.policies);
    assertIssueCodes(
      fileName,
      actual.issues.map((issue) => issue.issueCode),
      fixture.expected.issueCodes,
    );
  }

  checkHashExcludesVolatileFields();
  console.log(`content-kitchen contract fixtures passed (${fileNames.length} fixtures)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
