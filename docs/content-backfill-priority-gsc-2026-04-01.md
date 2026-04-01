# Content Backfill Priority - GSC Driven - 2026-04-01

## Goal

- Replace the recency-only queue with a performance-led queue for the next archive content-depth pass.
- Prioritize older detail pages that are already earning real Google Search Console impressions but still use shallow legacy detail content.

## Data Source

- Source: Google Search Console page-level performance for `sc-domain:pinpointanswertoday.app`
- Window: `2026-03-05` through `2026-04-01` inclusive
- Filter: canonical detail URLs matching `/linkedin-pinpoint-answers/pinpoint-answer-*`
- Cleanup:
  - Combined trailing-slash and non-trailing-slash variants into one page record
  - Excluded pages already completed in the first recency queue (`700-680`)

## Why This Queue

- These pages already have real impressions, so deeper content can affect actual organic traffic instead of hypothetical traffic.
- Most of them still only have early legacy detail scaffolding, which means the upside is larger than on pages we already enriched.
- This queue intentionally mixes newer archived pages with older high-impression pages so we do not overfit to recency alone.

## Priority List

1. `pinpoint-answer-530` - `1873` impressions, `0` clicks, avg position `1.09`
2. `pinpoint-answer-676` - `82` impressions, `12` clicks, avg position `5.59`
3. `pinpoint-answer-677` - `71` impressions, `3` clicks, avg position `2.01`
4. `pinpoint-answer-674` - `55` impressions, `2` clicks, avg position `5.13`
5. `pinpoint-answer-526` - `46` impressions, `0` clicks, avg position `1.04`
6. `pinpoint-answer-467` - `40` impressions, `0` clicks, avg position `1.88`
7. `pinpoint-answer-477` - `21` impressions, `0` clicks, avg position `1.10`
8. `pinpoint-answer-675` - `21` impressions, `0` clicks, avg position `5.29`
9. `pinpoint-answer-678` - `20` impressions, `0` clicks, avg position `6.90`
10. `pinpoint-answer-460` - `19` impressions, `0` clicks, avg position `11.26`

## Watchlist

- `pinpoint-answer-9013`
  - Showed `86` impressions but has no local detail JSON file, so it should be treated as a routing or indexing anomaly before any content work.
- `pinpoint-answer-531`
  - Still appears in Search Console and currently looks like a placeholder record in the registry, so it should be fixed soon even though it did not make the top 10 by impressions.
- `pinpoint-answer-481`
  - Next in line after the top 10 if we keep expanding the performance-led queue.

## Rule For This Pass

- Keep using the richer detail structure from the first 20-page pass:
  - visible 2-5 sentence opening paragraph
  - explicit turning clue
  - solvePath with false start and pivot
  - clueRows with concrete non-obvious reasoning
  - FAQ answers tied to the real clue logic
- If two pages are close on impressions, prefer the page with more clicks or a fresher publish date.
- If a page is structurally broken, placeholder, or anomalous in GSC, fix that before treating it as a normal content-depth candidate.

## Status

- Queue selected on `2026-04-01`.
- First GSC-driven content-depth pass completed for `530`, `676`, `677`, `674`, `526`, `467`, `477`, `675`, `678`, and `460` on `2026-04-01`.
- Next likely follow-up pages are `481`, `531`, and then any page that gains impressions before the next content pass starts.
