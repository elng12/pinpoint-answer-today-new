import type { ContentCandidate, ValidateCandidateInput, ValidationPolicies } from "./types";

export const BLOCK_PUBLISH_POLICIES: ValidationPolicies = {
  indexPolicy: "block_publish",
  sitemapPolicy: "exclude",
  schemaPolicy: "none",
  internalLinkPolicy: "hidden_from_recent",
  requiredAction: "block_publish",
};

export const REVIEW_POLICIES: ValidationPolicies = {
  indexPolicy: "review_required",
  sitemapPolicy: "exclude",
  schemaPolicy: "none",
  internalLinkPolicy: "hidden_from_recent",
  requiredAction: "review",
};

export const FULL_ANALYSIS_REVIEW_POLICIES: ValidationPolicies = {
  indexPolicy: "review_required",
  sitemapPolicy: "include_after_audit",
  schemaPolicy: "article_only",
  internalLinkPolicy: "deemphasized",
  requiredAction: "review",
};

export function derivePolicies(input: Pick<ValidateCandidateInput, "candidate" | "allowAnswerFirstIndex">): ValidationPolicies {
  const candidate = input.candidate as Partial<ContentCandidate> | null | undefined;

  if (candidate?.contentMode === "answer-first") {
    if (input.allowAnswerFirstIndex === true) {
      return {
        indexPolicy: "index",
        sitemapPolicy: "include",
        schemaPolicy: "article_only",
        internalLinkPolicy: "deemphasized",
        requiredAction: "enrich",
      };
    }

    return {
      indexPolicy: "noindex",
      sitemapPolicy: "exclude",
      schemaPolicy: "none",
      internalLinkPolicy: "hidden_from_recent",
      requiredAction: "enrich",
    };
  }

  if (candidate?.contentMode === "full-analysis") {
    return FULL_ANALYSIS_REVIEW_POLICIES;
  }

  return BLOCK_PUBLISH_POLICIES;
}
