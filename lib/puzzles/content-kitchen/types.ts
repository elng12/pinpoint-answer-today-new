export const CONTENT_KITCHEN_CLUE_COUNT = 5;

export type ContentMode = "answer-first" | "full-analysis";

export type ValidationOutcome =
  | "pass_full_analysis"
  | "pass_answer_first"
  | "downgrade_to_answer_first"
  | "requires_review"
  | "block_publish";

export type IndexPolicy = "index" | "noindex" | "review_required" | "block_publish";
export type SitemapPolicy = "include" | "exclude" | "include_after_audit";
export type SchemaPolicy = "none" | "article_only";
export type InternalLinkPolicy = "normal" | "deemphasized" | "hidden_from_recent";

export type RequiredAction =
  | "none"
  | "enrich"
  | "review"
  | "block_publish"
  | "degrade"
  | "create_fix_task";

export type DegradationAction =
  | "remove_faq_schema"
  | "apply_noindex"
  | "remove_from_sitemap"
  | "hide_from_recent"
  | "create_fix_task";

export type Pr6aIssueCode =
  | "MISSING_L1_INPUT"
  | "INVALID_L1_INPUT"
  | "INVALID_CANDIDATE_METADATA"
  | "CANDIDATE_L1_MISMATCH"
  | "CANONICAL_URL_MISMATCH"
  | "ANSWER_HIDDEN_FROM_RENDERED_HTML"
  | "NOINDEX_REQUIRED_BUT_MISSING"
  | "FULL_ANALYSIS_STRUCTURE_NOT_VALIDATED";

export type ContentKitchenIssueSeverity = "P0" | "P1" | "P2";

export type CanonicalConfig = {
  siteBaseUrl: string;
  detailRoutePrefix: "/linkedin-pinpoint-answers";
  trailingSlash: true;
};

export type L1PuzzleClue = {
  clueId: string;
  text: string;
  position: number;
};

export type L1PuzzleInput = {
  puzzleId: string;
  puzzleNumber?: number;
  logicalGameDate: string;
  source: string;
  capturedAt?: string;
  inputSnapshotHash?: string;
  answer: string;
  clues: L1PuzzleClue[];
};

export type ContentCandidateClue = {
  clueId: string;
  text: string;
  position: number;
};

export type ContentCandidate = {
  puzzleId: string;
  slug: string;
  canonicalUrl: string;
  contentMode: ContentMode;
  revisionId: string;
  inputSnapshotHash: string;
  contentHash: string;
  answer: string;
  clues: ContentCandidateClue[];
  summary?: string;
};

export type ValidationIssue = {
  issueCode: Pr6aIssueCode;
  severity: ContentKitchenIssueSeverity;
  fieldPath: string;
  message: string;
  suggestedAction: string;
  blocking: boolean;
  candidateRevisionId?: string;
};

export type ValidationPolicies = {
  indexPolicy: IndexPolicy;
  sitemapPolicy: SitemapPolicy;
  schemaPolicy: SchemaPolicy;
  internalLinkPolicy: InternalLinkPolicy;
  requiredAction: RequiredAction;
  degradationActions?: DegradationAction[];
};

export type ValidateCandidateInput = {
  l1Input?: Partial<L1PuzzleInput> | null;
  candidate?: Partial<ContentCandidate> | null;
  canonicalConfig: CanonicalConfig;
  renderedHtml?: string;
  allowAnswerFirstIndex?: boolean;
};

export type ValidateCandidateOutput = {
  outcome: ValidationOutcome;
  policies: ValidationPolicies;
  issues: ValidationIssue[];
};
