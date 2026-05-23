import { normalizeIdentityMatch, normalizeIdentityText } from "./identity";
import {
  CONTENT_KITCHEN_CLUE_COUNT,
  type FullAnalysisClueFitSlot,
  type FullAnalysisFaqGenerationIssue,
  type FullAnalysisFaqGenerationIssueCode,
  type FullAnalysisFaqGenerationResult,
  type FullAnalysisFaqSlot,
  type FullAnalysisPuzzleTypeClassification,
  type L1PuzzleInput,
} from "./types";

export type GenerateFullAnalysisFaqItemsInput = {
  l1Input: L1PuzzleInput;
  classification: FullAnalysisPuzzleTypeClassification;
  clueFits: FullAnalysisClueFitSlot[];
};

function makeIssue(
  issueCode: FullAnalysisFaqGenerationIssueCode,
  fieldPath: string,
  message: string,
  suggestedAction: string,
): FullAnalysisFaqGenerationIssue {
  return {
    issueCode,
    fieldPath,
    message,
    suggestedAction,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(normalizeIdentityText).filter(Boolean))];
}

function formatClueList(clueTexts: string[]): string {
  if (clueTexts.length <= 2) {
    return clueTexts.join(" and ");
  }

  return `${clueTexts.slice(0, -1).join(", ")}, and ${clueTexts[clueTexts.length - 1]}`;
}

function clueFitById(clueFits: FullAnalysisClueFitSlot[]): Map<string, FullAnalysisClueFitSlot> {
  const byId = new Map<string, FullAnalysisClueFitSlot>();
  for (const clueFit of clueFits) {
    const clueId = normalizeIdentityMatch(clueFit.clueId);
    if (clueId) {
      byId.set(clueId, clueFit);
    }
  }
  return byId;
}

export function generateFullAnalysisFaqItems(
  input: GenerateFullAnalysisFaqItemsInput,
): FullAnalysisFaqGenerationResult {
  if (input.classification.puzzleType !== "category_membership") {
    return {
      ok: false,
      faqItems: [],
      issues: [
        makeIssue(
          "UNSUPPORTED_FAQ_PUZZLE_TYPE",
          "classification.puzzleType",
          "The local FAQ generator only supports category_membership in this PR8 slice.",
          "Keep this candidate out of local FAQ generation until a later generator supports its puzzle type.",
        ),
      ],
    };
  }

  const answerCategory = normalizeIdentityText(input.classification.answerCategory);
  if (!answerCategory) {
    return {
      ok: false,
      faqItems: [],
      issues: [
        makeIssue(
          "MISSING_FAQ_ANSWER_CATEGORY",
          "classification.answerCategory",
          "Category-membership FAQ generation needs an answer category.",
          "Run puzzle type classification before generating FAQ items.",
        ),
      ],
    };
  }

  const issues: FullAnalysisFaqGenerationIssue[] = [];
  const fitsById = clueFitById(input.clueFits);
  const orderedFits = input.l1Input.clues.flatMap((clue) => {
    const fit = fitsById.get(normalizeIdentityMatch(clue.clueId));
    return fit ? [fit] : [];
  });

  if (input.clueFits.length !== CONTENT_KITCHEN_CLUE_COUNT || orderedFits.length !== CONTENT_KITCHEN_CLUE_COUNT) {
    issues.push(
      makeIssue(
        "INCOMPLETE_FAQ_CLUE_FIT_COVERAGE",
        "clueFits",
        "FAQ generation needs exactly five clue-fit slots, one per L1 clue.",
        "Generate complete 5/5 clue-fit coverage before FAQ items.",
      ),
    );
  }

  for (let index = 0; index < orderedFits.length; index += 1) {
    const fit = orderedFits[index];
    if (!Array.isArray(fit.evidenceRefs) || fit.evidenceRefs.length === 0 || fit.evidenceRefs.some((ref) => !normalizeIdentityText(ref))) {
      issues.push(
        makeIssue(
          "MISSING_FAQ_EVIDENCE_REF",
          `clueFits[${index}].evidenceRefs`,
          "FAQ generation needs evidence refs from every clue-fit slot.",
          "Attach evidence refs to every clue-fit slot before FAQ generation.",
        ),
      );
    }
  }

  if (issues.length > 0) {
    return {
      ok: false,
      faqItems: [],
      issues,
    };
  }

  const clueTexts = input.l1Input.clues.map((clue) => normalizeIdentityText(clue.text));
  const allEvidenceRefs = unique(orderedFits.flatMap((fit) => fit.evidenceRefs));
  const firstFit = orderedFits[0];
  const firstClueText = normalizeIdentityText(firstFit.clueText) || clueTexts[0];

  const faqItems: FullAnalysisFaqSlot[] = [
    {
      question: "What is the Pinpoint answer?",
      answer: `The answer is ${answerCategory}.`,
      evidenceRefs: allEvidenceRefs,
    },
    {
      question: `Why does ${firstClueText} fit ${answerCategory}?`,
      answer: `Reviewed dictionary evidence links ${firstClueText} to ${answerCategory}.`,
      evidenceRefs: firstFit.evidenceRefs,
    },
    {
      question: `How do the clues confirm ${answerCategory}?`,
      answer: `${formatClueList(clueTexts)} all match ${answerCategory}, so the five clues point to the same answer category.`,
      evidenceRefs: allEvidenceRefs,
    },
  ];

  return {
    ok: true,
    faqItems,
  };
}
