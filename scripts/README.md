# Scripts

This directory contains project maintenance scripts for validation, release checks, Worker operations, visual smoke checks, Google Search Console queries, and Content Kitchen workflows.

Prefer the `npm run ...` commands in `package.json` for routine work. Run individual files directly only when debugging or following a runbook.

## Daily Validation

| Command | Script | Purpose |
| --- | --- | --- |
| `npm run validate:data` | `validate-data.ts` | Validates puzzle registry/detail JSON and content contracts. Also runs before `npm run build`. |
| `npm run typecheck` | TypeScript compiler | Checks TypeScript without emitting files. |
| `npm run lint` | ESLint | Lints `app`, `components`, and `lib` with zero warnings allowed. |
| `npm run build` | `validate:data` plus Next build | Production build path. |

## Regression and Guardrails

| Command | Script | Purpose |
| --- | --- | --- |
| `npm run test:pinpoint-seo` | `check-pinpoint-seo-builders.ts` | Checks SEO builders, metadata, and structured data behavior. |
| `npm run test:homepage-keyword-audit` | `/Users/elng/web/关键词密度脚本/check-fixtures.ts` | Checks homepage keyword audit fixtures for tokenizer, stop words, blocked phrases, compare mode, and source-mode conflict behavior. |
| `npm run test:pinpoint-routing` | `check-routing-regressions.ts` | Checks redirects, middleware, route handling, and legacy routing expectations. |
| `npm run test:pinpoint-rendered` | `check-pinpoint-rendered-content.ts` | Checks rendered content expectations for Pinpoint pages. |
| `npm run test:content-kitchen` | `check-content-kitchen-contract.ts` | Checks Content Kitchen data and contract assumptions. |
| `npm run test:pinpoint-guardrails` | `check-pinpoint-guardrails.ts` | Runs SEO/routing tests and broader release safety guardrails. |
| `npm run test:pinpoint-regression:core` | `run-pinpoint-regression.mjs --set core` | Runs the core content regression sample set. |
| `npm run test:pinpoint-regression:all` | `run-pinpoint-regression.mjs --set all` | Runs the full content regression sample set. |

## Release and Deployment

| Command | Script | Purpose |
| --- | --- | --- |
| `npm run release:production` | `release-production.mjs` | Orchestrates production release checks and release steps. |
| `npm run generate:static-page-metadata` | `generate-static-page-metadata.mjs` | Regenerates static page metadata from git modification dates. |
| `npm run pinpoint:prepublish-gate` | `check-pinpoint-prepublish-gate.ts` | Runs the one-command Pinpoint pre-publish gate and returns `AUTO_PUBLISH_ALLOWED`, `BLOCK_PUBLISH`, `DOWNGRADE_TO_ANSWER_FIRST_NOINDEX`, or `REVIEW_REQUIRED`. It also runs the detail keyword audit against rendered detail HTML. Complete generated clue explanations can pass now; `MISSING_EVIDENCE_REF` is info only under the current policy. See `docs/pinpoint-evidence-ref-policy-2026-05-31.md`. |
| `npm run pinpoint:candidate-close` | `close-pinpoint-candidate-branches.mjs` | Closes safe Pinpoint candidate branches or opens a tracked issue when one is stuck. |
| `npm run pinpoint:main-recovery` | `recover-pinpoint-main-content.mjs` | After a failed `main` CI run, tries only known content auto-repair and pushes a safe candidate branch for automatic promotion. |
| Vercel build hook | `vercel-ignore-build.mjs` | Determines whether Vercel can skip a build for a given change set. |
| `npm run prepare` | `install-hooks.mjs` | Installs local git hooks. |

## Worker Operations

| Command | Script | Purpose |
| --- | --- | --- |
| `npm run worker:preflight` | `worker-ops.mjs preflight --env prod` | Checks production Worker prerequisites. |
| `npm run worker:health` | `worker-ops.mjs health --env prod` | Checks Worker health through the configured production target. |
| `npm run worker:release-queue-dry-run` | `worker-ops.mjs release-queue-dry-run --env staging` | Runs release queue logic against staging without publishing. |
| `npm run worker:release-queue-status-check` | `worker-ops.mjs release-queue-status-check --env prod` | Checks whether the production Worker token can read GitHub/Vercel commit status. |
| `npm run worker:release-queue-observe` | `worker-ops.mjs release-queue-observe --env prod` | Observes production release queue state. |
| `npm run worker:auto-publish-pause` | `worker-ops.mjs auto-publish-pause --env prod` | Pauses scheduled auto-publish while keeping Worker fetch and KV writes. |
| `npm run worker:auto-publish-resume` | `worker-ops.mjs auto-publish-resume --env prod` | Clears the KV-backed auto-publish pause. |
| `npm run worker:auto-publish-pause-status` | `worker-ops.mjs auto-publish-pause-status --env prod` | Reads the active auto-publish pause status. |
| `npm run worker:refresh-cookie` | `worker-ops.mjs refresh-cookie --targets all` | Refreshes Worker cookie secrets for configured targets. |

## Visual and Search Tools

| Command | Script | Purpose |
| --- | --- | --- |
| `npm run visual:detail` | `capture-detail-screenshots.mjs` | Captures detail page screenshots with Playwright. |
| `npm run visual:pinpoint-smoke` | `check-pinpoint-visibility-smoke.mjs` | Runs a visual smoke check for Pinpoint page visibility. |
| `npm run gsc:pinpoint` | `gsc-pinpoint.mjs` | Queries Google Search Console for Pinpoint URLs. |
| `npm run check:aitdk-density` | `/Users/elng/web/关键词密度脚本/check-aitdk-density.ts` | Prints a fast 1-5 word density table using the same core tokenizer as the keyword audit tool. |
| `npm run detail:keyword-audit` | `audit-detail-keywords.ts` | Checks detail page keyword order using an AITDK-like ranking pass, plus raw current-issue-number coverage. |
| `npm run detail:publish-check` | `check-detail-publish.ts` | Runs the production detail-page publish checklist for one slug: live HTTP 200, H1/title, five clues, answer, reasoning, teaching items, old-module absence, summary API, keyword audit, and Vercel Ready status. |
| `npm run detail:recent-backfill-audit` | `audit-recent-detail-backfill.ts` | Audits the newest N production detail pages before deciding which recent pages need a rewrite. |
| `npm run homepage:keyword-audit` | `/Users/elng/web/关键词密度脚本/audit-homepage-keywords.ts` | Checks target keyword order first, then homepage keyword density from the standalone keyword-density tool folder. Local result is only a fast estimate; AITDK / TDK stays final. |

### Detail Publish Check

Use this after deploy for one production detail page:

```bash
npm run detail:publish-check -- --slug pinpoint-answer-761
npm --silent run detail:publish-check -- --slug pinpoint-answer-761 --json
npm run detail:publish-check -- --url https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-761/
```

If no slug is passed, it checks the latest local public puzzle against the production site.

This command is the executable version of `docs/pinpoint-detail-publish-checklist-2026-05-31.md`.

`release:production` runs this command after deploy. If it fails, the release script sends a Feishu/Slack alert when `FEISHU_WEBHOOK_URL`, `ALERT_WEBHOOK_URL`, or `SLACK_WEBHOOK_URL` is configured. P0 failures also trigger a best-effort `worker:auto-publish-pause`.

### Recent Detail Backfill Audit

Use this before rewriting recent older pages:

```bash
npm run detail:recent-backfill-audit -- --limit 10
npm --silent run detail:recent-backfill-audit -- --limit 10 --json
npm run detail:recent-backfill-audit -- --limit 10 --skip-fetch
```

The command checks data shape, production HTML, current detail headings, removed old modules, reasoning article shape, and the detail keyword audit for each recent page.

Default behavior is report-only. `REWRITE` means the page is a good rewrite candidate. `BLOCKED` means the live page or data has a serious problem. Use `--fail-on-blockers` only when a CI job should fail on serious live-page problems.

### Detail Keyword Audit

Use this for detail page keyword separation checks:

```bash
npm run detail:keyword-audit -- --url http://localhost:3004/linkedin-pinpoint-answers/pinpoint-answer-760/ --top 15
npm run detail:keyword-audit -- --html ./.next/server/app/linkedin-pinpoint-answers/pinpoint-answer-760.html --slug pinpoint-answer-760
```

`npm run pinpoint:prepublish-gate` runs this audit automatically against the rendered detail HTML for the target public puzzle. Run the standalone command only when tuning a page or debugging a failed gate.

For the full daily detail-page release checklist, use `docs/pinpoint-detail-publish-checklist-2026-05-31.md`.

This script is not a replacement for AITDK. It is a guardrail for page intent.

It follows the browser plugin's practical ranking behavior:

- numeric issue numbers are filtered before ranking, so `pinpoint 760 answer` ranks as `pinpoint answer`;
- 1-word ranking filters common filler words;
- 2-5 word ranking keeps common filler words but filters numbers;
- raw page text still has to include the current issue number.

It checks that:

- homepage keeps `pinpoint today`, `pinpoint answer today`, and `linkedin pinpoint answer today`;
- detail pages keep raw issue-number phrases such as `pinpoint 760`, `pinpoint 760 answer`, and `linkedin pinpoint 760 answer`;
- the issue number is dynamic, so #761 must use `761`, #762 must use `762`, and so on;
- detail pages also keep clue-sequence phrases in the 3-5 word top ranks;
- if a homepage phrase beats the detail clue phrases on a detail page, the script fails.

Strict detail order:

| Group | #1 | #2 | #3 |
| --- | --- | --- | --- |
| 1 word | `pinpoint` | `answer` | `linkedin` |
| 2 words | `pinpoint answer` | `linkedin pinpoint` | first 2-word clue sequence |
| 3 words | first 3-word clue sequence | second 3-word clue sequence | third 3-word clue sequence |
| 4 words | first 4-word clue sequence | second 4-word clue sequence | no forced filler |
| 5 words | full clue sequence | answer phrase if it naturally has 5 words | no forced filler |

### Homepage Keyword Audit

Use this for homepage keyword order and density checks:

```bash
npm run homepage:keyword-audit -- --url http://localhost:3004/
npm run homepage:keyword-audit -- --html ./tmp/home-rendered.html --source-mode rendered-html
npm run homepage:keyword-audit -- --text "pinpoint answer today"
npm run homepage:keyword-audit -- --url http://localhost:3004/ --save
npm run homepage:keyword-audit -- --before docs/seo-evidence/before.json --after docs/seo-evidence/after.json
```

The default config comes from `/Users/elng/web/关键词密度脚本/config/homepage-keyword-density-targets.json`. For another site or another keyword plan, pass `--config <file>`.

The first check is whether the target keyword order matches the config. Density is the second check.

`--top` only controls how many rows are shown in the report. Full ranking, target status, and strange phrase checks still use the complete n-gram table.

If another script needs to parse `--json`, run through npm silent mode:

```bash
npm --silent run homepage:keyword-audit -- --text "pinpoint answer today" --json
```

The script does not edit homepage files. It only reports what needs attention.

## Content Kitchen

| Command | Script | Purpose |
| --- | --- | --- |
| `npm run content-kitchen:enrichment-dry-run` | `run-content-kitchen-enrichment-worker-dry-run.ts` | Runs the enrichment Worker flow in dry-run mode. |
| `npm run content-kitchen:review-decision` | `run-content-kitchen-review-decision.ts` | Produces or checks Content Kitchen review decisions. |
| `npm run content-kitchen:post-publish-audit` | `run-content-kitchen-post-publish-audit.ts` | Runs the post-publish audit entry point. |
| `npm run content-kitchen:post-publish-observed-facts` | `run-content-kitchen-post-publish-observed-facts.ts` | Collects observed facts for post-publish audit workflows. |
| `npm run content-kitchen:post-publish-build-output-adapter` | `run-content-kitchen-post-publish-build-output-adapter.ts` | Adapts build output for post-publish audit workflows. |
| `npm run content-kitchen:post-publish-local-audit` | `run-content-kitchen-post-publish-local-audit-chain.ts` | Runs the local post-publish audit chain. |
| `npm run content-kitchen:post-publish-public-fetch-audit` | `run-content-kitchen-post-publish-public-fetch-audit.ts` | Audits public fetch behavior after publish. |

Supporting modules:

- `content-kitchen-enrichment-action-drafts.ts`
- `content-kitchen-enrichment-file-store.ts`
- `content-kitchen-enrichment-health-report.ts`
- `content-kitchen-enrichment-run-summary.ts`
- `content-kitchen-review-ui-surface.ts`

## Low-Frequency Tools

| Script | Purpose |
| --- | --- |
| `import-legacy-puzzles.mjs` | Imports or migrates legacy puzzle data. Treat as a one-time or low-frequency migration helper. |
| `pinpoint-intermediate-state.mjs` | Checks intermediate state and commit-detection behavior used by guardrails. |

## Operating Notes

- Keep `validate-data.ts`, SEO checks, routing checks, guardrails, and regression scripts stable before moving files.
- Update `package.json`, `worker/README.md`, and any runbooks before renaming or relocating scripts.
- Prefer adding a new documented npm command before asking operators to run a long direct `tsx` or `node` command.
