function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function timestampOf(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeEnvironment(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeSha(value) {
  return String(value || "").trim().toLowerCase();
}

export function selectVercelProductionDeployment(deployments, expectedSha) {
  const normalizedSha = normalizeSha(expectedSha);
  if (!normalizedSha || !Array.isArray(deployments)) return null;

  return deployments
    .map(asRecord)
    .filter(Boolean)
    .filter((deployment) => (
      normalizeSha(deployment.sha) === normalizedSha &&
      normalizeEnvironment(deployment.environment) === "production"
    ))
    .sort((left, right) => (
      timestampOf(right.created_at) - timestampOf(left.created_at) ||
      Number(right.id || 0) - Number(left.id || 0)
    ))[0] || null;
}

export function selectLatestVercelDeploymentStatus(statuses) {
  if (!Array.isArray(statuses)) return null;

  return statuses
    .map(asRecord)
    .filter(Boolean)
    .sort((left, right) => (
      timestampOf(right.created_at) - timestampOf(left.created_at) ||
      Number(right.id || 0) - Number(left.id || 0)
    ))[0] || null;
}

export function resolveVercelProductionDeploymentSnapshot({
  deployments,
  statuses,
  expectedSha,
}) {
  const deployment = selectVercelProductionDeployment(deployments, expectedSha);
  if (!deployment) {
    return { state: "missing", deployment: null, status: null };
  }

  const status = selectLatestVercelDeploymentStatus(statuses);
  const rawState = String(status?.state || "").trim().toLowerCase();
  let state = "unknown";
  if (rawState === "queued" || rawState === "pending" || rawState === "in_progress") {
    state = "building";
  } else if (rawState === "success") {
    state = "ready";
  } else if (rawState === "failure" || rawState === "error") {
    state = "failed";
  }

  return { state, deployment, status };
}

export function hasUsedVercelProductionRetry(marker, candidateSha) {
  const record = asRecord(marker);
  return normalizeSha(record?.candidateSha) === normalizeSha(candidateSha);
}

export function buildVercelProductionRetryMarker({
  candidateBranch,
  candidateSha,
  previousProductionSha,
  requestedAt,
}) {
  return {
    version: 1,
    candidateBranch: String(candidateBranch || "").trim(),
    candidateSha: String(candidateSha || "").trim(),
    previousProductionSha: String(previousProductionSha || "").trim(),
    requestedAt: String(requestedAt || "").trim(),
  };
}

export function canClosePinpointCandidateRelease({ productionState, publicAuditOutcome }) {
  return productionState === "ready" && publicAuditOutcome === "published_and_audit_passed";
}
