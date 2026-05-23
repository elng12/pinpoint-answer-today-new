import { createHash } from "node:crypto";
import { getIssueDefinition } from "./issue-registry";
import { normalizeIdentityText } from "./identity";
import type {
  ContentKitchenIssueCode,
  ReviewArtifactEvidenceSummary,
  ReviewArtifactReviewerAction,
  ReviewArtifactV0,
  ValidateCandidateInput,
  ValidateCandidateOutput,
} from "./types";

export type BuildReviewArtifactInput = {
  validationInput: ValidateCandidateInput;
  validationOutput: ValidateCandidateOutput;
  artifactId?: string;
  createdAt?: string;
  publishedRevisionId?: string;
  renderedPreviewUrl?: string;
  evidenceSummary?: ReviewArtifactEvidenceSummary;
};

function stableArtifactId(input: BuildReviewArtifactInput): string {
  const candidateRevisionId = normalizeIdentityText(input.validationInput.candidate?.revisionId) || "unknown-revision";
  const issueCodes = input.validationOutput.issues.map((issue) => issue.issueCode).join(".");
  const hash = createHash("sha256")
    .update(`${candidateRevisionId}:${input.validationOutput.outcome}:${issueCodes}`, "utf8")
    .digest("hex")
    .slice(0, 12);
  return `art_review_${hash}`;
}

export function shouldCreateReviewArtifact(output: ValidateCandidateOutput): boolean {
  return (
    output.outcome === "requires_review" ||
    output.outcome === "downgrade_to_answer_first" ||
    output.outcome === "block_publish"
  );
}

function allowedReviewerActions(output: ValidateCandidateOutput): ReviewArtifactReviewerAction[] {
  if (output.outcome === "block_publish") {
    return ["reject_candidate", "create_fix_task"];
  }

  if (output.outcome === "downgrade_to_answer_first") {
    return ["approve_downgrade", "request_full_analysis_fix", "create_fix_task"];
  }

  if (output.outcome === "requires_review") {
    return ["approve_candidate", "reject_candidate", "create_fix_task"];
  }

  return [];
}

function issueCodesRequiringDecision(output: ValidateCandidateOutput): ContentKitchenIssueCode[] {
  return output.issues
    .filter((issue) => issue.blocking || output.outcome !== "pass_answer_first" && output.outcome !== "pass_full_analysis")
    .map((issue) => issue.issueCode);
}

export function buildReviewArtifactV0(input: BuildReviewArtifactInput): ReviewArtifactV0 | null {
  const output = input.validationOutput;
  if (!shouldCreateReviewArtifact(output)) {
    return null;
  }

  for (const issue of output.issues) {
    getIssueDefinition(issue.issueCode);
  }

  const candidate = input.validationInput.candidate;
  const l1Input = input.validationInput.l1Input;

  return {
    artifactVersion: "content-kitchen-review-artifact-v0",
    artifactId: input.artifactId ?? stableArtifactId(input),
    artifactType: "review",
    createdAt: input.createdAt ?? new Date(0).toISOString(),
    ...(normalizeIdentityText(candidate?.puzzleId ?? l1Input?.puzzleId)
      ? { puzzleId: normalizeIdentityText(candidate?.puzzleId ?? l1Input?.puzzleId) }
      : {}),
    ...(normalizeIdentityText(candidate?.canonicalUrl)
      ? { canonicalUrl: normalizeIdentityText(candidate?.canonicalUrl) }
      : {}),
    ...(candidate?.contentMode ? { contentMode: candidate.contentMode } : {}),
    ...(normalizeIdentityText(candidate?.revisionId)
      ? { candidateRevisionId: normalizeIdentityText(candidate?.revisionId) }
      : {}),
    ...(input.publishedRevisionId ? { publishedRevisionId: input.publishedRevisionId } : {}),
    validation: {
      outcome: output.outcome,
      policies: output.policies,
      issueCodes: output.issues.map((issue) => issue.issueCode),
      issues: output.issues,
    },
    issueCodesRequiringDecision: issueCodesRequiringDecision(output),
    recommendedAction: output.policies.requiredAction,
    allowedReviewerActions: allowedReviewerActions(output),
    ...(input.evidenceSummary ? { evidenceSummary: input.evidenceSummary } : {}),
    ...(input.renderedPreviewUrl ? { renderedPreviewUrl: input.renderedPreviewUrl } : {}),
  };
}
