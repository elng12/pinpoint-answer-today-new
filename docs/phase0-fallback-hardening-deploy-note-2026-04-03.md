# Phase 0 Fallback Hardening Deploy Note

Date: 2026-04-03
Environment: production
Site: `https://pinpointanswertoday.app`
Release commit: `75b8e2a`

## What shipped

- Added a publish guard in `worker/src/index.ts` so public detail payloads no longer go straight from "thin long-form" to production.
- Introduced a three-step public publish path:
  - `full-analysis`
  - downgrade to `light-explainer`
  - hard block only when no healthy published detail exists
- Added `pageExperienceMode` so the site can distinguish a verified compact explainer from a live worker fallback shell.
- Added a runtime "Latest Answer" CTA on archived detail pages so older static pages can point to the current live answer without baking today's slug into every old page build.
- Added guardrail coverage for:
  - downgrade from weak full-analysis to `light-explainer`
  - preserve healthy existing content when downgrade still fails
  - hard block only when no safe published detail exists

## Why this release mattered

- The previous failure mode was "today's puzzle data exists, but production still stays on yesterday because the full analysis is too thin to pass build validation."
- This release reduces the chance of that outage by preferring a safe compact public page over a failed public publish.
- It also removes one daily rebuild pressure point from archived pages by moving the latest-answer CTA to client runtime fetch.

## Validation completed

- `npm run validate:data`
- `npm run build`
- `npm run test:pinpoint-guardrails`

## Production smoke check

- Deployment reached `Ready` on Vercel for production.
- Archived page check:
  - `https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-700/`
  - Confirmed runtime CTA appears as `View Latest Answer (#703)`.
- Current live page check:
  - `https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-703/`
  - Confirmed the latest-answer CTA does not appear on the current live page.

## Known follow-up

- Phase 1 still needs to split the current generic fallback template by puzzle type instead of sending all non-phrase puzzles through one category-style skeleton.
- The current release hardens publishing and page behavior first; it does not yet replace the full fallback article structure described in the PRD.

## Rollback note

- If this release causes a regression, the safest rollback target is the previous production commit on `main`, while preserving the current registry and puzzle data commits for `#702` and `#703`.
- Do not revert worker-generated puzzle data blindly; treat app-shell rollback and content rollback as separate decisions.
