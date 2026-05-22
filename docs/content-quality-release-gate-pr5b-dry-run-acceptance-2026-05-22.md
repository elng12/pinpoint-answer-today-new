# PR5B Candidate Branch Dry-Run Acceptance

Date: 2026-05-22
Status: remote staging dry-run passed; staging flag restored to disabled

## Purpose

This runbook verifies that PR5B can write a public Pinpoint payload to a candidate branch without touching the production branch.

It is intentionally narrower than `/admin/run`:

- it does not fetch LinkedIn
- it does not call LLM enrichment
- it does not trigger ISR revalidation
- it does not consume the Feishu production publish notification key
- it must not run when `GITHUB_BRANCH_NEW_SITE=main`

## Local Implementation

Worker endpoint:

```text
POST /admin/candidate-branch-dry-run
```

Required protections:

- `secret` query parameter must match `ADMIN_SECRET`
- `PINPOINT_CANDIDATE_BRANCH_ENABLED=true`
- `GITHUB_BRANCH_NEW_SITE` must not be `main`
- method must be `POST`

The endpoint builds a synthetic `fallback_full` public payload and calls the same `publishToNewSiteGitHub()` writer used by the real publish flow. That means the branch creation, file comparison, Git tree, commit, and ref update code path is real.

## Staging Preconditions

Staging Worker should have:

```text
GITHUB_REPO_NEW_SITE=elng12/pinpoint-answer-today-new
GITHUB_BRANCH_NEW_SITE=worker-staging
PINPOINT_CANDIDATE_BRANCH_ENABLED=true
PINPOINT_CANDIDATE_BRANCH_PREFIX=pinpoint/candidate
```

The committed `wrangler.toml` default is `PINPOINT_CANDIDATE_BRANCH_ENABLED=false`. Turn it on only for the staging dry-run window, then turn it back off.

Required secrets:

```text
ADMIN_SECRET
GITHUB_TOKEN_NEW_SITE
```

Optional secrets are not required for this dry-run:

```text
NEW_SITE_REVALIDATE_SECRET
SITE_API_TOKEN
LLM_API_KEY
FEISHU_WEBHOOK_URL
```

## Execute

Use a synthetic slug that cannot collide with normal daily puzzle numbers:

```bash
ADMIN_SECRET=... \
curl -sS -X POST \
  "https://pinpoint-worker-staging.2296744453m.workers.dev/admin/candidate-branch-dry-run?secret=${ADMIN_SECRET}&date=2026-05-22&puzzleNumber=900752&answer=Candidate%20Dry%20Run&words=ALPHA,BRAVO,CHARLIE,DELTA,ECHO"
```

Expected response shape:

```json
{
  "ok": true,
  "mode": "candidate-branch-dry-run",
  "baseBranch": "worker-staging",
  "candidateBranch": "pinpoint/candidate/2026-05-22-pinpoint-answer-900752",
  "slug": "pinpoint-answer-900752",
  "detailState": "fallback_full",
  "productionBranchTouched": false,
  "revalidateTriggered": false
}
```

## Verify GitHub State

```bash
git fetch origin pinpoint/candidate/2026-05-22-pinpoint-answer-900752
git diff --name-only origin/worker-staging..FETCH_HEAD
```

Expected changed files:

```text
data/puzzles/pinpoint-answer-900752.json
data/puzzles/registry.json
```

Expected not changed:

```text
app/**
components/**
lib/**
scripts/**
docs/**
release-overrides/**
```

## Verify Production Was Not Touched

```bash
git ls-remote origin main
git ls-remote origin pinpoint/candidate/2026-05-22-pinpoint-answer-900752
```

Acceptance:

- `main` SHA does not change during the dry-run window
- candidate branch exists
- candidate branch points to a commit that is not on `main`

## Verify Candidate Branch Gates

```bash
git worktree add /tmp/pinpoint-pr5b-candidate FETCH_HEAD
cd /tmp/pinpoint-pr5b-candidate
npm ci
npm run build
npm run test:pinpoint-rendered
```

Acceptance:

- build succeeds
- rendered gate includes the synthetic public detail page
- sitemap includes the synthetic public detail page with a fresh `lastmod`

## Cleanup

If this is only a smoke test and no review is needed:

```bash
git push origin --delete pinpoint/candidate/2026-05-22-pinpoint-answer-900752
```

If it is used as review evidence, keep the branch until the reviewer records the CI result.

## 2026-05-22 Remote Staging Result

Completed:

- Worker endpoint implemented.
- Endpoint is POST-only.
- Endpoint is admin-gated.
- Endpoint rejects primary-branch environments.
- Endpoint requires `PINPOINT_CANDIDATE_BRANCH_ENABLED=true`.
- Guardrail coverage added to `npm run test:pinpoint-guardrails`.
- `worker` typecheck passes.
- Cloudflare staging deploy with `PINPOINT_CANDIDATE_BRANCH_ENABLED=true` succeeded.
- `POST /admin/candidate-branch-dry-run` succeeded on staging.
- Candidate branch created:

```text
pinpoint/candidate/2026-05-22-pinpoint-answer-900752
```

- Candidate branch commit:

```text
eac1dac3459d070abf60a82948a18b2ddd101d99
chore: stage pinpoint-answer-900752 candidate for 2026-05-22 (fallback_full, candidate-branch-enabled)
```

- `main` SHA observed during verification:

```text
863efffc52be2194839d99f2718b0980582aa6df
```

- `worker-staging` SHA observed during verification:

```text
07a3fbf94e4bc84f6f501937fc924f06af5fc44c
```

Candidate diff versus `worker-staging`:

```text
A data/puzzles/pinpoint-answer-900752.json
M data/puzzles/registry.json
```

Worker dry-run response confirmed:

```json
{
  "ok": true,
  "mode": "candidate-branch-dry-run",
  "repo": "elng12/pinpoint-answer-today-new",
  "baseBranch": "worker-staging",
  "candidateBranch": "pinpoint/candidate/2026-05-22-pinpoint-answer-900752",
  "slug": "pinpoint-answer-900752",
  "puzzleDate": "2026-05-22",
  "puzzleNumber": 900752,
  "detailState": "fallback_full",
  "productionBranchTouched": false,
  "revalidateTriggered": false
}
```

Rollback completed:

- Staging was redeployed with `PINPOINT_CANDIDATE_BRANCH_ENABLED=false`.
- Negative check after rollback returned `409` with the candidate flag disabled guard.

Not completed locally:

- Candidate branch CI/rendered gate was not run from GitHub in this pass. The created candidate branch is based on `worker-staging`; PR4 rendered gate must be present on the candidate base branch before using this path as the full PR4+PR5 promotion check.
