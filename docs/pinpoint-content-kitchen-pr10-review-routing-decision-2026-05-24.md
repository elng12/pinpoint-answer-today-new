# PR10 Review Routing And Decision Contract

This is the local contract note for PR10.1.

It defines how a review artifact is routed and how a final review decision is recorded.

It is intentionally local-only:

- it does not build Review UI
- it does not call a model
- it does not send Feishu messages
- it does not write review queue storage
- it does not touch production storage
- it does not publish content
- it does not run Worker cron

## Review Route

`ReviewRoute` decides who should inspect the artifact:

- `auto_approve`: rules found no review issue
- `auto_reject`: hard rules found a clear failure
- `model_review`: only soft quality issues remain
- `human_review`: risk is too high, unclear, or low-confidence

`auto_approve` means local rules think no reviewer is needed. It does not mean automatic publishing.

## Hard Rules

Hard-rule failures are not sent to model review.

Examples:

- answer or L1 mismatch
- invalid candidate metadata
- canonical URL mismatch
- missing or duplicate clue rows
- missing evidence refs
- unsupported reasoning shape
- noindex requirement mismatch
- FAQ schema without visible FAQ

These route to `auto_reject` in v0.

## Model Review

Model review is only a route in PR10.1. No model is called in this slice.

Soft issues can route to `model_review`, for example:

- generic reasoning
- weak fit evidence
- L4-only evidence
- low-confidence full-analysis evidence
- optional internal-link quality issues
- stale indexed answer-first cleanup advice

Model decisions can recommend:

- approve
- reject
- request regeneration
- escalate to human

Model decisions cannot:

- override issue codes
- force answer-first
- approve hard-rule failures
- publish content

Low-confidence model decisions must use `escalate_to_human`.

## Human Review

Human review is required when:

- rendered answer visibility is unclear
- full-analysis structure is not certified yet
- clue fit is unsupported
- a prohibited source appears
- evidence sources conflict
- answer-first SLA review is required
- high-priority escalation is active
- a model decision has low confidence

Only a human can use `override_issue`.

## Review Decision

Every decision uses `decisionVersion: "content-kitchen-review-decision-v0"`.

Required fields:

- `artifactId`
- `puzzleId`
- `candidateRevisionId`
- `issueCodes`
- `route`
- `action`
- `reviewerType`
- `reviewerId`
- `reviewedAt`
- `note`

Model decisions also require:

- `confidence`
- `modelName`
- `modelVersion`

Validation rules:

- `artifactId` must match the review artifact
- `puzzleId` must match the review artifact
- `candidateRevisionId` must match the review artifact
- every decision issue code must already exist on the artifact
- model decisions cannot override issues
- model decisions below confidence threshold must escalate to human
- human override decisions must name at least one real artifact issue code

## First Local Checks

The content-kitchen contract test covers:

- low-risk artifact routes to `auto_approve`
- answer mismatch routes to `auto_reject`
- soft quality issue routes to `model_review`
- low-confidence model decision routes to `human_review`
- model override of a hard rule fails
- missing `artifactId` fails
- revision mismatch fails
- override of an absent issue code fails
