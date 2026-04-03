# Pinpoint Fallback Hardening Implementation Checklist (2026-04-03)

> Status: draft
> Depends on: `docs/fallback-template-hardening-prd-2026-04-01.md`
> Goal: turn the PRD into an execution checklist for Phase 0 and Phase 1

## 1. Outcome

This checklist is for shipping the first two phases only:

- Phase 0: stop bad fallback payloads from breaking the daily publish path
- Phase 1: upgrade fallback output from one thin generic template into typed, page-aware detail content

This is not the full multi-phase roadmap. It is the shortest path to:

- keep daily puzzles publishing even when long-form generation fails
- stop thin fallback content from reaching public detail pages unnoticed
- make fallback detail pages look and read like a real answer product page

## 2. Working Rules

- Put the publish guard inside `worker/src/index.ts` `publishToNewSiteGitHub()`
- Treat `full-analysis -> light-explainer -> fail` as the publish decision state machine
- Keep `resolveThinContentProtectionDecision()` as the write-layer protection, not the generation-layer state machine
- Ship all newly added detail fields as optional in schema and UI
- Prefer filling missing structure over adding free-form filler paragraphs
- Do not make historical pages rebuild daily just to update `Latest Answer CTA`

## 3. Files In Scope

Worker and generation:

- `worker/src/index.ts`
- `lib/puzzles/fallback-copy.ts`

Validation and schema:

- `scripts/validate-data.mjs`
- `lib/puzzles/evidence-contract.shared.mjs`
- `lib/puzzles/schema.shared.mjs`
- `lib/puzzles/schema.ts`

Data mapping and runtime types:

- `lib/puzzles/data/detail.ts`
- `lib/puzzles/data/types.ts`
- `lib/puzzles/data/live-worker.ts`
- `lib/puzzles/detail-view.ts`

Frontend consumption:

- `components/detail/PuzzleDetail.tsx`
- `components/detail/PuzzleFullAnalysis.tsx`

## 4. Phase 0

### 4.1 Worker State Machine

Owner area:

- `worker/src/index.ts`

Tasks:

- Add a dedicated publish-quality decision helper near `resolveThinContentProtectionDecision()`
- The helper should decide one of:
  - `use-full-analysis`
  - `downgrade-to-light-explainer`
  - `fail-no-publish`
- Make the decision deterministic from payload structure, not from free-form model confidence
- Keep the `obvious` difficulty rule looser than `medium / hard`

Definition of done:

- `medium / hard` payloads require at least `2` `wrongGuessCandidates`
- `obvious` payloads require at least `1` `wrongGuessCandidate`
- Missing `setValidationSummary`, missing `categoryPrecisionNote`, missing/invalid `turningPoint`, or too few cited clues can force downgrade

### 4.2 Unified Publish Guard

Owner area:

- `worker/src/index.ts`

Main functions:

- `publishToNewSiteGitHub()`
- `resolveThinContentProtectionDecision()`

Tasks:

- Move all public publish guarding into `publishToNewSiteGitHub()`
- Do not add separate guard logic at every call site
- Only public detail states should trigger the guard path
- Non-public detail states like `generating`, `validated`, and `failed` should bypass the full public-content gate
- Run the new state machine first
- Run `resolveThinContentProtectionDecision()` second

Definition of done:

- Thin `full-analysis` payloads downgrade before write
- If downgraded `light-explainer` passes minimum rules, publish still succeeds
- Existing `keep-existing` and `use-primary` paths still work for same-slug protection

### 4.3 Shared Detail Record Output

Owner area:

- `worker/src/index.ts`

Main functions:

- `buildTemplateFallbackPayload()`
- `buildPublishedPuzzleDetailRecord()`
- `buildFallbackAnalysis()`
- `buildWorkerArticleBreakdown()`

Tasks:

- Treat `buildPublishedPuzzleDetailRecord()` as the common detail-content assembly point
- Ensure the internal short-analysis fallback path does not keep using old thin logic
- Add `pageExperienceMode` to the detail record output
- Add the minimum new optional fields needed for Phase 0:
  - `pageMeta`
  - `pageExperienceMode`
  - `latestAnswerCta`
- Keep Phase 0 narrow: only add the fields needed to safely ship `light-explainer`

Definition of done:

- Template fallback path and enrich short-content fallback path both produce records consistent with the same state machine
- No path can silently bypass the new downgrade rules

### 4.4 Light Explainer Minimum Shape

Owner area:

- `worker/src/index.ts`
- `lib/puzzles/schema.shared.mjs`
- `lib/puzzles/schema.ts`

Tasks:

- Define the minimum light-explainer contract:
  - puzzle number
  - publish date / ISO date
  - clues
  - answer / main answer
  - category
  - `pageMeta`
  - reveal-capable answer content
  - at least one short explanation paragraph
  - `recentAnswerLinks`
  - `latestAnswerCta`
- Make all new fields optional at schema level for backward compatibility

Definition of done:

- Old detail JSON still parses
- New light-explainer records are valid without pretending to be full long-form analysis

### 4.5 Runtime CTA Rule

Owner area:

- `components/detail/PuzzleDetail.tsx`
- `components/detail/PuzzleFullAnalysis.tsx`
- data-loading layer under `lib/puzzles/data`

Tasks:

- Implement `Latest Answer CTA` as runtime-fed content
- Do not make old detail pages depend on daily static rebuilds
- Decide one runtime source and keep it simple:
  - client fetch to a lightweight endpoint
  - or a server-side runtime fetch during request handling
- Do not bake "today's slug" into every archived static page

Definition of done:

- Archived pages can show a current CTA without requiring mass rebuilds

### 4.6 Phase 0 Validation

Owner area:

- `scripts/validate-data.mjs`

Tasks:

- Keep existing checks intact
- Add only the minimum checks needed to validate `pageExperienceMode`
- Validate that `light-explainer` and `full-analysis` are checked with different minimum requirements
- Do not force all old records to suddenly satisfy Phase 1 structure

Definition of done:

- `validate:data` understands the new mode split
- Historical records still pass

### 4.7 Phase 0 Frontend Compatibility

Owner area:

- `components/detail/PuzzleDetail.tsx`
- `components/detail/PuzzleFullAnalysis.tsx`
- `lib/puzzles/data/detail.ts`
- `lib/puzzles/data/types.ts`

Tasks:

- Add optional handling for every new field
- Render a lighter analysis layout when `pageExperienceMode === "light-explainer"`
- Keep existing archived pages rendering correctly when fields are absent

Definition of done:

- No white-screen risk from missing fields
- Old detail pages still render with current data

### 4.8 Phase 0 Test Checklist

Run at minimum:

- `npm run validate:data`
- `npm run build`
- `npm run test:pinpoint-routing`
- `npm run test:pinpoint-regression:core`

Manual verification:

- A healthy full-analysis payload still publishes
- A thin full-analysis payload downgrades to light-explainer and still publishes
- A payload missing core puzzle data fails to publish
- An archived detail page with old JSON still renders

## 5. Phase 1

### 5.1 Split the Fallback Template by Pattern Type

Owner area:

- `lib/puzzles/fallback-copy.ts`

Tasks:

- Replace the current "phrase vs everything else" split with explicit typed branches
- First split should cover:
  - `before / after`
  - `emoji / symbol / icon`
  - `typed-category / ordinary category`
- Keep `association` explicitly assigned to a branch instead of falling through implicitly

Definition of done:

- Non-phrase puzzles no longer all share one generic category script

### 5.2 Upgrade Shared Article Structure

Owner area:

- `lib/puzzles/fallback-copy.ts`
- `worker/src/index.ts`

Tasks:

- Implement the six-module structure for `full-analysis`
- Ensure `buildFallbackAnalysis()` and `buildWorkerArticleBreakdown()` use the upgraded template source
- Make the generated structure support:
  - opening misread
  - early anchor clue
  - wrong-direction rejection
  - candidate answer formation
  - full-set validation
  - category lock

Definition of done:

- Fallback full-analysis is no longer just "turning point + answer + final confirmations"

### 5.3 Add Structured Inputs Instead of Free Filler

Owner area:

- `worker/src/index.ts`
- upstream enrich payload handling in `worker/src/index.ts`

Tasks:

- Add generation paths for:
  - `wrongGuessCandidates`
  - `setValidationSummary`
  - `categoryPrecisionNote`
  - `clueSupportNotes`
  - `recentAnswerLinks`
- Use the source priority already defined in the PRD:
  - upstream structured result
  - worker limited inference
  - downgrade if still insufficient

Definition of done:

- The worker fills structure on purpose
- It does not chase a word target by padding generic prose

### 5.4 Extend Schema and Runtime Types

Owner area:

- `lib/puzzles/schema.shared.mjs`
- `lib/puzzles/schema.ts`
- `lib/puzzles/data/types.ts`
- `lib/puzzles/data/detail.ts`
- `lib/puzzles/data/live-worker.ts`

Tasks:

- Add the new optional fields to schema and mapped runtime types
- Introduce `pageExperienceMode` end-to-end
- Ensure data loaders normalize absent values safely
- Decide which new fields belong in shared schema versus UI-only derived data

Definition of done:

- Worker output, schema validation, and React props all agree on field shape

### 5.5 Page-Level Rendering Upgrade

Owner area:

- `components/detail/PuzzleDetail.tsx`
- `components/detail/PuzzleFullAnalysis.tsx`
- `lib/puzzles/detail-view.ts`

Tasks:

- Make the page explicitly aware of `full-analysis` vs `light-explainer`
- Render pageMeta, category, table, lessons/takeaways, FAQ/side note, recent links, and runtime CTA in a stable order
- Keep the existing page shell where possible; avoid unnecessary design churn in this phase

Definition of done:

- Full-analysis pages read like a complete answer page
- Light-explainer pages look intentionally lighter, not broken

### 5.6 Phase 1 Validation Upgrade

Owner area:

- `scripts/validate-data.mjs`
- `lib/puzzles/evidence-contract.shared.mjs`

Tasks:

- Decide whether new structured checks extend evidence contract or run after it
- Add checks for the new fields without breaking old content
- Keep mode-aware validation:
  - `full-analysis` has stricter structure requirements
  - `light-explainer` has lower minimums

Definition of done:

- Validation errors explain whether a record failed full-analysis or even failed light-explainer minimums

### 5.7 Phase 1 Test Checklist

Run at minimum:

- `npm run validate:data`
- `npm run build`
- `npm run test:pinpoint-routing`
- `npm run test:pinpoint-regression:core`
- `npm run test:pinpoint-regression`

Manual verification set:

- One `before/after` puzzle
- One `emoji/symbol/icon` puzzle
- One ordinary category puzzle
- One `obvious` puzzle that still qualifies for `full-analysis`
- One archived old-schema puzzle

## 6. Suggested Delivery Order

Recommended order:

1. Add schema optional fields and runtime types needed for Phase 0
2. Implement the state machine and unified guard inside `publishToNewSiteGitHub()`
3. Make `buildPublishedPuzzleDetailRecord()` emit mode-aware records
4. Add light-explainer rendering compatibility
5. Ship Phase 0
6. Split `fallback-copy.ts` by pattern type
7. Upgrade shared structured content generation
8. Extend validation and richer page rendering
9. Ship Phase 1

## 7. Open Decisions Before Coding

- Whether `obvious` puzzles should default to `full-analysis` when they meet the lighter threshold
- Whether new checks belong inside `validateEvidenceContract()` or after it
- Which runtime source should power `Latest Answer CTA`
- Whether `recentAnswerLinks` should be generated in the worker or derived later in the data layer

## 8. Handoff Notes

If this checklist is used to open engineering tasks, split tickets by responsibility instead of by PRD section:

- Worker publish guard and state machine
- Shared schema and runtime typing
- Full-analysis template split
- Frontend light/full rendering
- Validation and regression coverage
