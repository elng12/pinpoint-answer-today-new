export type PublishMode = "answer-first" | "full-analysis" | "failed";

export type PublishIssueLevel = "blocking" | "warning" | "info";

export type PublishGateIssue = {
  code: string;
  level: PublishIssueLevel;
  message: string;
  slug?: string;
  puzzleNumber?: number;
  field?: string;
  sourceConfidence?: "confirmed" | "manual" | "inferred" | "weak" | "unknown";
  publishMode?: PublishMode;
};

export type PublishGateResult = {
  ok: boolean;
  slug: string;
  puzzleNumber?: number;
  publishMode?: PublishMode;
  issues: PublishGateIssue[];
};

export declare const publishModes: PublishMode[];
export declare function isPublishMode(value: unknown): value is PublishMode;
export declare function resolvePublishMode(input?: {
  detail?: Record<string, unknown>;
  registryEntry?: Record<string, unknown>;
}): {
  mode: PublishMode;
  inferred: boolean;
  issues: PublishGateIssue[];
};
export declare function validatePublishEligibility(input?: {
  slug?: string;
  registryEntry?: Record<string, unknown>;
  detail?: Record<string, unknown>;
  expectedMode?: PublishMode;
  answerFirstPublicEnabled?: boolean;
  sourceConfidence?: "confirmed" | "manual" | "inferred" | "weak" | "unknown";
  evidenceArtifact?: Record<string, unknown> | null;
  evidenceArtifactPath?: string;
  requireEvidenceForFullAnalysis?: boolean;
  productionEvidence?: boolean;
}): PublishGateResult;
export declare function formatPublishGateIssues(issues: PublishGateIssue[]): string;
