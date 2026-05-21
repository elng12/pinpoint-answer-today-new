import type { PublishGateIssue, PublishMode } from "./publish-eligibility.shared.mjs";

export type SourceConfidence = "confirmed" | "manual" | "inferred" | "weak" | "unknown";

export type LightweightPublishFailureSummary = {
  version: 1;
  kind: "pinpoint-lightweight-publish-failure-summary";
  generatedAt: string;
  slug: string;
  logicalGameDate: string;
  puzzleNumber?: number;
  publishMode: PublishMode | "unknown";
  issueCodes: string[];
  blockingIssueCodes: string[];
  issues: Array<Pick<PublishGateIssue, "code" | "level" | "message" | "field">>;
  sourceConfidence: SourceConfidence;
  retryCount: number;
  reason: string;
  nextAction: string;
};

export type LightweightPublishFailureStreak = {
  version: 1;
  count: number;
  threshold: number;
  triggered: boolean;
  lastLogicalGameDate: string;
  lastSlug: string;
  lastPublishMode: PublishMode | "unknown";
  lastIssueCodes: string[];
  updatedAt: string;
};

export declare function buildLightweightPublishFailureSummary(input?: {
  slug?: string;
  logicalGameDate?: string;
  puzzleDate?: string;
  puzzleNumber?: number;
  publishMode?: PublishMode | "unknown";
  issues?: PublishGateIssue[];
  sourceConfidence?: SourceConfidence;
  retryCount?: number;
  reason?: string;
  nextAction?: string;
  generatedAt?: string;
}): LightweightPublishFailureSummary;

export declare function updateLightweightPublishFailureStreak(
  previous?: Partial<LightweightPublishFailureStreak> | null,
  summary?: Partial<LightweightPublishFailureSummary>,
  options?: {
    threshold?: number;
    updatedAt?: string;
  },
): LightweightPublishFailureStreak;
