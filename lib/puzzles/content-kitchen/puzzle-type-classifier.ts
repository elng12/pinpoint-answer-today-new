import { normalizeIdentityMatch, normalizeIdentityText } from "./identity";
import {
  CONTENT_KITCHEN_CLUE_COUNT,
  type AliasDictionary,
  type CategoryMembershipDictionary,
  type ContentKitchenDictionaries,
  type FullAnalysisPuzzleTypeCandidateCategory,
  type FullAnalysisPuzzleTypeClassification,
  type FullAnalysisPuzzleTypeClassificationReason,
  type L1PuzzleInput,
} from "./types";

export type ClassifyFullAnalysisPuzzleTypeInput = {
  l1Input: L1PuzzleInput;
  dictionaries?: ContentKitchenDictionaries;
  answerCategoryHint?: string;
};

type CategoryCoverage = {
  category: string;
  normalizedCategory: string;
  lookupVersion: string;
  matchedClueIds: Set<string>;
};

function stableReasonCodes(
  reasonCodes: FullAnalysisPuzzleTypeClassificationReason[],
): FullAnalysisPuzzleTypeClassificationReason[] {
  return [...new Set(reasonCodes)];
}

function toCandidateCategory(coverage: CategoryCoverage): FullAnalysisPuzzleTypeCandidateCategory {
  return {
    category: coverage.category,
    matchedClueCount: coverage.matchedClueIds.size,
    matchedClueIds: [...coverage.matchedClueIds].sort(),
    lookupVersion: coverage.lookupVersion,
  };
}

function sortCandidateCategories(
  categories: FullAnalysisPuzzleTypeCandidateCategory[],
): FullAnalysisPuzzleTypeCandidateCategory[] {
  return [...categories].sort((left, right) => {
    if (right.matchedClueCount !== left.matchedClueCount) {
      return right.matchedClueCount - left.matchedClueCount;
    }

    return left.category.localeCompare(right.category);
  });
}

function buildCategoryCoverage(
  l1Input: L1PuzzleInput,
  dictionary: CategoryMembershipDictionary,
): FullAnalysisPuzzleTypeCandidateCategory[] {
  const coverageByCategory = new Map<string, CategoryCoverage>();

  for (const clue of l1Input.clues) {
    const normalizedClueText = normalizeIdentityMatch(clue.text);
    if (!normalizedClueText) {
      continue;
    }

    const matchingEntries = dictionary.entries.filter((entry) => entry.normalizedMember === normalizedClueText);
    for (const entry of matchingEntries) {
      const coverage = coverageByCategory.get(entry.normalizedCategory) ?? {
        category: entry.category,
        normalizedCategory: entry.normalizedCategory,
        lookupVersion: dictionary.versionId,
        matchedClueIds: new Set<string>(),
      };
      coverage.matchedClueIds.add(normalizeIdentityText(clue.clueId));
      coverageByCategory.set(entry.normalizedCategory, coverage);
    }
  }

  return sortCandidateCategories([...coverageByCategory.values()].map(toCandidateCategory));
}

function categoryMatchesAnswerHint(
  category: FullAnalysisPuzzleTypeCandidateCategory,
  answerHint: string,
  aliasDictionary: AliasDictionary,
): FullAnalysisPuzzleTypeClassificationReason | null {
  const normalizedHint = normalizeIdentityMatch(answerHint);
  if (!normalizedHint) {
    return null;
  }

  if (normalizeIdentityMatch(category.category) === normalizedHint) {
    return "ANSWER_CATEGORY_HINT_MATCHED";
  }

  const aliasMatch = aliasDictionary.entries.some((entry) => {
    return (
      (entry.aliasType === "answer" || entry.aliasType === "category") &&
      entry.normalizedAlias === normalizedHint &&
      entry.normalizedCanonicalValue === normalizeIdentityMatch(category.category)
    );
  });

  return aliasMatch ? "ANSWER_ALIAS_MATCHED_CATEGORY" : null;
}

function unknownClassification(
  l1Input: L1PuzzleInput,
  candidateCategories: FullAnalysisPuzzleTypeCandidateCategory[],
  reasonCodes: FullAnalysisPuzzleTypeClassificationReason[],
): FullAnalysisPuzzleTypeClassification {
  const bestCategory = candidateCategories[0];
  const matchedClueIds = bestCategory?.matchedClueIds ?? [];

  return {
    puzzleType: "unknown",
    confidence: "low",
    matchedClueCount: bestCategory?.matchedClueCount ?? 0,
    matchedClueIds,
    unmatchedClueIds: l1Input.clues
      .map((clue) => clue.clueId)
      .filter((clueId) => !matchedClueIds.includes(clueId)),
    candidateCategories,
    reasonCodes: stableReasonCodes(reasonCodes),
  };
}

export function classifyFullAnalysisPuzzleType(
  input: ClassifyFullAnalysisPuzzleTypeInput,
): FullAnalysisPuzzleTypeClassification {
  const dictionaries = input.dictionaries;
  if (!dictionaries) {
    return unknownClassification(input.l1Input, [], ["NO_REVIEWED_CATEGORY_COVERAGE"]);
  }

  const answerHint = normalizeIdentityText(input.answerCategoryHint) || normalizeIdentityText(input.l1Input.answer);
  const candidateCategories = buildCategoryCoverage(input.l1Input, dictionaries.categoryMembership);
  const reasonCodes: FullAnalysisPuzzleTypeClassificationReason[] = [];

  if (candidateCategories.length === 0) {
    return unknownClassification(input.l1Input, [], ["NO_REVIEWED_CATEGORY_COVERAGE"]);
  }

  const fullCoverageCategories = candidateCategories.filter((category) => {
    return category.matchedClueCount === CONTENT_KITCHEN_CLUE_COUNT;
  });

  if (fullCoverageCategories.length === 0) {
    reasonCodes.push("PARTIAL_REVIEWED_CATEGORY_COVERAGE");
    return unknownClassification(input.l1Input, candidateCategories, reasonCodes);
  }

  const answerMatchedCategories = fullCoverageCategories.flatMap((category) => {
    const matchReason = categoryMatchesAnswerHint(category, answerHint, dictionaries.aliasDictionary);
    return matchReason ? [{ category, matchReason }] : [];
  });

  if (answerMatchedCategories.length === 1) {
    const selected = answerMatchedCategories[0].category;
    return {
      puzzleType: "category_membership",
      confidence: "high",
      answerCategory: selected.category,
      matchedClueCount: selected.matchedClueCount,
      matchedClueIds: selected.matchedClueIds,
      unmatchedClueIds: [],
      candidateCategories,
      reasonCodes: stableReasonCodes([
        "ALL_CLUES_MATCH_REVIEWED_CATEGORY",
        answerMatchedCategories[0].matchReason,
      ]),
    };
  }

  if (fullCoverageCategories.length === 1) {
    const selected = fullCoverageCategories[0];
    return {
      puzzleType: "category_membership",
      confidence: "medium",
      answerCategory: selected.category,
      matchedClueCount: selected.matchedClueCount,
      matchedClueIds: selected.matchedClueIds,
      unmatchedClueIds: [],
      candidateCategories,
      reasonCodes: ["ALL_CLUES_MATCH_REVIEWED_CATEGORY"],
    };
  }

  reasonCodes.push("AMBIGUOUS_REVIEWED_CATEGORY_COVERAGE");
  return unknownClassification(input.l1Input, candidateCategories, reasonCodes);
}
