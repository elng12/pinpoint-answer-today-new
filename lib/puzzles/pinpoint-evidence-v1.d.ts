export type EvidenceSupportLevelV1 = "deterministic" | "manual" | "weak";
export type EvidenceFitConfidenceV1 = "confirmed" | "manual" | "weak";
export type EvidenceAnswerConfidenceV1 = "confirmed" | "manual" | "inferred" | "weak";
export type EvidenceTimezoneSourceV1 = "assumption" | "verified" | "manual";
export type EvidenceSourceProviderV1 = "graphql" | "manual" | "cached" | "unknown";

export type PinpointEvidenceV1Issue = {
  level: "error";
  code: string;
  message: string;
  field?: string;
};

export type PinpointEvidenceV1 = {
  schemaVersion: 1;
  slug: string;
  puzzleNumber: number;
  logicalGameDate: string;
  source: {
    provider: EvidenceSourceProviderV1;
    fetchedAt: string;
    timezone: string;
    timezoneSource: EvidenceTimezoneSourceV1;
    rawResponseHash?: string;
    rawResponse?: string;
  };
  answer: {
    value: string;
    confidence: EvidenceAnswerConfidenceV1;
    confirmedAt?: string;
  };
  clues: Array<{
    index: number;
    text: string;
    fit?: string;
    evidenceRef: string;
    supportLevel: EvidenceSupportLevelV1;
    fitConfidence: EvidenceFitConfidenceV1;
    phraseExample?: string;
  }>;
  manualReview?: {
    reviewer?: string;
    timestamp?: string;
    reason?: string;
    changedFields?: string[];
  };
};

export function isFixtureEvidencePath(path: unknown): boolean;

export function validatePinpointEvidenceV1(input?: {
  evidence?: PinpointEvidenceV1 | Record<string, unknown> | null;
  artifactPath?: string;
  production?: boolean;
  slug?: string;
  puzzleNumber?: number;
  logicalGameDate?: string;
  detail?: Record<string, unknown>;
  registryEntry?: Record<string, unknown>;
}): PinpointEvidenceV1Issue[];
