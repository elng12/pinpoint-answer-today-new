# Content Quality Release Gate - PR5 Candidate Branch and Queue Plan

Date: 2026-05-22
Status: PR5A and PR5B implementation ready for review; PR5B remote staging dry-run passed; PR5C+ not started

## Status Update

PR5A has been implemented locally as a pure queue policy helper:

- `lib/puzzles/release-queue-policy.shared.mjs`
- `lib/puzzles/release-queue-policy.shared.d.mts`
- `lib/puzzles/release-queue-policy.d.ts`
- guardrail coverage in `scripts/check-pinpoint-guardrails.ts`

PR5B has also been implemented locally as a disabled-by-default Worker candidate branch writer:

- `PINPOINT_CANDIDATE_BRANCH_ENABLED=false` remains the default behavior.
- When enabled, public payload writes go to `pinpoint/candidate/<logicalGameDate>-<slug>` instead of the configured production branch.
- Missing candidate branches are created from `GITHUB_BRANCH_NEW_SITE` before writing payload files.
- Candidate writes do not trigger ISR revalidation or consume the Feishu publish notification de-dupe key.
- A staging-only dry-run endpoint is available for acceptance: `POST /admin/candidate-branch-dry-run`.

PR5B does not add automatic promotion, queue-state API integration, Vercel CLI promotion, or automatic draft PR creation.

Remote staging dry-run result:

- staging was temporarily deployed with `PINPOINT_CANDIDATE_BRANCH_ENABLED=true`
- dry-run created `pinpoint/candidate/2026-05-22-pinpoint-answer-900752`
- candidate diff against `worker-staging` only touched `data/puzzles/pinpoint-answer-900752.json` and `data/puzzles/registry.json`
- staging was redeployed with `PINPOINT_CANDIDATE_BRANCH_ENABLED=false`
- negative check confirmed the endpoint returns `409` while the flag is disabled

## Problem

PR4 catches rendered failures after `next build`, but the current publish path can still push public data directly to `main`.

The remaining risk is deployment churn:

1. Worker publishes an `answer-first` or other public state to `main`.
2. Vercel starts a production build.
3. Enrichment completes shortly after.
4. Worker pushes another public commit for the same slug.
5. Vercel queues another production build, increasing latency and making release state harder to reason about.

The remediation plan already requires that same-slug enrichment should not create unlimited production commits inside the SLA window.

## Selected PR5 Direction

PR5 should introduce a candidate-first promotion boundary, but it should not immediately enable automatic promotion.

The first implementation should be dry-run or maintainer-triggered:

- Worker still must not auto-promote candidate branches to production.
- Main branch remains the only production branch.
- Candidate branches are used to validate final payloads with PR4 rendered gates before merge.
- Deployment queue state is recorded and reported, but unknown queue state must default to "do not push another production commit".

## Proposed Candidate Branch Contract

Branch format:

```text
pinpoint/candidate/<logicalGameDate>-<slug>
```

Example:

```text
pinpoint/candidate/2026-05-22-pinpoint-answer-752
```

Candidate branch content:

- `data/puzzles/<slug>.json`
- `data/puzzles/registry.json`
- optional pre-publish artifact under `output/publish-artifacts/<logicalGameDate>/<slug>.prepublish.json`

Candidate branch must not contain:

- unrelated docs-only cleanup
- unrelated historical puzzle edits
- production-effective override files
- generated screenshots or local artifacts

## Queue Decision States

PR5 should make the release decision explicit:

| Deployment state | Same slug public push allowed? | Required action |
| --- | --- | --- |
| `none` | yes, if local gates pass | push production or create candidate based on publish mode |
| `queued` | no | update/create candidate branch |
| `building` | no | update/create candidate branch |
| `ready` | yes, if candidate is still current | maintainer can merge/promote |
| `failed` | no automatic push | create review artifact and notify |
| `unknown` | no | candidate branch only |

For the same slug, production push budget should be:

- at most one production-affecting push inside the 60-minute SLA window
- no second production push while Vercel has a queued/building deployment for the current slug
- manual override required for a second production push inside the window

## Minimal Implementation Steps

### PR5A - Queue Policy Library `[LOCAL IMPLEMENTATION READY]`

Add a pure decision helper with tests.

Inputs:

- `slug`
- `logicalGameDate`
- `publishMode`
- `lastProductionPushAt`
- `deploymentState`
- `candidateBranchExists`
- `overrideSecondProductionPush`

Outputs:

- `action: "push-production" | "write-candidate" | "hold-review"`
- `reasonCode`
- `notificationFields`

Acceptance:

- queued/building/unknown never returns `push-production`
- ready can return `push-production` only when candidate is current
- second production push inside 60 minutes requires explicit override
- failed deployment returns `hold-review`

Implemented behavior:

- `deploymentState: "queued"` -> `write-candidate`
- `deploymentState: "building"` -> `write-candidate`
- unsupported deployment state -> normalized to `unknown` -> `write-candidate`
- recent production push inside SLA window -> `write-candidate`
- recent production push with explicit override -> `push-production`
- stale candidate branch -> `write-candidate`
- failed production deployment -> `hold-review`
- no active deployment and no recent push -> `push-production`

### PR5B - Candidate Branch Writer `[LOCAL IMPLEMENTATION READY]`

Add an isolated writer path, but keep it disabled by default.

Environment flag:

```text
PINPOINT_CANDIDATE_BRANCH_ENABLED=false
```

Optional branch prefix:

```text
PINPOINT_CANDIDATE_BRANCH_PREFIX=pinpoint/candidate
```

Acceptance:

- when disabled, existing Worker main-branch publishing remains unchanged
- when enabled in staging, public payloads are written to a candidate branch
- missing candidate branch is created from the configured base branch
- candidate branch writes do not trigger ISR revalidation
- candidate branch writes do not mark the production Feishu notification as already sent
- commit message includes slug, logical date, publish mode, and reason code

Implemented behavior:

- base branch comes from `GITHUB_BRANCH_NEW_SITE` and still defaults to `main`
- candidate branch name is deterministic: `pinpoint/candidate/<logicalGameDate>-<slug>`
- candidate commit title uses `candidate-branch-enabled` as the initial reason code
- non-public states still use the configured base branch; candidate mode only applies to public publish states
- staging dry-run route is admin-gated, POST-only, requires the candidate flag, and rejects primary-branch environments

Dry-run acceptance runbook:

- `docs/content-quality-release-gate-pr5b-dry-run-acceptance-2026-05-22.md`

### PR5C - Maintainer Promotion Flow

Do not auto-merge in PR5.

First acceptable flow:

1. Candidate branch receives payload.
2. CI runs `npm run build` and `npm run test:pinpoint-rendered`.
3. Maintainer reviews rendered gate result.
4. Maintainer merges candidate branch into `main`.
5. Production release script verifies Vercel success and live detail content.

Later optional flow:

- auto-promote only after three successful manual cycles and explicit approval.

## Notification Requirements

Every candidate or hold decision should report:

- slug
- logicalGameDate
- publishMode
- deploymentState
- action
- reasonCode
- candidateBranch
- whether a production push was skipped
- whether SLA clock is still active

## Explicit Non-Scope For PR5

PR5 should not include:

- automatic `answer-first` public enablement
- automatic SLA cron
- production-effective override
- KV/runtime emergency override
- auto-merge to `main`
- Vercel CLI `promote` in production
- new model routing
- search grounding or multi-model consensus

## Rollback

If candidate branch logic causes confusion:

1. Set `PINPOINT_CANDIDATE_BRANCH_ENABLED=false`.
2. Continue using PR4 rendered gate on `main`.
3. Keep queue decision logs for diagnosis.
4. Do not remove PR1-PR4 gates.

## Remaining Open Decisions Before PR5C

1. Who is the release maintainer allowed to merge candidate branches?
2. Should candidate branches be deleted after merge?
3. Should failed candidate CI notify Feishu only, or also create a GitHub issue?
4. Should candidate branch names include puzzle number only, or logical date plus slug?
5. Should Vercel queue state come from GitHub commit statuses first, Vercel API first, or both?
