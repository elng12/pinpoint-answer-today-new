# Content Quality Release Gate - PR Split Handoff

Date: 2026-05-21
Status: superseded by merged main-branch implementation

## Status Update - 2026-05-22

This document is now historical handoff context, not an active worktree instruction.

- PR1 landed in `main` as `1aa6204` (`Add shared Pinpoint publish eligibility gate`).
- PR2 landed in `main` as `2a713ce` (`Record Pinpoint publish failure summaries`).
- PR3 landed in `main` as `4b98ea4` (`Add Pinpoint Evidence V1 dry-run guards`).
- Follow-up docs were merged in PR #45 and PR #46.
- Current `main` also includes later production changes through `2af7874`.

Do not interpret the original "not staged, not committed" notes below as current repository state.

## Original Goal

Split the current working-tree implementation into three reviewable PRs without expanding scope:

1. PR1: publish mode and shared eligibility gate.
2. PR2: final payload failure handling, lightweight summaries, and continuous-failure alerting.
3. PR3: Evidence V1 dry-run validation, #724 fixture coverage, and override schema dry-run.

Do not include rendered HTML gates, link graph gates, sitemap/schema freshness gates, Playwright checks, SLA cron, candidate-branch promotion, production model routing, KV/runtime override, or production-effective override in these PRs.

## Current Worktree Notes

- The implementation is currently combined in one local worktree.
- No files have been staged or committed by Codex.
- Existing untracked docs from earlier audit work are still present and should be reviewed separately before staging.
- `data/puzzles/pinpoint-answer-750.json` remains a legacy short/light-explainer live record; that is intentional for the #750 regression guardrail.

## Validation Already Passed

Run from repo root unless noted:

```bash
npm run test:pinpoint-guardrails
npm run typecheck
npm run validate:data
cd worker && npm run typecheck
```

All four commands passed after PR3.

## PR1 - Shared Publish Eligibility Gate

### Purpose

Make Worker, release, validation, and tests agree on what can be written as public `published/live` content.

### Include Files

- `lib/puzzles/publish-eligibility.shared.mjs`
- `lib/puzzles/publish-eligibility.shared.d.mts`
- `lib/puzzles/publish-eligibility.d.ts`
- `lib/puzzles/schema.shared.mjs`
- `lib/puzzles/schema.shared.d.mts`
- `lib/puzzles/schema.ts`
- `scripts/release-production.mjs`
- `scripts/validate-data.ts`
- `scripts/check-pinpoint-guardrails.ts`
- `worker/src/index.ts`

### Required Cherry-Pick Scope

Only include PR1 hunks that:

- Add `publishMode` enum/schema support.
- Add shared `validatePublishEligibility`.
- Wire release production checks to shared eligibility.
- Wire Worker final public publish path to shared eligibility.
- Keep `answer-first` disabled by default via `publishMode.answerFirstDisabled`.
- Preserve legacy data compatibility in `validate:data`.
- Add #750 short/light-explainer regression coverage.

### Exclude From PR1

- `publish-failure-summary.*`
- `pinpoint-evidence-v1.*`
- `release-override.*`
- `tests/fixtures/pinpoint/evidence/*`
- Worker lightweight failure summary/KV streak helpers.
- Evidence V1 parameters on `validatePublishEligibility`.
- Override dry-run tests.

### Review Checklist

- `answer-first` cannot pass production eligibility unless explicitly enabled.
- `failed` payloads cannot be treated as public final payloads.
- `validate:data` does not break all historical legacy entries.
- `release-production.mjs` fails before Vercel publish if the active target payload violates publish eligibility.
- Worker does not write a #750-style short/light-explainer as `full-analysis`.

### Suggested Commit Message

```text
feat: add shared Pinpoint publish eligibility gate
```

## PR2 - Final Payload Failure Handling

### Purpose

When PR1 eligibility blocks final public payloads, do not write bad `published/live` data. Instead, emit actionable diagnostics.

### Depends On

PR1.

### Include Files

- `lib/puzzles/publish-failure-summary.shared.mjs`
- `lib/puzzles/publish-failure-summary.shared.d.mts`
- `lib/puzzles/publish-failure-summary.d.ts`
- `worker/src/index.ts`
- `scripts/check-pinpoint-guardrails.ts`

### Required Cherry-Pick Scope

Only include PR2 hunks that:

- Add `buildLightweightPublishFailureSummary`.
- Add `updateLightweightPublishFailureStreak`.
- Store lightweight summary in KV at `publish:failure-summary:<logicalGameDate>:<slug>`.
- Maintain rolling failure streak in KV at `publish:failure-streak:pinpoint`.
- Send a notification with `slug`, `logicalGameDate`, `publishMode`, `sourceConfidence: "unknown"`, and blocking issue codes.
- Avoid recursive writes of `failedPayload` for `PublishEligibilityBlockedError`.
- Add guardrail tests for lightweight summary shape and same-day/non-same-day streak behavior.

### Exclude From PR2

- Evidence V1.
- Override schema.
- #724 evidence fixtures.
- Any production-effective override.
- Any SLA cron, candidate branch, rendered HTML, link graph, or model routing logic.

### Review Checklist

- Eligibility-blocked final payloads do not write `failed` or any other public path as a fallback.
- Non-eligibility errors keep the existing failure behavior unless explicitly changed in review.
- Same-day retries do not inflate the continuous-failure streak.
- Three consecutive logical dates trigger one deduped high-priority notification.
- Summary payload contains actionable issue codes, not raw secrets or full model payloads.

### Suggested Commit Message

```text
feat: record Pinpoint publish failure summaries
```

## PR3 - Evidence V1 and Override Dry-Run

### Purpose

Add minimum Evidence V1 and override schema validation as dry-run/testable contracts without enabling production bypasses.

### Depends On

PR1 and PR2.

### Include Files

- `lib/puzzles/pinpoint-evidence-v1.shared.mjs`
- `lib/puzzles/pinpoint-evidence-v1.shared.d.mts`
- `lib/puzzles/pinpoint-evidence-v1.d.ts`
- `lib/puzzles/pinpoint-evidence-v1.ts`
- `lib/puzzles/release-override.shared.mjs`
- `lib/puzzles/release-override.shared.d.mts`
- `lib/puzzles/release-override.d.ts`
- `lib/puzzles/release-override.ts`
- `lib/puzzles/publish-eligibility.shared.mjs`
- `lib/puzzles/publish-eligibility.shared.d.mts`
- `lib/puzzles/publish-eligibility.d.ts`
- `lib/puzzles/schema.shared.mjs`
- `lib/puzzles/schema.shared.d.mts`
- `lib/puzzles/schema.ts`
- `scripts/check-pinpoint-guardrails.ts`
- `tests/fixtures/pinpoint/evidence/pinpoint-answer-724.evidence.fixture.json`
- `tests/fixtures/pinpoint/evidence/pinpoint-answer-724.bad-mapping.evidence.fixture.json`

### Required Cherry-Pick Scope

Only include PR3 hunks that:

- Add Evidence V1 support levels: `deterministic`, `manual`, `weak`.
- Validate schema version, slug, puzzle number, `logicalGameDate`, source timezone, answer, clue count, clue order, clue refs, weak support, and manual-review metadata.
- Reject fixture evidence paths when `productionEvidence: true`.
- Add optional evidence parameters to shared `validatePublishEligibility`.
- Keep evidence validation opt-in via `requireEvidenceForFullAnalysis`, `evidenceArtifact`, or `evidenceArtifactPath`.
- Extend `clueRows` schema to allow optional `evidenceRef`, `phraseExample`, and `fitConfidence`.
- Add release override schema dry-run with required reviewer/reason/timestamps, max 48-hour window, active issue-code matching, and disallowed core issue codes.
- Ensure override dry-run always returns `productionEffective: false`.
- Add #724 good/bad fixtures and guardrail coverage.

### Exclude From PR3

- Reading production evidence from repo paths in Worker.
- Making evidence required for all production releases by default.
- Any production-effective release override.
- KV/runtime emergency override.
- Search grounding or multi-model consensus.
- Rendered HTML/link/schema blocking gates.

### Review Checklist

- Missing evidence can be tested as blocking only when evidence is explicitly required.
- Fixture evidence is rejected in production mode with `evidence.fixtureInProduction`.
- #724 bad fixture catches swapped clue mapping and weak support.
- Manual evidence requires reviewer, reason, timestamp, and changed fields.
- Override dry-run rejects missing fields, expired overrides, >48h overrides, inactive issue codes, and core disallowed issue codes.
- Override dry-run cannot bypass production gates.

### Suggested Commit Message

```text
feat: add Pinpoint evidence V1 dry-run guards
```

## Suggested Staging Commands

These are examples only; review hunks interactively before staging because several files contain changes for more than one PR.

```bash
git add -p lib/puzzles/schema.shared.mjs lib/puzzles/schema.shared.d.mts lib/puzzles/schema.ts
git add -p lib/puzzles/publish-eligibility.shared.mjs lib/puzzles/publish-eligibility.shared.d.mts lib/puzzles/publish-eligibility.d.ts
git add -p scripts/release-production.mjs scripts/validate-data.ts scripts/check-pinpoint-guardrails.ts worker/src/index.ts
```

For PR2:

```bash
git add lib/puzzles/publish-failure-summary.shared.mjs lib/puzzles/publish-failure-summary.shared.d.mts lib/puzzles/publish-failure-summary.d.ts
git add -p worker/src/index.ts scripts/check-pinpoint-guardrails.ts
```

For PR3:

```bash
git add lib/puzzles/pinpoint-evidence-v1.shared.mjs lib/puzzles/pinpoint-evidence-v1.shared.d.mts lib/puzzles/pinpoint-evidence-v1.d.ts lib/puzzles/pinpoint-evidence-v1.ts
git add lib/puzzles/release-override.shared.mjs lib/puzzles/release-override.shared.d.mts lib/puzzles/release-override.d.ts lib/puzzles/release-override.ts
git add tests/fixtures/pinpoint/evidence/pinpoint-answer-724.evidence.fixture.json tests/fixtures/pinpoint/evidence/pinpoint-answer-724.bad-mapping.evidence.fixture.json
git add -p lib/puzzles/publish-eligibility.shared.mjs lib/puzzles/publish-eligibility.shared.d.mts lib/puzzles/publish-eligibility.d.ts
git add -p lib/puzzles/schema.shared.mjs lib/puzzles/schema.shared.d.mts lib/puzzles/schema.ts scripts/check-pinpoint-guardrails.ts
```

## Reviewer Warning

Do not stage the existing untracked audit docs into implementation PRs unless the reviewer explicitly wants docs bundled with code:

- `docs/full-audit-remediation-plan-2026-05-19.md`
- `docs/gsc-ranking-recovery-plan-2026-05-19.md`
- `docs/homepage-today-answer-strategy-review-2026-05-19.md`
- `docs/phase0-seo-integrity-day0-check-2026-05-19.md`

The primary remediation plan and this handoff can be reviewed separately:

- `docs/content-quality-release-gate-remediation-plan-2026-05-20.md`
- `docs/content-quality-release-gate-pr-split-handoff-2026-05-21.md`
