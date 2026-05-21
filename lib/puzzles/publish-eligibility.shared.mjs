export const publishModes = ["answer-first", "full-analysis", "failed"];

const publicDetailStates = new Set(["published", "fallback_full"]);

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeLower(value) {
  return normalizeString(value).toLowerCase();
}

export function isPublishMode(value) {
  return publishModes.includes(value);
}

export function resolvePublishMode({ detail = {}, registryEntry = {} } = {}) {
  const explicitMode = normalizeString(detail.publishMode || registryEntry.publishMode);
  if (isPublishMode(explicitMode)) {
    return {
      mode: explicitMode,
      inferred: false,
      issues: [],
    };
  }

  const issues = [];
  if (explicitMode) {
    issues.push({
      code: "publishMode.unsupported",
      level: "blocking",
      message: `Unsupported publishMode: ${explicitMode}`,
      field: "publishMode",
    });
  }

  const detailState = normalizeLower(detail.detailState || registryEntry.detailState || "published");
  if (detailState === "failed") {
    return { mode: "failed", inferred: true, issues };
  }

  const bodyMode = normalizeLower(detail.bodyMode);
  const pageExperienceMode = normalizeLower(detail.pageExperienceMode);
  if (bodyMode === "short" || pageExperienceMode === "light-explainer") {
    return {
      mode: "answer-first",
      inferred: true,
      issues: [
        ...issues,
        {
          code: "publishMode.inferredLegacy",
          level: "warning",
          message: "Legacy short/light detail inferred as answer-first.",
          field: bodyMode === "short" ? "bodyMode" : "pageExperienceMode",
        },
      ],
    };
  }

  if (detailState === "fallback_full") {
    return {
      mode: "full-analysis",
      inferred: true,
      issues: [
        ...issues,
        {
          code: "publishMode.legacyFallbackFull",
          level: "warning",
          message: "Legacy fallback_full inferred as full-analysis candidate.",
          field: "detailState",
        },
      ],
    };
  }

  return {
    mode: "full-analysis",
    inferred: true,
    issues: [
      ...issues,
      {
        code: "publishMode.inferredLegacy",
        level: "warning",
        message: "Legacy detail inferred as full-analysis candidate.",
        field: "publishMode",
      },
    ],
  };
}

function makeIssue({
  code,
  level = "blocking",
  message,
  slug,
  puzzleNumber,
  field,
  sourceConfidence = "unknown",
  publishMode,
}) {
  return {
    code,
    level,
    message,
    ...(slug ? { slug } : {}),
    ...(Number.isInteger(puzzleNumber) ? { puzzleNumber } : {}),
    ...(field ? { field } : {}),
    sourceConfidence,
    ...(publishMode ? { publishMode } : {}),
  };
}

export function validatePublishEligibility(input) {
  const {
    slug,
    registryEntry = {},
    detail = {},
    expectedMode,
    answerFirstPublicEnabled = false,
    sourceConfidence = "unknown",
  } = input ?? {};
  const normalizedSlug = normalizeString(slug || detail.slug || registryEntry.slug);
  const puzzleNumber = Number(detail.puzzleNumber || registryEntry.puzzleNumber);
  const issues = [];

  const modeResult = resolvePublishMode({ detail, registryEntry });
  const publishMode = modeResult.mode;
  for (const issue of modeResult.issues) {
    issues.push(makeIssue({
      ...issue,
      slug: normalizedSlug,
      puzzleNumber,
      sourceConfidence,
      publishMode,
    }));
  }

  if (!normalizedSlug) {
    issues.push(makeIssue({
      code: "slug.missing",
      message: "Missing slug.",
      field: "slug",
      sourceConfidence,
      publishMode,
    }));
  }

  if (!Number.isInteger(puzzleNumber) || puzzleNumber <= 0) {
    issues.push(makeIssue({
      code: "puzzleNumber.missing",
      message: "Missing puzzle number.",
      slug: normalizedSlug,
      field: "puzzleNumber",
      sourceConfidence,
      publishMode,
    }));
  }

  if (!publishMode) {
    issues.push(makeIssue({
      code: "publishMode.missing",
      message: "Missing publishMode.",
      slug: normalizedSlug,
      puzzleNumber,
      field: "publishMode",
      sourceConfidence,
    }));
  }

  const detailState = normalizeLower(detail.detailState || registryEntry.detailState || "published");
  if (publishMode !== "failed" && detailState && !publicDetailStates.has(detailState)) {
    issues.push(makeIssue({
      code: "detailState.notPublishable",
      message: `detailState is not public: ${detailState}`,
      slug: normalizedSlug,
      puzzleNumber,
      field: "detailState",
      sourceConfidence,
      publishMode,
    }));
  }

  const answer = normalizeString(detail.answer || detail.mainAnswer || registryEntry.mainAnswer);
  if (!answer) {
    issues.push(makeIssue({
      code: "answer.missing",
      message: "Missing answer.",
      slug: normalizedSlug,
      puzzleNumber,
      field: "answer",
      sourceConfidence,
      publishMode,
    }));
  }

  const clues = Array.isArray(detail.clues)
    ? detail.clues
    : Array.isArray(detail.rawWords)
      ? detail.rawWords
      : registryEntry.clues;
  if (!Array.isArray(clues) || clues.filter((clue) => normalizeString(clue)).length !== 5) {
    issues.push(makeIssue({
      code: "clues.countMismatch",
      message: "Public Pinpoint payload must contain exactly 5 clues.",
      slug: normalizedSlug,
      puzzleNumber,
      field: "clues",
      sourceConfidence,
      publishMode,
    }));
  }

  if (publishMode === "failed") {
    issues.push(makeIssue({
      code: "publishMode.failedPublicPayload",
      message: "failed payloads cannot be written to the public final payload path.",
      slug: normalizedSlug,
      puzzleNumber,
      field: "publishMode",
      sourceConfidence,
      publishMode,
    }));
  }

  if (publishMode === "answer-first" && !answerFirstPublicEnabled) {
    issues.push(makeIssue({
      code: "publishMode.answerFirstDisabled",
      message: "answer-first public publishing is disabled.",
      slug: normalizedSlug,
      puzzleNumber,
      field: "publishMode",
      sourceConfidence,
      publishMode,
    }));
  }

  const expected = isPublishMode(expectedMode) ? expectedMode : undefined;
  if (expected === "full-analysis") {
    const bodyMode = normalizeLower(detail.bodyMode);
    const pageExperienceMode = normalizeLower(detail.pageExperienceMode);
    if (bodyMode === "short") {
      issues.push(makeIssue({
        code: "publishMode.bodyModeMismatch",
        message: "short bodyMode cannot be published as full-analysis.",
        slug: normalizedSlug,
        puzzleNumber,
        field: "bodyMode",
        sourceConfidence,
        publishMode,
      }));
    }

    if (pageExperienceMode === "light-explainer") {
      issues.push(makeIssue({
        code: "publishMode.pageExperienceMismatch",
        message: "light-explainer pageExperienceMode cannot be published as full-analysis.",
        slug: normalizedSlug,
        puzzleNumber,
        field: "pageExperienceMode",
        sourceConfidence,
        publishMode,
      }));
    }

    if (publishMode !== "full-analysis") {
      issues.push(makeIssue({
        code: "publishMode.expectedFullAnalysis",
        message: `Expected full-analysis but resolved ${publishMode || "unknown"}.`,
        slug: normalizedSlug,
        puzzleNumber,
        field: "publishMode",
        sourceConfidence,
        publishMode,
      }));
    }

  }

  const blockingIssues = issues.filter((issue) => issue.level === "blocking");
  return {
    ok: blockingIssues.length === 0,
    slug: normalizedSlug,
    ...(Number.isInteger(puzzleNumber) ? { puzzleNumber } : {}),
    ...(publishMode ? { publishMode } : {}),
    issues,
  };
}

export function formatPublishGateIssues(issues) {
  return (Array.isArray(issues) ? issues : [])
    .map((issue) => {
      const field = issue.field ? ` field=${issue.field}` : "";
      return `${issue.code}${field}: ${issue.message}`;
    })
    .join("; ");
}
