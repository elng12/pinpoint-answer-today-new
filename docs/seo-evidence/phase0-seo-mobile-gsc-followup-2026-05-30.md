# Phase 0 SEO / Mobile / GSC Follow-up - 2026-05-30

Checked at: 2026-05-30 17:23-17:45 CST

Scope:

- Production URL status and sitemap freshness.
- Googlebot Smartphone HTML visibility.
- Mobile browser render spot check.
- Search Console Search Analytics and URL Inspection API.
- PageSpeed Insights mobile attempt.

## Current Latest Puzzle

Local registry latest:

| Field | Value |
| --- | --- |
| Puzzle | `#760` |
| Slug | `pinpoint-answer-760` |
| Updated at | `2026-05-30T07:04:26.122Z` |
| Clues | Paper, Cut, Feed, Flash, Hump (whale emoji) |
| Answer | Words that come before "back" |

## Production URL Checks

Googlebot Smartphone user agent was used for HTML fetches.

| URL | Status | Canonical | Robots | Main marker |
| --- | ---: | --- | --- | --- |
| `/` | 200 | `https://pinpointanswertoday.app` | `index, follow` | Shows `#760` |
| `/puzzles` | 200 | `https://pinpointanswertoday.app/puzzles` | `index, follow` | Shows latest and `#735/#736/#737` |
| `/next-pinpoint-preview` | 200 | `https://pinpointanswertoday.app/next-pinpoint-preview` | `index, follow` | Shows latest link |
| `/linkedin-pinpoint-answers/pinpoint-answer-735/` | 200 | self | `index, follow` | Shows self slug |
| `/linkedin-pinpoint-answers/pinpoint-answer-736/` | 200 | self | `index, follow` | Shows self slug |
| `/linkedin-pinpoint-answers/pinpoint-answer-737/` | 200 | self | `index, follow` | Shows self slug |
| `/linkedin-pinpoint-answers/pinpoint-answer-760/` | 200 | self | `index, follow` | Shows self slug |
| `/api/puzzles/summary` | 200 | n/a | n/a | Latest is `#760` |
| `/robots.txt` | 200 | n/a | n/a | Served |
| `/sitemap.xml` | 200 | n/a | n/a | 308 entries |

Sitemap checks:

| Path | Sitemap lastmod |
| --- | --- |
| `/` | `2026-05-30T07:04:26.122Z` |
| `/puzzles` | `2026-05-30T07:04:26.122Z` |
| `/next-pinpoint-preview` | `2026-05-30T07:04:26.122Z` |
| `/linkedin-pinpoint-answers/pinpoint-answer-735/` | `2026-05-06T07:01:42.573Z` |
| `/linkedin-pinpoint-answers/pinpoint-answer-736/` | `2026-05-07T07:01:43.931Z` |
| `/linkedin-pinpoint-answers/pinpoint-answer-737/` | `2026-05-07T07:01:58.344Z` |
| `/linkedin-pinpoint-answers/pinpoint-answer-760/` | `2026-05-30T07:04:26.122Z` |

Result: production URL, canonical, robots, latest summary, and sitemap freshness checks pass.

## Googlebot Smartphone HTML

Checked with a Googlebot Smartphone user agent.

| URL | Result |
| --- | --- |
| `/` | `#760`, date, Paper/Cut/Feed clues, answer phrase, and latest detail link are present in HTML. |
| `/puzzles` | `#760`, date, recent clues, and latest detail link are present in HTML. |
| `/linkedin-pinpoint-answers/pinpoint-answer-760/` | `#760`, date, all five clues, answer phrase, and detail content are present in HTML. |

Result: no evidence that Googlebot Smartphone receives an empty shell or misses the core page content.

## Mobile Browser Render Spot Check

Browser viewport:

```text
390x844, deviceScaleFactor=3, mobile=true, touch=true
```

Rendered pages checked:

| URL | Result |
| --- | --- |
| `/` | Mobile render shows `#760`, date, all five clue buttons, answer reveal area, latest detail link, recent answer links, archive link, and Pro Tips link. |
| `/linkedin-pinpoint-answers/pinpoint-answer-760/` | Mobile render shows breadcrumb, H1, published/updated dates, How we verify link, five clue buttons, reveal button, full analysis, solved connection, FAQ, and recent links. |
| `/puzzles` | Mobile render shows 303 archived puzzles, search box, latest `#760`, and restored `#735/#736/#737` archive links. |

Browser network/console on `/puzzles`:

- No console errors or warnings.
- Main document, CSS, JS chunks, font, and favicon returned 200 or 304.

Extra note:

- The live detail page still contains older section labels such as `Words & How They Fit` and `Lessons Learned from Pinpoint #760`. This is not a mobile-indexing blocker, but it means the detail-template cleanup is not fully reflected on production.

## Search Console: Search Analytics

Range:

```text
2026-05-19 -> 2026-05-29
```

Recent 30 detail pages:

| Metric | Value |
| --- | ---: |
| Pages with clicks | 4 / 30 |
| Aggregate clicks | 4 |
| Aggregate impressions | 3000 |

Top recent detail pages:

| Puzzle | Clicks | Impressions | Avg position |
| --- | ---: | ---: | ---: |
| `#752` | 1 | 1146 | 7.55 |
| `#753` | 1 | 592 | 6.27 |
| `#756` | 1 | 348 | 7.88 |
| `#757` | 1 | 234 | 6.93 |
| `#754` | 0 | 351 | 7.72 |
| `#755` | 0 | 142 | 7.29 |
| `#751` | 0 | 110 | 7.98 |
| `#759` | 0 | 9 | 8.56 |
| `#760` | 0 | 0 | 0.00 |

Homepage:

| Metric | Value |
| --- | ---: |
| Clicks | 1 |
| Impressions | 208 |
| CTR | 0.5% |
| Avg position | 42.98 |
| Mobile impressions | 22 |
| Desktop impressions | 136 |

Homepage query examples:

| Query | Clicks | Impressions | Avg position |
| --- | ---: | ---: | ---: |
| `linkedin pinpoint answer today` | 0 | 7 | 52.43 |
| `linkedin pinpoint today` | 0 | 3 | 39.00 |
| `linkedin pinpoint answer` | 0 | 2 | 58.00 |
| `linkedin pinpoint hints` | 0 | 2 | 59.00 |

Restored pages:

| Page fragment | Matched rows | Clicks | Impressions |
| --- | ---: | ---: | ---: |
| `pinpoint-answer-735` | 0 | 0 | 0 |
| `pinpoint-answer-736` | 0 | 0 | 0 |
| `pinpoint-answer-737` | 0 | 0 | 0 |

Result: Search Analytics still shows no visible impression recovery for `#735/#736/#737` in this window, even though URL Inspection now says the pages are indexed.

## Search Console: URL Inspection API

Initial API inspection result. A later Edge UI check for `#760` is recorded below.

| URL | Verdict | Coverage | Fetch | Last crawl |
| --- | --- | --- | --- | --- |
| `/` | PASS | Submitted and indexed | Successful | `2026-05-29T05:31:44Z` |
| `/puzzles` | PASS | Submitted and indexed | Successful | `2026-05-20T09:11:48Z` |
| `/linkedin-pinpoint-answers/pinpoint-answer-760/` | NEUTRAL | URL is unknown to Google | n/a | n/a |
| `/linkedin-pinpoint-answers/pinpoint-answer-735/` | PASS | Submitted and indexed | Successful | `2026-05-19T11:45:33Z` |
| `/linkedin-pinpoint-answers/pinpoint-answer-736/` | PASS | Submitted and indexed | Successful | `2026-05-06T10:43:16Z` |
| `/linkedin-pinpoint-answers/pinpoint-answer-737/` | PASS | Submitted and indexed | Successful | `2026-05-19T11:47:05Z` |

Notes:

- `#735/#736/#737` are indexed according to URL Inspection API.
- `#760` was new today and was still unknown to Google at the time of the first API check. A later Edge UI check showed it as indexed.
- API output did not provide a useful mobile usability verdict; it returned `VERDICT_UNSPECIFIED`.

## PageSpeed Insights Mobile

Attempted URLs:

- `/`
- `/linkedin-pinpoint-answers/pinpoint-answer-760/`
- `/puzzles`

Result:

- Direct request timed out before returning useful data.
- Retried through the local proxy.
- Google API returned `429 RESOURCE_EXHAUSTED`, quota `defaultPerDayPerProject` value `0`.

Conclusion:

- PageSpeed mobile is still not completed.
- This is a tooling/API quota block, not evidence that mobile performance passed or failed.

## Current Decision

Pass:

- Production URL status.
- Canonical and robots checks.
- Sitemap inclusion and current lastmod for main public routes.
- Googlebot Smartphone HTML visibility.
- Mobile rendered content visibility.
- URL Inspection API indexing state for homepage, archive, latest detail `#760`, and restored `#735/#736/#737`.
- Edge GSC UI live tests for homepage, archive, latest detail `#760`, and restored `#735/#736/#737`.

Not yet closed:

1. Sitemap resubmission was completed by API at `2026-05-30T11:12:41.967Z`; GSC reports the sitemap as pending with 0 warnings and 0 errors.
2. PageSpeed Insights mobile remains blocked by API quota; use the browser UI or another PSI key later.
3. Search Analytics still has 0 rows for `#735/#736/#737`; recheck after more crawl/data lag.
4. Production detail template still shows older section labels; handle separately from SEO/mobile indexing.

## Follow-up Execution - Sitemap Resubmission

Executed at: 2026-05-30 19:12 CST

API:

```text
PUT https://searchconsole.googleapis.com/webmasters/v3/sites/sc-domain%3Apinpointanswertoday.app/sitemaps/https%3A%2F%2Fpinpointanswertoday.app%2Fsitemap.xml
```

Result:

| Field | Value |
| --- | --- |
| Submit status | `204` |
| Sitemap path | `https://pinpointanswertoday.app/sitemap.xml` |
| Last submitted | `2026-05-30T11:12:41.967Z` |
| Pending | `true` |
| Last downloaded | `2026-05-30T02:43:43.318Z` |
| Warnings | `0` |
| Errors | `0` |
| Submitted web URLs | `307` |

Edge browser note:

- Microsoft Edge is logged in to Search Console and can open the property overview.
- System automation could not click or type in Edge through `osascript` because macOS blocked `osascript` accessibility control: `osascript is not allowed assistive access`.
- `cliclick` could click Edge UI controls, and the URL Inspection API result link could open the completed inspection page directly in Edge.

## Follow-up Execution - Edge GSC UI Live Test for `#760`

Executed at: 2026-05-30 20:07 CST

URL:

```text
https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-760/
```

Results:

| Check | Result |
| --- | --- |
| Google index result | `网址已收到 Google` |
| API coverage after refresh | `Submitted and indexed` |
| Page fetch | `Successful` |
| Crawled as | `MOBILE` |
| Edge live test | `网址可编入 Google 索引` |
| Enhancement detected | `路径` detected 1 valid item |
| Screenshot | `docs/seo-evidence/screenshots/2026-05-30/gsc-live-760-2026-05-30.png` |

Conclusion:

- `#760` does not need a manual indexing request right now.
- The page is indexed and live-testable from Edge.

## Follow-up Execution - Edge GSC UI Live Tests for Remaining Pages

Executed at: 2026-05-30 20:12-20:15 CST

Results:

| URL | Edge live test | Enhancement detected | Screenshot |
| --- | --- | --- | --- |
| `/` | `网址可编入 Google 索引` | No enhancements | `docs/seo-evidence/screenshots/2026-05-30/gsc-live-home-2026-05-30.png` |
| `/puzzles` | `网址可编入 Google 索引` | `路径` detected 1 valid item | `docs/seo-evidence/screenshots/2026-05-30/gsc-live-archive-2026-05-30.png` |
| `/linkedin-pinpoint-answers/pinpoint-answer-735/` | `网址可编入 Google 索引` | `路径` detected 1 valid item | `docs/seo-evidence/screenshots/2026-05-30/gsc-live-735-2026-05-30.png` |
| `/linkedin-pinpoint-answers/pinpoint-answer-736/` | `网址可编入 Google 索引` | `路径` detected 1 valid item | `docs/seo-evidence/screenshots/2026-05-30/gsc-live-736-2026-05-30.png` |
| `/linkedin-pinpoint-answers/pinpoint-answer-737/` | `网址可编入 Google 索引` | `路径` detected 1 valid item | `docs/seo-evidence/screenshots/2026-05-30/gsc-live-737-2026-05-30.png` |

Indexing request decision:

- Did not submit manual indexing requests.
- Reason: all checked URLs are already indexed or live-test indexable. Extra request clicks are low-value here, and one click attempt caused Edge focus to jump to a different tab.

## Recommended Next Step

Do the remaining delayed checks next:

1. Re-run Search Analytics in 3-5 days and compare whether `#735/#736/#737` begin getting impressions.
2. Re-run PageSpeed mobile when the API quota issue is gone, or use the browser UI manually.
3. Fix the production detail template labels separately if that is still part of the content-template cleanup.
