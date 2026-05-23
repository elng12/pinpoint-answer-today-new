# Pinpoint Content Kitchen Rollout Playbook

Date: 2026-05-23
Status: rollout playbook
Parent architecture doc: `docs/pinpoint-content-kitchen-competitor-derived-plan-2026-05-22.md`
First execution ticket: `docs/pinpoint-content-kitchen-pr6a-mvp-2026-05-23.md`

## Purpose

This playbook defines when the content kitchen is allowed to move from local validation to real publishing automation.

The rule is simple:

> Do not scale automation before validation, review ownership, audit signals, and stop controls are trustworthy.

## Rollout Stages

### Stage 0 — Local Contract Only

Allowed:

- run PR6A fixtures
- run local typecheck/lint
- refine validator output

Not allowed:

- no production publish change
- no sitemap change
- no Worker publish change
- no GSC call
- no public URL audit
- no auto-publish

Exit criteria:

- `npm run test:content-kitchen` passes
- `npm run typecheck` passes
- `npm run lint` passes
- PR6A owner signs off

### Stage 1 — Shadow Validation

Allowed:

- run validator against selected real records
- collect issue codes
- collect policy outputs
- collect estimated review/audit workload

Not allowed:

- do not block current publishing
- do not edit puzzle data
- do not change sitemap
- do not change public noindex/index policy
- do not fetch production URLs

Minimum sample:

- latest 30 public records
- known weak records `#701`, `#747`, `#748`, `#749`, `#750` when present
- 7 consecutive daily runs after shadow begins
- at least one legacy fallback record if present
- at least one `answer-first` or `light-explainer` style record if present

Exit criteria:

- no adapter-caused false P0 remains unexplained
- no hidden answer/clue issue is ignored
- issue code distribution is reviewed
- owner signs off that the validator is ready for manual publish use

### Stage 2 — Manual Publish

Allowed:

- generate candidates
- require human approval for `full-analysis`
- publish `answer-first` only as `noindex + sitemap exclude`

Not allowed:

- no automatic `full-analysis` publish
- no indexed `answer-first`
- no unattended review override

Exit criteria:

- review owner and backup are named
- review SLA is accepted
- P0 issue response path is tested
- audit output is readable by the operator

### Stage 3 — Limited Auto-Publish

Allowed:

- automatic `full-analysis` only for low-risk puzzle types
- ambiguous or weak-fit candidates go to review
- `answer-first` remains `noindex + sitemap exclude`

Not allowed:

- no auto-publish for weak evidence
- no L4-only full-analysis
- no indexed `answer-first`
- no historical backfill competing with daily publish

Exit criteria:

- cost stays under budget
- review backlog stays under capacity
- P0 issue count is zero
- post-publish audit pass rate meets canary threshold

Low-risk puzzle type v0:

- all five clues directly match reviewed L2 `category_membership.json`
- answer/category exists in the reviewed local dictionary
- no clue has multiple competing category mappings
- no clue depends on L4-only evidence
- no evidence source conflict exists
- generator output has exactly five clue rows
- reasoning pattern is `cumulative_confirmation`, unless a `turning_point` is explicitly supported by reviewed evidence
- no competitor similarity P0 is present

If a candidate misses any v0 low-risk rule, it goes to manual review.

Strong evidence coverage v0:

- 5/5 clue rows have `fitEvidence`
- 5/5 clue rows have fit evidence from reviewed L2 or human-reviewed L5
- 0 clue rows rely on L4-only evidence
- 0 unresolved source conflicts
- every evidence record has `sourceLevel`, `sourceType`, `claim`, and `confidence`
- every L2 evidence record has `lookupVersion`
- every retrieved evidence record has `retrievedAt`
- every clue row evidence ref points to the exact clue row it supports

If a candidate misses any v0 strong evidence rule, it cannot auto-publish as `full-analysis`.

### Stage 4 — Canary

Canary sample:

- at least 7 consecutive publishing days
- at least 30 new or newly validated pages
- at least 5 puzzle patterns when available
- maximum 5 automatic `full-analysis` publishes per day in first canary
- `answer-first` remains non-indexable

Go thresholds:

| Metric | Required result |
| --- | --- |
| wrong answer published | 0 |
| hidden answer or missing clues in public HTML | 0 |
| P0 post-publish audit failure | 0 |
| canonical / robots P0 issue | 0 |
| competitor similarity P0 | 0 |
| `full-analysis` audit pass rate | >= 95% |
| review backlog p95 age | < 24h |
| cost per page | under configured budget |

If any P0 occurs:

- pause auto-publish
- create a review/audit artifact
- fix or rollback
- restart the canary clock

### Stage 5 — Expanded Auto-Publish

Do not jump directly to full rollout.

Expansion should happen by daily quota:

1. canary quota
2. small daily quota increase
3. another clean review window
4. next quota increase
5. full rollout only after repeated clean windows

`answer-first` indexing remains disabled unless a separate SEO decision enables it.

If later enabled, cap indexed `answer-first` at:

```text
min(10% of recent 30 pages, 3 pages)
```

## Stop-The-Line Rules

Pause auto-publish immediately if any of these happen:

- wrong answer published
- hidden answer in public HTML
- missing L1 clues in public HTML
- repeated P0 post-publish audit failures
- canonical mismatch
- robots/noindex mismatch
- competitor similarity P0
- review queue exceeds capacity
- cost exceeds budget
- a large share of recent pages remains unresolved `answer-first`

## Stop-The-Line Ownership

Auto-publish cannot start without:

- named rollout owner
- named backup
- named review owner
- named backup reviewer

Pause rule:

- any reviewer may request a pause when they see P0 evidence
- rollout owner or backup must pause auto-publish

Resume rule:

- only rollout owner or backup may resume auto-publish
- resume requires a short written note explaining:
  - what failed
  - what changed
  - which validation passed
  - which audit passed
  - whether affected pages were repaired, downgraded, or rolled back

## Review Queue Rules

Before limited auto-publish:

- review owner must be named
- backup reviewer must be named
- review capacity must be defined
- escalation path must be defined

Default review capacity:

- one reviewer can handle up to 20 P1 items per day
- open P1 items above 30 means backlog exceeds capacity
- review backlog p95 age above 24 hours means backlog exceeds capacity
- any open P0 means auto-publish must pause
- if capacity is exceeded, do not expand canary or auto-publish quota

Default SLA:

- P0: immediate pause or rollback decision
- P1: handle within 24 hours
- P2: batch review within normal maintenance window

If review backlog exceeds capacity:

- pause rollout expansion
- route new weak candidates to `answer-first noindex`
- reduce automatic publish quota
- add review capacity before expanding again

## Evidence Owner Rules

Before PR7 can support automatic `full-analysis`:

- `category_membership.json` must have an owner
- `alias_dictionary.json` must have an owner
- dictionary review process must be defined
- dictionary versioning must be recorded
- affected-page lookup by dictionary version must be possible

Unreviewed dictionary changes:

- may run in shadow
- may support manual review
- must not support automatic `full-analysis`

Human override:

- may approve one candidate revision
- does not automatically update L2 dictionary
- may suggest a dictionary change
- dictionary change still requires owner review

Minimum dictionary diff format:

```json
{
  "dictionaryName": "category_membership",
  "fromVersion": "2026-05-23.1",
  "toVersion": "2026-05-23.2",
  "changes": [
    {
      "type": "add",
      "category": "types of guitar",
      "member": "bass",
      "sourceNote": "curated",
      "reviewer": "reviewer-name",
      "risk": "low"
    }
  ],
  "affectedPublishedPages": []
}
```

Dictionary diff rules:

- every change needs `type`, normalized key/value, source note, reviewer, and risk
- risk should be `low`, `medium`, or `high`
- medium/high risk changes should create review artifacts for affected pages
- deleted or changed entries must preserve old lookup versions for old revisions

## Date And Sitemap Rules

`datePublished`:

- first public publish time for the canonical URL
- should not change on retries

`dateModified`:

- changes only on substantive content updates
- allowed changes include answer correction, full-analysis upgrade, material clue explanation change, material FAQ change, or important internal-link change
- not allowed for queue retry, rebuild, review status change, or noindex/index flip alone

Sitemap `lastmod`:

- must follow substantive content change
- must not be used to fake freshness

Noindex and sitemap:

- if `indexPolicy="noindex"`, then `sitemapPolicy` should be `exclude`
- noindex pages should remain crawlable; do not block them with robots.txt just to hide them

## Decisions Needed Before Auto-Publish

- rollout owner
- rollout backup
- review owner
- review backup
- cost budget
- review backlog capacity
- storage owner for content revisions
- storage owner for validation results
- storage owner for review/audit artifacts
- storage owner for usage logs
- confirm or update the v0 low-risk puzzle type definition
- confirm or update the v0 strong evidence coverage definition
