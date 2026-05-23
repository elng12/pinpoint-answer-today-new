import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { normalizeIdentityMatch, normalizeIdentityText } from "./identity";
import type {
  AliasDictionary,
  AliasDictionaryEntry,
  CategoryMembershipDictionary,
  CategoryMembershipEntry,
  ContentKitchenDictionaries,
  ContentKitchenDictionaryBase,
  ContentKitchenDictionaryDiff,
  ContentKitchenEvidenceRecord,
  DictionaryChangeType,
  DictionaryDiffAffectedPage,
  DictionaryDiffChange,
  DictionaryName,
  DictionaryReviewStatus,
  DictionaryRisk,
  L1PuzzleInput,
} from "./types";

type CategoryEvidenceInput = {
  l1Input: L1PuzzleInput;
  category: string;
  dictionary: CategoryMembershipDictionary;
  evidenceIdPrefix?: string;
};

export const DEFAULT_CATEGORY_MEMBERSHIP_EVIDENCE_ID_PREFIX = "ev";

const DICTIONARY_REVIEW_STATUSES = new Set<DictionaryReviewStatus>(["draft", "shadow", "reviewed"]);
const DICTIONARY_RISKS = new Set<DictionaryRisk>(["low", "medium", "high"]);
const DICTIONARY_NAMES = new Set<DictionaryName>(["category_membership", "alias_dictionary"]);
const DICTIONARY_CHANGE_TYPES = new Set<DictionaryChangeType>(["add", "update", "delete"]);
const ALIAS_TYPES = new Set<AliasDictionaryEntry["aliasType"]>(["answer", "category", "clue", "phrase"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isIsoUtc(value: unknown): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(normalizeIdentityText(value));
}

function normalizeDictionaryValue(value: unknown): string {
  return normalizeIdentityMatch(value);
}

function safeEvidenceId(value: string): string {
  return normalizeIdentityMatch(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function requireString(value: unknown, fieldPath: string): string {
  const normalized = normalizeIdentityText(value);
  if (!normalized) {
    throw new Error(`${fieldPath} is required`);
  }
  return normalized;
}

function requireIsoUtc(value: unknown, fieldPath: string): string {
  const normalized = requireString(value, fieldPath);
  if (!isIsoUtc(normalized)) {
    throw new Error(`${fieldPath} must be an ISO UTC timestamp`);
  }
  return normalized;
}

function validateDictionaryBase(
  input: unknown,
  expectedName: ContentKitchenDictionaryBase["dictionaryName"],
  expectedSchemaVersion: ContentKitchenDictionaryBase["schemaVersion"],
): ContentKitchenDictionaryBase {
  if (!isRecord(input)) {
    throw new Error(`${expectedName} dictionary must be an object`);
  }

  const dictionaryName = requireString(input.dictionaryName, "dictionaryName");
  const schemaVersion = requireString(input.schemaVersion, "schemaVersion");
  const versionId = requireString(input.versionId, "versionId");
  const owner = requireString(input.owner, "owner");
  const reviewedBy = requireString(input.reviewedBy, "reviewedBy");
  const reviewedAt = requireIsoUtc(input.reviewedAt, "reviewedAt");
  const reviewStatus = requireString(input.reviewStatus, "reviewStatus") as DictionaryReviewStatus;

  if (dictionaryName !== expectedName) {
    throw new Error(`dictionaryName must be ${expectedName}`);
  }

  if (schemaVersion !== expectedSchemaVersion) {
    throw new Error(`${dictionaryName}.schemaVersion must be ${expectedSchemaVersion}`);
  }

  if (!DICTIONARY_REVIEW_STATUSES.has(reviewStatus)) {
    throw new Error(`${dictionaryName}.reviewStatus is unsupported`);
  }

  if (reviewStatus !== "reviewed") {
    throw new Error(`${dictionaryName} must be reviewed before it can support L2 evidence`);
  }

  return {
    dictionaryName,
    schemaVersion,
    versionId,
    owner,
    reviewedBy,
    reviewedAt,
    reviewStatus,
  };
}

function validateRisk(value: unknown, fieldPath: string): DictionaryRisk {
  const risk = requireString(value, fieldPath) as DictionaryRisk;
  if (!DICTIONARY_RISKS.has(risk)) {
    throw new Error(`${fieldPath} is unsupported`);
  }
  return risk;
}

function validateCategoryEntry(input: unknown, index: number): CategoryMembershipEntry {
  if (!isRecord(input)) {
    throw new Error(`entries[${index}] must be an object`);
  }

  const fieldPath = `entries[${index}]`;
  const category = requireString(input.category, `${fieldPath}.category`);
  const normalizedCategory = requireString(input.normalizedCategory, `${fieldPath}.normalizedCategory`);
  const member = requireString(input.member, `${fieldPath}.member`);
  const normalizedMember = requireString(input.normalizedMember, `${fieldPath}.normalizedMember`);

  if (normalizedCategory !== normalizeDictionaryValue(category)) {
    throw new Error(`${fieldPath}.normalizedCategory must match normalized category`);
  }

  if (normalizedMember !== normalizeDictionaryValue(member)) {
    throw new Error(`${fieldPath}.normalizedMember must match normalized member`);
  }

  return {
    category,
    normalizedCategory,
    member,
    normalizedMember,
    sourceNote: requireString(input.sourceNote, `${fieldPath}.sourceNote`),
    reviewer: requireString(input.reviewer, `${fieldPath}.reviewer`),
    risk: validateRisk(input.risk, `${fieldPath}.risk`),
    createdAt: requireIsoUtc(input.createdAt, `${fieldPath}.createdAt`),
    updatedAt: requireIsoUtc(input.updatedAt, `${fieldPath}.updatedAt`),
  };
}

function validateAliasEntry(input: unknown, index: number): AliasDictionaryEntry {
  if (!isRecord(input)) {
    throw new Error(`entries[${index}] must be an object`);
  }

  const fieldPath = `entries[${index}]`;
  const aliasType = requireString(input.aliasType, `${fieldPath}.aliasType`) as AliasDictionaryEntry["aliasType"];
  if (!ALIAS_TYPES.has(aliasType)) {
    throw new Error(`${fieldPath}.aliasType is unsupported`);
  }

  const canonicalValue = requireString(input.canonicalValue, `${fieldPath}.canonicalValue`);
  const normalizedCanonicalValue = requireString(input.normalizedCanonicalValue, `${fieldPath}.normalizedCanonicalValue`);
  const alias = requireString(input.alias, `${fieldPath}.alias`);
  const normalizedAlias = requireString(input.normalizedAlias, `${fieldPath}.normalizedAlias`);

  if (normalizedCanonicalValue !== normalizeDictionaryValue(canonicalValue)) {
    throw new Error(`${fieldPath}.normalizedCanonicalValue must match normalized canonicalValue`);
  }

  if (normalizedAlias !== normalizeDictionaryValue(alias)) {
    throw new Error(`${fieldPath}.normalizedAlias must match normalized alias`);
  }

  return {
    aliasType,
    canonicalValue,
    normalizedCanonicalValue,
    alias,
    normalizedAlias,
    sourceNote: requireString(input.sourceNote, `${fieldPath}.sourceNote`),
    reviewer: requireString(input.reviewer, `${fieldPath}.reviewer`),
    risk: validateRisk(input.risk, `${fieldPath}.risk`),
    createdAt: requireIsoUtc(input.createdAt, `${fieldPath}.createdAt`),
    updatedAt: requireIsoUtc(input.updatedAt, `${fieldPath}.updatedAt`),
  };
}

function validateDictionaryName(value: unknown, fieldPath: string): DictionaryName {
  const dictionaryName = requireString(value, fieldPath) as DictionaryName;
  if (!DICTIONARY_NAMES.has(dictionaryName)) {
    throw new Error(`${fieldPath} is unsupported`);
  }
  return dictionaryName;
}

function validateChangeType(value: unknown, fieldPath: string): DictionaryChangeType {
  const type = requireString(value, fieldPath) as DictionaryChangeType;
  if (!DICTIONARY_CHANGE_TYPES.has(type)) {
    throw new Error(`${fieldPath} is unsupported`);
  }
  return type;
}

function optionalString(value: unknown): string | undefined {
  const normalized = normalizeIdentityText(value);
  return normalized || undefined;
}

function validateCategoryDiffFields(input: Record<string, unknown>, fieldPath: string) {
  const category = requireString(input.category, `${fieldPath}.category`);
  const normalizedCategory = requireString(input.normalizedCategory, `${fieldPath}.normalizedCategory`);
  const member = requireString(input.member, `${fieldPath}.member`);
  const normalizedMember = requireString(input.normalizedMember, `${fieldPath}.normalizedMember`);

  if (normalizedCategory !== normalizeDictionaryValue(category)) {
    throw new Error(`${fieldPath}.normalizedCategory must match normalized category`);
  }

  if (normalizedMember !== normalizeDictionaryValue(member)) {
    throw new Error(`${fieldPath}.normalizedMember must match normalized member`);
  }

  return {
    category,
    normalizedCategory,
    member,
    normalizedMember,
  };
}

function validateAliasDiffFields(input: Record<string, unknown>, fieldPath: string) {
  const aliasType = requireString(input.aliasType, `${fieldPath}.aliasType`) as AliasDictionaryEntry["aliasType"];
  if (!ALIAS_TYPES.has(aliasType)) {
    throw new Error(`${fieldPath}.aliasType is unsupported`);
  }

  const canonicalValue = requireString(input.canonicalValue, `${fieldPath}.canonicalValue`);
  const normalizedCanonicalValue = requireString(input.normalizedCanonicalValue, `${fieldPath}.normalizedCanonicalValue`);
  const alias = requireString(input.alias, `${fieldPath}.alias`);
  const normalizedAlias = requireString(input.normalizedAlias, `${fieldPath}.normalizedAlias`);

  if (normalizedCanonicalValue !== normalizeDictionaryValue(canonicalValue)) {
    throw new Error(`${fieldPath}.normalizedCanonicalValue must match normalized canonicalValue`);
  }

  if (normalizedAlias !== normalizeDictionaryValue(alias)) {
    throw new Error(`${fieldPath}.normalizedAlias must match normalized alias`);
  }

  return {
    aliasType,
    canonicalValue,
    normalizedCanonicalValue,
    alias,
    normalizedAlias,
  };
}

function validateDictionaryDiffChange(
  input: unknown,
  index: number,
  dictionaryName: DictionaryName,
): DictionaryDiffChange {
  if (!isRecord(input)) {
    throw new Error(`changes[${index}] must be an object`);
  }

  const fieldPath = `changes[${index}]`;
  const base = {
    type: validateChangeType(input.type, `${fieldPath}.type`),
    sourceNote: requireString(input.sourceNote, `${fieldPath}.sourceNote`),
    reviewer: requireString(input.reviewer, `${fieldPath}.reviewer`),
    risk: validateRisk(input.risk, `${fieldPath}.risk`),
  };

  if (dictionaryName === "category_membership") {
    return {
      ...base,
      ...validateCategoryDiffFields(input, fieldPath),
    };
  }

  return {
    ...base,
    ...validateAliasDiffFields(input, fieldPath),
  };
}

function validateAffectedPage(input: unknown, index: number): DictionaryDiffAffectedPage {
  if (!isRecord(input)) {
    throw new Error(`affectedPublishedPages[${index}] must be an object`);
  }

  const fieldPath = `affectedPublishedPages[${index}]`;
  if (typeof input.needsReview !== "boolean") {
    throw new Error(`${fieldPath}.needsReview must be boolean`);
  }

  return {
    slug: requireString(input.slug, `${fieldPath}.slug`),
    ...(optionalString(input.canonicalUrl) ? { canonicalUrl: optionalString(input.canonicalUrl) } : {}),
    ...(optionalString(input.revisionId) ? { revisionId: optionalString(input.revisionId) } : {}),
    ...(optionalString(input.lookupVersion) ? { lookupVersion: optionalString(input.lookupVersion) } : {}),
    reason: requireString(input.reason, `${fieldPath}.reason`),
    needsReview: input.needsReview,
  };
}

function assertNoDuplicateKeys(keys: string[], label: string) {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) {
      throw new Error(`${label} contains duplicate key: ${key}`);
    }
    seen.add(key);
  }
}

export function validateCategoryMembershipDictionary(input: unknown): CategoryMembershipDictionary {
  const base = validateDictionaryBase(
    input,
    "category_membership",
    "content-kitchen-category-membership-v0",
  );

  if (!isRecord(input) || !Array.isArray(input.entries) || input.entries.length === 0) {
    throw new Error("category_membership.entries must be a non-empty array");
  }

  const entries = input.entries.map(validateCategoryEntry);
  assertNoDuplicateKeys(
    entries.map((entry) => `${entry.normalizedCategory}:${entry.normalizedMember}`),
    "category_membership.entries",
  );

  return {
    ...base,
    dictionaryName: "category_membership",
    schemaVersion: "content-kitchen-category-membership-v0",
    entries,
  };
}

export function validateAliasDictionary(input: unknown): AliasDictionary {
  const base = validateDictionaryBase(
    input,
    "alias_dictionary",
    "content-kitchen-alias-dictionary-v0",
  );

  if (!isRecord(input) || !Array.isArray(input.entries) || input.entries.length === 0) {
    throw new Error("alias_dictionary.entries must be a non-empty array");
  }

  const entries = input.entries.map(validateAliasEntry);
  assertNoDuplicateKeys(
    entries.map((entry) => `${entry.aliasType}:${entry.normalizedAlias}:${entry.normalizedCanonicalValue}`),
    "alias_dictionary.entries",
  );

  return {
    ...base,
    dictionaryName: "alias_dictionary",
    schemaVersion: "content-kitchen-alias-dictionary-v0",
    entries,
  };
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

export function validateDictionaryDiff(input: unknown): ContentKitchenDictionaryDiff {
  if (!isRecord(input)) {
    throw new Error("dictionary diff must be an object");
  }

  const schemaVersion = requireString(input.schemaVersion, "schemaVersion");
  if (schemaVersion !== "content-kitchen-dictionary-diff-v0") {
    throw new Error("schemaVersion must be content-kitchen-dictionary-diff-v0");
  }

  const dictionaryName = validateDictionaryName(input.dictionaryName, "dictionaryName");
  const fromVersion = requireString(input.fromVersion, "fromVersion");
  const toVersion = requireString(input.toVersion, "toVersion");
  if (fromVersion === toVersion) {
    throw new Error("fromVersion and toVersion must differ");
  }

  if (!Array.isArray(input.changes) || input.changes.length === 0) {
    throw new Error("changes must be a non-empty array");
  }

  const changes = input.changes.map((change, index) => {
    return validateDictionaryDiffChange(change, index, dictionaryName);
  });
  const affectedPublishedPages = Array.isArray(input.affectedPublishedPages)
    ? input.affectedPublishedPages.map(validateAffectedPage)
    : [];

  return {
    schemaVersion,
    dictionaryName,
    fromVersion,
    toVersion,
    createdAt: requireIsoUtc(input.createdAt, "createdAt"),
    reviewedBy: requireString(input.reviewedBy, "reviewedBy"),
    reviewedAt: requireIsoUtc(input.reviewedAt, "reviewedAt"),
    changes,
    affectedPublishedPages,
  };
}

export async function readContentKitchenDictionaries(rootDir = process.cwd()): Promise<ContentKitchenDictionaries> {
  const dictionaryDir = resolve(rootDir, "lib", "puzzles", "content-kitchen", "dictionaries");
  const [categoryMembershipJson, aliasDictionaryJson] = await Promise.all([
    readJson(resolve(dictionaryDir, "category_membership.json")),
    readJson(resolve(dictionaryDir, "alias_dictionary.json")),
  ]);

  return {
    categoryMembership: validateCategoryMembershipDictionary(categoryMembershipJson),
    aliasDictionary: validateAliasDictionary(aliasDictionaryJson),
  };
}

export async function readContentKitchenDictionaryDiffs(rootDir = process.cwd()): Promise<ContentKitchenDictionaryDiff[]> {
  const diffDir = resolve(rootDir, "lib", "puzzles", "content-kitchen", "dictionaries", "diffs");
  const fileNames = (await readdir(diffDir)).filter((fileName) => fileName.endsWith(".json")).sort();
  const diffs = await Promise.all(
    fileNames.map(async (fileName) => {
      return validateDictionaryDiff(await readJson(resolve(diffDir, fileName)));
    }),
  );
  return diffs;
}

export function lookupCategoryMembership(
  dictionary: CategoryMembershipDictionary,
  input: { category: string; member: string },
): CategoryMembershipEntry | null {
  const normalizedCategory = normalizeDictionaryValue(input.category);
  const normalizedMember = normalizeDictionaryValue(input.member);
  return dictionary.entries.find((entry) => {
    return entry.normalizedCategory === normalizedCategory && entry.normalizedMember === normalizedMember;
  }) ?? null;
}

export function lookupAliases(
  dictionary: AliasDictionary,
  input: { alias: string; aliasType?: AliasDictionaryEntry["aliasType"] },
): AliasDictionaryEntry[] {
  const normalizedAlias = normalizeDictionaryValue(input.alias);
  return dictionary.entries.filter((entry) => {
    return entry.normalizedAlias === normalizedAlias && (!input.aliasType || entry.aliasType === input.aliasType);
  });
}

export function buildCategoryMembershipEvidenceRecords(input: CategoryEvidenceInput): ContentKitchenEvidenceRecord[] {
  const category = normalizeIdentityText(input.category);
  const evidenceIdPrefix = normalizeIdentityText(input.evidenceIdPrefix) || DEFAULT_CATEGORY_MEMBERSHIP_EVIDENCE_ID_PREFIX;

  return input.l1Input.clues.flatMap((clue) => {
    const entry = lookupCategoryMembership(input.dictionary, {
      category,
      member: clue.text,
    });

    if (!entry) {
      return [];
    }

    return [
      {
        evidenceId: `${evidenceIdPrefix}-${safeEvidenceId(clue.text)}`,
        clueId: clue.clueId,
        sourceLevel: "L2",
        sourceType: "category_membership",
        supportKind: "fit",
        claim: `${entry.member} is reviewed as a member of ${entry.category}.`,
        confidence: entry.risk === "low" ? "high" : "medium",
        lookupVersion: input.dictionary.versionId,
        notes: entry.sourceNote,
      },
    ];
  });
}

export function dictionaryDiffRequiresReviewArtifacts(diff: ContentKitchenDictionaryDiff): boolean {
  return diff.changes.some((change) => change.risk === "medium" || change.risk === "high") &&
    diff.affectedPublishedPages.some((page) => page.needsReview);
}
