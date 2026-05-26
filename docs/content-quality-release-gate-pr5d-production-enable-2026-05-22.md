# PR5D Production Release Queue Enablement

Date: 2026-05-22
Status: production flag enablement pending deploy

## Scope

Enable the Pinpoint release queue on the production Worker only:

```text
PINPOINT_RELEASE_QUEUE_ENABLED=true
PINPOINT_RELEASE_QUEUE_OVERRIDE_SECOND_PUSH=false
PINPOINT_CANDIDATE_BRANCH_ENABLED=false
```

The queue still applies only to public payloads on the primary `main` branch. It does not change draft validation, rendered gates, candidate branch naming, or Vercel deployment behavior.

## Staging Evidence

The staging Worker was validated with the read-only queue simulation matrix after rotating the staging-only `ADMIN_SECRET`:

```text
queued -> write-candidate / production-deployment-queued
building -> write-candidate / production-deployment-building
unknown -> write-candidate / production-deployment-unknown
failed -> hold-review / production-deployment-failed
same-slug-budget -> write-candidate / production-push-budget-exhausted
override-second-push -> push-production / production-push-allowed
```

## Production Behavior

With the flag enabled:

- the first same-slug production write can proceed when Vercel status is `none` or otherwise eligible
- queued/building/unknown Vercel status writes to the deterministic candidate branch
- failed Vercel status enters review and does not write production
- a second same-slug production push inside the 60-minute window writes candidate unless `PINPOINT_RELEASE_QUEUE_OVERRIDE_SECOND_PUSH=true`
- candidate branches are auto-promoted only after CI machine checks pass, the branch only changes allowed puzzle files, and the public fetch audit passes
- if that success path stalls, the `Pinpoint Candidate Watchdog` workflow runs after CI and every 30 minutes; it promotes/deletes branches that are already safe, retries failed candidate CI, and opens a GitHub issue when a branch cannot be closed automatically

## First-Run Observation

Use the production observation command after each cron window until the first real publish has been reviewed:

```bash
npm run worker:release-queue-observe -- --date 2026-05-23
```

The command checks:

- production Worker `/health`
- latest GitHub `main` commit
- combined commit status and Vercel status
- candidate branches matching the observation date or slug

Also run the Worker-token status check before the next cron window:

```bash
npm run worker:release-queue-status-check -- --env prod
```

If a same-day candidate branch appears, do not manually merge it first. Let CI or the watchdog close it. A candidate is not considered closed until the public page audit passes, the candidate branch is deleted, and the candidate branch count returns to 0. If no candidate branch appears and the Worker produced a single healthy production commit, the first-run observation can be marked complete.

## Rollback

If production publishing is unexpectedly held or routed to candidate:

1. Set `PINPOINT_RELEASE_QUEUE_ENABLED=false` in `worker/wrangler.toml`.
2. Deploy production Worker:

```bash
cd worker
npx wrangler deploy
```

3. Leave `PINPOINT_RELEASE_QUEUE_OVERRIDE_SECOND_PUSH=false`.
4. Inspect queue notifications and KV keys before re-enabling.

Rollback does not require changing GitHub, Vercel, or Worker secrets.
