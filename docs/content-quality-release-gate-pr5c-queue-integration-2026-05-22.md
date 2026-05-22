# PR5C Release Queue Integration

Date: 2026-05-22
Status: implemented behind a disabled-by-default Worker flag; ready for review

## Purpose

PR5C connects the PR5A queue policy to the Worker publish path without enabling it by default in production.

The goal is to prevent the same Pinpoint slug from creating repeated production commits while a Vercel deployment is still queued/building or while the 60-minute same-slug production push budget is active.

## Feature Flags

Committed defaults:

```text
PINPOINT_RELEASE_QUEUE_ENABLED=false
PINPOINT_RELEASE_QUEUE_SLA_WINDOW_MINUTES=60
PINPOINT_RELEASE_QUEUE_OVERRIDE_SECOND_PUSH=false
PINPOINT_CANDIDATE_BRANCH_ENABLED=false
PINPOINT_CANDIDATE_BRANCH_PREFIX=pinpoint/candidate
```

`PINPOINT_RELEASE_QUEUE_ENABLED=true` is required before the Worker uses the queue policy on the primary `main` branch publish path.

`PINPOINT_CANDIDATE_BRANCH_ENABLED=true` still force-routes public payloads to candidate branches and takes precedence over the release queue. Keep it disabled in production unless running a controlled staging dry-run.

## Runtime Decision

When the release queue is enabled and the Worker is about to write a public Pinpoint payload to the primary branch:

1. Read the current base branch ref from GitHub.
2. Read the combined commit status for the base commit.
3. Map the Vercel status:
   - `pending` -> `building`
   - `success` -> `ready`
   - `failure` / `error` -> `failed`
   - missing Vercel status -> `unknown`
4. Read the same-slug production push timestamp from KV:
   - `pinpoint:release-queue:last-production-push:<slug>`
5. Check whether the deterministic candidate branch exists:
   - `pinpoint/candidate/<logicalGameDate>-<slug>`
6. Compare candidate branch freshness against the base branch.
7. Call `decidePinpointReleaseQueueAction()`.

Actions:

| Action | Worker behavior |
| --- | --- |
| `push-production` | Continue writing the public payload to `main`; record the same-slug production push timestamp in KV. |
| `write-candidate` | Create/update the deterministic candidate branch; do not revalidate production; send a queue notification. |
| `hold-review` | Do not write a public payload; send a review notification. |

If a candidate branch already exists, the Worker does not auto-promote it. Even a current candidate stays in `write-candidate` with `candidate-branch-awaiting-promotion` unless a future maintainer-controlled promotion path explicitly passes `allowCandidatePromotion`.

## Read-Only Staging Simulation

Staging cannot safely exercise the real release queue by pointing `GITHUB_BRANCH_NEW_SITE` at `main`: that would make an admin publish capable of touching the production branch.

Use the admin-only, read-only simulation endpoint instead:

```bash
curl -X POST "https://pinpoint-worker-staging.<account>.workers.dev/admin/release-queue-dry-run?secret=<admin-secret>&simulatePrimary=1&releaseQueueEnabled=1&date=2026-05-22&puzzleNumber=752&deploymentState=queued"
```

For the full repeatable matrix, prefer the repo script:

```bash
ADMIN_SECRET=<staging-worker-admin-secret> \
  npm run worker:release-queue-dry-run -- --date 2026-05-22 --puzzle-number 752
```

The script intentionally reads the secret only from environment variables or local ignored env files; it never writes the secret to the repository.

Expected behavior:

- `readOnly=true`
- `simulatePrimary=true`
- `queueEligible=true`
- `decision.action=write-candidate`
- no GitHub ref writes
- no ISR revalidation
- no queue notification

Useful scenarios:

| Scenario | Query params | Expected decision |
| --- | --- | --- |
| Vercel queue/build pressure | `deploymentState=queued` or `deploymentState=building` | `write-candidate` |
| Missing Vercel status | `deploymentState=unknown` | `write-candidate` |
| Failed production deployment | `deploymentState=failed` | `hold-review` |
| Same-slug push budget exhausted | `deploymentState=ready&lastProductionPushAt=<ISO time within 60 min>` | `write-candidate` |
| Explicit second-push override | `deploymentState=ready&lastProductionPushAt=<ISO time within 60 min>&overrideSecondProductionPush=1` | `push-production` |

## What This Does Not Do

This PR does not add automatic promotion.

Candidate branches still require maintainer review and a separate merge/promote decision. The queue integration only decides where the Worker writes the generated payload.

This PR also does not introduce Vercel API credentials. It uses GitHub commit status for the Vercel deployment signal, matching the existing GitHub integration path.

## Acceptance

Local acceptance:

```bash
npm run test:pinpoint-guardrails
cd worker && npm run typecheck
cd worker && npx wrangler deploy --dry-run
```

Expected:

- release queue integration remains behind `PINPOINT_RELEASE_QUEUE_ENABLED=false`
- Vercel pending status maps to `building`
- failed Vercel status maps to `failed`
- same-slug push budget is persisted only after a production public commit
- existing candidate branches do not auto-promote
- candidate writes do not trigger ISR revalidation
- hold-review writes no public payload

## Rollback

If the queue behavior is confusing or too conservative:

1. Keep `PINPOINT_RELEASE_QUEUE_ENABLED=false`.
2. Keep `PINPOINT_CANDIDATE_BRANCH_ENABLED=false`.
3. Continue using PR4 rendered gate on `main`.
4. Inspect queue notification fields and KV keys before enabling again.
