export const deploymentStates = ["none", "queued", "building", "ready", "failed", "unknown"];
export const releaseQueueActions = ["push-production", "write-candidate", "hold-review"];

const DEFAULT_SLA_WINDOW_MINUTES = 60;

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeState(value) {
  const normalized = normalizeString(value);
  return deploymentStates.includes(normalized) ? normalized : "unknown";
}

function normalizeBoolean(value) {
  return value === true;
}

function parseTimeMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = normalizeString(value);
  if (!normalized) return Number.NaN;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeWindowMinutes(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SLA_WINDOW_MINUTES;
}

function makeDecision(action, reasonCode, input, extra = {}) {
  const deploymentState = normalizeState(input.deploymentState);
  const slug = normalizeString(input.slug);
  const logicalGameDate = normalizeString(input.logicalGameDate);
  const publishMode = normalizeString(input.publishMode || "unknown");
  const candidateBranch =
    normalizeString(input.candidateBranch) ||
    (slug && logicalGameDate ? `pinpoint/candidate/${logicalGameDate}-${slug}` : "");

  return {
    action,
    reasonCode,
    productionPushSkipped: action !== "push-production",
    notificationFields: {
      slug,
      logicalGameDate,
      publishMode,
      deploymentState,
      action,
      reasonCode,
      candidateBranch,
      ...(extra.remainingWindowMs !== undefined ? { remainingWindowMs: extra.remainingWindowMs } : {}),
    },
  };
}

export function decidePinpointReleaseQueueAction(input = {}) {
  const deploymentState = normalizeState(input.deploymentState);
  const nowMs = parseTimeMs(input.nowMs);
  const clockMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const lastProductionPushMs = parseTimeMs(input.lastProductionPushAt);
  const windowMs = normalizeWindowMinutes(input.slaWindowMinutes) * 60 * 1000;
  const recentProductionPush =
    Number.isFinite(lastProductionPushMs) &&
    lastProductionPushMs <= clockMs &&
    clockMs - lastProductionPushMs < windowMs;
  const remainingWindowMs = recentProductionPush ? windowMs - (clockMs - lastProductionPushMs) : 0;

  if (input.localGatesPassed === false) {
    return makeDecision("hold-review", "local-gates-failed", { ...input, deploymentState });
  }

  if (deploymentState === "failed") {
    return makeDecision("hold-review", "production-deployment-failed", { ...input, deploymentState });
  }

  if (deploymentState === "queued" || deploymentState === "building") {
    return makeDecision("write-candidate", `production-deployment-${deploymentState}`, { ...input, deploymentState });
  }

  if (deploymentState === "unknown") {
    return makeDecision("write-candidate", "production-deployment-unknown", { ...input, deploymentState });
  }

  if (recentProductionPush && !normalizeBoolean(input.overrideSecondProductionPush)) {
    return makeDecision(
      "write-candidate",
      "production-push-budget-exhausted",
      { ...input, deploymentState },
      { remainingWindowMs },
    );
  }

  if (
    deploymentState === "ready" &&
    normalizeBoolean(input.candidateBranchExists) &&
    !normalizeBoolean(input.candidateIsCurrent)
  ) {
    return makeDecision("write-candidate", "candidate-branch-outdated", { ...input, deploymentState });
  }

  if (
    deploymentState === "ready" &&
    normalizeBoolean(input.candidateBranchExists) &&
    !normalizeBoolean(input.allowCandidatePromotion)
  ) {
    return makeDecision("write-candidate", "candidate-branch-awaiting-promotion", { ...input, deploymentState });
  }

  return makeDecision("push-production", "production-push-allowed", { ...input, deploymentState });
}
