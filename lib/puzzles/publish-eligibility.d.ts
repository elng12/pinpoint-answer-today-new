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

export const publishModes: PublishMode[];
export function isPublishMode(value: unknown): value is PublishMode;
export function resolvePublishMode(input?: {
  detail?: Record<string, unknown>;
  registryEntry?: Record<string, unknown>;
}): {
  mode: PublishMode;
  inferred: boolean;
  issues: PublishGateIssue[];
};
export function validatePublishEligibility(input?: {
  slug?: string;
  registryEntry?: Record<string, unknown>;
  detail?: Record<string, unknown>;
  expectedMode?: PublishMode;
  answerFirstPublicEnabled?: boolean;
  sourceConfidence?: "confirmed" | "manual" | "inferred" | "weak" | "unknown";
}): PublishGateResult;
export function formatPublishGateIssues(issues: PublishGateIssue[]): string;
