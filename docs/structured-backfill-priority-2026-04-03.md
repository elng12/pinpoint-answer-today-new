# Structured Backfill Priority - 2026-04-03

## Goal

- Pick the next historical Pinpoint pages to upgrade into the new structured detail shape.
- Prioritize pages where the upside is highest:
  - real clicks or clean clue-driven demand
  - meaningful impressions already proven in GSC
  - still missing the new structured fields and page blocks

## What Is Already Done

These pages already act as live sample pages for the new structure:

- `pinpoint-answer-701`
  - visual / emoji category sample
- `pinpoint-answer-700`
  - typed-category sample
- `pinpoint-answer-702`
  - phrase sample
- `pinpoint-answer-693`
  - association / translation-board sample

All four already have:

- `pageExperienceMode`
- `wrongGuessCandidates`
- `setValidationSummary`
- `categoryPrecisionNote`
- the live page blocks:
  - `Nearby Reads We Ruled Out`
  - `Why This Answer Fits Tighter`

## Data Basis

This priority list is based on the latest evidence already checked into the repo:

1. `docs/high-search-intent-pinpoint-sop-2026-04-01.md`
   - shows which recent pages actually earned clicks
   - especially important for clue-driven demand
2. `docs/content-backfill-priority-gsc-2026-04-01.md`
   - shows older pages with proven impressions and clicks from GSC
3. Local JSON audit on `2026-04-03`
   - confirmed the candidates below still do not have:
     - `pageExperienceMode`
     - `wrongGuessCandidates`
     - `setValidationSummary`
     - `categoryPrecisionNote`

## Selection Rule

Use this order:

1. pages with real clicks and clean clue demand
2. pages with strong impressions and decent position
3. pages that help expand type coverage without dragging in legacy schema cleanup

## Batch 1 - Immediate

These are the best next pages to backfill right now.

| Priority | Slug | Type | Why now |
| --- | --- | --- | --- |
| 1 | `pinpoint-answer-698` | category / hard | Confirmed click page in the high-search-intent SOP, and one of the clearest clue-driven winners after `700`. |
| 2 | `pinpoint-answer-676` | phrase / medium | Strong GSC page from the old queue: `82` impressions and `12` clicks. Good phrase candidate with obvious commercial-style search language. |
| 3 | `pinpoint-answer-530` | phrase / medium | Huge impression page in the GSC queue: `1873` impressions. Even without clicks, this is the biggest CTR-upside page left in the older archive. |
| 4 | `pinpoint-answer-699` | category / hard | Recent page with real clicks in the SOP window and a very search-friendly clue set. Good consumer-intent category page. |
| 5 | `pinpoint-answer-677` | category / obvious | Already proved demand in GSC with `71` impressions and `3` clicks. Also a clean typed-category style board. |
| 6 | `pinpoint-answer-688` | phrase / medium | Recent click page in the SOP window. Useful because it validates another phrase board beyond `702`. |

### Why This Batch Works

- It mixes recent real-click pages with older proven GSC pages.
- It covers both of the highest-value repeatable shapes:
  - phrase
  - category / typed-category
- It avoids dragging in older schema repair work before the traffic-first batch is done.

## Batch 2 - Scale After Batch 1

These are the next clean candidates once Batch 1 is done.

| Priority | Slug | Type | Why it belongs next |
| --- | --- | --- | --- |
| 7 | `pinpoint-answer-674` | category / medium | Proven GSC page with `55` impressions and `2` clicks; concrete category logic should benefit from structured false-start framing. |
| 8 | `pinpoint-answer-526` | category / medium | Proven GSC page with `46` impressions; mechanism-style category should benefit from the new precision block. |
| 9 | `pinpoint-answer-467` | category / medium | Older page with real impression history and a nice "wrong first read" board, which should show the new nearby-read block well. |
| 10 | `pinpoint-answer-477` | category / obvious | Low-risk typed-category style page with good phrase-like clue behavior. |
| 11 | `pinpoint-answer-675` | category / obvious | Strong object/category board that should surface a clean precision note once backfilled. |
| 12 | `pinpoint-answer-678` | phrase / medium | Good phrase candidate with product-language clues and clear shared ending behavior. |
| 13 | `pinpoint-answer-460` | phrase / medium | Older phrase page with strong everyday compounds; useful for testing whether the new structure helps long-tail older traffic. |

## Watchlist - Do Not Mix Into The First Two Batches

### `pinpoint-answer-697`

- It did earn clicks in the SOP window.
- But the SOP also flags `696` and `697` as pages that may have been tested against the wrong clue queries.
- Treat it as a good candidate only after one more GSC re-check confirms the query quality is clean.

### `pinpoint-answer-695`

- Explicitly avoid it for now.
- The SOP calls out heavy wrong-page testing:
  - lots of impressions
  - but the query mix was not cleanly its own

### `pinpoint-answer-594`, `pinpoint-answer-641`, `pinpoint-answer-593`

- Do not batch these with the structured traffic pass yet.
- Their local JSON shape is older and less normalized than the current detail model:
  - missing `questionType`
  - missing `difficultyBand`
  - more legacy-style prose blocks
- They should be treated as a separate normalization pass, not mixed into the next traffic-first backfill batch.

## Recommended Execution Order

If only one small batch can be done next, use this exact order:

1. `698`
2. `676`
3. `530`
4. `699`
5. `677`
6. `688`

If the batch must be split in two:

- Batch A
  - `698`
  - `676`
  - `530`
- Batch B
  - `699`
  - `677`
  - `688`

## Exit Rule For This Plan

Re-run the GSC check before opening Batch 2 if either of these happens:

- one of the Batch 1 pages picks up a strong new click trend after the structured refresh
- a watchlist page starts showing cleaner clue-driven demand than one of the current Batch 2 candidates

## Current Status

- Plan created on `2026-04-03`
- Based on the latest checked-in GSC-derived docs and local JSON audit
- No fresh live GSC pull was used for this version because no direct credentials path was available in the workspace at review time
