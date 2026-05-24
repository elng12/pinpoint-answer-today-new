# PR9 Enrichment Dry-Run Usage

This is the local operator note for the PR9 answer-first enrichment worker dry run.

It is intentionally local-only:

- it does not publish content
- it does not send Feishu messages
- it does not write review queue storage
- it does not touch production storage
- it does not run Worker cron

## Inputs

Use a checked job input file:

```bash
lib/puzzles/content-kitchen/examples/enrichment-worker-dry-run.input.json
```

For a high-priority escalation example, use:

```bash
lib/puzzles/content-kitchen/examples/enrichment-worker-high-priority.input.json
```

## Inspect Only

Print the full dry-run result without writing files:

```bash
npm run content-kitchen:enrichment-dry-run -- \
  --input lib/puzzles/content-kitchen/examples/enrichment-worker-dry-run.input.json \
  --pretty
```

This prints:

- updated job state preview
- `runSummary`
- `actionDrafts`
- `healthReport`
- claimed jobs
- skipped jobs
- state advancement decisions

## Health Report

Start with `healthReport.status` before reading the full output.

The status values are:

- `ok`: no review action is needed
- `needs_review`: inspect review queue drafts before allowing automatic enrichment to continue
- `high_priority`: inspect high-priority action drafts before any future publish automation
- `blocked`: inspect dead-letter or max-attempt jobs before retrying the queue

The health report also includes:

- compact counts
- claimed job ids
- review job ids
- dead-letter job ids
- high-priority job ids
- active issue codes
- skip reasons

## Write Job State Preview

Write updated job state to a separate local file:

```bash
npm run content-kitchen:enrichment-dry-run -- \
  --input lib/puzzles/content-kitchen/examples/enrichment-worker-dry-run.input.json \
  --output /tmp/content-kitchen-worker-output.json \
  --pretty
```

Rules:

- the input file is read-only
- `--output` must not equal `--input`
- the output file can be used as the next dry-run input

## Write Action Drafts

Write only notification and review queue drafts to a separate local file:

```bash
npm run content-kitchen:enrichment-dry-run -- \
  --input lib/puzzles/content-kitchen/examples/enrichment-worker-dry-run.input.json \
  --action-output /tmp/content-kitchen-action-drafts.json \
  --pretty
```

The action output contains:

- `sourcePath`
- `writtenAt`
- notification drafts with `dispatchStatus: "not_sent"`
- review queue drafts with `persistenceStatus: "not_persisted"`

Rules:

- --action-output must not equal `--input`
- --action-output must not equal `--output`
- action drafts are for inspection only
- action drafts are not sent to Feishu
- action drafts are not written to review queue storage

## Write Both Files

Write job state preview and action drafts in one local run:

```bash
npm run content-kitchen:enrichment-dry-run -- \
  --input lib/puzzles/content-kitchen/examples/enrichment-worker-dry-run.input.json \
  --output /tmp/content-kitchen-worker-output.json \
  --action-output /tmp/content-kitchen-action-drafts.json \
  --pretty
```

Use this when manually checking one worker pass before any future production wiring.

## Resume From Output

Use a previous job-state output as the next input:

```bash
npm run content-kitchen:enrichment-dry-run -- \
  --input /tmp/content-kitchen-worker-output.json \
  --output /tmp/content-kitchen-worker-output-next.json \
  --action-output /tmp/content-kitchen-action-drafts-next.json \
  --now 2026-05-23T09:12:00.000Z \
  --worker-id worker-dry-run-next \
  --lock-minutes 10 \
  --pretty
```

This is still local-only. It only proves that queue state can be resumed and inspected.

## What To Check

After a normal SLA miss:

- `notificationDrafts[0].dispatchStatus` is `not_sent`
- `reviewQueueDrafts[0].persistenceStatus` is `not_persisted`
- `reviewQueueDrafts[0].reason` is `answer_first_review_required`

After a high-priority miss:

- output job state is `dead_letter`
- notification priority is `high_priority`
- review queue priority is `high_priority`
- high-priority action drafts are still `not_sent` and `not_persisted`
