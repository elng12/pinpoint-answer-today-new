import {
  buildCanonicalSlug,
  buildCanonicalUrl,
  hashInputSnapshot,
  normalizeIdentityMatch,
  normalizeIdentityText,
} from "./identity";
import { buildCategoryMembershipEvidenceRecords } from "./dictionary";
import { validateFullAnalysisEvidence } from "./evidence";
import { validateFullAnalysisStructure } from "./full-analysis";
import {
  BLOCK_PUBLISH_POLICIES,
  DOWNGRADE_TO_ANSWER_FIRST_POLICIES,
  derivePolicies,
  FULL_ANALYSIS_PASS_POLICIES,
  FULL_ANALYSIS_REVIEW_POLICIES,
  REVIEW_POLICIES,
} from "./policies";
import {
  CONTENT_KITCHEN_CLUE_COUNT,
  type ContentCandidate,
  type ContentCandidateClue,
  type ContentKitchenEvidenceRecord,
  type ContentKitchenIssueCode,
  type L1PuzzleClue,
  type L1PuzzleInput,
  type ValidateCandidateInput,
  type ValidateCandidateOutput,
  type ValidationIssue,
  type ValidationOutcome,
  type ValidationPolicies,
} from "./types";

function makeIssue(
  issueCode: ContentKitchenIssueCode,
  fieldPath: string,
  message: string,
  suggestedAction: string,
  options: { severity?: "P0" | "P1" | "P2"; blocking?: boolean; candidateRevisionId?: string } = {},
): ValidationIssue {
  return {
    issueCode,
    severity: options.severity ?? "P0",
    fieldPath,
    message,
    suggestedAction,
    blocking: options.blocking ?? true,
    ...(options.candidateRevisionId ? { candidateRevisionId: options.candidateRevisionId } : {}),
  };
}

function output(
  outcome: ValidationOutcome,
  policies: ValidationPolicies,
  issues: ValidationIssue[],
): ValidateCandidateOutput {
  return { outcome, policies, issues };
}

function block(issue: ValidationIssue): ValidateCandidateOutput {
  return output("block_publish", BLOCK_PUBLISH_POLICIES, [issue]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactlyFiveValidL1Clues(clues: unknown): clues is L1PuzzleClue[] {
  if (!Array.isArray(clues) || clues.length !== CONTENT_KITCHEN_CLUE_COUNT) {
    return false;
  }

  const positions = new Set<number>();
  for (const clue of clues) {
    if (!isRecord(clue)) return false;
    if (!normalizeIdentityText(clue.clueId)) return false;
    if (!normalizeIdentityText(clue.text)) return false;
    if (typeof clue.position !== "number" || !Number.isInteger(clue.position)) return false;
    if (positions.has(clue.position)) return false;
    positions.add(clue.position);
  }

  return true;
}

function hasCandidateClues(clues: unknown): clues is ContentCandidateClue[] {
  return Array.isArray(clues);
}

function orderCluesByPosition<T extends { position: number }>(clues: T[]): T[] {
  return [...clues].sort((left, right) => left.position - right.position);
}

function cluesMatchL1(candidateClues: ContentCandidateClue[], l1Clues: L1PuzzleClue[]): boolean {
  if (candidateClues.length !== CONTENT_KITCHEN_CLUE_COUNT) {
    return false;
  }

  const expected = orderCluesByPosition(l1Clues);
  if (candidateClues.length !== expected.length) {
    return false;
  }

  return candidateClues.every((candidateClue, index) => {
    const expectedClue = expected[index];
    if (!expectedClue) return false;

    return (
      normalizeIdentityMatch(candidateClue.clueId) === normalizeIdentityMatch(expectedClue.clueId) &&
      normalizeIdentityMatch(candidateClue.text) === normalizeIdentityMatch(expectedClue.text) &&
      candidateClue.position === expectedClue.position
    );
  });
}

function renderedHtmlShowsAnswerAndClues(renderedHtml: string | undefined, l1Input: L1PuzzleInput): boolean {
  const normalizedHtml = normalizeIdentityMatch(renderedHtml);
  if (!normalizedHtml) {
    return false;
  }

  if (!normalizedHtml.includes(normalizeIdentityMatch(l1Input.answer))) {
    return false;
  }

  return orderCluesByPosition(l1Input.clues).every((clue) => {
    return normalizedHtml.includes(normalizeIdentityMatch(clue.text));
  });
}

function renderedHtmlHasNoindex(renderedHtml: string | undefined): boolean {
  const normalizedHtml = normalizeIdentityMatch(renderedHtml);
  return Boolean(normalizedHtml && normalizedHtml.includes("noindex"));
}

function isContentMode(value: unknown): value is ContentCandidate["contentMode"] {
  return value === "answer-first" || value === "full-analysis";
}

function resolveEvidenceRecords(
  input: ValidateCandidateInput,
  candidate: Partial<ContentCandidate>,
  l1Input: L1PuzzleInput,
): Partial<ContentKitchenEvidenceRecord>[] | undefined {
  if (Array.isArray(input.evidenceRecords) && input.evidenceRecords.length > 0) {
    return input.evidenceRecords;
  }

  const categoryMembership = input.dictionaries?.categoryMembership;
  const category = normalizeIdentityText(candidate.answerCategory || candidate.answer);
  if (!categoryMembership || !category) {
    return input.evidenceRecords;
  }

  const dictionaryEvidence = buildCategoryMembershipEvidenceRecords({
    l1Input,
    category,
    dictionary: categoryMembership,
  });

  return dictionaryEvidence.length > 0 ? dictionaryEvidence : input.evidenceRecords;
}

export function validateCandidate(input: ValidateCandidateInput): ValidateCandidateOutput {
  const l1Input = input.l1Input;
  const candidate = input.candidate;
  const candidateRevisionId = normalizeIdentityText(candidate?.revisionId);

  if (!l1Input || !isRecord(l1Input)) {
    return block(
      makeIssue("MISSING_L1_INPUT", "l1Input", "L1 input is missing.", "Provide L1 input."),
    );
  }

  if (!normalizeIdentityText(l1Input.answer)) {
    return block(
      makeIssue("INVALID_L1_INPUT", "l1Input.answer", "L1 answer is missing.", "Provide a non-empty L1 answer."),
    );
  }

  if (!hasExactlyFiveValidL1Clues(l1Input.clues)) {
    return block(
      makeIssue(
        "INVALID_L1_INPUT",
        "l1Input.clues",
        "L1 must contain exactly five valid clues with unique positions.",
        "Fix L1 clue ids, text, count, or positions.",
      ),
    );
  }

  if (!normalizeIdentityText(l1Input.puzzleId) || !normalizeIdentityText(l1Input.logicalGameDate) || !normalizeIdentityText(l1Input.source)) {
    return block(
      makeIssue(
        "INVALID_L1_INPUT",
        "l1Input",
        "L1 puzzleId, logicalGameDate, and source are required.",
        "Fix L1 identity fields.",
      ),
    );
  }

  const validatedL1 = l1Input as L1PuzzleInput;

  if (!candidate || !isRecord(candidate)) {
    return block(
      makeIssue("INVALID_CANDIDATE_METADATA", "candidate", "Candidate is missing.", "Provide a candidate."),
    );
  }

  if (!isContentMode(candidate.contentMode)) {
    return block(
      makeIssue(
        "INVALID_CANDIDATE_METADATA",
        "candidate.contentMode",
        "Candidate contentMode is unsupported.",
        "Use answer-first or full-analysis.",
        { candidateRevisionId },
      ),
    );
  }

  if (!normalizeIdentityText(candidate.revisionId)) {
    return block(
      makeIssue(
        "INVALID_CANDIDATE_METADATA",
        "candidate.revisionId",
        "Candidate revisionId is missing.",
        "Provide a non-empty revisionId.",
      ),
    );
  }

  if (!normalizeIdentityText(candidate.contentHash)) {
    return block(
      makeIssue(
        "INVALID_CANDIDATE_METADATA",
        "candidate.contentHash",
        "Candidate contentHash is missing.",
        "Provide a non-empty contentHash.",
        { candidateRevisionId },
      ),
    );
  }

  if (normalizeIdentityMatch(candidate.puzzleId) !== normalizeIdentityMatch(validatedL1.puzzleId)) {
    return block(
      makeIssue(
        "CANDIDATE_L1_MISMATCH",
        "candidate.puzzleId",
        "Candidate puzzleId does not match L1 puzzleId.",
        "Regenerate the candidate from the current L1 input.",
        { candidateRevisionId },
      ),
    );
  }

  const expectedSlug = buildCanonicalSlug(validatedL1);
  if (normalizeIdentityText(candidate.slug) !== expectedSlug) {
    return block(
      makeIssue(
        "CANONICAL_URL_MISMATCH",
        "candidate.slug",
        "Candidate slug does not match the L1-derived slug.",
        "Use buildCanonicalSlug(l1Input).",
        { candidateRevisionId },
      ),
    );
  }

  const expectedCanonicalUrl = buildCanonicalUrl(input.canonicalConfig, expectedSlug);
  if (normalizeIdentityText(candidate.canonicalUrl) !== expectedCanonicalUrl) {
    return block(
      makeIssue(
        "CANONICAL_URL_MISMATCH",
        "candidate.canonicalUrl",
        "Candidate canonical URL does not match the L1-derived canonical URL.",
        "Use buildCanonicalUrl(canonicalConfig, expectedSlug).",
        { candidateRevisionId },
      ),
    );
  }

  if (normalizeIdentityMatch(candidate.answer) !== normalizeIdentityMatch(validatedL1.answer)) {
    return block(
      makeIssue(
        "CANDIDATE_L1_MISMATCH",
        "candidate.answer",
        "Candidate answer does not match L1 answer.",
        "Regenerate the candidate from the current L1 input.",
        { candidateRevisionId },
      ),
    );
  }

  if (!hasCandidateClues(candidate.clues) || !cluesMatchL1(candidate.clues, validatedL1.clues)) {
    return block(
      makeIssue(
        "CANDIDATE_L1_MISMATCH",
        "candidate.clues",
        "Candidate clues do not match L1 clues and order.",
        "Regenerate the candidate from the current L1 input.",
        { candidateRevisionId },
      ),
    );
  }

  const expectedInputSnapshotHash = hashInputSnapshot(validatedL1);
  if (normalizeIdentityText(candidate.inputSnapshotHash) !== expectedInputSnapshotHash) {
    return block(
      makeIssue(
        "CANDIDATE_L1_MISMATCH",
        "candidate.inputSnapshotHash",
        "Candidate inputSnapshotHash does not match the recomputed L1 hash.",
        "Regenerate the candidate from the current L1 input.",
        { candidateRevisionId },
      ),
    );
  }

  const preliminaryPolicies = derivePolicies(input);
  if (
    preliminaryPolicies.indexPolicy === "noindex" &&
    normalizeIdentityText(input.renderedHtml) &&
    !renderedHtmlHasNoindex(input.renderedHtml)
  ) {
    return block(
      makeIssue(
        "NOINDEX_REQUIRED_BUT_MISSING",
        "renderedHtml",
        "Candidate requires noindex, but rendered HTML proof does not contain a noindex marker.",
        "Add a noindex marker or do not provide rendered HTML proof for this candidate yet.",
        { candidateRevisionId },
      ),
    );
  }

  if (preliminaryPolicies.indexPolicy === "index" && !renderedHtmlShowsAnswerAndClues(input.renderedHtml, validatedL1)) {
    return output("requires_review", REVIEW_POLICIES, [
      makeIssue(
        "ANSWER_HIDDEN_FROM_RENDERED_HTML",
        "renderedHtml",
        "Indexable candidate lacks rendered HTML proof for the answer and all five clues.",
        "Provide renderedHtml proof or keep the page non-indexable.",
        { blocking: false, candidateRevisionId },
      ),
    ]);
  }

  if (candidate.contentMode === "full-analysis") {
    const structureIssues = validateFullAnalysisStructure({
      candidate,
      l1Input: validatedL1,
      renderedHtml: input.renderedHtml,
      existingRoutes: input.existingRoutes,
    });

    if (structureIssues.length > 0) {
      return output("downgrade_to_answer_first", DOWNGRADE_TO_ANSWER_FIRST_POLICIES, structureIssues);
    }

    if (!renderedHtmlShowsAnswerAndClues(input.renderedHtml, validatedL1)) {
      return output("requires_review", FULL_ANALYSIS_REVIEW_POLICIES, [
        makeIssue(
          "ANSWER_HIDDEN_FROM_RENDERED_HTML",
          "renderedHtml",
          "Indexable full-analysis candidate lacks rendered HTML proof for the answer and all five clues.",
          "Provide renderedHtml proof before indexing full-analysis.",
          { blocking: false, candidateRevisionId },
        ),
      ]);
    }

    const evidenceIssues = validateFullAnalysisEvidence({
      candidate,
      l1Input: validatedL1,
      evidenceRecords: resolveEvidenceRecords(input, candidate, validatedL1),
    });

    if (evidenceIssues.length > 0) {
      return output("requires_review", FULL_ANALYSIS_REVIEW_POLICIES, evidenceIssues);
    }

    return output("pass_full_analysis", FULL_ANALYSIS_PASS_POLICIES, []);
  }

  return output("pass_answer_first", preliminaryPolicies, []);
}
