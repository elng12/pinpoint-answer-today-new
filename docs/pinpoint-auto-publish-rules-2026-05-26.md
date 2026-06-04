# Pinpoint Auto Publish Rules

Date: 2026-05-26
Status: production settings reviewed; first guardrails tightened
Competitor snapshot: `/Users/elng/Downloads/us.sitesucker.mac.sitesucker-pro/pinpointanswer.today`

## Plain Goal

We do not need a person to review every page.

We need hard rules.

The daily page can auto-publish only when the machine can prove these things:

- the puzzle data is correct
- the page shape is complete
- Google can read the answer page
- the published URL really works

If a hard rule fails, do not publish.

If a soft rule fails, publish only in a safer mode or send it to review.

## What The Competitor Does

The local competitor snapshot shows a simple daily system:

- one detail page per puzzle
- route pattern: `/linkedin-pinpoint-answer/pinpoint-{number}/`
- archive page: `/linkedin-pinpoint-answer/`
- 268 local detail pages, from `pinpoint-458` to `pinpoint-725`
- every detail page uses `index, follow`
- every detail page has 5 clue cards
- every detail page has a reveal-answer button
- every detail page links to recent answers
- most recent pages have a 5-row explanation table
- most recent pages have FAQ
- the answer text exists in the HTML, even if the user sees a reveal button

The useful lesson is not that their content is perfect.

The useful lesson is that their page shape is stable every day.

## Rules We Should Copy

These are the rules we should keep for our own auto-publish system.

### Latest Page Rules

The homepage must show the latest puzzle.

Required:

- latest puzzle number
- latest game date
- latest 5 clues
- latest answer section
- link to the latest detail page
- recent answers list

If the homepage still shows yesterday's puzzle, the publish is not done.

### Detail Page Rules

Every published detail page must have:

- fixed URL: `/linkedin-pinpoint-answers/pinpoint-answer-{number}/`
- title containing `LinkedIn Pinpoint` and the puzzle number
- H1: `Pinpoint {number} Answer & LinkedIn Analysis`
- date
- puzzle number
- exactly 5 clues
- answer text visible in rendered HTML
- five complete and specific clue explanations
- `LinkedIn Pinpoint {number} Answer Reasoning`
- `What This Pinpoint Teaches` teaching items
- recent answer links
- archive link path
- keyword order that follows `docs/pinpoint-detail-keyword-density-rules-2026-05-30.md`

The answer must be present in rendered HTML.

It is okay to use a reveal button for users, but Google must still be able to see the answer in the HTML.

For the daily operator checklist, use `docs/pinpoint-detail-publish-checklist-2026-05-31.md`.

### SEO Rules

A public full answer page must have:

- `index, follow`
- correct canonical URL
- sitemap inclusion
- page title with search intent
- meta description
- structured data where our site supports it
- no accidental `noindex`

Target search wording is split by page type.

Homepage wording:

- `LinkedIn Pinpoint answer today`
- `Pinpoint answer today`

Detail page wording:

- `LinkedIn Pinpoint {number} answer`
- `Pinpoint {number} answer`
- current clue path

### Archive And Link Rules

The new page must be reachable from:

- homepage
- archive page
- recent answers section
- sitemap
- previous or nearby detail pages when possible

If the page exists but no other page links to it, it is not ready for auto-publish.

## Rules We Should Not Copy

The competitor has weak spots we should avoid:

- do not index weak legal or utility pages just because they exist
- do not use `website` as the only page type everywhere
- do not skip structured data on detail pages when our system can add it
- do not restore old table-only explanation modules just because the competitor uses them
- do not split `What This Pinpoint Teaches` back into separate FAQ and lessons modules
- do not hide the answer so completely that Google cannot see it

## Hard Block Rules

If any of these happen, stop the publish.

### Puzzle Data Blocks

- date is missing
- date is wrong
- puzzle number is missing
- puzzle number is repeated
- puzzle number jumps unexpectedly
- answer is empty
- answer is `unknown`, `TBD`, `coming soon`, or placeholder text
- clues are missing
- clues are not exactly 5
- clues are empty
- clue order changed by accident
- candidate answer does not match the source answer
- candidate clues do not match the source clues
- new page contains old puzzle number, old date, old clues, or old answer

### Page Content Blocks

- title is missing
- H1 is missing
- answer section is missing
- rendered page does not have exactly 5 clue cards
- five complete and specific clue explanations are missing
- `Answer Reasoning` is missing
- `What This Pinpoint Teaches` has too few teaching items
- recent answer links are missing
- answer and explanation disagree
- one part of the page says answer A, another part says answer B
- page contains placeholder text like `TODO`, `TBD`, `placeholder`, `insert answer`, or `unknown`
- content is too short to be a real answer page

### Search Blocks

- public full answer page has `noindex`
- canonical URL is wrong
- sitemap does not include the new page
- answer is not visible in rendered HTML
- all 5 clues are not visible in rendered HTML
- title does not target `LinkedIn Pinpoint answer`
- page cannot be reached from homepage or archive

### Publish Blocks

- build fails
- route returns 404
- public fetch fails
- public HTML cannot be checked
- production summary points to the wrong latest puzzle
- sitemap is stale after publish

## Safer Downgrade Rules

Some pages should not become public full-analysis pages yet, but they can still be kept in a safer state.

Use `answer-first noindex` when:

- answer and clues are correct
- full explanation is not strong enough yet
- explanation is too generic
- internal links need cleanup
- teaching items are weak but the answer page shell exists

In this mode:

- do not add it to sitemap
- do not show it as a normal public full-analysis page
- keep it in the enrichment or review path

## Soft Warning Rules

These should not block the first version of auto-publish:

- article is not beautifully written
- teaching items could be richer
- intro could be better
- page could use better internal links
- wording feels a little template-like
- visual layout can be improved

These are improvement tasks, not hard stops.

## Current Code Coverage

This repo already has many of the pieces.

Production settings already match the automatic publish direction:

- Worker cron runs at the LinkedIn reset window.
- `AUTO_PUBLISH_ENABLED=true`.
- `AUTO_ENRICH_ENABLED=true`.
- `PINPOINT_RELEASE_QUEUE_ENABLED=true`.
- `PINPOINT_AUTO_PUBLISH_PAUSED=false` by default, with a KV-backed admin pause switch for emergencies.
- shadow and staging environments do not have production cron enabled.

| Rule area | Current status | Main files |
| --- | --- | --- |
| basic puzzle data check | mostly exists | `scripts/validate-data.ts` |
| source answer and 5 clues match candidate | exists in content-kitchen candidate check | `lib/puzzles/content-kitchen/validate-candidate.ts` |
| slug and canonical match source puzzle | exists | `lib/puzzles/content-kitchen/validate-candidate.ts` |
| answer and clues visible in rendered HTML | exists as a candidate rule | `lib/puzzles/content-kitchen/validate-candidate.ts` |
| full-analysis clue explanations | exists, requires five complete and specific clue explanations | `lib/puzzles/content-kitchen/full-analysis.ts` |
| full-analysis reasoning | exists, blocks generic reasoning | `lib/puzzles/content-kitchen/full-analysis.ts` |
| teaching item shape | exists in rendered detail checks through `What This Pinpoint Teaches`; old separate FAQ UI should not return | `scripts/check-pinpoint-rendered-content.ts`, `components/detail/PuzzleFullAnalysis.tsx` |
| internal link shape | exists | `lib/puzzles/content-kitchen/full-analysis.ts` |
| index/noindex policy | exists | `lib/puzzles/content-kitchen/policies.ts` |
| public page fetch after publish | exists | `lib/puzzles/content-kitchen/post-publish-audit.ts` |
| public answer and clues visible after publish | exists | `lib/puzzles/content-kitchen/post-publish-audit.ts` |
| public canonical/robots/sitemap audit | exists | `lib/puzzles/content-kitchen/post-publish-audit.ts` |
| production release public fetch audit | wired into release script | `scripts/release-production.mjs` |
| one-command pre-publish gate | exists and is called by `release:production` | `scripts/check-pinpoint-prepublish-gate.ts`, `package.json`, `scripts/release-production.mjs` |
| post-deploy detail publish check | exists and is called by `release:production`; failures are classified as P0/P1/P2 and send webhook alerts when configured | `scripts/check-detail-publish.ts`, `scripts/release-production.mjs` |
| fast clue explanations | allowed when all 5 generated clue explanations are complete and specific; `MISSING_EVIDENCE_REF` is info only and does not create a follow-up task under the current policy | `scripts/check-pinpoint-prepublish-gate.ts`, `lib/puzzle-generation/prompt-builder.ts`, `docs/pinpoint-evidence-ref-policy-2026-05-31.md` |
| detail publish checklist | exists as the operator-facing final checklist for local and production verification | `docs/pinpoint-detail-publish-checklist-2026-05-31.md` |
| daily Worker post-publish public audit | exists, checks detail page, sitemap, homepage, archive, and summary API; P0 failures send webhook alerts and pause the next auto-publish run | `worker/src/index.ts` |
| emergency pause switch | exists, keeps fetch/KV but stops scheduled publish | `worker/src/index.ts`, `scripts/worker-ops.mjs` |
| daily status report | exists, reports published, downgraded, candidate, blocked, paused, or needs review, plus the production-site state | `worker/src/index.ts` |

## Gaps To Close

These are the remaining weak parts before broader unattended auto-publish.

1. Make the daily Worker status report easier to read from the ops CLI.
2. Keep watching whether the Worker in-process publish guard and the local pre-publish gate drift apart.
3. If they drift, move the shared checks into one reusable library used by both paths.

Evidence refs are not a current gap for the accepted fast clue-explanation path. The current rule is documented in `docs/pinpoint-evidence-ref-policy-2026-05-31.md`.

## First Auto-Publish Standard

The first version should be strict but simple.

Auto-publish only when:

- puzzle number is correct
- game date is correct
- answer is correct and non-empty
- exactly 5 clues are present
- detail page has answer, 5 clue cards, `Answer Reasoning`, `What This Pinpoint Teaches`, and recent links
- title and H1 target Pinpoint answer searches
- detail keyword order passes the fixed detail-page rule
- page is indexable
- sitemap includes the page
- homepage and archive link to the page
- public URL returns a good page after publish
- public HTML shows the answer and all 5 clues

If all pass, publish.

If any hard rule fails, block.

If only explanation strength fails, downgrade to `answer-first noindex` and keep working on it.

## Suggested Next Work

The single pre-publish gate now exists. Keep its output simple:

```text
AUTO_PUBLISH_ALLOWED
BLOCK_PUBLISH
DOWNGRADE_TO_ANSWER_FIRST_NOINDEX
REVIEW_REQUIRED
```

Next work is maintenance:

- keep the local gate, Worker gate, and `docs/pinpoint-detail-publish-checklist-2026-05-31.md` in sync
- make the daily Worker status report easier to read from the ops CLI
- keep the detail keyword audit aligned with the browser Traffic.cv / AITDK panel
- keep Feishu/Slack webhook env vars present in the release environment so post-deploy failures are visible immediately

This gives us the same daily machine rhythm as the competitor, but with harder safety rules.
