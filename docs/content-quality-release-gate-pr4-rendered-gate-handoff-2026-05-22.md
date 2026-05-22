# Content Quality Release Gate - PR4 Rendered Gate Handoff

Date: 2026-05-22
Status: local implementation ready for review, not merged

## Purpose

PR4 adds the first post-build rendered-content gate for Pinpoint public pages without changing Worker publish behavior, candidate branch behavior, SLA cron, or production override behavior.

This is the short-term bridge described in the remediation plan: CI can now fail after `next build` if rendered public pages, sitemap freshness, or key structured data are broken. It does not yet prevent a bad commit from reaching `main`; that requires the later candidate branch promotion flow.

## Included Scope

Files:

- `.github/workflows/ci.yml`
- `package.json`
- `scripts/check-pinpoint-rendered-content.ts`
- `scripts/check-pinpoint-visibility-smoke.mjs`

Implemented checks:

1. `npm run test:pinpoint-rendered`
   - Requires `.next/server/app`, so it must run after `npm run build`.
   - Reads real built HTML for all public `/linkedin-pinpoint-answers/<slug>/` pages.
   - Checks H1, five clue cards, clue order, clue table, FAQ count, answer text, canonical, robots, detail links, recent links, and JSON-LD.
   - Checks `Article.dateModified` against registry `updatedAt`.
   - Checks `Article.datePublished` against registry `publishDate`.
   - Checks sitemap coverage for all public detail pages.
   - Checks sitemap detail `<lastmod>` against registry `updatedAt`.
   - Checks home/archive sitemap `<lastmod>` against the newest public detail `updatedAt`.
   - Checks the rendered home page links to the latest public detail page.

2. CI integration
   - Adds `Build`.
   - Adds `Pinpoint Rendered Content Gate`.
   - Raises CI timeout from 15 to 20 minutes.

3. `npm run visual:pinpoint-smoke`
   - Manual Playwright smoke script.
   - Requires a running local or preview server.
   - Checks desktop and mobile selectors for latest public detail by default.
   - Leaves two full-page screenshots under `output/playwright/visibility-smoke/`.

## Explicit Non-Scope

PR4 does not include:

- Worker candidate branch publishing.
- Automatic `answer-first` to `full-analysis` SLA cron.
- Vercel deployment queue dedupe.
- Production-effective override.
- KV/runtime emergency override.
- Auto-promote from preview to production.
- Playwright as CI blocking gate.
- Browser-level CSS overlap/occlusion scoring.

## Verification Already Run

Commands run locally:

```bash
npm run test:pinpoint-rendered
npm run typecheck
npm run test:pinpoint-guardrails
npm run build
npm run lint
node --check scripts/check-pinpoint-visibility-smoke.mjs
npm run visual:pinpoint-smoke -- --base-url http://127.0.0.1:3004
git diff --check
```

Observed results:

- Rendered gate passed for all 295 public Pinpoint pages.
- Sitemap gate passed for all 295 public Pinpoint detail URLs.
- Playwright smoke passed for latest public detail `pinpoint-answer-752` on desktop and mobile.
- Local preview server was started only for smoke verification and is not part of the PR4 production path.

## Review Checklist

- Confirm `test:pinpoint-rendered` runs only after `next build`.
- Confirm the rendered gate fails if `.next/server/app` is missing.
- Confirm public details with `noindex` are blocked.
- Confirm public details without `Article`, `BreadcrumbList`, or recent `ItemList` JSON-LD are blocked.
- Confirm sitemap `<lastmod>` equals registry `updatedAt` for detail pages.
- Confirm Playwright remains manual until the team approves CI browser dependencies.

## Rollback

If the rendered gate false-positives in CI:

1. Temporarily remove only the `Pinpoint Rendered Content Gate` step from `.github/workflows/ci.yml`.
2. Keep `scripts/check-pinpoint-rendered-content.ts` in the repo for local debugging.
3. Do not disable `validate:data`, `typecheck`, or `test:pinpoint-guardrails`.

If build time becomes too high:

1. Keep `Build` and rendered gate on pull requests.
2. Consider limiting push-to-main rendered checks with `PINPOINT_RENDERED_CHECK_LIMIT=50` only as a temporary mitigation.
3. Restore all-page checking before enabling candidate branch auto-promote.

