# PR10 Review Routing And Decision Contract

This is the local contract note for PR10.1 through PR10.7.

It defines how a review artifact is routed and how a final review decision is recorded.

It is intentionally local-only:

- it does not build a production Review UI route
- it does not add any sitemap entry
- it does not call a model
- it does not send Feishu messages
- it does not write review queue storage
- it does not render production content
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
- unsupported reasoning shape
- noindex requirement mismatch
- FAQ schema without visible FAQ

These route to `auto_reject` in v0.

Current production note, 2026-05-31: `MISSING_EVIDENCE_REF` is not a hard routing failure for the accepted fast clue-explanation path. Treat it as info only when five clue rows are complete, specific, and in order. See `docs/pinpoint-evidence-ref-policy-2026-05-31.md`.

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
- valid decisions produce an effect plan
- invalid decisions produce `invalid_decision`
- `auto_approve` still does not allow automatic publish

## Example Files

Checked examples live in `lib/puzzles/content-kitchen/examples`.

Each example has an artifact file and a decision file:

- `review-decision-auto-approve.*.example.json`
- `review-decision-auto-reject.*.example.json`
- `review-decision-model-review.*.example.json`
- `review-decision-low-confidence-human.*.example.json`
- `review-decision-human-override.*.example.json`

These examples cover:

- low-risk route to `auto_approve`
- hard-rule route to `auto_reject`
- soft quality route to `model_review`
- low-confidence model route to `human_review`
- human-only `override_issue`

## Local Runner

Use the local runner to inspect a route and validate a decision file:

```bash
npm run content-kitchen:review-decision -- \
  --artifact lib/puzzles/content-kitchen/examples/review-decision-model-review.artifact.example.json \
  --decision lib/puzzles/content-kitchen/examples/review-decision-model-review.decision.example.json \
  --pretty
```

The runner prints:

- derived route
- decision validation
- effect plan
- review queue draft when review remains open
- Feishu notification draft when a review queue draft exists
- Review UI input when a review queue draft exists

The effect plan explains the local consequence of the decision:

- `approved`: reviewer approved this candidate revision
- `rejected`: candidate revision must not publish
- `regeneration_requested`: regenerate before continuing
- `answer_first_forced`: record answer-first fallback request
- `issue_override_recorded`: record a human-only issue override
- `human_escalation_required`: keep the artifact in human review
- `invalid_decision`: do not apply any downstream action

In PR10 v0, every effect plan has `publishAllowed: false`.

## Review Queue Draft

PR10.4 adds a local review queue draft envelope.

It uses `queueDraftVersion: "content-kitchen-review-queue-draft-v0"`.

It exists only when an artifact still needs model or human review.

Examples:

- route-only `model_review` artifacts create a model-review queue draft
- route-only `human_review` artifacts create a human-review queue draft
- model decisions with `human_escalation_required` create a human queue draft
- partial human overrides create a queue draft for remaining issue codes
- `auto_approve`, `auto_reject`, and fully decided effects do not create a queue draft

Required fields:

- `draftOnly: true`
- `persistenceStatus: "not_persisted"`
- `queueName: "content-kitchen-review"`
- `artifactId`
- `puzzleId`
- `candidateRevisionId`
- `route`
- `routeReason`
- `priority`
- `reason`
- `issueCodes`
- `recommendedAction`
- `publishAllowed: false`
- `createdAt`
- `lines`

Priority rules:

- `ANSWER_FIRST_HIGH_PRIORITY_ALERT` creates `high_priority`
- all other PR10.4 review queue drafts use `normal`

The queue draft may include `publicUrl` from the artifact canonical URL and `renderedPreviewUrl` from the artifact preview URL.

It must not include raw rendered HTML, model prompts, secrets, or production storage ids.

The local runner includes `reviewQueueDraft` only when the draft exists.

## Review Notification Draft

PR10.5 adds a local Feishu notification draft.

It uses `notificationDraftVersion: "content-kitchen-review-notification-draft-v0"`.

It exists only when a review queue draft exists.

Required fields:

- `draftOnly: true`
- `dispatchStatus: "not_sent"`
- `channel: "feishu"`
- `priority`
- `reason`
- `artifactId`
- `puzzleId`
- `candidateRevisionId`
- `issueSeverity`
- `recommendedAction`
- `dedupeKey`
- `payload`

Payload shape:

- `msg_type: "text"`
- `content.text` is built from the draft lines

Feishu notification drafts include puzzle id, logical date, current mode, issue severity, recommended action, public URL, and review URL when available.

Rules:

- `normal` queue drafts create normal Feishu notification drafts
- `high_priority` queue drafts create high-priority Feishu notification drafts
- the draft may include `reviewUrl` when a later Review UI provides one
- the draft never reads a webhook URL
- the draft never sends a Feishu message
- the draft must not include raw rendered HTML, model prompts, secrets, or production storage ids

The local runner includes `reviewNotificationDraft` only when a review queue draft exists.

## Review UI Input

PR10.6 adds a local Review UI input contract.

It uses `reviewUiInputVersion: "content-kitchen-review-ui-input-v0"`.

It exists only when a review queue draft exists.

It is not a real UI.

Required safety fields:

- `localOnly: true`
- `renderStatus: "not_rendered"`
- `safety.rawRenderedHtmlIncluded: false`
- `safety.modelPromptIncluded: false`
- `safety.secretsIncluded: false`
- `safety.publishAllowed: false`

The UI input groups together:

- artifact id and artifact type
- puzzle snapshot
- candidate and published revision ids
- validation outcome
- validation policies
- issue groups by severity
- route result
- review queue draft
- notification draft when available
- effect plan when available
- evidence summary when available
- public URL and rendered preview URL when available
- review URL when available
- recommended action
- allowed reviewer actions

Puzzle snapshot status is explicit: `provided` or `missing`.

If a puzzle snapshot is missing, the UI input must not invent answer text or clue text.

The local runner includes `reviewUiInput` only when a review queue draft exists.

## Review UI Read-only Local Surface

PR10.7 adds a local static HTML surface for the Review UI input.

It uses `content-kitchen-review-ui-surface-v0`.

This is only a local file preview. It is not a Next route, not a production page, and not included in sitemap.

Use `--ui-output` to write it:

```bash
npm run content-kitchen:review-decision -- \
  --artifact lib/puzzles/content-kitchen/examples/review-decision-human-override.artifact.example.json \
  --review-url https://example.com/admin/content-kitchen/review/art_review_human_override_example \
  --ui-output /tmp/content-kitchen-review-ui.html \
  --pretty
```

The generated HTML:

- shows artifact id, puzzle id, revision id, route, policy output, issue groups, queue draft, notification draft, safety flags, and allowed actions
- shows five L1 clues only when a puzzle snapshot is provided
- does not invent answer text or clue text when the puzzle snapshot is missing
- includes `<meta name="robots" content="noindex, nofollow">`
- has no JavaScript
- has no form submit
- writes no storage
- sends no Feishu message
- publishes no content

Rules:

- `--ui-output` requires a review queue draft
- `--ui-output` must not equal `--artifact`
- `--ui-output` must not equal `--decision`
- `--ui-output` must not equal `--output`

Write the result to a local file:

```bash
npm run content-kitchen:review-decision -- \
  --artifact lib/puzzles/content-kitchen/examples/review-decision-model-review.artifact.example.json \
  --decision lib/puzzles/content-kitchen/examples/review-decision-model-review.decision.example.json \
  --review-url https://example.com/admin/content-kitchen/review/art_review_human_override_example \
  --output /tmp/content-kitchen-review-decision-result.json \
  --ui-output /tmp/content-kitchen-review-ui.html \
  --pretty
```

Route without a decision file:

```bash
npm run content-kitchen:review-decision -- \
  --artifact lib/puzzles/content-kitchen/examples/review-decision-human-override.artifact.example.json \
  --review-url https://example.com/admin/content-kitchen/review/art_review_human_override_example \
  --pretty
```

Rules:

- `--output` must not equal `--artifact`
- `--output` must not equal `--decision`
- `--ui-output` must not equal `--artifact`
- `--ui-output` must not equal `--decision`
- `--ui-output` must not equal `--output`
- the runner is for local inspection only
- the runner does not call a model
- the runner does not send Feishu messages
- the runner does not read Feishu webhook secrets
- the runner does not write review queue storage
- the runner does not build a production Review UI route
- the runner does not render production content
- the runner does not touch production storage
- the runner does not publish content
