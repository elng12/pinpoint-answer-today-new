import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCategoryMembershipEvidenceRecords,
  buildPublishedEvidenceUsageRecords,
  dictionaryDiffRequiresReviewArtifacts,
  findAffectedPublishedPages,
  lookupAliases,
  lookupCategoryMembership,
  readContentKitchenDictionaries,
  readContentKitchenDictionaryDiffs,
} from "../lib/puzzles/content-kitchen/dictionary";
import { generateFullAnalysisClueFits } from "../lib/puzzles/content-kitchen/clue-fit-generator";
import { generateFullAnalysisFaqItems } from "../lib/puzzles/content-kitchen/faq-generator";
import { generateFullAnalysisFalseStart } from "../lib/puzzles/content-kitchen/false-start-generator";
import { assembleFullAnalysisSlotPlan } from "../lib/puzzles/content-kitchen/full-analysis-assembler";
import { validateFullAnalysisSlotPlan } from "../lib/puzzles/content-kitchen/full-analysis-slots";
import { hashInputSnapshot } from "../lib/puzzles/content-kitchen/identity";
import { buildFullAnalysisRepairPlan } from "../lib/puzzles/content-kitchen/local-repair-loop";
import { classifyFullAnalysisPuzzleType } from "../lib/puzzles/content-kitchen/puzzle-type-classifier";
import { generateFullAnalysisReasoning } from "../lib/puzzles/content-kitchen/reasoning-generator";
import {
  CONTENT_KITCHEN_ISSUE_REGISTRY,
  getIssueDefinition,
  getPr6P0IssueCodes,
  getPr7IssueCodes,
} from "../lib/puzzles/content-kitchen/issue-registry";
import { buildReviewArtifactV0, shouldCreateReviewArtifact } from "../lib/puzzles/content-kitchen/review-artifact";
import { validateCandidate } from "../lib/puzzles/content-kitchen/validate-candidate";
import type {
  ContentKitchenDictionaries,
  ContentKitchenIssueCode,
  FullAnalysisSlotIssueCode,
  FullAnalysisSlotPlanV0,
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

async function assertDictionariesAreReadable(): Promise<ContentKitchenDictionaries> {
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

  const usageRecords = buildPublishedEvidenceUsageRecords({
    slug: "pinpoint-answer-900",
    canonicalUrl: "https://example.com/linkedin-pinpoint-answers/pinpoint-answer-900/",
    revisionId: "rev-full-analysis-cumulative",
    contentMode: "full-analysis",
    evidenceRecords,
  });
  assert.equal(usageRecords.length, 5, "published evidence usage index should include one row per evidence record");

  const affectedByVersion = findAffectedPublishedPages(usageRecords, {
    lookupVersion: dictionaries.categoryMembership.versionId,
    dictionaryName: "category_membership",
  });
  assert.deepEqual(
    affectedByVersion.map((page) => page.slug),
    ["pinpoint-answer-900"],
    "affected page lookup should find pages by dictionary lookup version",
  );

  const affectedByMember = findAffectedPublishedPages(usageRecords, {
    dictionaryName: "category_membership",
    category: "Types of guitar",
    member: "Bass",
  });
  assert.deepEqual(
    affectedByMember.map((page) => page.slug),
    ["pinpoint-answer-900"],
    "affected page lookup should find pages by dictionary category and member",
  );
  assert.equal(affectedByMember[0]?.needsReview, true, "affected pages should be marked for review by default");

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

  return dictionaries;
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

function makeSlotContractL1Input(): L1PuzzleInput {
  return {
    puzzleId: "pinpoint-900-2026-05-23",
    puzzleNumber: 900,
    logicalGameDate: "2026-05-23",
    source: "official_capture",
    answer: "Types of guitar",
    clues: [
      { clueId: "clue-1", text: "Bass", position: 1 },
      { clueId: "clue-2", text: "Classical", position: 2 },
      { clueId: "clue-3", text: "Electric", position: 3 },
      { clueId: "clue-4", text: "Acoustic", position: 4 },
      { clueId: "clue-5", text: "Steel", position: 5 },
    ],
  };
}

function makeValidSlotPlan(): FullAnalysisSlotPlanV0 {
  const l1Input = makeSlotContractL1Input();

  return {
    slotVersion: "full-analysis-slot-plan-v0",
    puzzleType: "category_membership",
    answerCategory: "Types of guitar",
    clueFits: l1Input.clues.map((clue) => ({
      clueId: clue.clueId,
      clueText: clue.text,
      fit: `${clue.text} is a type of guitar.`,
      whyItSupportsAnswer: `${clue.text} supports the shared category Types of guitar.`,
      evidenceRefs: [`ev-${clue.clueId}`],
    })),
    reasoning: {
      pattern: "cumulative_confirmation",
      clueIds: ["clue-1", "clue-2", "clue-3"],
      text: "Bass, Classical, and Electric all work as named types of guitar, so the other clues confirm the same category.",
      evidenceRefs: ["ev-clue-1", "ev-clue-2", "ev-clue-3"],
    },
    falseStart: {
      status: "omitted",
    },
    faqItems: [
      {
        question: "Why is Bass a fit?",
        answer: "Bass is a type of guitar in this clue set.",
        evidenceRefs: ["ev-clue-1"],
      },
      {
        question: "Why is Electric a fit?",
        answer: "Electric is another type of guitar in the same category.",
        evidenceRefs: ["ev-clue-3"],
      },
    ],
  };
}

function getSlotIssueCodes(slotPlan: Partial<FullAnalysisSlotPlanV0>): FullAnalysisSlotIssueCode[] {
  return validateFullAnalysisSlotPlan({
    l1Input: makeSlotContractL1Input(),
    slotPlan,
  }).map((issue) => issue.issueCode);
}

function assertSlotIssueIncluded(
  name: string,
  slotPlan: Partial<FullAnalysisSlotPlanV0>,
  expectedIssueCode: FullAnalysisSlotIssueCode,
) {
  assert.ok(
    getSlotIssueCodes(slotPlan).includes(expectedIssueCode),
    `${name}: expected slot issue ${expectedIssueCode}`,
  );
}

function assertFullAnalysisSlotContract() {
  const validPlan = makeValidSlotPlan();
  assert.deepEqual(getSlotIssueCodes(validPlan), [], "valid full-analysis slot plan should pass");

  const includedFalseStart: FullAnalysisSlotPlanV0 = {
    ...validPlan,
    falseStart: {
      status: "included",
      rejectedTheory: "The clues might be instrument parts.",
      whyRejected: "The clues fit better as whole guitar types, not parts.",
      evidenceRefs: ["ev-clue-1"],
    },
  };
  assert.deepEqual(getSlotIssueCodes(includedFalseStart), [], "included false-start slot should pass when complete");

  const duplicateClueFit: FullAnalysisSlotPlanV0 = {
    ...validPlan,
    clueFits: validPlan.clueFits.map((clueFit, index) => {
      if (index === 4) {
        return {
          ...clueFit,
          clueId: "clue-1",
        };
      }

      return clueFit;
    }),
  };
  assertSlotIssueIncluded("duplicate clue fit", duplicateClueFit, "DUPLICATE_SLOT_CLUE_FIT");

  const unknownClueFit: FullAnalysisSlotPlanV0 = {
    ...validPlan,
    clueFits: validPlan.clueFits.map((clueFit, index) => {
      if (index === 0) {
        return {
          ...clueFit,
          clueId: "not-a-real-clue",
        };
      }

      return clueFit;
    }),
  };
  assertSlotIssueIncluded("unknown clue fit", unknownClueFit, "UNKNOWN_SLOT_CLUE");

  assertSlotIssueIncluded(
    "weak cumulative reasoning",
    {
      ...validPlan,
      reasoning: {
        pattern: "cumulative_confirmation",
        clueIds: ["clue-1"],
        text: "Only one clue is not enough to support cumulative reasoning.",
      },
    },
    "UNSUPPORTED_SLOT_REASONING",
  );

  assertSlotIssueIncluded(
    "incomplete false start",
    {
      ...validPlan,
      falseStart: {
        status: "included",
        rejectedTheory: "The answer might be instrument parts.",
        whyRejected: "",
      },
    },
    "INVALID_FALSE_START_SLOT",
  );
}

function assertPuzzleTypeClassifier(dictionaries: ContentKitchenDictionaries) {
  const l1Input = makeSlotContractL1Input();
  const direct = classifyFullAnalysisPuzzleType({
    l1Input,
    dictionaries,
  });

  assert.equal(direct.puzzleType, "category_membership", "classifier should detect reviewed category membership");
  assert.equal(direct.confidence, "high", "direct answer/category match should be high confidence");
  assert.equal(direct.answerCategory, "Types of guitar", "classifier should return the selected category");
  assert.equal(direct.matchedClueCount, 5, "classifier should match all five clues");
  assert.deepEqual(direct.unmatchedClueIds, [], "classifier should have no unmatched clues for full coverage");
  assert.ok(
    direct.reasonCodes.includes("ANSWER_CATEGORY_HINT_MATCHED"),
    "classifier should explain direct answer/category match",
  );

  const alias = classifyFullAnalysisPuzzleType({
    l1Input: {
      ...l1Input,
      answer: "Kinds of guitar",
    },
    dictionaries,
  });
  assert.equal(alias.puzzleType, "category_membership", "classifier should use reviewed answer aliases");
  assert.equal(alias.confidence, "high", "reviewed answer alias should be high confidence");
  assert.ok(
    alias.reasonCodes.includes("ANSWER_ALIAS_MATCHED_CATEGORY"),
    "classifier should explain answer alias match",
  );

  const partial = classifyFullAnalysisPuzzleType({
    l1Input: {
      ...l1Input,
      answer: "Unknown category",
      clues: [
        { clueId: "clue-1", text: "Bass", position: 1 },
        { clueId: "clue-2", text: "Alpha", position: 2 },
        { clueId: "clue-3", text: "Bravo", position: 3 },
        { clueId: "clue-4", text: "Charlie", position: 4 },
        { clueId: "clue-5", text: "Delta", position: 5 },
      ],
    },
    dictionaries,
  });
  assert.equal(partial.puzzleType, "unknown", "partial category coverage should stay unknown");
  assert.equal(partial.confidence, "low", "partial category coverage should stay low confidence");
  assert.equal(partial.matchedClueCount, 1, "partial category coverage should report best match count");
  assert.ok(
    partial.reasonCodes.includes("PARTIAL_REVIEWED_CATEGORY_COVERAGE"),
    "classifier should explain partial category coverage",
  );

  const noDictionary = classifyFullAnalysisPuzzleType({ l1Input });
  assert.equal(noDictionary.puzzleType, "unknown", "classifier should stay unknown without dictionaries");
  assert.ok(
    noDictionary.reasonCodes.includes("NO_REVIEWED_CATEGORY_COVERAGE"),
    "classifier should explain missing reviewed coverage",
  );

  const ambiguous = classifyFullAnalysisPuzzleType({
    l1Input: {
      ...l1Input,
      answer: "Shared set",
    },
    dictionaries: {
      ...dictionaries,
      categoryMembership: {
        ...dictionaries.categoryMembership,
        entries: [
          ...dictionaries.categoryMembership.entries,
          ...dictionaries.categoryMembership.entries.map((entry) => ({
            ...entry,
            category: "Instrument labels",
            normalizedCategory: "instrument labels",
          })),
        ],
      },
    },
  });
  assert.equal(ambiguous.puzzleType, "unknown", "ambiguous full category coverage should stay unknown");
  assert.ok(
    ambiguous.reasonCodes.includes("AMBIGUOUS_REVIEWED_CATEGORY_COVERAGE"),
    "classifier should explain ambiguous reviewed coverage",
  );
}

function assertClueFitGenerator(dictionaries: ContentKitchenDictionaries) {
  const l1Input = makeSlotContractL1Input();
  const classification = classifyFullAnalysisPuzzleType({
    l1Input,
    dictionaries,
  });
  const generated = generateFullAnalysisClueFits({
    l1Input,
    classification,
    dictionaries,
    evidenceIdPrefix: "slot",
  });

  assert.equal(generated.ok, true, "clue-fit generator should produce slots for reviewed category membership");
  if (!generated.ok) {
    throw new Error("expected clue-fit generation to pass");
  }
  assert.equal(generated.clueFits.length, 5, "clue-fit generator should produce five clue-fit slots");
  assert.equal(generated.evidenceRecords.length, 5, "clue-fit generator should produce five evidence records");
  assert.deepEqual(
    generated.clueFits.map((clueFit) => clueFit.clueId),
    l1Input.clues.map((clue) => clue.clueId),
    "clue-fit generator should preserve L1 clue order",
  );
  assert.ok(
    generated.clueFits.every((clueFit) => clueFit.evidenceRefs.length === 1 && clueFit.whyItSupportsAnswer.includes("Types of guitar")),
    "generated clue fits should cite one evidence ref and explain the answer category",
  );

  const generatedSlotPlan: FullAnalysisSlotPlanV0 = {
    ...makeValidSlotPlan(),
    clueFits: generated.clueFits,
  };
  assert.deepEqual(
    validateFullAnalysisSlotPlan({ l1Input, slotPlan: generatedSlotPlan }),
    [],
    "generated clue-fit slots should satisfy the full-analysis slot contract",
  );

  const unsupported = generateFullAnalysisClueFits({
    l1Input,
    classification: {
      ...classification,
      puzzleType: "unknown",
      answerCategory: undefined,
    },
    dictionaries,
  });
  assert.equal(unsupported.ok, false, "unknown puzzle type should not generate clue-fit slots");
  if (unsupported.ok) {
    throw new Error("expected unsupported clue-fit generation to fail");
  }
  assert.deepEqual(
    unsupported.issues.map((issue) => issue.issueCode),
    ["UNSUPPORTED_PUZZLE_TYPE"],
    "unsupported puzzle type should return a clear issue code",
  );

  const noDictionaries = generateFullAnalysisClueFits({
    l1Input,
    classification,
  });
  assert.equal(noDictionaries.ok, false, "missing dictionaries should not generate clue-fit slots");
  if (noDictionaries.ok) {
    throw new Error("expected missing-dictionary clue-fit generation to fail");
  }
  assert.deepEqual(
    noDictionaries.issues.map((issue) => issue.issueCode),
    ["MISSING_REVIEWED_DICTIONARIES"],
    "missing dictionaries should return a clear issue code",
  );

  const incompleteL1 = {
    ...l1Input,
    clues: [
      { clueId: "clue-1", text: "Bass", position: 1 },
      { clueId: "clue-2", text: "Classical", position: 2 },
      { clueId: "clue-3", text: "Electric", position: 3 },
      { clueId: "clue-4", text: "Acoustic", position: 4 },
      { clueId: "clue-5", text: "Not in dictionary", position: 5 },
    ],
  };
  const incomplete = generateFullAnalysisClueFits({
    l1Input: incompleteL1,
    classification,
    dictionaries,
  });
  assert.equal(incomplete.ok, false, "incomplete dictionary coverage should not pass clue-fit generation");
  if (incomplete.ok) {
    throw new Error("expected incomplete clue-fit generation to fail");
  }
  assert.equal(incomplete.clueFits.length, 4, "incomplete generation should keep generated safe clue fits");
  assert.ok(
    incomplete.issues.some((issue) => issue.issueCode === "MISSING_REVIEWED_CATEGORY_MEMBER"),
    "incomplete generation should report the missing dictionary member",
  );
  assert.ok(
    incomplete.issues.some((issue) => issue.issueCode === "INCOMPLETE_CLUE_FIT_COVERAGE"),
    "incomplete generation should report incomplete 5/5 coverage",
  );
}

function assertReasoningPatternGenerator(dictionaries: ContentKitchenDictionaries) {
  const l1Input = makeSlotContractL1Input();
  const classification = classifyFullAnalysisPuzzleType({
    l1Input,
    dictionaries,
  });
  const generatedFits = generateFullAnalysisClueFits({
    l1Input,
    classification,
    dictionaries,
    evidenceIdPrefix: "slot",
  });
  assert.equal(generatedFits.ok, true, "reasoning generator setup should produce clue fits");
  if (!generatedFits.ok) {
    throw new Error("expected clue-fit generation to pass before reasoning generation");
  }

  const generatedReasoning = generateFullAnalysisReasoning({
    l1Input,
    classification,
    clueFits: generatedFits.clueFits,
  });
  assert.equal(generatedReasoning.ok, true, "reasoning generator should produce reasoning for complete clue fits");
  if (!generatedReasoning.ok) {
    throw new Error("expected reasoning generation to pass");
  }
  assert.equal(
    generatedReasoning.reasoning.pattern,
    "cumulative_confirmation",
    "reasoning generator should use cumulative confirmation for category membership",
  );
  assert.deepEqual(
    generatedReasoning.reasoning.clueIds,
    l1Input.clues.map((clue) => clue.clueId),
    "reasoning generator should cite all L1 clue ids in order",
  );
  assert.equal(
    generatedReasoning.reasoning.evidenceRefs?.length,
    5,
    "reasoning generator should carry all clue-fit evidence refs",
  );
  assert.ok(
    generatedReasoning.reasoning.text.includes("Types of guitar"),
    "reasoning text should mention the selected answer category",
  );

  const generatedSlotPlan: FullAnalysisSlotPlanV0 = {
    ...makeValidSlotPlan(),
    clueFits: generatedFits.clueFits,
    reasoning: generatedReasoning.reasoning,
  };
  assert.deepEqual(
    validateFullAnalysisSlotPlan({ l1Input, slotPlan: generatedSlotPlan }),
    [],
    "generated reasoning should satisfy the full-analysis slot contract",
  );

  const unsupported = generateFullAnalysisReasoning({
    l1Input,
    classification: {
      ...classification,
      puzzleType: "unknown",
      answerCategory: undefined,
    },
    clueFits: generatedFits.clueFits,
  });
  assert.equal(unsupported.ok, false, "unknown puzzle type should not generate reasoning");
  if (unsupported.ok) {
    throw new Error("expected unsupported reasoning generation to fail");
  }
  assert.deepEqual(
    unsupported.issues.map((issue) => issue.issueCode),
    ["UNSUPPORTED_REASONING_PUZZLE_TYPE"],
    "unsupported reasoning should return a clear issue code",
  );

  const incomplete = generateFullAnalysisReasoning({
    l1Input,
    classification,
    clueFits: generatedFits.clueFits.slice(0, 4),
  });
  assert.equal(incomplete.ok, false, "incomplete clue fits should not generate reasoning");
  if (incomplete.ok) {
    throw new Error("expected incomplete reasoning generation to fail");
  }
  assert.ok(
    incomplete.issues.some((issue) => issue.issueCode === "INCOMPLETE_REASONING_CLUE_FIT_COVERAGE"),
    "incomplete reasoning should report incomplete clue-fit coverage",
  );

  const missingEvidence = generateFullAnalysisReasoning({
    l1Input,
    classification,
    clueFits: generatedFits.clueFits.map((fit, index) => {
      if (index === 0) {
        return {
          ...fit,
          evidenceRefs: [],
        };
      }

      return fit;
    }),
  });
  assert.equal(missingEvidence.ok, false, "missing evidence refs should not generate reasoning");
  if (missingEvidence.ok) {
    throw new Error("expected missing-evidence reasoning generation to fail");
  }
  assert.ok(
    missingEvidence.issues.some((issue) => issue.issueCode === "MISSING_REASONING_EVIDENCE_REF"),
    "missing-evidence reasoning should report missing evidence refs",
  );
}

function assertFalseStartGenerator() {
  const l1Input = makeSlotContractL1Input();
  const generated = generateFullAnalysisFalseStart();

  assert.deepEqual(
    generated.falseStart,
    { status: "omitted" },
    "false-start generator should omit unsupported false starts instead of inventing one",
  );
  assert.deepEqual(
    generated.reasonCodes,
    ["NO_SUPPORTED_FALSE_START_EVIDENCE"],
    "false-start generator should explain why the slot was omitted",
  );

  const generatedSlotPlan: FullAnalysisSlotPlanV0 = {
    ...makeValidSlotPlan(),
    falseStart: generated.falseStart,
  };
  assert.deepEqual(
    validateFullAnalysisSlotPlan({ l1Input, slotPlan: generatedSlotPlan }),
    [],
    "omitted false-start output should satisfy the full-analysis slot contract",
  );
}

function assertFaqGenerator(dictionaries: ContentKitchenDictionaries) {
  const l1Input = makeSlotContractL1Input();
  const classification = classifyFullAnalysisPuzzleType({
    l1Input,
    dictionaries,
  });
  const generatedFits = generateFullAnalysisClueFits({
    l1Input,
    classification,
    dictionaries,
    evidenceIdPrefix: "slot",
  });
  assert.equal(generatedFits.ok, true, "FAQ generator setup should produce clue fits");
  if (!generatedFits.ok) {
    throw new Error("expected clue-fit generation to pass before FAQ generation");
  }

  const generatedFaq = generateFullAnalysisFaqItems({
    l1Input,
    classification,
    clueFits: generatedFits.clueFits,
  });
  assert.equal(generatedFaq.ok, true, "FAQ generator should produce FAQ items for complete clue fits");
  if (!generatedFaq.ok) {
    throw new Error("expected FAQ generation to pass");
  }
  assert.equal(generatedFaq.faqItems.length, 3, "FAQ generator should produce three stable FAQ items");
  assert.ok(
    generatedFaq.faqItems.every((faqItem) => faqItem.question.trim() && faqItem.answer.includes("Types of guitar")),
    "generated FAQ items should have specific question and answer text",
  );
  assert.ok(
    generatedFaq.faqItems.every((faqItem) => Array.isArray(faqItem.evidenceRefs) && faqItem.evidenceRefs.length > 0),
    "generated FAQ items should carry evidence refs",
  );

  const generatedSlotPlan: FullAnalysisSlotPlanV0 = {
    ...makeValidSlotPlan(),
    clueFits: generatedFits.clueFits,
    faqItems: generatedFaq.faqItems,
  };
  assert.deepEqual(
    validateFullAnalysisSlotPlan({ l1Input, slotPlan: generatedSlotPlan }),
    [],
    "generated FAQ items should satisfy the full-analysis slot contract",
  );

  const unsupported = generateFullAnalysisFaqItems({
    l1Input,
    classification: {
      ...classification,
      puzzleType: "unknown",
      answerCategory: undefined,
    },
    clueFits: generatedFits.clueFits,
  });
  assert.equal(unsupported.ok, false, "unknown puzzle type should not generate FAQ items");
  if (unsupported.ok) {
    throw new Error("expected unsupported FAQ generation to fail");
  }
  assert.deepEqual(
    unsupported.issues.map((issue) => issue.issueCode),
    ["UNSUPPORTED_FAQ_PUZZLE_TYPE"],
    "unsupported FAQ generation should return a clear issue code",
  );

  const incomplete = generateFullAnalysisFaqItems({
    l1Input,
    classification,
    clueFits: generatedFits.clueFits.slice(0, 4),
  });
  assert.equal(incomplete.ok, false, "incomplete clue fits should not generate FAQ items");
  if (incomplete.ok) {
    throw new Error("expected incomplete FAQ generation to fail");
  }
  assert.ok(
    incomplete.issues.some((issue) => issue.issueCode === "INCOMPLETE_FAQ_CLUE_FIT_COVERAGE"),
    "incomplete FAQ generation should report incomplete clue-fit coverage",
  );

  const missingEvidence = generateFullAnalysisFaqItems({
    l1Input,
    classification,
    clueFits: generatedFits.clueFits.map((fit, index) => {
      if (index === 0) {
        return {
          ...fit,
          evidenceRefs: [],
        };
      }

      return fit;
    }),
  });
  assert.equal(missingEvidence.ok, false, "missing evidence refs should not generate FAQ items");
  if (missingEvidence.ok) {
    throw new Error("expected missing-evidence FAQ generation to fail");
  }
  assert.ok(
    missingEvidence.issues.some((issue) => issue.issueCode === "MISSING_FAQ_EVIDENCE_REF"),
    "missing-evidence FAQ generation should report missing evidence refs",
  );
}

function assertDeterministicAssembler(dictionaries: ContentKitchenDictionaries) {
  const l1Input = makeSlotContractL1Input();
  const classification = classifyFullAnalysisPuzzleType({
    l1Input,
    dictionaries,
  });
  const generatedFits = generateFullAnalysisClueFits({
    l1Input,
    classification,
    dictionaries,
    evidenceIdPrefix: "slot",
  });
  assert.equal(generatedFits.ok, true, "assembler setup should produce clue fits");
  if (!generatedFits.ok) {
    throw new Error("expected clue-fit generation to pass before assembly");
  }

  const generatedReasoning = generateFullAnalysisReasoning({
    l1Input,
    classification,
    clueFits: generatedFits.clueFits,
  });
  assert.equal(generatedReasoning.ok, true, "assembler setup should produce reasoning");
  if (!generatedReasoning.ok) {
    throw new Error("expected reasoning generation to pass before assembly");
  }

  const generatedFalseStart = generateFullAnalysisFalseStart();
  const generatedFaq = generateFullAnalysisFaqItems({
    l1Input,
    classification,
    clueFits: generatedFits.clueFits,
  });
  assert.equal(generatedFaq.ok, true, "assembler setup should produce FAQ items");
  if (!generatedFaq.ok) {
    throw new Error("expected FAQ generation to pass before assembly");
  }

  const assembled = assembleFullAnalysisSlotPlan({
    l1Input,
    classification,
    clueFits: generatedFits.clueFits,
    reasoning: generatedReasoning.reasoning,
    falseStart: generatedFalseStart.falseStart,
    faqItems: generatedFaq.faqItems,
  });
  assert.equal(assembled.ok, true, "assembler should produce a valid full-analysis slot plan");
  if (!assembled.ok) {
    throw new Error("expected assembly to pass");
  }
  assert.equal(assembled.slotPlan.slotVersion, "full-analysis-slot-plan-v0", "assembler should set slot plan version");
  assert.equal(assembled.slotPlan.puzzleType, "category_membership", "assembler should preserve puzzle type");
  assert.equal(assembled.slotPlan.answerCategory, "Types of guitar", "assembler should preserve answer category");
  assert.equal(assembled.slotPlan.clueFits.length, 5, "assembler should preserve five clue fits");
  assert.equal(assembled.slotPlan.faqItems.length, 3, "assembler should preserve generated FAQ items");
  assert.deepEqual(
    validateFullAnalysisSlotPlan({ l1Input, slotPlan: assembled.slotPlan }),
    [],
    "assembled slot plan should satisfy the full-analysis slot contract",
  );

  const missingCategory = assembleFullAnalysisSlotPlan({
    l1Input,
    classification: {
      ...classification,
      answerCategory: undefined,
    },
    clueFits: generatedFits.clueFits,
    reasoning: generatedReasoning.reasoning,
    falseStart: generatedFalseStart.falseStart,
    faqItems: generatedFaq.faqItems,
  });
  assert.equal(missingCategory.ok, false, "assembler should fail without answer category");
  if (missingCategory.ok) {
    throw new Error("expected missing-category assembly to fail");
  }
  assert.ok(
    missingCategory.issues.some((issue) => issue.issueCode === "MISSING_ASSEMBLY_ANSWER_CATEGORY"),
    "missing-category assembly should return a clear issue code",
  );

  const invalidPlan = assembleFullAnalysisSlotPlan({
    l1Input,
    classification,
    clueFits: generatedFits.clueFits.slice(0, 4),
    reasoning: generatedReasoning.reasoning,
    falseStart: generatedFalseStart.falseStart,
    faqItems: generatedFaq.faqItems,
  });
  assert.equal(invalidPlan.ok, false, "assembler should fail when upstream slots break the slot contract");
  if (invalidPlan.ok) {
    throw new Error("expected invalid assembly to fail");
  }
  assert.ok(
    invalidPlan.issues.some((issue) => issue.issueCode === "INVALID_ASSEMBLED_SLOT_PLAN"),
    "invalid assembly should return a clear assembly issue code",
  );
  assert.ok(
    invalidPlan.slotIssues.some((issue) => issue.issueCode === "MISSING_SLOT_CLUE_FIT"),
    "invalid assembly should return slot contract issues for debugging",
  );
}

function assertLocalRepairLoop(dictionaries: ContentKitchenDictionaries) {
  const l1Input = makeSlotContractL1Input();
  const classification = classifyFullAnalysisPuzzleType({
    l1Input,
    dictionaries,
  });
  const generatedFits = generateFullAnalysisClueFits({
    l1Input,
    classification,
    dictionaries,
    evidenceIdPrefix: "slot",
  });
  assert.equal(generatedFits.ok, true, "repair loop setup should produce clue fits");
  if (!generatedFits.ok) {
    throw new Error("expected clue-fit generation to pass before repair loop checks");
  }

  const generatedReasoning = generateFullAnalysisReasoning({
    l1Input,
    classification,
    clueFits: generatedFits.clueFits,
  });
  assert.equal(generatedReasoning.ok, true, "repair loop setup should produce reasoning");
  if (!generatedReasoning.ok) {
    throw new Error("expected reasoning generation to pass before repair loop checks");
  }

  const generatedFalseStart = generateFullAnalysisFalseStart();
  const generatedFaq = generateFullAnalysisFaqItems({
    l1Input,
    classification,
    clueFits: generatedFits.clueFits,
  });
  assert.equal(generatedFaq.ok, true, "repair loop setup should produce FAQ items");
  if (!generatedFaq.ok) {
    throw new Error("expected FAQ generation to pass before repair loop checks");
  }

  const invalidPlan = assembleFullAnalysisSlotPlan({
    l1Input,
    classification,
    clueFits: generatedFits.clueFits.slice(0, 4),
    reasoning: generatedReasoning.reasoning,
    falseStart: generatedFalseStart.falseStart,
    faqItems: generatedFaq.faqItems,
  });
  assert.equal(invalidPlan.ok, false, "repair loop fixture should start from failed assembly");
  if (invalidPlan.ok) {
    throw new Error("expected invalid assembly to fail before repair loop checks");
  }

  const plan = buildFullAnalysisRepairPlan({
    issues: [...invalidPlan.issues, ...invalidPlan.slotIssues],
  });
  assert.equal(plan.canAutoRepair, true, "repair loop should auto-repair local slot omissions");
  assert.ok(
    plan.actions.some((action) => {
      return action.actionCode === "regenerate_clue_fits" && action.issueCodes.includes("MISSING_SLOT_CLUE_FIT");
    }),
    "repair loop should ask for clue-fit regeneration when clue rows are missing",
  );
  assert.ok(
    plan.actions.some((action) => {
      return action.actionCode === "rerun_assembler" && action.issueCodes.includes("INVALID_ASSEMBLED_SLOT_PLAN");
    }),
    "repair loop should ask for assembler rerun after upstream fixes",
  );

  const dictionaryCoveragePlan = buildFullAnalysisRepairPlan({
    issues: [
      {
        issueCode: "MISSING_REVIEWED_CATEGORY_MEMBER",
        fieldPath: "l1Input.clues[4]",
        suggestedAction: "Add reviewed dictionary coverage.",
      },
      {
        issueCode: "INCOMPLETE_CLUE_FIT_COVERAGE",
        fieldPath: "clueFits",
        suggestedAction: "Regenerate clue fits after coverage is complete.",
      },
    ],
  });
  assert.equal(
    dictionaryCoveragePlan.canAutoRepair,
    false,
    "repair loop should not auto-repair missing reviewed dictionary facts",
  );
  assert.ok(
    dictionaryCoveragePlan.actions.some((action) => action.actionCode === "repair_dictionary_coverage"),
    "repair loop should route missing dictionary facts to dictionary repair",
  );
  assert.ok(
    dictionaryCoveragePlan.actions.some((action) => action.actionCode === "regenerate_clue_fits"),
    "repair loop should still request clue-fit regeneration after dictionary repair",
  );

  const deduped = buildFullAnalysisRepairPlan({
    issues: [
      { issueCode: "MISSING_SLOT_CLUE_FIT", fieldPath: "slotPlan.clueFits" },
      { issueCode: "MISSING_SLOT_EVIDENCE_REF", fieldPath: "slotPlan.clueFits[0].evidenceRefs" },
      { issueCode: "INCOMPLETE_REASONING_CLUE_FIT_COVERAGE", fieldPath: "clueFits" },
    ],
  });
  assert.equal(
    deduped.actions.filter((action) => action.actionCode === "regenerate_clue_fits").length,
    1,
    "repair loop should dedupe repeated clue-fit repair actions",
  );
  assert.deepEqual(
    deduped.actions.find((action) => action.actionCode === "regenerate_clue_fits")?.issueCodes.sort(),
    ["INCOMPLETE_REASONING_CLUE_FIT_COVERAGE", "MISSING_SLOT_CLUE_FIT", "MISSING_SLOT_EVIDENCE_REF"].sort(),
    "deduped repair action should keep all source issue codes",
  );

  const unsupportedTypePlan = buildFullAnalysisRepairPlan({
    issues: [
      { issueCode: "UNSUPPORTED_PUZZLE_TYPE", fieldPath: "classification.puzzleType" },
      { issueCode: "UNSUPPORTED_FAQ_PUZZLE_TYPE", fieldPath: "classification.puzzleType" },
    ],
  });
  assert.equal(
    unsupportedTypePlan.canAutoRepair,
    false,
    "repair loop should not auto-repair unsupported puzzle types",
  );
  assert.deepEqual(
    unsupportedTypePlan.actions.find((action) => action.actionCode === "rerun_puzzle_type_classifier")?.issueCodes.sort(),
    ["UNSUPPORTED_FAQ_PUZZLE_TYPE", "UNSUPPORTED_PUZZLE_TYPE"].sort(),
    "unsupported type repair should dedupe classification reruns",
  );

  const unknownIssuePlan = buildFullAnalysisRepairPlan({
    issues: [
      { issueCode: "SOME_FUTURE_ISSUE", fieldPath: "l1Input.answer", suggestedAction: "Future issue." },
    ],
  });
  assert.equal(unknownIssuePlan.canAutoRepair, false, "repair loop should not auto-repair unknown future issues");
  assert.equal(
    unknownIssuePlan.actions[0]?.target,
    "slotPlan",
    "unknown issue fallback should not suggest changing L1 answer or clues",
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
  assertFullAnalysisSlotContract();
  assertIssueRegistryIsStable();
  assertPr6P0Coverage(fixtures);
  assertPr7Coverage(fixtures);
  await assertExamplesAreValidJson();
  const dictionaries = await assertDictionariesAreReadable();
  assertPuzzleTypeClassifier(dictionaries);
  assertClueFitGenerator(dictionaries);
  assertReasoningPatternGenerator(dictionaries);
  assertFalseStartGenerator();
  assertFaqGenerator(dictionaries);
  assertDeterministicAssembler(dictionaries);
  assertLocalRepairLoop(dictionaries);
  console.log(`content-kitchen contract fixtures passed (${fileNames.length} fixtures)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
