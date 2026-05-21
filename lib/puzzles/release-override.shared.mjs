const DISALLOWED_OVERRIDE_CODES = new Set([
  "answer.missing",
  "answer.unconfirmed",
  "clues.countMismatch",
  "evidence.missingArtifact",
  "evidence.fixtureInProduction",
  "publishMode.failedPublicPayload",
  "slug.missing",
  "puzzleNumber.missing",
]);

function normalizeString(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function pushIssue(issues, code, message, field) {
  issues.push({
    level: "blocking",
    code,
    message,
    ...(field ? { field } : {}),
  });
}

function parseTime(value) {
  const normalized = normalizeString(value);
  if (!normalized) return Number.NaN;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

export function validateReleaseOverrideDryRun(input = {}) {
  const override = input.override && typeof input.override === "object" ? input.override : {};
  const activeIssueCodes = new Set(
    (Array.isArray(input.activeIssueCodes) ? input.activeIssueCodes : [])
      .map((code) => normalizeString(code))
      .filter(Boolean),
  );
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  const issues = [];

  const slug = normalizeString(override.slug);
  const reviewer = normalizeString(override.reviewer);
  const reason = normalizeString(override.reason);
  const createdAt = normalizeString(override.createdAt);
  const expiresAt = normalizeString(override.expiresAt);
  const issueCodes = Array.isArray(override.issueCodes)
    ? override.issueCodes.map((code) => normalizeString(code)).filter(Boolean)
    : [];

  if (!slug) {
    pushIssue(issues, "override.slugMissing", "override.slug is required", "slug");
  }
  if (input.slug && slug && slug !== normalizeString(input.slug)) {
    pushIssue(issues, "override.slugMismatch", "override.slug must match the dry-run target slug", "slug");
  }
  if (issueCodes.length === 0) {
    pushIssue(issues, "override.issueCodesMissing", "override.issueCodes must list at least one issue code", "issueCodes");
  }
  if (!reviewer) {
    pushIssue(issues, "override.reviewerMissing", "override.reviewer is required", "reviewer");
  }
  if (!reason) {
    pushIssue(issues, "override.reasonMissing", "override.reason is required", "reason");
  }
  if (!createdAt) {
    pushIssue(issues, "override.createdAtMissing", "override.createdAt is required", "createdAt");
  }
  if (!expiresAt) {
    pushIssue(issues, "override.expiresAtMissing", "override.expiresAt is required", "expiresAt");
  }

  const createdAtMs = parseTime(createdAt);
  const expiresAtMs = parseTime(expiresAt);
  if (createdAt && !Number.isFinite(createdAtMs)) {
    pushIssue(issues, "override.createdAtInvalid", "override.createdAt must be a valid timestamp", "createdAt");
  }
  if (expiresAt && !Number.isFinite(expiresAtMs)) {
    pushIssue(issues, "override.expiresAtInvalid", "override.expiresAt must be a valid timestamp", "expiresAt");
  }
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs) {
    pushIssue(issues, "override.expired", "override.expiresAt is already expired", "expiresAt");
  }
  if (Number.isFinite(createdAtMs) && Number.isFinite(expiresAtMs) && expiresAtMs - createdAtMs > 48 * 60 * 60 * 1000) {
    pushIssue(issues, "override.tooLong", "override expiresAt must be within 48 hours of createdAt", "expiresAt");
  }

  for (const code of issueCodes) {
    if (activeIssueCodes.size > 0 && !activeIssueCodes.has(code)) {
      pushIssue(issues, "override.issueCodeMismatch", `override issue code is not active: ${code}`, "issueCodes");
    }
    if (DISALLOWED_OVERRIDE_CODES.has(code)) {
      pushIssue(issues, "override.disallowedIssueCode", `issue code cannot be overridden: ${code}`, "issueCodes");
    }
  }

  return {
    ok: issues.length === 0,
    productionEffective: false,
    issues,
  };
}

export const disallowedReleaseOverrideCodes = Array.from(DISALLOWED_OVERRIDE_CODES);
