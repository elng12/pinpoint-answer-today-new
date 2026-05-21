const sourceConfidenceValues = new Set(["confirmed", "manual", "inferred", "weak", "unknown"]);

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeSourceConfidence(value) {
  const normalized = normalizeString(value);
  return sourceConfidenceValues.has(normalized) ? normalized : "unknown";
}

function normalizeIssue(issue) {
  const row = issue && typeof issue === "object" ? issue : {};
  const code = normalizeString(row.code) || "publishGate.unknown";
  const level = normalizeString(row.level) || "blocking";
  const message = normalizeString(row.message) || code;
  return {
    code,
    level,
    message,
    ...(normalizeString(row.field) ? { field: normalizeString(row.field) } : {}),
  };
}

function normalizeIssueCodes(issues) {
  const codes = [];
  for (const issue of Array.isArray(issues) ? issues : []) {
    const code = normalizeString(issue?.code);
    if (code && !codes.includes(code)) {
      codes.push(code);
    }
  }
  return codes;
}

export function buildLightweightPublishFailureSummary(input = {}) {
  const issues = (Array.isArray(input.issues) ? input.issues : []).map(normalizeIssue);
  const blockingIssues = issues.filter((issue) => issue.level === "blocking" || issue.level === "error");
  const issueCodes = normalizeIssueCodes(issues);
  const blockingIssueCodes = normalizeIssueCodes(blockingIssues);
  const slug = normalizeString(input.slug);
  const logicalGameDate = normalizeString(input.logicalGameDate || input.puzzleDate);
  const publishMode = normalizeString(input.publishMode) || "unknown";
  const sourceConfidence = normalizeSourceConfidence(input.sourceConfidence);
  const reason = normalizeString(input.reason) || "publish eligibility blocked";
  const nextAction =
    normalizeString(input.nextAction) ||
    (blockingIssueCodes.length > 0
      ? "review payload against publish eligibility issue codes before retrying public write"
      : "review publish failure summary before retrying public write");
  const retryCount = Number.isFinite(input.retryCount) && input.retryCount >= 0
    ? Math.floor(input.retryCount)
    : 0;
  const puzzleNumber = Number(input.puzzleNumber);

  return {
    version: 1,
    kind: "pinpoint-lightweight-publish-failure-summary",
    generatedAt: normalizeString(input.generatedAt) || new Date().toISOString(),
    slug,
    logicalGameDate,
    ...(Number.isInteger(puzzleNumber) && puzzleNumber > 0 ? { puzzleNumber } : {}),
    publishMode,
    issueCodes,
    blockingIssueCodes,
    issues,
    sourceConfidence,
    retryCount,
    reason,
    nextAction,
  };
}

function dateOrdinal(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizeString(date));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(utc)) return null;
  return Math.floor(utc / 86_400_000);
}

export function updateLightweightPublishFailureStreak(previous = null, summary = {}, options = {}) {
  const threshold = Number.isFinite(options.threshold) && options.threshold > 0
    ? Math.floor(options.threshold)
    : 3;
  const previousRecord = previous && typeof previous === "object" ? previous : {};
  const previousDate = normalizeString(previousRecord.lastLogicalGameDate);
  const currentDate = normalizeString(summary.logicalGameDate);
  const previousOrdinal = dateOrdinal(previousDate);
  const currentOrdinal = dateOrdinal(currentDate);
  const previousCount = Number.isFinite(previousRecord.count) && previousRecord.count > 0
    ? Math.floor(previousRecord.count)
    : 0;
  const count = previousDate && currentDate === previousDate
    ? Math.max(previousCount, 1)
    : previousOrdinal !== null && currentOrdinal !== null && currentOrdinal === previousOrdinal + 1
      ? previousCount + 1
      : 1;

  return {
    version: 1,
    count,
    threshold,
    triggered: count >= threshold,
    lastLogicalGameDate: currentDate,
    lastSlug: normalizeString(summary.slug),
    lastPublishMode: normalizeString(summary.publishMode) || "unknown",
    lastIssueCodes: Array.isArray(summary.blockingIssueCodes) && summary.blockingIssueCodes.length > 0
      ? summary.blockingIssueCodes
      : Array.isArray(summary.issueCodes)
        ? summary.issueCodes
        : [],
    updatedAt: normalizeString(options.updatedAt) || new Date().toISOString(),
  };
}
