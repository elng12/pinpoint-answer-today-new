export type VercelProductionDeploymentState =
  | "missing"
  | "building"
  | "ready"
  | "failed"
  | "unknown";

export type JsonRecord = Record<string, unknown>;

export function selectVercelProductionDeployment(
  deployments: unknown,
  expectedSha: string,
): JsonRecord | null;

export function selectLatestVercelDeploymentStatus(statuses: unknown): JsonRecord | null;

export function resolveVercelProductionDeploymentSnapshot(input: {
  deployments: unknown;
  statuses: unknown;
  expectedSha: string;
}): {
  state: VercelProductionDeploymentState;
  deployment: JsonRecord | null;
  status: JsonRecord | null;
};

export function hasUsedVercelProductionRetry(marker: unknown, candidateSha: string): boolean;

export function buildVercelProductionRetryMarker(input: {
  candidateBranch: string;
  candidateSha: string;
  previousProductionSha: string;
  requestedAt: string;
}): {
  version: 1;
  candidateBranch: string;
  candidateSha: string;
  previousProductionSha: string;
  requestedAt: string;
};

export function canClosePinpointCandidateRelease(input: {
  productionState: VercelProductionDeploymentState;
  publicAuditOutcome: string;
}): boolean;
