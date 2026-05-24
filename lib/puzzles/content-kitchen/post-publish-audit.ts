import { getIssueDefinition } from "./issue-registry";
import type {
  ContentKitchenIssueCode,
  ContentKitchenIssueSeverity,
  PostPublishAuditArtifactV0,
  PostPublishAuditCheckName,
  PostPublishAuditCheckV0,
  PostPublishAuditExpectedStateV0,
  PostPublishAuditObservedStateV0,
  RequiredAction,
  ValidationIssue,
  ValidationPolicies,
} from "./types";

export const POST_PUBLISH_AUDIT_VERSION = "content-kitchen-post-publish-audit-v0";

export type BuildPostPublishAuditInput = {
  artifactId: string;
  checkedAt: string;
  expected: PostPublishAuditExpectedStateV0;
  observed: PostPublishAuditObservedStateV0;
};

function textValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value);
}

function checkPass(name: PostPublishAuditCheckName, message: string, details: {
  expected?: unknown;
  observed?: unknown;
} = {}): PostPublishAuditCheckV0 {
  return {
    name,
    status: "pass",
    message,
    ...(details.expected !== undefined ? { expected: textValue(details.expected) } : {}),
    ...(details.observed !== undefined ? { observed: textValue(details.observed) } : {}),
  };
}

function checkNotChecked(name: PostPublishAuditCheckName, message: string): PostPublishAuditCheckV0 {
  return {
    name,
    status: "not_checked",
    message,
  };
}

function checkFail(name: PostPublishAuditCheckName, issueCode: ContentKitchenIssueCode, message: string, details: {
  expected?: unknown;
  observed?: unknown;
} = {}): PostPublishAuditCheckV0 {
  const definition = getIssueDefinition(issueCode);

  return {
    name,
    status: "fail",
    message,
    issueCode,
    severity: definition.defaultSeverity,
    ...(details.expected !== undefined ? { expected: textValue(details.expected) } : {}),
    ...(details.observed !== undefined ? { observed: textValue(details.observed) } : {}),
  };
}

function checkPublicFetch(observed: PostPublishAuditObservedStateV0): PostPublishAuditCheckV0 {
  const statusOk = observed.httpStatus === undefined || (observed.httpStatus >= 200 && observed.httpStatus < 400);

  if (observed.fetchOk && statusOk) {
    return checkPass("public_fetch", "Public URL fetched successfully.", {
      observed: observed.httpStatus ?? "status_not_recorded",
    });
  }

  return checkFail("public_fetch", "PUBLIC_HTML_FETCH_FAILED", "Public URL fetch failed or returned a bad status.", {
    expected: "fetchOk=true and HTTP 2xx/3xx",
    observed: observed.httpStatus ?? "missing_status",
  });
}

function checkPublicRender(observed: PostPublishAuditObservedStateV0): PostPublishAuditCheckV0 {
  if (!observed.fetchOk) {
    return checkNotChecked("public_render", "Render check skipped because public fetch failed.");
  }

  if (observed.renderOk) {
    return checkPass("public_render", "Public HTML render facts were available.");
  }

  return checkFail("public_render", "PUBLIC_HTML_RENDER_FAILED", "Public HTML render facts were not available.", {
    expected: "renderOk=true",
    observed: observed.renderOk,
  });
}

function checkAnswerVisible(
  expected: PostPublishAuditExpectedStateV0,
  observed: PostPublishAuditObservedStateV0,
): PostPublishAuditCheckV0 {
  if (!observed.fetchOk || !observed.renderOk) {
    return checkNotChecked("answer_visible", "Answer visibility skipped because render facts are unavailable.");
  }

  if (observed.answerVisible) {
    return checkPass("answer_visible", "Published answer is visible.", {
      expected: expected.answer,
      observed: true,
    });
  }

  return checkFail("answer_visible", "ANSWER_HIDDEN_FROM_RENDERED_HTML", "Published answer is not visible.", {
    expected: expected.answer,
    observed: false,
  });
}

function checkCluesVisible(
  expected: PostPublishAuditExpectedStateV0,
  observed: PostPublishAuditObservedStateV0,
): PostPublishAuditCheckV0 {
  if (!observed.fetchOk || !observed.renderOk) {
    return checkNotChecked("all_clues_visible", "Clue visibility skipped because render facts are unavailable.");
  }

  const visible = new Set(observed.visibleClues ?? []);
  const missing = expected.clues.filter((clue) => !visible.has(clue));
  if (missing.length === 0) {
    return checkPass("all_clues_visible", "All expected L1 clues are visible.", {
      expected: expected.clues.length,
      observed: observed.visibleClues?.length ?? 0,
    });
  }

  return checkFail("all_clues_visible", "MISSING_CLUE_ROW", "One or more expected L1 clues are missing from public HTML.", {
    expected: expected.clues.join(" | "),
    observed: `missing: ${missing.join(" | ")}`,
  });
}

function checkCanonical(
  expected: PostPublishAuditExpectedStateV0,
  observed: PostPublishAuditObservedStateV0,
): PostPublishAuditCheckV0 {
  if (!observed.fetchOk || !observed.renderOk) {
    return checkNotChecked("canonical_matches", "Canonical check skipped because render facts are unavailable.");
  }

  if (observed.canonicalUrl === expected.canonicalUrl) {
    return checkPass("canonical_matches", "Canonical URL matches expected URL.", {
      expected: expected.canonicalUrl,
      observed: observed.canonicalUrl,
    });
  }

  return checkFail("canonical_matches", "CANONICAL_URL_MISMATCH", "Canonical URL does not match expected URL.", {
    expected: expected.canonicalUrl,
    observed: observed.canonicalUrl ?? "missing",
  });
}

function checkRobotsPolicy(
  expected: PostPublishAuditExpectedStateV0,
  observed: PostPublishAuditObservedStateV0,
): PostPublishAuditCheckV0 {
  if (!observed.fetchOk || !observed.renderOk) {
    return checkNotChecked("robots_policy_matches", "Robots policy check skipped because render facts are unavailable.");
  }

  if (expected.policies.indexPolicy !== "index" && expected.policies.indexPolicy !== "noindex") {
    return checkNotChecked("robots_policy_matches", "Robots policy check applies only to index or noindex policies.");
  }

  const expectedNoindex = expected.policies.indexPolicy === "noindex";
  if (observed.noindexPresent === expectedNoindex) {
    return checkPass("robots_policy_matches", "Robots noindex state matches expected policy.", {
      expected: expected.policies.indexPolicy,
      observed: observed.noindexPresent ? "noindex" : "index",
    });
  }

  return checkFail("robots_policy_matches", "ROBOTS_POLICY_MISMATCH", "Robots noindex state does not match expected policy.", {
    expected: expected.policies.indexPolicy,
    observed: observed.noindexPresent ? "noindex" : "index",
  });
}

function checkSitemapPolicy(
  expected: PostPublishAuditExpectedStateV0,
  observed: PostPublishAuditObservedStateV0,
): PostPublishAuditCheckV0 {
  if (expected.policies.sitemapPolicy === "include_after_audit") {
    return checkNotChecked("sitemap_policy_matches", "Sitemap inclusion is waiting for audit decision.");
  }
  if (observed.sitemapIncluded === undefined) {
    return checkNotChecked("sitemap_policy_matches", "Sitemap inclusion fact is unavailable.");
  }

  const expectedIncluded = expected.policies.sitemapPolicy === "include";
  if (observed.sitemapIncluded === expectedIncluded) {
    return checkPass("sitemap_policy_matches", "Sitemap inclusion matches expected policy.", {
      expected: expected.policies.sitemapPolicy,
      observed: observed.sitemapIncluded ? "included" : "excluded",
    });
  }

  return checkFail("sitemap_policy_matches", "SITEMAP_POLICY_MISMATCH", "Sitemap inclusion does not match expected policy.", {
    expected: expected.policies.sitemapPolicy,
    observed: observed.sitemapIncluded ? "included" : "excluded",
  });
}

function checkSitemapLastmod(
  expected: PostPublishAuditExpectedStateV0,
  observed: PostPublishAuditObservedStateV0,
): PostPublishAuditCheckV0 {
  if (observed.sitemapIncluded === undefined) {
    return checkNotChecked("sitemap_lastmod_matches", "Sitemap lastmod skipped because sitemap inclusion is unavailable.");
  }
  if (!observed.sitemapIncluded) {
    return checkNotChecked("sitemap_lastmod_matches", "Sitemap lastmod skipped because the URL is not in sitemap.");
  }
  if (!expected.sitemapLastmod) {
    return checkNotChecked("sitemap_lastmod_matches", "Sitemap lastmod has no expected value yet.");
  }
  if (!observed.sitemapLastmod) {
    return checkFail("sitemap_lastmod_matches", "SITEMAP_LASTMOD_MISSING", "Sitemap entry is missing lastmod.", {
      expected: expected.sitemapLastmod,
      observed: "missing",
    });
  }
  if (observed.sitemapLastmod === expected.sitemapLastmod) {
    return checkPass("sitemap_lastmod_matches", "Sitemap lastmod matches expected value.", {
      expected: expected.sitemapLastmod,
      observed: observed.sitemapLastmod,
    });
  }

  return checkFail("sitemap_lastmod_matches", "DATE_MODIFIED_MISMATCH", "Sitemap lastmod differs from expected value.", {
    expected: expected.sitemapLastmod,
    observed: observed.sitemapLastmod,
  });
}

function checkSchemaDateModified(
  expected: PostPublishAuditExpectedStateV0,
  observed: PostPublishAuditObservedStateV0,
): PostPublishAuditCheckV0 {
  if (!observed.fetchOk || !observed.renderOk) {
    return checkNotChecked("schema_date_modified_matches", "Schema dateModified skipped because render facts are unavailable.");
  }
  if (!expected.schemaDateModified) {
    return checkNotChecked("schema_date_modified_matches", "Schema dateModified has no expected value yet.");
  }
  if (!observed.schemaDateModified) {
    return checkFail("schema_date_modified_matches", "SCHEMA_DATE_MODIFIED_MISSING", "Schema dateModified is missing.", {
      expected: expected.schemaDateModified,
      observed: "missing",
    });
  }
  if (observed.schemaDateModified === expected.schemaDateModified) {
    return checkPass("schema_date_modified_matches", "Schema dateModified matches expected value.", {
      expected: expected.schemaDateModified,
      observed: observed.schemaDateModified,
    });
  }

  return checkFail("schema_date_modified_matches", "DATE_MODIFIED_MISMATCH", "Schema dateModified differs from expected value.", {
    expected: expected.schemaDateModified,
    observed: observed.schemaDateModified,
  });
}

function checkSchemaMode(
  expected: PostPublishAuditExpectedStateV0,
  observed: PostPublishAuditObservedStateV0,
): PostPublishAuditCheckV0 {
  if (!observed.fetchOk || !observed.renderOk) {
    return checkNotChecked("schema_mode_matches", "Schema mode skipped because render facts are unavailable.");
  }
  const expectedTypes = expected.schemaTypes ?? [];
  if (expectedTypes.length === 0) {
    return checkNotChecked("schema_mode_matches", "Schema mode has no expected schema types yet.");
  }

  const observedTypes = new Set(observed.schemaTypes ?? []);
  const missing = expectedTypes.filter((schemaType) => !observedTypes.has(schemaType));
  if (missing.length === 0) {
    return checkPass("schema_mode_matches", "Schema types match expected content mode.", {
      expected: expectedTypes.join(", "),
      observed: (observed.schemaTypes ?? []).join(", "),
    });
  }

  return checkFail("schema_mode_matches", "SCHEMA_MODE_MISMATCH", "Published schema types do not match expected content mode.", {
    expected: expectedTypes.join(", "),
    observed: (observed.schemaTypes ?? []).join(", "),
  });
}

function checkInternalLinks(
  expected: PostPublishAuditExpectedStateV0,
  observed: PostPublishAuditObservedStateV0,
): PostPublishAuditCheckV0 {
  if (!observed.fetchOk || !observed.renderOk) {
    return checkNotChecked("internal_links_valid", "Internal link audit skipped because render facts are unavailable.");
  }
  const expectedLinks = expected.expectedInternalLinks ?? [];
  if (expectedLinks.length === 0) {
    return checkNotChecked("internal_links_valid", "Internal link audit has no expected links yet.");
  }

  const observedLinks = new Set(observed.internalLinks ?? []);
  const missing = expectedLinks.filter((link) => !observedLinks.has(link));
  if (missing.length === 0) {
    return checkPass("internal_links_valid", "Expected internal links are present.", {
      expected: expectedLinks.length,
      observed: observed.internalLinks?.length ?? 0,
    });
  }

  return checkFail("internal_links_valid", "INTERNAL_LINK_BROKEN", "One or more expected internal links are missing.", {
    expected: expectedLinks.join(" | "),
    observed: `missing: ${missing.join(" | ")}`,
  });
}

function buildChecks(input: BuildPostPublishAuditInput): PostPublishAuditCheckV0[] {
  return [
    checkPublicFetch(input.observed),
    checkPublicRender(input.observed),
    checkAnswerVisible(input.expected, input.observed),
    checkCluesVisible(input.expected, input.observed),
    checkCanonical(input.expected, input.observed),
    checkRobotsPolicy(input.expected, input.observed),
    checkSitemapPolicy(input.expected, input.observed),
    checkSitemapLastmod(input.expected, input.observed),
    checkSchemaDateModified(input.expected, input.observed),
    checkSchemaMode(input.expected, input.observed),
    checkInternalLinks(input.expected, input.observed),
  ];
}

function uniqueIssueCodes(checks: PostPublishAuditCheckV0[]): ContentKitchenIssueCode[] {
  return [...new Set(checks.flatMap((check) => (check.issueCode ? [check.issueCode] : [])))];
}

function maxSeverity(issueCodes: ContentKitchenIssueCode[]): ContentKitchenIssueSeverity | undefined {
  const severities = issueCodes.map((issueCode) => getIssueDefinition(issueCode).defaultSeverity);
  if (severities.includes("P0")) return "P0";
  if (severities.includes("P1")) return "P1";
  if (severities.includes("P2")) return "P2";
  return undefined;
}

function recommendedAction(issueCodes: ContentKitchenIssueCode[]): RequiredAction {
  if (issueCodes.length === 0) return "none";
  if (maxSeverity(issueCodes) === "P0") return "rollback";
  if (issueCodes.includes("ROBOTS_POLICY_MISMATCH") || issueCodes.includes("SITEMAP_POLICY_MISMATCH")) return "degrade";
  return "create_fix_task";
}

function recommendedPolicies(issueCodes: ContentKitchenIssueCode[], expected: PostPublishAuditExpectedStateV0): ValidationPolicies {
  const action = recommendedAction(issueCodes);
  if (issueCodes.length === 0) {
    return expected.policies;
  }

  if (maxSeverity(issueCodes) === "P0") {
    return {
      indexPolicy: "block_publish",
      sitemapPolicy: "remove_on_next_build",
      schemaPolicy: "block_schema",
      internalLinkPolicy: "hidden_from_recent",
      requiredAction: action,
    };
  }

  return {
    indexPolicy: "review_required",
    sitemapPolicy: "include_after_audit",
    schemaPolicy: expected.policies.schemaPolicy === "faq_allowed" && issueCodes.includes("SCHEMA_MODE_MISMATCH")
      ? "article_only"
      : expected.policies.schemaPolicy,
    internalLinkPolicy: "deemphasized",
    requiredAction: action,
    ...(action === "degrade" ? { degradationActions: ["apply_noindex", "remove_from_sitemap", "hide_from_recent", "create_fix_task"] } : {}),
  };
}

function buildIssues(checks: PostPublishAuditCheckV0[], revisionId: string): ValidationIssue[] {
  return checks.flatMap((check) => {
    if (!check.issueCode) return [];
    const definition = getIssueDefinition(check.issueCode);
    return [{
      issueCode: check.issueCode,
      severity: definition.defaultSeverity,
      fieldPath: `postPublishAudit.checks.${check.name}`,
      message: check.message,
      suggestedAction: definition.defaultRequiredAction,
      blocking: definition.defaultSeverity === "P0",
      candidateRevisionId: revisionId,
    }];
  });
}

export function buildPostPublishAudit(input: BuildPostPublishAuditInput): PostPublishAuditArtifactV0 {
  const checks = buildChecks(input);
  const issueCodes = uniqueIssueCodes(checks);
  const fetchFailed = issueCodes.includes("PUBLIC_HTML_FETCH_FAILED");
  const auditOutcome = issueCodes.length === 0
    ? "published_and_audit_passed"
    : fetchFailed
      ? "publish_failed"
      : "published_but_audit_failed";
  const action = recommendedAction(issueCodes);

  return {
    artifactVersion: POST_PUBLISH_AUDIT_VERSION,
    artifactType: "post_publish_audit",
    artifactId: input.artifactId,
    createdAt: input.checkedAt,
    checkedAt: input.checkedAt,
    puzzleId: input.expected.puzzleId,
    canonicalUrl: input.expected.canonicalUrl,
    revisionId: input.expected.revisionId,
    contentMode: input.expected.contentMode,
    fetchedUrl: input.observed.fetchedUrl,
    ...(input.observed.httpStatus !== undefined ? { httpStatus: input.observed.httpStatus } : {}),
    auditOutcome,
    issueCodes,
    issues: buildIssues(checks, input.expected.revisionId),
    checks,
    recommendedPolicies: recommendedPolicies(issueCodes, input.expected),
    recommendedAction: action,
    safety: {
      rawRenderedHtmlIncluded: false,
      publicFetchPerformedByContract: false,
      publishAllowed: false,
    },
  };
}
