import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_ANSWER_FIRST_SLA_CONFIG,
  evaluateAnswerFirstSla,
} from "../lib/puzzles/content-kitchen/answer-first-sla";
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
import {
  advanceAnswerFirstEnrichmentJobState,
  canApplyEnrichmentJobResult,
  canClaimAnswerFirstEnrichmentJob,
  claimAnswerFirstEnrichmentJob,
  completeAnswerFirstEnrichmentJob,
  createAnswerFirstEnrichmentJob,
  failAnswerFirstEnrichmentJob,
  findActiveEnrichmentJobForTarget,
  getEnrichmentQueueSkipReason,
  isActiveEnrichmentJob,
  isEnrichmentJobLockExpired,
  runAnswerFirstEnrichmentWorkerTick,
  scanAnswerFirstEnrichmentQueue,
} from "../lib/puzzles/content-kitchen/enrichment-job";
import {
  createInMemoryAnswerFirstEnrichmentJobStore,
  runAnswerFirstEnrichmentWorkerTickFromStore,
} from "../lib/puzzles/content-kitchen/enrichment-job-store";
import { generateFullAnalysisClueFits } from "../lib/puzzles/content-kitchen/clue-fit-generator";
import { generateFullAnalysisFaqItems } from "../lib/puzzles/content-kitchen/faq-generator";
import { generateFullAnalysisFalseStart } from "../lib/puzzles/content-kitchen/false-start-generator";
import { assembleFullAnalysisSlotPlan } from "../lib/puzzles/content-kitchen/full-analysis-assembler";
import { generateFullAnalysisLocalPipeline } from "../lib/puzzles/content-kitchen/full-analysis-local-pipeline";
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
import { ENRICHMENT_WORKER_FILE_STORE_OUTPUT_VERSION } from "./content-kitchen-enrichment-file-store";
import { ENRICHMENT_WORKER_ACTION_DRAFTS_VERSION } from "./content-kitchen-enrichment-action-drafts";
import { ENRICHMENT_WORKER_HEALTH_REPORT_VERSION } from "./content-kitchen-enrichment-health-report";
import { ENRICHMENT_WORKER_RUN_SUMMARY_VERSION } from "./content-kitchen-enrichment-run-summary";
import {
  ENRICHMENT_WORKER_DRY_RUN_RESULT_VERSION,
  ENRICHMENT_WORKER_RUN_MANIFEST_VERSION,
  parseAnswerFirstEnrichmentWorkerDryRunInput,
  runCli as runAnswerFirstEnrichmentWorkerDryRunCli,
  runAnswerFirstEnrichmentWorkerJsonDryRun,
  runAnswerFirstEnrichmentWorkerJsonDryRunToFile,
  type AnswerFirstEnrichmentWorkerDryRunInput,
} from "./run-content-kitchen-enrichment-worker-dry-run";
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
const PACKAGE_JSON_PATH = resolve(ROOT, "package.json");
const PR9_ENRICHMENT_DRY_RUN_USAGE_DOC_PATH = resolve(
  ROOT,
  "docs",
  "pinpoint-content-kitchen-pr9-enrichment-dry-run-usage-2026-05-24.md",
);

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

function assertLocalPipelineSmoke(dictionaries: ContentKitchenDictionaries) {
  const l1Input = makeSlotContractL1Input();
  const generated = generateFullAnalysisLocalPipeline({
    l1Input,
    dictionaries,
    evidenceIdPrefix: "pipeline",
  });

  assert.equal(generated.ok, true, "local pipeline should produce a full-analysis slot plan");
  if (!generated.ok) {
    throw new Error("expected local pipeline to pass");
  }
  assert.equal(generated.stage, "complete", "local pipeline should report complete stage on success");
  assert.equal(generated.classification.puzzleType, "category_membership", "local pipeline should classify the puzzle");
  assert.equal(generated.clueFitResult.clueFits.length, 5, "local pipeline should produce five clue fits");
  assert.equal(generated.clueFitResult.evidenceRecords.length, 5, "local pipeline should produce five evidence records");
  assert.equal(generated.reasoningResult.reasoning.pattern, "cumulative_confirmation", "local pipeline should produce reasoning");
  assert.equal(generated.falseStartResult.falseStart.status, "omitted", "local pipeline should omit unsupported false starts");
  assert.equal(generated.faqResult.faqItems.length, 3, "local pipeline should produce stable FAQ items");
  assert.deepEqual(
    validateFullAnalysisSlotPlan({ l1Input, slotPlan: generated.assemblyResult.slotPlan }),
    [],
    "local pipeline output should satisfy the full-analysis slot contract",
  );
  assert.deepEqual(generated.repairPlan.actions, [], "successful local pipeline should not request repairs");

  const missingDictionaries = generateFullAnalysisLocalPipeline({
    l1Input,
  });
  assert.equal(missingDictionaries.ok, false, "local pipeline should fail clearly without dictionaries");
  if (missingDictionaries.ok) {
    throw new Error("expected missing-dictionary local pipeline to fail");
  }
  assert.equal(missingDictionaries.stage, "clue_fits", "missing dictionaries should stop before clue-fit generation");
  assert.deepEqual(
    missingDictionaries.issues.map((issue) => issue.issueCode),
    ["MISSING_REVIEWED_DICTIONARIES"],
    "missing dictionaries should return a direct issue code",
  );
  assert.equal(
    missingDictionaries.repairPlan.actions[0]?.actionCode,
    "load_reviewed_dictionaries",
    "missing dictionaries should route to dictionary loading",
  );

  const unsupported = generateFullAnalysisLocalPipeline({
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
  assert.equal(unsupported.ok, false, "local pipeline should fail unsupported puzzle types");
  if (unsupported.ok) {
    throw new Error("expected unsupported local pipeline to fail");
  }
  assert.equal(unsupported.stage, "clue_fits", "unsupported puzzle type should stop at clue fits");
  assert.ok(
    unsupported.issues.some((issue) => issue.issueCode === "UNSUPPORTED_PUZZLE_TYPE"),
    "unsupported puzzle type should report a clear issue",
  );
  assert.equal(
    unsupported.repairPlan.canAutoRepair,
    false,
    "unsupported puzzle type should not be marked auto-repairable",
  );
}

function assertAnswerFirstSlaClock() {
  const publishedAt = "2026-05-23T08:00:00.000Z";
  const baseInput = {
    contentMode: "answer-first" as const,
    answerFirstPublishedAt: publishedAt,
  };

  assert.equal(
    DEFAULT_ANSWER_FIRST_SLA_CONFIG.targetFullAnalysisMinutes,
    30,
    "answer-first SLA should target full-analysis within 30 minutes",
  );

  const withinSla = evaluateAnswerFirstSla({
    ...baseInput,
    now: "2026-05-23T08:29:00.000Z",
  });
  assert.equal(withinSla.status, "within_sla", "fresh answer-first pages should stay within SLA");
  assert.equal(withinSla.notificationLevel, "none", "fresh answer-first pages should not alert");
  assert.deepEqual(withinSla.issueCodes, [], "fresh answer-first pages should not have SLA issue codes");
  assert.equal(withinSla.policies.indexPolicy, "noindex", "v0 answer-first should remain noindex");
  assert.equal(withinSla.policies.sitemapPolicy, "exclude", "v0 answer-first should stay out of sitemap");
  assert.equal(withinSla.policies.requiredAction, "enrich", "fresh answer-first pages should still target enrichment");

  const alertDue = evaluateAnswerFirstSla({
    ...baseInput,
    now: "2026-05-23T08:31:00.000Z",
  });
  assert.equal(alertDue.status, "normal_alert_due", "answer-first pages past 30 minutes should alert");
  assert.equal(alertDue.notificationLevel, "normal", "30-minute SLA misses should use normal alert level");
  assert.deepEqual(alertDue.issueCodes, ["ANSWER_FIRST_OVER_SLA"], "30-minute SLA misses should keep one issue code");

  const reviewRequired = evaluateAnswerFirstSla({
    ...baseInput,
    now: "2026-05-23T09:01:00.000Z",
  });
  assert.equal(reviewRequired.status, "review_required", "answer-first pages past 60 minutes should enter review");
  assert.equal(reviewRequired.policies.indexPolicy, "review_required", "review-stage answer-first should require review");
  assert.equal(
    reviewRequired.policies.sitemapPolicy,
    "remove_on_next_build",
    "review-stage answer-first should be removed from sitemap on the next build",
  );
  assert.equal(reviewRequired.policies.requiredAction, "review", "review-stage answer-first should require review");
  assert.deepEqual(
    reviewRequired.issueCodes,
    ["ANSWER_FIRST_OVER_SLA", "ANSWER_FIRST_REVIEW_REQUIRED"],
    "review-stage answer-first should report over-SLA and review issue codes",
  );

  const indexedStale = evaluateAnswerFirstSla({
    ...baseInput,
    now: "2026-05-23T10:01:00.000Z",
    isIndexedAnswerFirst: true,
  });
  assert.equal(
    indexedStale.status,
    "thin_page_noindex_required",
    "future indexed answer-first pages older than two hours should fall back to noindex",
  );
  assert.equal(indexedStale.policies.requiredAction, "degrade", "stale indexed answer-first pages should degrade");
  assert.deepEqual(
    indexedStale.policies.degradationActions,
    ["apply_noindex", "remove_from_sitemap", "hide_from_recent"],
    "stale indexed answer-first pages should reduce SEO and recent-link exposure",
  );
  assert.ok(
    indexedStale.issueCodes.includes("INDEXED_ANSWER_FIRST_STALE"),
    "stale indexed answer-first pages should report the indexed stale issue",
  );

  const highPriority = evaluateAnswerFirstSla({
    ...baseInput,
    now: "2026-05-23T14:01:00.000Z",
  });
  assert.equal(
    highPriority.status,
    "high_priority_alert_due",
    "unresolved answer-first pages past six hours should need high-priority alert",
  );
  assert.equal(highPriority.notificationLevel, "high_priority", "six-hour unresolved pages should use high priority");
  assert.ok(
    highPriority.issueCodes.includes("ANSWER_FIRST_HIGH_PRIORITY_ALERT"),
    "six-hour unresolved pages should report the high-priority issue",
  );

  const upgradeReady = evaluateAnswerFirstSla({
    ...baseInput,
    now: "2026-05-23T08:10:00.000Z",
    hasSafeFullAnalysisUpgrade: true,
  });
  assert.equal(upgradeReady.status, "upgrade_ready", "safe full-analysis candidates should be upgraded immediately");
  assert.equal(upgradeReady.policies.requiredAction, "upgrade", "safe full-analysis candidates should request upgrade");
  assert.deepEqual(upgradeReady.issueCodes, [], "safe full-analysis candidates should not carry SLA issue codes");

  const notApplicable = evaluateAnswerFirstSla({
    contentMode: "full-analysis",
    answerFirstPublishedAt: publishedAt,
    now: "2026-05-23T14:01:00.000Z",
  });
  assert.equal(notApplicable.status, "not_applicable", "full-analysis pages should not use answer-first SLA handling");
  assert.equal(notApplicable.policies.requiredAction, "keep_current", "full-analysis pages should keep current content");
}

function assertAnswerFirstEnrichmentJobContract() {
  const job = createAnswerFirstEnrichmentJob({
    puzzleId: "pinpoint-900-2026-05-23",
    sourceRevisionId: "rev-answer-first-900",
    targetRevision: "rev-full-analysis-900",
    inputSnapshotHash: "sha256:l1-900",
    answerFirstPublishedAt: "2026-05-23T08:00:00.000Z",
    now: "2026-05-23T08:05:00.000Z",
  });

  assert.equal(job.jobVersion, "answer-first-enrichment-job-v0", "enrichment job version should be stable");
  assert.equal(
    job.idempotencyKey,
    "content-kitchen:answer-first-enrichment:pinpoint-900-2026-05-23:rev-full-analysis-900",
    "enrichment job idempotency key should be stable for puzzleId + targetRevision",
  );
  assert.equal(job.state, "queued", "new enrichment jobs should start queued");
  assert.equal(job.nextAttemptAt, "2026-05-23T08:05:00.000Z", "new enrichment jobs should be immediately runnable");
  assert.equal(job.attemptCount, 0, "new enrichment jobs should start with zero attempts");
  assert.equal(job.maxAttempts, 3, "new enrichment jobs should default to three attempts");
  assert.equal(job.backoffStrategy, "exponential", "new enrichment jobs should default to exponential backoff");
  assert.equal(job.deadlineAt, "2026-05-23T08:30:00.000Z", "deadline should match target full-analysis time");
  assert.equal(job.targetFullAnalysisAt, "2026-05-23T08:30:00.000Z", "target full-analysis time should be 30 minutes");
  assert.equal(job.firstAlertAt, "2026-05-23T08:30:00.000Z", "first alert should be 30 minutes");
  assert.equal(job.reviewRequiredAt, "2026-05-23T09:00:00.000Z", "review should be required after 60 minutes");
  assert.equal(job.thinPageNoindexAt, "2026-05-23T10:00:00.000Z", "thin indexed fallback should be after 2 hours");
  assert.equal(job.highPriorityAlertAt, "2026-05-23T14:00:00.000Z", "high priority alert should be after 6 hours");
  assert.deepEqual(job.failureReasonCodes, [], "new enrichment jobs should not start with failure reasons");

  assert.equal(isActiveEnrichmentJob(job), true, "queued enrichment jobs should count as active");
  assert.equal(
    isActiveEnrichmentJob({ ...job, state: "completed" }),
    false,
    "completed enrichment jobs should not count as active",
  );
  assert.equal(
    Boolean(findActiveEnrichmentJobForTarget([{ ...job, state: "completed" }, job], job)),
    true,
    "active job lookup should find queued jobs for the same puzzleId + targetRevision",
  );
  assert.equal(
    findActiveEnrichmentJobForTarget([{ ...job, state: "completed" }], job),
    undefined,
    "active job lookup should ignore completed jobs",
  );

  const runningJob = { ...job, state: "running" as const };
  assert.equal(
    canApplyEnrichmentJobResult({
      job: runningJob,
      currentPublishedRevisionId: "rev-answer-first-900",
      currentInputSnapshotHash: "sha256:l1-900",
      resultTargetRevision: "rev-full-analysis-900",
    }),
    true,
    "running jobs should apply when source revision, input hash, and target revision still match",
  );
  assert.equal(
    canApplyEnrichmentJobResult({
      job: runningJob,
      currentPublishedRevisionId: "rev-newer-answer-first-900",
      currentInputSnapshotHash: "sha256:l1-900",
      resultTargetRevision: "rev-full-analysis-900",
    }),
    false,
    "stale jobs should not overwrite a newer published revision",
  );
  assert.equal(
    canApplyEnrichmentJobResult({
      job: runningJob,
      currentPublishedRevisionId: "rev-answer-first-900",
      currentInputSnapshotHash: "sha256:new-l1-900",
      resultTargetRevision: "rev-full-analysis-900",
    }),
    false,
    "stale jobs should not overwrite content generated from newer L1 input",
  );
  assert.equal(
    canApplyEnrichmentJobResult({
      job: runningJob,
      currentPublishedRevisionId: "rev-answer-first-900",
      currentInputSnapshotHash: "sha256:l1-900",
      resultTargetRevision: "rev-other-full-analysis-900",
    }),
    false,
    "stale jobs should not apply a result for a different target revision",
  );
}

function assertAnswerFirstEnrichmentJobRetryAndLock() {
  const job = createAnswerFirstEnrichmentJob({
    puzzleId: "pinpoint-901-2026-05-23",
    sourceRevisionId: "rev-answer-first-901",
    targetRevision: "rev-full-analysis-901",
    inputSnapshotHash: "sha256:l1-901",
    answerFirstPublishedAt: "2026-05-23T08:00:00.000Z",
    now: "2026-05-23T08:05:00.000Z",
    maxAttempts: 2,
  });

  assert.equal(
    canClaimAnswerFirstEnrichmentJob(job, "2026-05-23T08:04:59.000Z"),
    false,
    "jobs should not be claimable before nextAttemptAt",
  );
  assert.equal(
    canClaimAnswerFirstEnrichmentJob(job, "2026-05-23T08:05:00.000Z"),
    true,
    "queued jobs should be claimable at nextAttemptAt",
  );

  const firstClaim = claimAnswerFirstEnrichmentJob({
    job,
    workerId: "worker-a",
    now: "2026-05-23T08:05:00.000Z",
  });
  assert.ok(firstClaim, "claiming a due queued job should return a running job");
  assert.equal(firstClaim.state, "running", "claimed jobs should move to running");
  assert.equal(firstClaim.attemptCount, 1, "claiming a job should increment attempt count");
  assert.equal(firstClaim.lockedBy, "worker-a", "claimed jobs should store the worker id");
  assert.equal(firstClaim.lockedUntil, "2026-05-23T08:20:00.000Z", "claimed jobs should default to a 15 minute lock");
  assert.equal(
    isEnrichmentJobLockExpired(firstClaim, "2026-05-23T08:19:59.000Z"),
    false,
    "fresh locks should not be expired",
  );
  assert.equal(
    isEnrichmentJobLockExpired(firstClaim, "2026-05-23T08:20:00.000Z"),
    true,
    "locks should expire at lockedUntil",
  );
  assert.equal(
    claimAnswerFirstEnrichmentJob({
      job: firstClaim,
      workerId: "worker-b",
      now: "2026-05-23T08:10:00.000Z",
    }),
    null,
    "running jobs with a live lock should not be claimed by another worker",
  );

  const failedOnce = failAnswerFirstEnrichmentJob({
    job: firstClaim,
    now: "2026-05-23T08:06:00.000Z",
    failureReasonCodes: ["ANSWER_FIRST_OVER_SLA"],
  });
  assert.equal(failedOnce.state, "queued", "failed jobs with attempts remaining should return to queued");
  assert.equal(failedOnce.nextAttemptAt, "2026-05-23T08:11:00.000Z", "first exponential retry should wait 5 minutes");
  assert.equal(failedOnce.lockedBy, undefined, "failed jobs should clear lockedBy");
  assert.equal(failedOnce.lockedUntil, undefined, "failed jobs should clear lockedUntil");
  assert.deepEqual(failedOnce.failureReasonCodes, ["ANSWER_FIRST_OVER_SLA"], "failed jobs should keep reason codes");

  const secondClaim = claimAnswerFirstEnrichmentJob({
    job: failedOnce,
    workerId: "worker-b",
    now: "2026-05-23T08:11:00.000Z",
  });
  assert.ok(secondClaim, "retryable jobs should be claimable at their next attempt time");
  assert.equal(secondClaim.attemptCount, 2, "second claim should increment attempt count again");

  const deadLetter = failAnswerFirstEnrichmentJob({
    job: secondClaim,
    now: "2026-05-23T08:12:00.000Z",
    failureReasonCodes: ["ANSWER_FIRST_REVIEW_REQUIRED", "ANSWER_FIRST_OVER_SLA"],
  });
  assert.equal(deadLetter.state, "dead_letter", "jobs should enter dead letter after max attempts");
  assert.equal(deadLetter.deadLetterAt, "2026-05-23T08:12:00.000Z", "dead-letter jobs should store deadLetterAt");
  assert.equal(deadLetter.nextAttemptAt, "2026-05-23T08:12:00.000Z", "dead-letter jobs should not schedule another retry");
  assert.deepEqual(
    deadLetter.failureReasonCodes,
    ["ANSWER_FIRST_OVER_SLA", "ANSWER_FIRST_REVIEW_REQUIRED"],
    "dead-letter jobs should dedupe failure reason codes",
  );
  assert.equal(
    canClaimAnswerFirstEnrichmentJob(deadLetter, "2026-05-23T08:13:00.000Z"),
    false,
    "dead-letter jobs should not be claimable",
  );

  const expiredClaim = claimAnswerFirstEnrichmentJob({
    job: {
      ...job,
      state: "running",
      attemptCount: 1,
      lockedBy: "worker-a",
      lockedUntil: "2026-05-23T08:20:00.000Z",
    },
    workerId: "worker-b",
    now: "2026-05-23T08:21:00.000Z",
    lockMinutes: 10,
  });
  assert.ok(expiredClaim, "running jobs with expired locks should be claimable");
  assert.equal(expiredClaim.lockedBy, "worker-b", "expired locks should be replaced by the new worker");
  assert.equal(expiredClaim.lockedUntil, "2026-05-23T08:31:00.000Z", "custom lock minutes should be applied");
  assert.equal(expiredClaim.attemptCount, 2, "expired-lock claims should count as a new attempt");

  const completed = completeAnswerFirstEnrichmentJob({
    job: expiredClaim,
    now: "2026-05-23T08:22:00.000Z",
  });
  assert.equal(completed.state, "completed", "completed jobs should move to completed");
  assert.equal(completed.lockedBy, undefined, "completed jobs should clear lockedBy");
  assert.equal(completed.lockedUntil, undefined, "completed jobs should clear lockedUntil");
  assert.equal(
    canClaimAnswerFirstEnrichmentJob(completed, "2026-05-23T08:23:00.000Z"),
    false,
    "completed jobs should not be claimable",
  );
}

function assertAnswerFirstEnrichmentQueueScan() {
  const dueQueued = createAnswerFirstEnrichmentJob({
    puzzleId: "pinpoint-902-2026-05-23",
    sourceRevisionId: "rev-answer-first-902",
    targetRevision: "rev-full-analysis-902",
    inputSnapshotHash: "sha256:l1-902",
    answerFirstPublishedAt: "2026-05-23T08:00:00.000Z",
    now: "2026-05-23T08:05:00.000Z",
  });
  const futureQueued = {
    ...createAnswerFirstEnrichmentJob({
      puzzleId: "pinpoint-903-2026-05-23",
      sourceRevisionId: "rev-answer-first-903",
      targetRevision: "rev-full-analysis-903",
      inputSnapshotHash: "sha256:l1-903",
      answerFirstPublishedAt: "2026-05-23T08:00:00.000Z",
      now: "2026-05-23T08:05:00.000Z",
    }),
    nextAttemptAt: "2026-05-23T08:30:00.000Z",
  };
  const runningLocked = {
    ...createAnswerFirstEnrichmentJob({
      puzzleId: "pinpoint-904-2026-05-23",
      sourceRevisionId: "rev-answer-first-904",
      targetRevision: "rev-full-analysis-904",
      inputSnapshotHash: "sha256:l1-904",
      answerFirstPublishedAt: "2026-05-23T08:00:00.000Z",
      now: "2026-05-23T08:05:00.000Z",
    }),
    state: "running" as const,
    attemptCount: 1,
    lockedBy: "worker-a",
    lockedUntil: "2026-05-23T08:25:00.000Z",
  };
  const runningExpired = {
    ...runningLocked,
    puzzleId: "pinpoint-905-2026-05-23",
    targetRevision: "rev-full-analysis-905",
    lockedUntil: "2026-05-23T08:09:00.000Z",
  };
  const completed = {
    ...dueQueued,
    puzzleId: "pinpoint-906-2026-05-23",
    targetRevision: "rev-full-analysis-906",
    state: "completed" as const,
  };
  const deadLetter = {
    ...dueQueued,
    puzzleId: "pinpoint-907-2026-05-23",
    targetRevision: "rev-full-analysis-907",
    state: "dead_letter" as const,
  };
  const maxAttemptsReached = {
    ...dueQueued,
    puzzleId: "pinpoint-908-2026-05-23",
    targetRevision: "rev-full-analysis-908",
    attemptCount: 3,
    maxAttempts: 3,
  };

  assert.equal(
    getEnrichmentQueueSkipReason(dueQueued, "2026-05-23T08:10:00.000Z"),
    null,
    "due queued jobs should be runnable",
  );
  assert.equal(
    getEnrichmentQueueSkipReason(futureQueued, "2026-05-23T08:10:00.000Z"),
    "not_due",
    "future queued jobs should be skipped as not due",
  );
  assert.equal(
    getEnrichmentQueueSkipReason(runningLocked, "2026-05-23T08:10:00.000Z"),
    "lock_active",
    "running jobs with a live lock should be skipped",
  );
  assert.equal(
    getEnrichmentQueueSkipReason(completed, "2026-05-23T08:10:00.000Z"),
    "terminal_state",
    "completed jobs should be skipped as terminal",
  );
  assert.equal(
    getEnrichmentQueueSkipReason(deadLetter, "2026-05-23T08:10:00.000Z"),
    "terminal_state",
    "dead-letter jobs should be skipped as terminal",
  );
  assert.equal(
    getEnrichmentQueueSkipReason(maxAttemptsReached, "2026-05-23T08:10:00.000Z"),
    "max_attempts_reached",
    "jobs at max attempts should be skipped",
  );

  const scan = scanAnswerFirstEnrichmentQueue({
    jobs: [
      dueQueued,
      futureQueued,
      runningLocked,
      runningExpired,
      completed,
      deadLetter,
      maxAttemptsReached,
    ],
    now: "2026-05-23T08:10:00.000Z",
  });
  assert.deepEqual(
    scan.runnableJobs.map((job) => job.puzzleId),
    ["pinpoint-902-2026-05-23", "pinpoint-905-2026-05-23"],
    "queue scan should return due queued jobs and expired-lock running jobs",
  );
  assert.deepEqual(
    scan.skippedJobs.map((entry) => [entry.job.puzzleId, entry.reason]),
    [
      ["pinpoint-903-2026-05-23", "not_due"],
      ["pinpoint-904-2026-05-23", "lock_active"],
      ["pinpoint-906-2026-05-23", "terminal_state"],
      ["pinpoint-907-2026-05-23", "terminal_state"],
      ["pinpoint-908-2026-05-23", "max_attempts_reached"],
    ],
    "queue scan should keep clear skip reasons",
  );

  const limitedScan = scanAnswerFirstEnrichmentQueue({
    jobs: [dueQueued, runningExpired],
    now: "2026-05-23T08:10:00.000Z",
    limit: 1,
  });
  assert.deepEqual(
    limitedScan.runnableJobs.map((job) => job.puzzleId),
    ["pinpoint-902-2026-05-23"],
    "queue scan limit should cap runnable jobs",
  );
  assert.deepEqual(
    limitedScan.skippedJobs.map((entry) => [entry.job.puzzleId, entry.reason]),
    [["pinpoint-905-2026-05-23", "over_limit"]],
    "queue scan should explain jobs skipped only because the batch limit was reached",
  );
}

function assertAnswerFirstEnrichmentStateAdvance() {
  const job = createAnswerFirstEnrichmentJob({
    puzzleId: "pinpoint-909-2026-05-23",
    sourceRevisionId: "rev-answer-first-909",
    targetRevision: "rev-full-analysis-909",
    inputSnapshotHash: "sha256:l1-909",
    answerFirstPublishedAt: "2026-05-23T08:00:00.000Z",
    now: "2026-05-23T08:05:00.000Z",
  });

  const fresh = advanceAnswerFirstEnrichmentJobState({
    job,
    now: "2026-05-23T08:29:00.000Z",
  });
  assert.equal(fresh.transition, "unchanged", "fresh jobs should not advance");
  assert.equal(fresh.job.state, "queued", "fresh jobs should stay queued");
  assert.deepEqual(fresh.issueCodesAdded, [], "fresh jobs should not add issue codes");

  const overSla = advanceAnswerFirstEnrichmentJobState({
    job,
    now: "2026-05-23T08:31:00.000Z",
  });
  assert.equal(overSla.transition, "marked_over_sla", "jobs past 30 minutes should be marked over SLA");
  assert.equal(overSla.job.state, "queued", "over-SLA jobs should keep their current queue state before review time");
  assert.equal(overSla.job.updatedAt, "2026-05-23T08:31:00.000Z", "over-SLA jobs should update updatedAt");
  assert.deepEqual(overSla.issueCodesAdded, ["ANSWER_FIRST_OVER_SLA"], "over-SLA jobs should add one issue code");
  assert.deepEqual(overSla.job.failureReasonCodes, ["ANSWER_FIRST_OVER_SLA"], "over-SLA jobs should keep failure reasons");

  const runningJob = {
    ...job,
    state: "running" as const,
    attemptCount: 1,
    lockedBy: "worker-a",
    lockedUntil: "2026-05-23T09:10:00.000Z",
  };
  const reviewRequired = advanceAnswerFirstEnrichmentJobState({
    job: runningJob,
    now: "2026-05-23T09:01:00.000Z",
  });
  assert.equal(reviewRequired.transition, "review_required", "jobs past 60 minutes should enter review");
  assert.equal(reviewRequired.job.state, "review_required", "review-stage jobs should use review_required state");
  assert.equal(reviewRequired.job.lockedBy, undefined, "review-stage jobs should clear lockedBy");
  assert.equal(reviewRequired.job.lockedUntil, undefined, "review-stage jobs should clear lockedUntil");
  assert.deepEqual(
    reviewRequired.job.failureReasonCodes,
    ["ANSWER_FIRST_OVER_SLA", "ANSWER_FIRST_REVIEW_REQUIRED"],
    "review-stage jobs should keep over-SLA and review reason codes",
  );
  assert.deepEqual(
    reviewRequired.issueCodesAdded,
    ["ANSWER_FIRST_OVER_SLA", "ANSWER_FIRST_REVIEW_REQUIRED"],
    "review-stage jobs should report newly added issue codes",
  );

  const highPriority = advanceAnswerFirstEnrichmentJobState({
    job: reviewRequired.job,
    now: "2026-05-23T14:01:00.000Z",
  });
  assert.equal(highPriority.transition, "dead_letter", "jobs past six hours should enter dead letter");
  assert.equal(highPriority.job.state, "dead_letter", "six-hour unresolved jobs should use dead_letter state");
  assert.equal(highPriority.job.deadLetterAt, "2026-05-23T14:01:00.000Z", "dead-letter jobs should set deadLetterAt");
  assert.deepEqual(
    highPriority.job.failureReasonCodes,
    ["ANSWER_FIRST_OVER_SLA", "ANSWER_FIRST_REVIEW_REQUIRED", "ANSWER_FIRST_HIGH_PRIORITY_ALERT"],
    "dead-letter jobs should keep all SLA reason codes",
  );
  assert.deepEqual(
    highPriority.issueCodesAdded,
    ["ANSWER_FIRST_HIGH_PRIORITY_ALERT"],
    "dead-letter transition should report only newly added issue codes",
  );

  const completed = completeAnswerFirstEnrichmentJob({
    job,
    now: "2026-05-23T08:20:00.000Z",
  });
  const completedAdvance = advanceAnswerFirstEnrichmentJobState({
    job: completed,
    now: "2026-05-23T14:01:00.000Z",
  });
  assert.equal(completedAdvance.transition, "unchanged", "completed jobs should not be advanced by SLA");
  assert.equal(completedAdvance.job.state, "completed", "completed jobs should stay completed");

  const deadLetterAdvance = advanceAnswerFirstEnrichmentJobState({
    job: highPriority.job,
    now: "2026-05-23T15:00:00.000Z",
  });
  assert.equal(deadLetterAdvance.transition, "unchanged", "dead-letter jobs should not be advanced again");
  assert.equal(deadLetterAdvance.job.deadLetterAt, "2026-05-23T14:01:00.000Z", "deadLetterAt should stay stable");
}

function assertAnswerFirstEnrichmentWorkerTick() {
  const dueQueued = createAnswerFirstEnrichmentJob({
    puzzleId: "pinpoint-910-2026-05-23",
    sourceRevisionId: "rev-answer-first-910",
    targetRevision: "rev-full-analysis-910",
    inputSnapshotHash: "sha256:l1-910",
    answerFirstPublishedAt: "2026-05-23T08:45:00.000Z",
    now: "2026-05-23T08:55:00.000Z",
  });
  const futureQueued = {
    ...createAnswerFirstEnrichmentJob({
      puzzleId: "pinpoint-911-2026-05-23",
      sourceRevisionId: "rev-answer-first-911",
      targetRevision: "rev-full-analysis-911",
      inputSnapshotHash: "sha256:l1-911",
      answerFirstPublishedAt: "2026-05-23T08:45:00.000Z",
      now: "2026-05-23T08:55:00.000Z",
    }),
    nextAttemptAt: "2026-05-23T09:30:00.000Z",
  };
  const reviewDue = createAnswerFirstEnrichmentJob({
    puzzleId: "pinpoint-912-2026-05-23",
    sourceRevisionId: "rev-answer-first-912",
    targetRevision: "rev-full-analysis-912",
    inputSnapshotHash: "sha256:l1-912",
    answerFirstPublishedAt: "2026-05-23T08:00:00.000Z",
    now: "2026-05-23T08:05:00.000Z",
  });
  const expiredRunning = {
    ...createAnswerFirstEnrichmentJob({
      puzzleId: "pinpoint-913-2026-05-23",
      sourceRevisionId: "rev-answer-first-913",
      targetRevision: "rev-full-analysis-913",
      inputSnapshotHash: "sha256:l1-913",
      answerFirstPublishedAt: "2026-05-23T08:45:00.000Z",
      now: "2026-05-23T08:55:00.000Z",
    }),
    state: "running" as const,
    attemptCount: 1,
    lockedBy: "worker-old",
    lockedUntil: "2026-05-23T09:00:00.000Z",
  };

  const tick = runAnswerFirstEnrichmentWorkerTick({
    jobs: [dueQueued, futureQueued, reviewDue, expiredRunning],
    now: "2026-05-23T09:01:00.000Z",
    workerId: "worker-tick",
    lockMinutes: 10,
    limit: 2,
  });

  assert.deepEqual(
    tick.claimedJobs.map((job) => job.puzzleId),
    ["pinpoint-910-2026-05-23", "pinpoint-913-2026-05-23"],
    "worker tick should claim due queued jobs and expired-lock running jobs",
  );
  assert.deepEqual(
    tick.claimedJobs.map((job) => [job.state, job.lockedBy, job.lockedUntil]),
    [
      ["running", "worker-tick", "2026-05-23T09:11:00.000Z"],
      ["running", "worker-tick", "2026-05-23T09:11:00.000Z"],
    ],
    "worker tick should lock claimed jobs for the requested worker",
  );
  assert.deepEqual(
    tick.claimedJobs.map((job) => [job.puzzleId, job.attemptCount]),
    [
      ["pinpoint-910-2026-05-23", 1],
      ["pinpoint-913-2026-05-23", 2],
    ],
    "worker tick should increment attempts when claiming jobs",
  );
  assert.deepEqual(
    tick.skippedJobs.map((entry) => [entry.job.puzzleId, entry.reason]),
    [
      ["pinpoint-911-2026-05-23", "not_due"],
      ["pinpoint-912-2026-05-23", "terminal_state"],
    ],
    "worker tick should report skipped jobs after state advancement",
  );
  assert.deepEqual(
    tick.stateAdvancements.map((result) => [result.job.puzzleId, result.transition]),
    [
      ["pinpoint-910-2026-05-23", "unchanged"],
      ["pinpoint-911-2026-05-23", "unchanged"],
      ["pinpoint-912-2026-05-23", "review_required"],
      ["pinpoint-913-2026-05-23", "unchanged"],
    ],
    "worker tick should advance states before scanning the queue",
  );

  const updatedByPuzzleId = new Map(tick.updatedJobs.map((job) => [job.puzzleId, job]));
  assert.equal(
    updatedByPuzzleId.get("pinpoint-912-2026-05-23")?.state,
    "review_required",
    "worker tick should keep review-required advancement in updated jobs",
  );
  assert.equal(
    updatedByPuzzleId.get("pinpoint-912-2026-05-23")?.lockedBy,
    undefined,
    "worker tick should clear locks for review-required jobs",
  );
  assert.equal(
    updatedByPuzzleId.get("pinpoint-910-2026-05-23")?.lockedBy,
    "worker-tick",
    "worker tick should return claimed queued jobs in updated jobs",
  );

  const limitedTick = runAnswerFirstEnrichmentWorkerTick({
    jobs: [dueQueued, expiredRunning],
    now: "2026-05-23T09:01:00.000Z",
    workerId: "worker-tick",
    lockMinutes: 10,
    limit: 1,
  });
  assert.deepEqual(
    limitedTick.claimedJobs.map((job) => job.puzzleId),
    ["pinpoint-910-2026-05-23"],
    "worker tick limit should cap claimed jobs",
  );
  assert.deepEqual(
    limitedTick.skippedJobs.map((entry) => [entry.job.puzzleId, entry.reason]),
    [["pinpoint-913-2026-05-23", "over_limit"]],
    "worker tick should keep over-limit skip reasons from the queue scanner",
  );
}

async function assertAnswerFirstEnrichmentJobStoreAdapter() {
  const dueQueued = createAnswerFirstEnrichmentJob({
    puzzleId: "pinpoint-914-2026-05-23",
    sourceRevisionId: "rev-answer-first-914",
    targetRevision: "rev-full-analysis-914",
    inputSnapshotHash: "sha256:l1-914",
    answerFirstPublishedAt: "2026-05-23T08:45:00.000Z",
    now: "2026-05-23T08:55:00.000Z",
  });
  const reviewDue = createAnswerFirstEnrichmentJob({
    puzzleId: "pinpoint-915-2026-05-23",
    sourceRevisionId: "rev-answer-first-915",
    targetRevision: "rev-full-analysis-915",
    inputSnapshotHash: "sha256:l1-915",
    answerFirstPublishedAt: "2026-05-23T08:00:00.000Z",
    now: "2026-05-23T08:05:00.000Z",
  });
  const store = createInMemoryAnswerFirstEnrichmentJobStore([dueQueued, reviewDue]);

  const loaded = await store.listAnswerFirstEnrichmentJobs();
  loaded[0].state = "dead_letter";
  loaded[0].failureReasonCodes.push("ANSWER_FIRST_HIGH_PRIORITY_ALERT");

  const unchangedSnapshot = store.snapshot();
  assert.equal(
    unchangedSnapshot[0].state,
    "queued",
    "in-memory job store should return cloned jobs from list",
  );
  assert.deepEqual(
    unchangedSnapshot[0].failureReasonCodes,
    [],
    "in-memory job store should protect stored failure reasons from caller mutation",
  );

  const tick = await runAnswerFirstEnrichmentWorkerTickFromStore({
    store,
    now: "2026-05-23T09:01:00.000Z",
    workerId: "worker-store",
    lockMinutes: 12,
  });

  assert.deepEqual(
    tick.claimedJobs.map((job) => job.puzzleId),
    ["pinpoint-914-2026-05-23"],
    "store-backed worker tick should claim due jobs loaded from the store",
  );
  assert.deepEqual(
    tick.skippedJobs.map((entry) => [entry.job.puzzleId, entry.reason]),
    [["pinpoint-915-2026-05-23", "terminal_state"]],
    "store-backed worker tick should skip jobs moved to review during advancement",
  );

  const storedAfterTick = store.snapshot();
  const storedByPuzzleId = new Map(storedAfterTick.map((job) => [job.puzzleId, job]));
  assert.equal(
    storedByPuzzleId.get("pinpoint-914-2026-05-23")?.state,
    "running",
    "store-backed worker tick should write claimed jobs back to the store",
  );
  assert.equal(
    storedByPuzzleId.get("pinpoint-914-2026-05-23")?.lockedBy,
    "worker-store",
    "store-backed worker tick should persist the worker lock",
  );
  assert.equal(
    storedByPuzzleId.get("pinpoint-914-2026-05-23")?.lockedUntil,
    "2026-05-23T09:13:00.000Z",
    "store-backed worker tick should persist the requested lock window",
  );
  assert.equal(
    storedByPuzzleId.get("pinpoint-915-2026-05-23")?.state,
    "review_required",
    "store-backed worker tick should write review-required advancement back to the store",
  );
  assert.deepEqual(
    storedByPuzzleId.get("pinpoint-915-2026-05-23")?.failureReasonCodes,
    ["ANSWER_FIRST_OVER_SLA", "ANSWER_FIRST_REVIEW_REQUIRED"],
    "store-backed worker tick should persist SLA issue codes from state advancement",
  );

  const replacement = completeAnswerFirstEnrichmentJob({
    job: storedByPuzzleId.get("pinpoint-914-2026-05-23")!,
    now: "2026-05-23T09:20:00.000Z",
  });
  await store.upsertAnswerFirstEnrichmentJobs([replacement]);
  assert.deepEqual(
    store.snapshot().map((job) => [job.puzzleId, job.state]),
    [
      ["pinpoint-914-2026-05-23", "completed"],
      ["pinpoint-915-2026-05-23", "review_required"],
    ],
    "in-memory job store should replace jobs by jobId without duplicating them",
  );
}

async function assertAnswerFirstEnrichmentWorkerJsonDryRun() {
  const examplePath = resolve(EXAMPLE_DIR, "enrichment-worker-dry-run.input.json");
  const raw = await readFile(examplePath, "utf8");
  const input = JSON.parse(raw) as AnswerFirstEnrichmentWorkerDryRunInput;
  const result = await runAnswerFirstEnrichmentWorkerJsonDryRun(input);

  assert.equal(
    result.schemaVersion,
    ENRICHMENT_WORKER_DRY_RUN_RESULT_VERSION,
    "worker dry-run result schema version should be stable",
  );
  assert.deepEqual(
    result.summary,
    {
      inputJobs: 3,
      outputJobs: 3,
      claimedJobs: 1,
      skippedJobs: 2,
      stateAdvancements: 1,
    },
    "worker dry-run should summarize claimed, skipped, and advanced jobs",
  );
  assert.equal(
    result.runSummary.schemaVersion,
    ENRICHMENT_WORKER_RUN_SUMMARY_VERSION,
    "worker dry-run should include a stable run summary schema",
  );
  assert.equal(
    result.runSummary.headline,
    "worker-dry-run @ 2026-05-23T09:01:00.000Z; 1 claimed job; 2 skipped jobs; 1 state change; 1 review; 0 dead-letter",
    "worker dry-run should include a short human-readable headline",
  );
  assert.deepEqual(
    result.runSummary.counts,
    {
      inputJobs: 3,
      outputJobs: 3,
      claimedJobs: 1,
      skippedJobs: 2,
      stateChanges: 1,
      reviewRequiredJobs: 1,
      deadLetterJobs: 0,
      overSlaJobs: 1,
      highPriorityJobs: 0,
    },
    "worker dry-run run summary should count important job states",
  );
  assert.deepEqual(
    result.runSummary.bySkipReason,
    {
      not_due: 1,
      terminal_state: 1,
    },
    "worker dry-run run summary should count skip reasons",
  );
  assert.deepEqual(
    result.runSummary.byOutputState,
    {
      queued: 1,
      review_required: 1,
      running: 1,
    },
    "worker dry-run run summary should count output states",
  );
  assert.deepEqual(
    result.runSummary.issueCodesAdded,
    ["ANSWER_FIRST_OVER_SLA", "ANSWER_FIRST_REVIEW_REQUIRED"],
    "worker dry-run run summary should list issue codes added this run",
  );
  assert.deepEqual(
    result.runSummary.activeIssueCodes,
    ["ANSWER_FIRST_OVER_SLA", "ANSWER_FIRST_REVIEW_REQUIRED"],
    "worker dry-run run summary should list active issue codes after the run",
  );
  assert.equal(
    result.actionDrafts.schemaVersion,
    ENRICHMENT_WORKER_ACTION_DRAFTS_VERSION,
    "worker dry-run should include stable local action drafts",
  );
  assert.equal(result.actionDrafts.dryRunOnly, true, "worker dry-run action drafts must stay local-only");
  assert.deepEqual(
    result.actionDrafts.notificationDrafts.map((draft) => [
      draft.channel,
      draft.priority,
      draft.dispatchStatus,
      draft.reason,
      draft.jobIds,
      draft.issueCodes,
    ]),
    [
      [
        "feishu",
        "normal",
        "not_sent",
        "answer_first_sla_alert",
        ["job-pinpoint-918-2026-05-23-rev-full-analysis-918"],
        ["ANSWER_FIRST_OVER_SLA", "ANSWER_FIRST_REVIEW_REQUIRED"],
      ],
    ],
    "worker dry-run should produce a Feishu-shaped notification draft without sending it",
  );
  assert.ok(
    result.actionDrafts.notificationDrafts[0]?.lines.some((line) => line.includes("not sent to Feishu")),
    "worker dry-run notification draft should say it is not sent",
  );
  assert.deepEqual(
    result.actionDrafts.reviewQueueDrafts.map((draft) => [
      draft.queueName,
      draft.persistenceStatus,
      draft.priority,
      draft.reason,
      draft.jobId,
      draft.issueCodes,
    ]),
    [
      [
        "content-kitchen-review",
        "not_persisted",
        "normal",
        "answer_first_review_required",
        "job-pinpoint-918-2026-05-23-rev-full-analysis-918",
        ["ANSWER_FIRST_OVER_SLA", "ANSWER_FIRST_REVIEW_REQUIRED"],
      ],
    ],
    "worker dry-run should produce a review queue draft without persisting it",
  );
  assert.equal(
    result.healthReport.schemaVersion,
    ENRICHMENT_WORKER_HEALTH_REPORT_VERSION,
    "worker dry-run should include a stable health report schema",
  );
  assert.equal(result.healthReport.status, "needs_review", "worker dry-run health should surface review needs");
  assert.equal(
    result.healthReport.recommendation,
    "Inspect review queue drafts before allowing automatic enrichment to continue.",
    "worker dry-run health should recommend review for normal SLA misses",
  );
  assert.deepEqual(
    result.healthReport.counts,
    {
      inputJobs: 3,
      claimedJobs: 1,
      skippedJobs: 2,
      reviewRequiredJobs: 1,
      deadLetterJobs: 0,
      highPriorityJobs: 0,
      notificationDrafts: 1,
      reviewQueueDrafts: 1,
    },
    "worker dry-run health should include compact counts",
  );
  assert.deepEqual(
    result.healthReport.jobIds,
    {
      claimed: ["job-pinpoint-916-2026-05-23-rev-full-analysis-916"],
      reviewRequired: ["job-pinpoint-918-2026-05-23-rev-full-analysis-918"],
      deadLetter: [],
      highPriority: [],
    },
    "worker dry-run health should include compact job id groups",
  );
  assert.deepEqual(
    result.claimedJobs.map((job) => [job.puzzleId, job.state, job.lockedBy, job.lockedUntil]),
    [["pinpoint-916-2026-05-23", "running", "worker-dry-run", "2026-05-23T09:11:00.000Z"]],
    "worker dry-run should claim due queued jobs from the JSON input",
  );
  assert.deepEqual(
    result.skippedJobs.map((entry) => [entry.job.puzzleId, entry.reason]),
    [
      ["pinpoint-917-2026-05-23", "not_due"],
      ["pinpoint-918-2026-05-23", "terminal_state"],
    ],
    "worker dry-run should explain skipped jobs",
  );
  assert.deepEqual(
    result.stateAdvancements.map((entry) => [entry.job.puzzleId, entry.transition, entry.issueCodesAdded]),
    [
      ["pinpoint-916-2026-05-23", "unchanged", []],
      ["pinpoint-917-2026-05-23", "unchanged", []],
      [
        "pinpoint-918-2026-05-23",
        "review_required",
        ["ANSWER_FIRST_OVER_SLA", "ANSWER_FIRST_REVIEW_REQUIRED"],
      ],
    ],
    "worker dry-run should report every state advancement decision",
  );

  const outputByPuzzleId = new Map(result.outputJobs.map((job) => [job.puzzleId, job]));
  assert.equal(
    outputByPuzzleId.get("pinpoint-916-2026-05-23")?.state,
    "running",
    "worker dry-run output should include claimed job state",
  );
  assert.equal(
    outputByPuzzleId.get("pinpoint-917-2026-05-23")?.state,
    "queued",
    "worker dry-run output should keep future jobs queued",
  );
  assert.deepEqual(
    outputByPuzzleId.get("pinpoint-918-2026-05-23")?.failureReasonCodes,
    ["ANSWER_FIRST_OVER_SLA", "ANSWER_FIRST_REVIEW_REQUIRED"],
    "worker dry-run output should include review-required issue codes",
  );

  const packageJson = JSON.parse(await readFile(PACKAGE_JSON_PATH, "utf8")) as {
    scripts?: Record<string, string>;
  };
  assert.ok(
    packageJson.scripts?.["content-kitchen:enrichment-dry-run"]?.includes(
      "run-content-kitchen-enrichment-worker-dry-run.ts",
    ),
    "package.json should expose the content-kitchen enrichment dry-run script",
  );

  const tmpDir = await mkdtemp(resolve(tmpdir(), "content-kitchen-worker-"));
  try {
    const outputPath = resolve(tmpDir, "worker-output.json");
    const actionOutputPath = resolve(tmpDir, "worker-action-drafts.json");
    const healthOutputPath = resolve(tmpDir, "worker-health-report.json");
    const manifestOutputPath = resolve(tmpDir, "worker-run-manifest.json");
    const fileResult = await runAnswerFirstEnrichmentWorkerJsonDryRunToFile({
      input,
      inputPath: examplePath,
      outputPath,
      actionOutputPath,
      healthOutputPath,
      manifestOutputPath,
    });
    const output = JSON.parse(await readFile(outputPath, "utf8")) as {
      schemaVersion: string;
      sourcePath: string;
      writtenAt: string;
      jobs: Array<{ puzzleId: string; state: string; lockedBy?: string; failureReasonCodes: string[] }>;
    };
    const actionOutput = JSON.parse(await readFile(actionOutputPath, "utf8")) as {
      schemaVersion: string;
      dryRunOnly: boolean;
      sourcePath: string;
      writtenAt: string;
      workerId: string;
      notificationDrafts: Array<{
        dispatchStatus: string;
        priority: string;
        jobIds: string[];
        issueCodes: string[];
      }>;
      reviewQueueDrafts: Array<{
        persistenceStatus: string;
        priority: string;
        jobId: string;
        issueCodes: string[];
      }>;
    };
    const healthOutput = JSON.parse(await readFile(healthOutputPath, "utf8")) as {
      schemaVersion: string;
      status: string;
      sourcePath: string;
      writtenAt: string;
      recommendation: string;
      counts: {
        inputJobs: number;
        notificationDrafts: number;
        reviewQueueDrafts: number;
      };
      jobIds: {
        reviewRequired: string[];
      };
      activeIssueCodes: string[];
    };
    const manifestOutput = JSON.parse(await readFile(manifestOutputPath, "utf8")) as {
      schemaVersion: string;
      dryRunOnly: boolean;
      sourcePath: string;
      writtenAt: string;
      workerId: string;
      paths: {
        inputPath: string;
        outputPath: string;
        actionOutputPath: string;
        healthOutputPath: string;
        manifestOutputPath: string;
      };
      summary: {
        inputJobs: number;
        claimedJobs: number;
        skippedJobs: number;
        stateAdvancements: number;
      };
      healthStatus: string;
      healthRecommendation: string;
      counts: {
        inputJobs: number;
        notificationDrafts: number;
        reviewQueueDrafts: number;
      };
      activeIssueCodes: string[];
    };

    assert.equal(
      fileResult.outputPath,
      outputPath,
      "worker dry-run file mode should report the output path",
    );
    assert.equal(
      fileResult.actionOutputPath,
      actionOutputPath,
      "worker dry-run file mode should report the action output path",
    );
    assert.equal(
      fileResult.healthOutputPath,
      healthOutputPath,
      "worker dry-run file mode should report the health output path",
    );
    assert.equal(
      fileResult.manifestOutputPath,
      manifestOutputPath,
      "worker dry-run file mode should report the manifest output path",
    );
    assert.equal(
      output.schemaVersion,
      ENRICHMENT_WORKER_FILE_STORE_OUTPUT_VERSION,
      "worker dry-run file output schema version should be stable",
    );
    assert.equal(output.sourcePath, examplePath, "worker dry-run file output should record the source path");
    assert.equal(output.writtenAt, input.now, "worker dry-run file output should use the dry-run timestamp");
    assert.deepEqual(
      output.jobs.map((job) => [job.puzzleId, job.state, job.lockedBy, job.failureReasonCodes]),
      [
        ["pinpoint-916-2026-05-23", "running", "worker-dry-run", []],
        ["pinpoint-917-2026-05-23", "queued", undefined, []],
        [
          "pinpoint-918-2026-05-23",
          "review_required",
          undefined,
          ["ANSWER_FIRST_OVER_SLA", "ANSWER_FIRST_REVIEW_REQUIRED"],
        ],
      ],
      "worker dry-run file output should persist updated job states",
    );
    assert.equal(
      actionOutput.schemaVersion,
      ENRICHMENT_WORKER_ACTION_DRAFTS_VERSION,
      "worker dry-run action output file should use the action draft schema version",
    );
    assert.equal(actionOutput.dryRunOnly, true, "worker dry-run action output file should stay dry-run only");
    assert.equal(actionOutput.sourcePath, examplePath, "worker dry-run action output should record the source path");
    assert.equal(actionOutput.writtenAt, input.now, "worker dry-run action output should use the dry-run timestamp");
    assert.equal(actionOutput.workerId, input.workerId, "worker dry-run action output should record the worker id");
    assert.deepEqual(
      actionOutput.notificationDrafts.map((draft) => [
        draft.dispatchStatus,
        draft.priority,
        draft.jobIds,
        draft.issueCodes,
      ]),
      [
        [
          "not_sent",
          "normal",
          ["job-pinpoint-918-2026-05-23-rev-full-analysis-918"],
          ["ANSWER_FIRST_OVER_SLA", "ANSWER_FIRST_REVIEW_REQUIRED"],
        ],
      ],
      "worker dry-run action output should write notification drafts without sending them",
    );
    assert.deepEqual(
      actionOutput.reviewQueueDrafts.map((draft) => [
        draft.persistenceStatus,
        draft.priority,
        draft.jobId,
        draft.issueCodes,
      ]),
      [
        [
          "not_persisted",
          "normal",
          "job-pinpoint-918-2026-05-23-rev-full-analysis-918",
          ["ANSWER_FIRST_OVER_SLA", "ANSWER_FIRST_REVIEW_REQUIRED"],
        ],
      ],
      "worker dry-run action output should write review queue drafts without persisting them",
    );
    assert.equal(
      healthOutput.schemaVersion,
      ENRICHMENT_WORKER_HEALTH_REPORT_VERSION,
      "worker dry-run health output file should use the health report schema version",
    );
    assert.equal(healthOutput.status, "needs_review", "worker dry-run health output should expose the health status");
    assert.equal(healthOutput.sourcePath, examplePath, "worker dry-run health output should record the source path");
    assert.equal(healthOutput.writtenAt, input.now, "worker dry-run health output should use the dry-run timestamp");
    assert.equal(
      healthOutput.recommendation,
      "Inspect review queue drafts before allowing automatic enrichment to continue.",
      "worker dry-run health output should include the operator recommendation",
    );
    assert.deepEqual(
      [
        healthOutput.counts.inputJobs,
        healthOutput.counts.notificationDrafts,
        healthOutput.counts.reviewQueueDrafts,
      ],
      [3, 1, 1],
      "worker dry-run health output should write compact counts",
    );
    assert.deepEqual(
      healthOutput.jobIds.reviewRequired,
      ["job-pinpoint-918-2026-05-23-rev-full-analysis-918"],
      "worker dry-run health output should write review-required job ids",
    );
    assert.deepEqual(
      healthOutput.activeIssueCodes,
      ["ANSWER_FIRST_OVER_SLA", "ANSWER_FIRST_REVIEW_REQUIRED"],
      "worker dry-run health output should write active issue codes",
    );
    assert.equal(
      manifestOutput.schemaVersion,
      ENRICHMENT_WORKER_RUN_MANIFEST_VERSION,
      "worker dry-run manifest output file should use the manifest schema version",
    );
    assert.equal(manifestOutput.dryRunOnly, true, "worker dry-run manifest output should stay dry-run only");
    assert.equal(manifestOutput.sourcePath, examplePath, "worker dry-run manifest should record the source path");
    assert.equal(manifestOutput.writtenAt, input.now, "worker dry-run manifest should use the dry-run timestamp");
    assert.equal(manifestOutput.workerId, input.workerId, "worker dry-run manifest should record the worker id");
    assert.deepEqual(
      manifestOutput.paths,
      {
        inputPath: examplePath,
        outputPath,
        actionOutputPath,
        healthOutputPath,
        manifestOutputPath,
      },
      "worker dry-run manifest should point to every local run file",
    );
    assert.deepEqual(
      [
        manifestOutput.summary.inputJobs,
        manifestOutput.summary.claimedJobs,
        manifestOutput.summary.skippedJobs,
        manifestOutput.summary.stateAdvancements,
      ],
      [3, 1, 2, 1],
      "worker dry-run manifest should include the compact run summary",
    );
    assert.equal(
      manifestOutput.healthStatus,
      "needs_review",
      "worker dry-run manifest should include the health status",
    );
    assert.equal(
      manifestOutput.healthRecommendation,
      "Inspect review queue drafts before allowing automatic enrichment to continue.",
      "worker dry-run manifest should include the health recommendation",
    );
    assert.deepEqual(
      [
        manifestOutput.counts.inputJobs,
        manifestOutput.counts.notificationDrafts,
        manifestOutput.counts.reviewQueueDrafts,
      ],
      [3, 1, 1],
      "worker dry-run manifest should include compact health counts",
    );
    assert.deepEqual(
      manifestOutput.activeIssueCodes,
      ["ANSWER_FIRST_OVER_SLA", "ANSWER_FIRST_REVIEW_REQUIRED"],
      "worker dry-run manifest should include active issue codes",
    );
    assert.equal(
      await readFile(examplePath, "utf8"),
      raw,
      "worker dry-run file mode should not mutate the input file",
    );
    await assert.rejects(
      () => runAnswerFirstEnrichmentWorkerDryRunCli(["--input", examplePath, "--action-output", examplePath]),
      /--action-output must be different from --input/,
      "worker dry-run CLI should reject action output paths that would overwrite the input",
    );
    await assert.rejects(
      () => runAnswerFirstEnrichmentWorkerDryRunCli([
        "--input",
        examplePath,
        "--output",
        outputPath,
        "--action-output",
        outputPath,
      ]),
      /--action-output must be different from --output/,
      "worker dry-run CLI should keep job output and action output paths separate",
    );
    await assert.rejects(
      () => runAnswerFirstEnrichmentWorkerDryRunCli(["--input", examplePath, "--health-output", examplePath]),
      /--health-output must be different from --input/,
      "worker dry-run CLI should reject health output paths that would overwrite the input",
    );
    await assert.rejects(
      () => runAnswerFirstEnrichmentWorkerDryRunCli([
        "--input",
        examplePath,
        "--output",
        outputPath,
        "--health-output",
        outputPath,
      ]),
      /--health-output must be different from --output/,
      "worker dry-run CLI should keep job output and health output paths separate",
    );
    await assert.rejects(
      () => runAnswerFirstEnrichmentWorkerDryRunCli([
        "--input",
        examplePath,
        "--action-output",
        actionOutputPath,
        "--health-output",
        actionOutputPath,
      ]),
      /--health-output must be different from --action-output/,
      "worker dry-run CLI should keep action output and health output paths separate",
    );
    await assert.rejects(
      () => runAnswerFirstEnrichmentWorkerDryRunCli(["--input", examplePath, "--manifest-output", examplePath]),
      /--manifest-output must be different from --input/,
      "worker dry-run CLI should reject manifest output paths that would overwrite the input",
    );
    await assert.rejects(
      () => runAnswerFirstEnrichmentWorkerDryRunCli([
        "--input",
        examplePath,
        "--output",
        outputPath,
        "--manifest-output",
        outputPath,
      ]),
      /--manifest-output must be different from --output/,
      "worker dry-run CLI should keep job output and manifest output paths separate",
    );
    await assert.rejects(
      () => runAnswerFirstEnrichmentWorkerDryRunCli([
        "--input",
        examplePath,
        "--action-output",
        actionOutputPath,
        "--manifest-output",
        actionOutputPath,
      ]),
      /--manifest-output must be different from --action-output/,
      "worker dry-run CLI should keep action output and manifest output paths separate",
    );
    await assert.rejects(
      () => runAnswerFirstEnrichmentWorkerDryRunCli([
        "--input",
        examplePath,
        "--health-output",
        healthOutputPath,
        "--manifest-output",
        healthOutputPath,
      ]),
      /--manifest-output must be different from --health-output/,
      "worker dry-run CLI should keep health output and manifest output paths separate",
    );

    const resumedInput = parseAnswerFirstEnrichmentWorkerDryRunInput(output, {
      now: "2026-05-23T09:12:00.000Z",
      workerId: "worker-dry-run-next",
      lockMinutes: 10,
    });
    const resumedResult = await runAnswerFirstEnrichmentWorkerJsonDryRun(resumedInput);
    assert.equal(
      resumedResult.runSummary.headline,
      "worker-dry-run-next @ 2026-05-23T09:12:00.000Z; 1 claimed job; 2 skipped jobs; 1 state change; 1 review; 0 dead-letter",
      "resumed worker dry-run should include an updated run summary headline",
    );
    assert.deepEqual(
      resumedResult.claimedJobs.map((job) => [job.puzzleId, job.attemptCount, job.lockedBy, job.lockedUntil]),
      [["pinpoint-916-2026-05-23", 2, "worker-dry-run-next", "2026-05-23T09:22:00.000Z"]],
      "worker dry-run should be able to use a file-store output as the next input",
    );
    assert.equal(
      resumedResult.healthReport.status,
      "needs_review",
      "resumed worker dry-run health should keep surfacing unresolved review work",
    );
    assert.deepEqual(
      resumedResult.skippedJobs.map((entry) => [entry.job.puzzleId, entry.reason]),
      [
        ["pinpoint-917-2026-05-23", "not_due"],
        ["pinpoint-918-2026-05-23", "terminal_state"],
      ],
      "resumed worker dry-run should preserve skipped job reasons from the output file state",
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function assertAnswerFirstEnrichmentWorkerHighPriorityJsonDryRun() {
  const examplePath = resolve(EXAMPLE_DIR, "enrichment-worker-high-priority.input.json");
  const raw = await readFile(examplePath, "utf8");
  const input = JSON.parse(raw) as AnswerFirstEnrichmentWorkerDryRunInput;
  const result = await runAnswerFirstEnrichmentWorkerJsonDryRun(input);

  assert.deepEqual(
    result.summary,
    {
      inputJobs: 1,
      outputJobs: 1,
      claimedJobs: 0,
      skippedJobs: 1,
      stateAdvancements: 1,
    },
    "high-priority worker dry-run should summarize dead-letter advancement",
  );
  assert.equal(
    result.runSummary.headline,
    "worker-high-priority-dry-run @ 2026-05-23T15:05:00.000Z; 0 claimed jobs; 1 skipped job; 1 state change; 0 review; 1 dead-letter",
    "high-priority worker dry-run should include dead-letter in the headline",
  );
  assert.deepEqual(
    result.runSummary.counts,
    {
      inputJobs: 1,
      outputJobs: 1,
      claimedJobs: 0,
      skippedJobs: 1,
      stateChanges: 1,
      reviewRequiredJobs: 0,
      deadLetterJobs: 1,
      overSlaJobs: 1,
      highPriorityJobs: 1,
    },
    "high-priority worker dry-run should count dead-letter and high-priority jobs",
  );
  assert.deepEqual(
    result.runSummary.byOutputState,
    {
      dead_letter: 1,
    },
    "high-priority worker dry-run should count dead-letter output state",
  );
  assert.deepEqual(
    result.runSummary.bySkipReason,
    {
      terminal_state: 1,
    },
    "high-priority worker dry-run should skip the advanced dead-letter job as terminal",
  );
  assert.deepEqual(
    result.runSummary.issueCodesAdded,
    ["ANSWER_FIRST_HIGH_PRIORITY_ALERT", "ANSWER_FIRST_OVER_SLA", "ANSWER_FIRST_REVIEW_REQUIRED"],
    "high-priority worker dry-run should list all newly-added escalation codes",
  );
  assert.deepEqual(
    result.actionDrafts.notificationDrafts.map((draft) => [
      draft.priority,
      draft.reason,
      draft.dispatchStatus,
      draft.jobIds,
      draft.issueCodes,
    ]),
    [
      [
        "high_priority",
        "answer_first_high_priority_alert",
        "not_sent",
        ["job-pinpoint-919-2026-05-23-rev-full-analysis-919"],
        ["ANSWER_FIRST_HIGH_PRIORITY_ALERT", "ANSWER_FIRST_OVER_SLA", "ANSWER_FIRST_REVIEW_REQUIRED"],
      ],
    ],
    "high-priority worker dry-run should create a high-priority notification draft without sending it",
  );
  assert.deepEqual(
    result.actionDrafts.reviewQueueDrafts.map((draft) => [
      draft.priority,
      draft.reason,
      draft.persistenceStatus,
      draft.state,
      draft.jobId,
      draft.issueCodes,
    ]),
    [
      [
        "high_priority",
        "answer_first_dead_letter",
        "not_persisted",
        "dead_letter",
        "job-pinpoint-919-2026-05-23-rev-full-analysis-919",
        ["ANSWER_FIRST_OVER_SLA", "ANSWER_FIRST_REVIEW_REQUIRED", "ANSWER_FIRST_HIGH_PRIORITY_ALERT"],
      ],
    ],
    "high-priority worker dry-run should create a high-priority review queue draft without persisting it",
  );
  assert.equal(
    result.healthReport.status,
    "high_priority",
    "high-priority worker dry-run health should surface urgent action",
  );
  assert.deepEqual(
    result.healthReport.jobIds.highPriority,
    ["job-pinpoint-919-2026-05-23-rev-full-analysis-919"],
    "high-priority worker dry-run health should include high-priority job ids",
  );
  assert.equal(
    result.healthReport.recommendation,
    "Inspect high-priority action drafts before any future publish automation.",
    "high-priority worker dry-run health should recommend urgent inspection",
  );
  assert.deepEqual(
    result.stateAdvancements.map((entry) => [entry.job.puzzleId, entry.transition, entry.issueCodesAdded]),
    [
      [
        "pinpoint-919-2026-05-23",
        "dead_letter",
        ["ANSWER_FIRST_OVER_SLA", "ANSWER_FIRST_REVIEW_REQUIRED", "ANSWER_FIRST_HIGH_PRIORITY_ALERT"],
      ],
    ],
    "high-priority worker dry-run should advance stale answer-first jobs to dead-letter",
  );
  assert.equal(await readFile(examplePath, "utf8"), raw, "high-priority worker dry-run should not mutate the example");
}

async function assertAnswerFirstEnrichmentWorkerHealthStatuses() {
  const examplePath = resolve(EXAMPLE_DIR, "enrichment-worker-dry-run.input.json");
  const raw = await readFile(examplePath, "utf8");
  const input = JSON.parse(raw) as AnswerFirstEnrichmentWorkerDryRunInput;
  const freshResult = await runAnswerFirstEnrichmentWorkerJsonDryRun({
    ...input,
    jobs: [input.jobs[0]],
  });
  assert.equal(freshResult.healthReport.status, "ok", "fresh runnable jobs should produce ok health");
  assert.equal(
    freshResult.healthReport.recommendation,
    "No review action is needed for this dry run.",
    "ok health should not ask for review",
  );

  const maxAttemptsResult = await runAnswerFirstEnrichmentWorkerJsonDryRun({
    ...input,
    jobs: [{
      ...input.jobs[0],
      attemptCount: input.jobs[0].maxAttempts,
    }],
  });
  assert.equal(
    maxAttemptsResult.healthReport.status,
    "blocked",
    "jobs at max attempts should produce blocked health",
  );
  assert.deepEqual(
    maxAttemptsResult.healthReport.skipReasons,
    { max_attempts_reached: 1 },
    "blocked health should expose the max-attempt skip reason",
  );
  assert.equal(
    maxAttemptsResult.healthReport.recommendation,
    "Inspect dead-letter or max-attempt jobs before retrying the queue.",
    "blocked health should recommend queue inspection before retrying",
  );
}

async function assertAnswerFirstEnrichmentDryRunUsageDoc() {
  const doc = await readFile(PR9_ENRICHMENT_DRY_RUN_USAGE_DOC_PATH, "utf8");
  const requiredSnippets = [
    "npm run content-kitchen:enrichment-dry-run",
    "--input lib/puzzles/content-kitchen/examples/enrichment-worker-dry-run.input.json",
    "--output /tmp/content-kitchen-worker-output.json",
    "--action-output /tmp/content-kitchen-action-drafts.json",
    "--health-output /tmp/content-kitchen-health-report.json",
    "--manifest-output /tmp/content-kitchen-run-manifest.json",
    "`healthReport`",
    "`healthStatus`",
    "`ok`: no review action is needed",
    "`needs_review`: inspect review queue drafts before allowing automatic enrichment to continue",
    "`high_priority`: inspect high-priority action drafts before any future publish automation",
    "`blocked`: inspect dead-letter or max-attempt jobs before retrying the queue",
    "--action-output must not equal `--input`",
    "--action-output must not equal `--output`",
    "--health-output must not equal `--input`",
    "--health-output must not equal `--output`",
    "--health-output must not equal `--action-output`",
    "--manifest-output must not equal `--input`",
    "--manifest-output must not equal `--output`",
    "--manifest-output must not equal `--action-output`",
    "--manifest-output must not equal `--health-output`",
    "dispatchStatus: \"not_sent\"",
    "persistenceStatus: \"not_persisted\"",
    "does not send Feishu messages",
    "does not write review queue storage",
    "does not touch production storage",
    "does not run Worker cron",
  ];

  for (const snippet of requiredSnippets) {
    assert.ok(doc.includes(snippet), `PR9 enrichment dry-run usage doc should include: ${snippet}`);
  }
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
  assertLocalPipelineSmoke(dictionaries);
  assertAnswerFirstSlaClock();
  assertAnswerFirstEnrichmentJobContract();
  assertAnswerFirstEnrichmentJobRetryAndLock();
  assertAnswerFirstEnrichmentQueueScan();
  assertAnswerFirstEnrichmentStateAdvance();
  assertAnswerFirstEnrichmentWorkerTick();
  await assertAnswerFirstEnrichmentJobStoreAdapter();
  await assertAnswerFirstEnrichmentWorkerJsonDryRun();
  await assertAnswerFirstEnrichmentWorkerHighPriorityJsonDryRun();
  await assertAnswerFirstEnrichmentWorkerHealthStatuses();
  await assertAnswerFirstEnrichmentDryRunUsageDoc();
  console.log(`content-kitchen contract fixtures passed (${fileNames.length} fixtures)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
