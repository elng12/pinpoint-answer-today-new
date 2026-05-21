# Content Gate Stacked PR Descriptions

Date: 2026-05-21

## PR1

Branch: `codex/content-gate-pr1`

Base: `main`

Title:

```text
Add shared Pinpoint publish eligibility gate
```

Body:

```md
## Summary

- Adds shared `publishMode` and `validatePublishEligibility` contract for Pinpoint public payloads.
- Wires release production, Worker final public write, and `validate:data` to the same eligibility rules.
- Blocks #750-style `short` / `light-explainer` payloads from being published as `full-analysis`.
- Keeps legacy data compatible by only applying repo-level publish eligibility when new publish mode fields are present.

## Scope

- Approved PR1 only: publish mode, shared eligibility, Worker/release/data validation alignment, and #750 regression guardrail.
- Does not add failure summaries, Evidence V1, override behavior, rendered HTML checks, SLA cron, candidate branches, or model routing.

## Validation

- `npm run test:pinpoint-guardrails`
- `npm run typecheck`
- `npm run validate:data`
- `cd worker && npm run typecheck`

## Stack

- PR1 base: `main`
- PR2 base: `codex/content-gate-pr1`
- PR3 base: `codex/content-gate-pr2`
```

## PR2

Branch: `codex/content-gate-pr2`

Base: `codex/content-gate-pr1`

Title:

```text
Record Pinpoint publish failure summaries
```

Body:

```md
## Summary

- Adds lightweight publish failure summary helpers for eligibility-blocked Pinpoint payloads.
- Persists blocked publish summaries to KV with slug, logical game date, publish mode, source confidence, and issue codes.
- Tracks consecutive logical-day publish failures/degradations and sends a deduped high-priority alert at the threshold.
- Prevents eligibility-blocked final payloads from recursively writing public `failed` fallback payloads.

## Scope

- Approved PR2 only: final payload failure handling, issue-code notification, lightweight summary, and continuous-failure alerting.
- Does not add Evidence V1, override behavior, rendered HTML checks, SLA cron, candidate branches, or model routing.

## Validation

- `npm run test:pinpoint-guardrails`
- `npm run typecheck`
- `npm run validate:data`
- `cd worker && npm run typecheck`

## Stack

- Depends on PR1: `codex/content-gate-pr1`
- PR3 base: `codex/content-gate-pr2`
```

## PR3

Branch: `codex/content-gate-pr3`

Base: `codex/content-gate-pr2`

Title:

```text
Add Pinpoint Evidence V1 dry-run guards
```

Body:

```md
## Summary

- Adds Pinpoint Evidence V1 dry-run validation for `deterministic`, `manual`, and `weak` support.
- Adds optional evidence parameters to shared publish eligibility without making evidence mandatory by default.
- Rejects fixture evidence in production mode and blocks weak evidence from supporting `full-analysis`.
- Adds #724 evidence fixtures to catch clue mapping regressions.
- Adds release override schema dry-run validation with required reviewer/reason/timestamps, 48-hour max duration, disallowed core issue codes, and `productionEffective: false`.

## Scope

- Approved PR3 only: Evidence V1 dry-run, #724 fixture coverage, fixture production guard, and override schema dry-run.
- Does not read production evidence from Worker, does not enable production-effective override, does not add KV/runtime override, and does not add rendered/link/schema blocking gates.

## Validation

- `npm run test:pinpoint-guardrails`
- `npm run typecheck`
- `npm run validate:data`
- `cd worker && npm run typecheck`

## Stack

- Depends on PR1: `codex/content-gate-pr1`
- Depends on PR2: `codex/content-gate-pr2`
```

## Push Status

- `codex/content-gate-pr1` pushed to `origin`.
- `codex/content-gate-pr2` pushed to `origin`.
- `codex/content-gate-pr3` pushed to `origin`.

## PR Creation URLs

- <https://github.com/elng12/pinpoint-answer-today-new/pull/new/codex/content-gate-pr1>
- <https://github.com/elng12/pinpoint-answer-today-new/pull/new/codex/content-gate-pr2>
- <https://github.com/elng12/pinpoint-answer-today-new/pull/new/codex/content-gate-pr3>
