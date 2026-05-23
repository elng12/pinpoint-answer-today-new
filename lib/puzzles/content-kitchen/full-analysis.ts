import { normalizeIdentityMatch, normalizeIdentityText } from "./identity";
import {
  CONTENT_KITCHEN_CLUE_COUNT,
  type ContentCandidate,
  type ContentKitchenIssueCode,
  type FullAnalysisClueRowCandidate,
  type FullAnalysisReasoning,
  type L1PuzzleInput,
  type ValidationIssue,
} from "./types";

type FullAnalysisStructureInput = {
  candidate: Partial<ContentCandidate>;
  l1Input: L1PuzzleInput;
  renderedHtml?: string;
  existingRoutes?: string[];
};

type IssueOptions = {
  severity?: "P0" | "P1" | "P2";
  blocking?: boolean;
  candidateRevisionId?: string;
};

const GENERIC_REASONING_PATTERNS = [
  /\ball clues point to the same\b/i,
  /\blook at all (the )?clues\b/i,
  /\bthe answer becomes clear\b/i,
  /\bshared category\b/i,
  /\bcommon theme\b/i,
  /\bthey all fit\b/i,
];

function makeIssue(
  issueCode: ContentKitchenIssueCode,
  fieldPath: string,
  message: string,
  suggestedAction: string,
  options: IssueOptions = {},
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function hasStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => normalizeIdentityText(item));
}

function l1ClueIds(l1Input: L1PuzzleInput): Set<string> {
  return new Set(l1Input.clues.map((clue) => normalizeIdentityMatch(clue.clueId)));
}

function getL1ClueText(l1Input: L1PuzzleInput, clueId: string): string {
  const normalizedId = normalizeIdentityMatch(clueId);
  return normalizeIdentityText(
    l1Input.clues.find((clue) => normalizeIdentityMatch(clue.clueId) === normalizedId)?.text,
  );
}

function visibleInRenderedHtml(renderedHtml: string | undefined, value: string): boolean {
  const normalizedHtml = normalizeIdentityMatch(renderedHtml);
  return Boolean(normalizedHtml && normalizedHtml.includes(normalizeIdentityMatch(value)));
}

function validateClueRows(input: FullAnalysisStructureInput): ValidationIssue | null {
  const rows = input.candidate.clueRows;
  const candidateRevisionId = normalizeIdentityText(input.candidate.revisionId);

  if (!Array.isArray(rows) || rows.length < CONTENT_KITCHEN_CLUE_COUNT) {
    return makeIssue(
      "MISSING_CLUE_ROW",
      "candidate.clueRows",
      "Full-analysis must contain exactly five clue rows.",
      "Add one clue row for every L1 clue.",
      { candidateRevisionId },
    );
  }

  const knownL1Ids = l1ClueIds(input.l1Input);
  const seenIds = new Set<string>();

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] as Partial<FullAnalysisClueRowCandidate> | undefined;
    const fieldPath = `candidate.clueRows[${index}]`;

    if (!isRecord(row)) {
      return makeIssue(
        "MISSING_CLUE_ROW",
        fieldPath,
        "Clue row must be an object.",
        "Regenerate the full-analysis clue rows.",
        { candidateRevisionId },
      );
    }

    const clueId = normalizeIdentityText(row.clueId);
    const normalizedClueId = normalizeIdentityMatch(clueId);
    if (!clueId || !knownL1Ids.has(normalizedClueId)) {
      return makeIssue(
        "MISSING_CLUE_ROW",
        `${fieldPath}.clueId`,
        "Clue row must point to one known L1 clue id.",
        "Use the exact L1 clue id for each row.",
        { candidateRevisionId },
      );
    }

    if (seenIds.has(normalizedClueId)) {
      return makeIssue(
        "DUPLICATE_CLUE_ROW",
        `${fieldPath}.clueId`,
        "A clue id appears in more than one full-analysis row.",
        "Keep exactly one row per L1 clue.",
        { candidateRevisionId },
      );
    }
    seenIds.add(normalizedClueId);

    const rowClueText = normalizeIdentityText(row.clueText);
    if (rowClueText && normalizeIdentityMatch(rowClueText) !== normalizeIdentityMatch(getL1ClueText(input.l1Input, clueId))) {
      return makeIssue(
        "CANDIDATE_L1_MISMATCH",
        `${fieldPath}.clueText`,
        "Clue row text does not match the L1 clue text.",
        "Use the exact L1 clue text for this row.",
        { candidateRevisionId },
      );
    }

    if (!normalizeIdentityText(row.fit) || !normalizeIdentityText(row.whyItSupportsAnswer)) {
      return makeIssue(
        "MISSING_CLUE_ROW",
        fieldPath,
        "Every clue row needs fit and whyItSupportsAnswer.",
        "Add non-empty fit and whyItSupportsAnswer fields.",
        { candidateRevisionId },
      );
    }

    if (!hasStringArray(row.evidenceRefs)) {
      return makeIssue(
        "MISSING_EVIDENCE_REF",
        `${fieldPath}.evidenceRefs`,
        "Every clue row needs at least one evidence ref string.",
        "Add evidenceRefs as non-empty strings. PR7 will check source quality.",
        { candidateRevisionId },
      );
    }
  }

  if (rows.length > CONTENT_KITCHEN_CLUE_COUNT) {
    return makeIssue(
      "DUPLICATE_CLUE_ROW",
      "candidate.clueRows",
      "Full-analysis has more than five clue rows.",
      "Keep exactly one row per L1 clue.",
      { candidateRevisionId },
    );
  }

  for (const clue of input.l1Input.clues) {
    if (!seenIds.has(normalizeIdentityMatch(clue.clueId))) {
      return makeIssue(
        "MISSING_CLUE_ROW",
        "candidate.clueRows",
        "Full-analysis is missing an L1 clue row.",
        "Add one clue row for every L1 clue.",
        { candidateRevisionId },
      );
    }
  }

  return null;
}

function validateReasoning(input: FullAnalysisStructureInput): ValidationIssue | null {
  const reasoning = input.candidate.reasoning as Partial<FullAnalysisReasoning> | undefined;
  const candidateRevisionId = normalizeIdentityText(input.candidate.revisionId);

  if (!isRecord(reasoning)) {
    return makeIssue(
      "MISSING_REASONING_PATTERN",
      "candidate.reasoning",
      "Full-analysis reasoning is missing.",
      "Add turning_point or cumulative_confirmation reasoning.",
      { candidateRevisionId },
    );
  }

  const text = normalizeIdentityText(reasoning.text);
  const generic = !text || countWords(text) < 12 || GENERIC_REASONING_PATTERNS.some((pattern) => pattern.test(text));
  if (generic) {
    return makeIssue(
      "GENERIC_REASONING_PATTERN",
      "candidate.reasoning.text",
      "Reasoning text is too generic for full-analysis.",
      "Explain the actual clue path with specific clue ids.",
      { severity: "P1", candidateRevisionId },
    );
  }

  const knownL1Ids = l1ClueIds(input.l1Input);
  if (reasoning.pattern === "turning_point") {
    const clueId = normalizeIdentityText(reasoning.clueId);
    if (!clueId || !knownL1Ids.has(normalizeIdentityMatch(clueId))) {
      return makeIssue(
        "UNSUPPORTED_REASONING_PATTERN",
        "candidate.reasoning.clueId",
        "Turning-point reasoning must name exactly one known L1 clue id.",
        "Use one L1 clue id as the turning point.",
        { candidateRevisionId },
      );
    }

    if (!normalizeIdentityText(reasoning.brokenTheory) || !normalizeIdentityText(reasoning.supportedTheory)) {
      return makeIssue(
        "UNSUPPORTED_REASONING_PATTERN",
        "candidate.reasoning",
        "Turning-point reasoning needs brokenTheory and supportedTheory.",
        "Add both theory fields.",
        { candidateRevisionId },
      );
    }

    return null;
  }

  if (reasoning.pattern === "cumulative_confirmation") {
    const clueIds = Array.isArray(reasoning.clueIds) ? reasoning.clueIds.map(normalizeIdentityText).filter(Boolean) : [];
    const uniqueKnownIds = new Set(clueIds.map(normalizeIdentityMatch).filter((clueId) => knownL1Ids.has(clueId)));
    if (uniqueKnownIds.size < 2) {
      return makeIssue(
        "UNSUPPORTED_REASONING_PATTERN",
        "candidate.reasoning.clueIds",
        "Cumulative-confirmation reasoning needs at least two known L1 clue ids.",
        "Reference at least two L1 clue ids.",
        { candidateRevisionId },
      );
    }

    return null;
  }

  return makeIssue(
    "UNSUPPORTED_REASONING_PATTERN",
    "candidate.reasoning.pattern",
    "Reasoning pattern must be turning_point or cumulative_confirmation.",
    "Use a supported reasoning pattern.",
    { candidateRevisionId },
  );
}

function validateFaq(input: FullAnalysisStructureInput): ValidationIssue | null {
  const faqItems = input.candidate.faqItems;
  const candidateRevisionId = normalizeIdentityText(input.candidate.revisionId);

  if (Array.isArray(faqItems) && faqItems.length > 0) {
    if (faqItems.length < 2 || faqItems.length > 4) {
      return makeIssue(
        "INVALID_FAQ_STRUCTURE",
        "candidate.faqItems",
        "Full-analysis FAQ items must be 2 to 4 when present.",
        "Keep 2 to 4 specific FAQ items or omit FAQ items.",
        { severity: "P1", candidateRevisionId },
      );
    }
  }

  const schemaTypes = Array.isArray(input.candidate.schemaTypes) ? input.candidate.schemaTypes : [];
  const hasFaqSchema = schemaTypes.some((schemaType) => normalizeIdentityMatch(schemaType) === "faqpage");
  if (!hasFaqSchema) {
    return null;
  }

  if (!Array.isArray(faqItems) || faqItems.length === 0) {
    return makeIssue(
      "FAQ_SCHEMA_WITHOUT_VISIBLE_FAQ",
      "candidate.schemaTypes",
      "FAQPage schema requires visible FAQ content.",
      "Remove FAQPage schema or render matching FAQ content.",
      { candidateRevisionId },
    );
  }

  const visible = faqItems.every((item) => {
    return visibleInRenderedHtml(input.renderedHtml, item.question) && visibleInRenderedHtml(input.renderedHtml, item.answer);
  });

  if (!visible) {
    return makeIssue(
      "FAQ_SCHEMA_WITHOUT_VISIBLE_FAQ",
      "renderedHtml",
      "FAQPage schema is present but matching FAQ content is not visible.",
      "Render the FAQ question and answer text or remove FAQPage schema.",
      { candidateRevisionId },
    );
  }

  return null;
}

function validateInternalLinks(input: FullAnalysisStructureInput): ValidationIssue | null {
  const internalLinks = input.candidate.internalLinks;
  const candidateRevisionId = normalizeIdentityText(input.candidate.revisionId);
  const existingRoutes = Array.isArray(input.existingRoutes) ? new Set(input.existingRoutes) : null;

  if (!Array.isArray(internalLinks)) {
    return null;
  }

  for (let index = 0; index < internalLinks.length; index += 1) {
    const link = internalLinks[index];
    const href = normalizeIdentityText(link?.href);
    const fieldPath = `candidate.internalLinks[${index}].href`;
    const routeShaped = href.startsWith("/") && !href.startsWith("//") && !/^https?:\/\//i.test(href);

    if (!routeShaped) {
      return makeIssue(
        "INTERNAL_LINK_BROKEN",
        fieldPath,
        "Internal link must be a route-shaped path.",
        "Use a local route path that starts with one slash.",
        { severity: "P1", candidateRevisionId },
      );
    }

    if (existingRoutes && !existingRoutes.has(href)) {
      return makeIssue(
        "INTERNAL_LINK_BROKEN",
        fieldPath,
        "Internal link target is not in the provided route index.",
        "Use an existing public route or update the route index.",
        { severity: "P1", candidateRevisionId },
      );
    }
  }

  return null;
}

export function validateFullAnalysisStructure(input: FullAnalysisStructureInput): ValidationIssue[] {
  const validators = [validateClueRows, validateReasoning, validateFaq, validateInternalLinks];
  for (const validator of validators) {
    const issue = validator(input);
    if (issue) {
      return [issue];
    }
  }

  return [];
}
