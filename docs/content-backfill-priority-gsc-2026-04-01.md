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
  - Not a real local detail page. Search Console shows impressions on several stale URL variants such as `/linkedin-pinpoint-answers/pinpoint-answer-9013`, `/puzzles/pinpoint-answer-9013/`, and locale-prefixed aliases, while the canonical detail route currently returns `404`.
  - Treat it as a stale-index / wrong-link anomaly, not as a content backfill candidate.
- `pinpoint-answer-501`
  - Next clean content-depth candidate after the third batch if impressions keep holding.
- `pinpoint-answer-518`
  - Another clean low-volume candidate worth considering before dropping into very weak-position pages.

## Rule For This Pass

- Keep using the richer detail structure from the first 20-page pass:
  - visible 2-5 sentence opening paragraph
  - explicit turning clue
  - solvePath with false start and pivot
  - clueRows with concrete non-obvious reasoning
  - FAQ answers tied to the real clue logic
- If two pages are close on impressions, prefer the page with more clicks or a fresher publish date.
- If a page is structurally broken, placeholder, or anomalous in GSC, fix that before treating it as a normal content-depth candidate.

## Follow-Up Batch

1. `pinpoint-answer-529` - `24` impressions, `0` clicks, avg position `1.71`
2. `pinpoint-answer-481` - `24` impressions, `0` clicks, avg position `1.79`
3. `pinpoint-answer-458` - `17` impressions, `0` clicks, avg position `1.59`
4. `pinpoint-answer-531` - `16` impressions, `0` clicks, avg position `1.88`
5. `pinpoint-answer-600` - `15` impressions, `0` clicks, avg position `18.20`
6. `pinpoint-answer-604` - `13` impressions, `0` clicks, avg position `11.08`
7. `pinpoint-answer-490` - `9` impressions, `0` clicks, avg position `7.78`
8. `pinpoint-answer-634` - `6` impressions, `0` clicks, avg position `8.67`
9. `pinpoint-answer-597` - `6` impressions, `0` clicks, avg position `13.83`
10. `pinpoint-answer-618` - `6` impressions, `0` clicks, avg position `17.83`

## Third Batch

1. `pinpoint-answer-563` - `5` impressions on canonical-style detail URLs, plus small legacy locale noise
2. `pinpoint-answer-679` - `5` impressions, `0` clicks, avg position `6.40`
3. `pinpoint-answer-614` - `5` impressions split across slash variants, `0` clicks
4. `pinpoint-answer-540` - `4` impressions, `0` clicks, avg position `15.75`
5. `pinpoint-answer-459` - `4` impressions, `0` clicks, avg position `20.50`

## Status

- Queue selected on `2026-04-01`.
- First GSC-driven content-depth pass completed for `530`, `676`, `677`, `674`, `526`, `467`, `477`, `675`, `678`, and `460` on `2026-04-01`.
- Second GSC-driven content-depth pass completed for `529`, `481`, `458`, `531`, `600`, `604`, `490`, `634`, `597`, and `618` on `2026-04-01`.
- The placeholder summary on `pinpoint-answer-531` was replaced with a real archived-page summary during this pass.
- Third GSC-driven content-depth pass completed for `563`, `679`, `614`, `540`, and `459` on `2026-04-01`.
- `563` still shows a small amount of legacy locale-path noise, and `614` is split across slash/non-slash URL rows, but both canonical detail pages are real and valid.
- Next likely follow-up pages are `501`, `518`, `644`, `502`, and `545` if the performance-led queue keeps expanding.
