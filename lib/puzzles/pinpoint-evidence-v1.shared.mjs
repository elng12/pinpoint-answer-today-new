const SUPPORT_LEVELS_V1 = new Set(["deterministic", "manual", "weak"]);
const FIT_CONFIDENCE_V1 = new Set(["confirmed", "manual", "weak"]);
const ANSWER_CONFIDENCE_V1 = new Set(["confirmed", "manual", "inferred", "weak"]);
const TIMEZONE_SOURCE_V1 = new Set(["assumption", "verified", "manual"]);
const SOURCE_PROVIDERS_V1 = new Set(["graphql", "manual", "cached", "unknown"]);

function normalizeString(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeLoose(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/["“”'’()\-_,!?:.;/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pushIssue(issues, code, message, field) {
  issues.push({
    level: "error",
    code,
    message,
    ...(field ? { field } : {}),
  });
}

function isIsoUtc(value) {
  const normalized = normalizeString(value);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(normalized);
}

function hasSecretLikeRawResponse(value) {
  const normalized = normalizeString(value).toLowerCase();
  return Boolean(
    normalized &&
      (normalized.includes("authorization") ||
        normalized.includes("cookie") ||
        normalized.includes("li_at=") ||
        normalized.includes("session") ||
        normalized.includes("token")),
  );
}

function normalizeCluesFromDetail(detail = {}, registryEntry = {}) {
  const detailClues = Array.isArray(detail.clues) ? detail.clues : [];
  const registryClues = Array.isArray(registryEntry.clues) ? registryEntry.clues : [];
  return (detailClues.length > 0 ? detailClues : registryClues)
    .map((clue) => normalizeString(clue))
    .filter(Boolean);
}

function normalizeAnswerFromDetail(detail = {}, registryEntry = {}) {
  return normalizeString(detail.answer || detail.mainAnswer || registryEntry.mainAnswer);
}

export function isFixtureEvidencePath(path) {
  const normalized = normalizeString(path);
  return normalized.includes("tests/fixtures/") || normalized.includes(".fixture.");
}

export function validatePinpointEvidenceV1(input = {}) {
  const issues = [];
  const evidence = input.evidence && typeof input.evidence === "object" ? input.evidence : null;
  const detail = input.detail && typeof input.detail === "object" ? input.detail : {};
  const registryEntry = input.registryEntry && typeof input.registryEntry === "object" ? input.registryEntry : {};
  const artifactPath = normalizeString(input.artifactPath);
  const production = Boolean(input.production);

  if (production && artifactPath && isFixtureEvidencePath(artifactPath)) {
    pushIssue(
      issues,
      "evidence.fixtureInProduction",
      "fixture evidence cannot be used for production publish eligibility",
      "evidenceArtifactPath",
    );
  }

  if (!evidence) {
    pushIssue(issues, "evidence.missingArtifact", "full-analysis requires a Pinpoint evidence artifact", "evidence");
    return issues;
  }

  if (Number(evidence.schemaVersion) !== 1) {
    pushIssue(issues, "evidence.schemaVersionInvalid", "evidence.schemaVersion must be 1", "schemaVersion");
  }

  const expectedSlug = normalizeString(input.slug || detail.slug || registryEntry.slug);
  const evidenceSlug = normalizeString(evidence.slug);
  if (!evidenceSlug) {
    pushIssue(issues, "evidence.slugMissing", "evidence.slug is required", "slug");
  } else if (expectedSlug && evidenceSlug !== expectedSlug) {
    pushIssue(issues, "evidence.slugMismatch", "evidence.slug must match the publish payload slug", "slug");
  }

  const expectedPuzzleNumber = Number(detail.puzzleNumber || registryEntry.puzzleNumber || input.puzzleNumber);
  const evidencePuzzleNumber = Number(evidence.puzzleNumber);
  if (!Number.isInteger(evidencePuzzleNumber) || evidencePuzzleNumber <= 0) {
    pushIssue(issues, "evidence.puzzleNumberMissing", "evidence.puzzleNumber is required", "puzzleNumber");
  } else if (Number.isInteger(expectedPuzzleNumber) && expectedPuzzleNumber > 0 && evidencePuzzleNumber !== expectedPuzzleNumber) {
    pushIssue(issues, "evidence.puzzleNumberMismatch", "evidence.puzzleNumber must match the publish payload", "puzzleNumber");
  }

  const expectedDate = normalizeString(input.logicalGameDate || registryEntry.publishDate || detail.publishDate || detail.isoDate);
  const logicalGameDate = normalizeString(evidence.logicalGameDate);
  if (!logicalGameDate) {
    pushIssue(issues, "evidence.logicalGameDateMissing", "evidence.logicalGameDate is required", "logicalGameDate");
  } else if (expectedDate && logicalGameDate !== expectedDate) {
    pushIssue(issues, "evidence.logicalGameDateMismatch", "evidence.logicalGameDate must match the publish payload date", "logicalGameDate");
  }

  const source = evidence.source && typeof evidence.source === "object" ? evidence.source : {};
  const sourceProvider = normalizeString(source.provider || "unknown");
  if (!SOURCE_PROVIDERS_V1.has(sourceProvider)) {
    pushIssue(issues, "evidence.sourceProviderInvalid", "evidence.source.provider is not supported in V1", "source.provider");
  }
  if (!isIsoUtc(source.fetchedAt)) {
    pushIssue(issues, "evidence.sourceFetchedAtInvalid", "evidence.source.fetchedAt must be an ISO UTC timestamp", "source.fetchedAt");
  }
  if (!normalizeString(source.timezone)) {
    pushIssue(issues, "evidence.timezoneMissing", "evidence.source.timezone is required", "source.timezone");
  }
  if (!TIMEZONE_SOURCE_V1.has(normalizeString(source.timezoneSource))) {
    pushIssue(issues, "evidence.timezoneSourceMissing", "evidence.source.timezoneSource is required", "source.timezoneSource");
  }
  if (source.rawResponse && hasSecretLikeRawResponse(source.rawResponse)) {
    pushIssue(issues, "evidence.rawResponseSecret", "raw response must be redacted or represented by hash only", "source.rawResponse");
  }

  const expectedAnswer = normalizeAnswerFromDetail(detail, registryEntry);
  const answer = evidence.answer && typeof evidence.answer === "object" ? evidence.answer : {};
  const answerValue = normalizeString(answer.value);
  const answerConfidence = normalizeString(answer.confidence);
  if (!answerValue) {
    pushIssue(issues, "evidence.answerMissing", "evidence.answer.value is required", "answer.value");
  } else if (expectedAnswer && normalizeLoose(answerValue) !== normalizeLoose(expectedAnswer)) {
    pushIssue(issues, "evidence.answerMismatch", "evidence answer must match the publish payload answer", "answer.value");
  }
  if (!ANSWER_CONFIDENCE_V1.has(answerConfidence)) {
    pushIssue(issues, "evidence.answerConfidenceInvalid", "evidence.answer.confidence is not supported in V1", "answer.confidence");
  }

  const expectedClues = normalizeCluesFromDetail(detail, registryEntry);
  const evidenceClues = Array.isArray(evidence.clues) ? evidence.clues : [];
  if (evidenceClues.length !== 5) {
    pushIssue(issues, "evidence.clueCountMismatch", "evidence.clues must contain exactly 5 rows", "clues");
  }
  if (expectedClues.length === 5 && evidenceClues.length === 5) {
    evidenceClues.forEach((row, index) => {
      const rowIndex = Number(row?.index);
      const fieldPrefix = `clues[${index}]`;
      if (rowIndex !== index) {
        pushIssue(issues, "evidence.clueIndexMismatch", "evidence clue index must match its 0-based position", `${fieldPrefix}.index`);
      }
      if (normalizeLoose(row?.text) !== normalizeLoose(expectedClues[index])) {
        pushIssue(issues, "evidence.clueTextMismatch", "evidence clue text must match the publish payload clue order", `${fieldPrefix}.text`);
      }
      const evidenceRef = normalizeString(row?.evidenceRef);
      const supportLevel = normalizeString(row?.supportLevel);
      const fitConfidence = normalizeString(row?.fitConfidence);
      if (!evidenceRef) {
        pushIssue(issues, "evidence.missingRef", "each evidence clue row must include evidenceRef", `${fieldPrefix}.evidenceRef`);
      }
      if (!SUPPORT_LEVELS_V1.has(supportLevel)) {
        pushIssue(issues, "evidence.supportLevelInvalid", "evidence clue supportLevel is not supported in V1", `${fieldPrefix}.supportLevel`);
      }
      if (!FIT_CONFIDENCE_V1.has(fitConfidence)) {
        pushIssue(issues, "evidence.fitConfidenceInvalid", "evidence clue fitConfidence is not supported in V1", `${fieldPrefix}.fitConfidence`);
      }
      if (supportLevel === "weak" || fitConfidence === "weak") {
        pushIssue(issues, "evidence.weakFit", "weak evidence cannot support full-analysis", `${fieldPrefix}.supportLevel`);
      }
    });
  }

  const evidenceRefs = new Set(
    evidenceClues
      .map((row) => normalizeString(row?.evidenceRef))
      .filter(Boolean),
  );
  const clueRows = Array.isArray(detail.clueRows) ? detail.clueRows : [];
  if (clueRows.length > 0) {
    clueRows.forEach((row, index) => {
      const fieldPrefix = `clueRows[${index}]`;
      const evidenceRef = normalizeString(row?.evidenceRef);
      if (!evidenceRef) {
        pushIssue(issues, "evidence.clueRowRefMissing", "full-analysis clueRows must include evidenceRef", `${fieldPrefix}.evidenceRef`);
      } else if (!evidenceRefs.has(evidenceRef)) {
        pushIssue(issues, "evidence.clueRowRefUnknown", "clueRows evidenceRef must exist in the evidence artifact", `${fieldPrefix}.evidenceRef`);
      }
    });
  }

  const usesManual =
    sourceProvider === "manual" ||
    answerConfidence === "manual" ||
    evidenceClues.some((row) => normalizeString(row?.supportLevel) === "manual" || normalizeString(row?.fitConfidence) === "manual");
  const manualReview = evidence.manualReview && typeof evidence.manualReview === "object" ? evidence.manualReview : null;
  if (usesManual) {
    if (!normalizeString(manualReview?.reviewer)) {
      pushIssue(issues, "evidence.manualReviewerMissing", "manual evidence requires manualReview.reviewer", "manualReview.reviewer");
    }
    if (!normalizeString(manualReview?.reason)) {
      pushIssue(issues, "evidence.manualReasonMissing", "manual evidence requires manualReview.reason", "manualReview.reason");
    }
    if (!isIsoUtc(manualReview?.timestamp)) {
      pushIssue(issues, "evidence.manualTimestampInvalid", "manual evidence requires an ISO UTC manualReview.timestamp", "manualReview.timestamp");
    }
    if (!Array.isArray(manualReview?.changedFields) || manualReview.changedFields.length === 0) {
      pushIssue(issues, "evidence.manualChangedFieldsMissing", "manual evidence requires manualReview.changedFields", "manualReview.changedFields");
    }
  }

  return issues;
}
