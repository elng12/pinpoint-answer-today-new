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
| `npm run pinpoint:candidate-close` | `close-pinpoint-candidate-branches.mjs` | Closes safe Pinpoint candidate branches or opens a tracked issue when one is stuck. |
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
| `npm run worker:refresh-cookie` | `worker-ops.mjs refresh-cookie --targets all` | Refreshes Worker cookie secrets for configured targets. |

## Visual and Search Tools

| Command | Script | Purpose |
| --- | --- | --- |
| `npm run visual:detail` | `capture-detail-screenshots.mjs` | Captures detail page screenshots with Playwright. |
| `npm run visual:pinpoint-smoke` | `check-pinpoint-visibility-smoke.mjs` | Runs a visual smoke check for Pinpoint page visibility. |
| `npm run gsc:pinpoint` | `gsc-pinpoint.mjs` | Queries Google Search Console for Pinpoint URLs. |

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
