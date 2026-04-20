# Home / Archive SEO Tightening Baseline - 2026-04-20

> Status: frozen before Phase 1 implementation  
> Captured at: 2026-04-20 22:40 CST  
> Local HEAD: `c1822c023cc41ebdb780767dadc29c7fd78b9c3c`

---

## 1. Scope

This file freezes the current production baseline for:

- `/`
- `/puzzles`

It is the comparison point for the Phase 1 copy-tightening experiment defined in:

- `docs/home-archive-seo-tightening-prd-2026-04-19.md`

---

## 2. Workspace snapshot

Current local working tree before Phase 1 code changes:

- `?? docs/fallback-prd-rollout-closeout-2026-04-04.md`
- `?? docs/home-archive-seo-tightening-prd-2026-04-19.md`

No business code changes were present when this baseline was captured.

---

## 3. Production page snapshot

### 3.1 Homepage `/`

Production URL:

- `https://pinpointanswertoday.app/`

Current production values:

- Title:  
  `LinkedIn Pinpoint Answer Today | Clues, Walkthrough & Archive`
- Meta description:  
  `Today's LinkedIn Pinpoint answer is Puzzle #720 — updated daily with spoiler-safe hints, clue explanations, and solutions that protect your streak.`
- H1:  
  `Today's LinkedIn Pinpoint #720 Answer`
- `Organization.description`:  
  `Get today's LinkedIn Pinpoint answer with spoiler-safe hints, clear clue-by-clue walkthroughs, yesterday's answer, and the full archive, all in one place.`
- `WebSite.description`:  
  `Get today's LinkedIn Pinpoint answer with spoiler-safe hints, clear clue-by-clue walkthroughs, yesterday's answer, and the full archive, all in one place.`

First-fold screenshots:

- Desktop: [home.png](artifacts/home-archive-seo-tightening-2026-04-20/home.png)
- Mobile: [home-mobile.png](artifacts/home-archive-seo-tightening-2026-04-20/home-mobile.png)

### 3.2 Archive `/puzzles`

Production URL:

- `https://pinpointanswertoday.app/puzzles`

Current production values:

- Title:  
  `LinkedIn Pinpoint Archive & Guides | Pinpoint Answer Today`
- Meta description:  
  `Browse LinkedIn Pinpoint walkthroughs, clue guides, archive pages, and past answers. Open the latest recap fast or revisit older puzzles in one place.`
- Visible heading text:  
  `All Pinpoint Answers`
- Current rendered `<h1>` in live HTML:  
  **none found**

Important implementation note:

- The visible heading is currently rendered through `SectionHeading`, whose default level is `2`, not `1`.
- See: `components/shared/SectionHeading.tsx`
- This means `/puzzles` currently behaves like “title text shown as H2”, not “real page H1 already exists”.

First-fold screenshots:

- Desktop: [puzzles.png](artifacts/home-archive-seo-tightening-2026-04-20/puzzles.png)
- Mobile: [puzzles-mobile.png](artifacts/home-archive-seo-tightening-2026-04-20/puzzles-mobile.png)

---

## 4. GSC 28-day baseline

Date range used:

- `2026-03-22` -> `2026-04-18`

### 4.1 Homepage `/`

Totals:

- Clicks: `2`
- Impressions: `680`
- CTR: `0.3%`
- Avg position: `28.80`

Device split:

- Desktop: `273` impressions, avg position `52.32`
- Mobile: `161` impressions, avg position `14.08`
- Tablet: `2` impressions, avg position `8.50`

Top country rows returned:

- `IND`: `54` impressions, avg position `33.13`
- `AUS`: `44` impressions, avg position `22.00`
- `GBR`: `39` impressions, avg position `55.38`
- `CAN`: `33` impressions, avg position `43.27`
- `DEU`: `20` impressions, avg position `25.65`

Notes:

- `USA` did not appear in the top 25 returned country rows for `/`.
- Homepage baseline remains dominated by low-rank and noisy clue / answer-like impressions rather than clean today-intent wins.

### 4.2 Archive `/puzzles`

Totals:

- Clicks: `0`
- Impressions: `108`
- CTR: `0.0%`
- Avg position: `10.22`

Device split:

- Desktop: `17` impressions, avg position `20.82`
- Mobile: `52` impressions, avg position `10.42`

Top country rows returned:

- `IND`: `26` impressions, avg position `8.50`
- `USA`: `11` impressions, avg position `18.82`
- `GBR`: `10` impressions, avg position `19.60`
- `TUR`: `3` impressions, avg position `8.67`
- `AUS`: `3` impressions, avg position `9.67`

Notes:

- `/puzzles` baseline is meaningfully better on mobile than desktop.
- `USA` exists for `/puzzles`, but the current baseline is still small and mixed with several non-US markets.

---

## 5. GSC command log

Commands used for this baseline:

```bash
npm run gsc:pinpoint -- page --credentials /Users/elng/Downloads/cursor-469606-0a5db422b4a4.json --page-url https://pinpointanswertoday.app/ --start-date 2026-03-22 --end-date 2026-04-18 --query-limit 25

npm run gsc:pinpoint -- page --credentials /Users/elng/Downloads/cursor-469606-0a5db422b4a4.json --page-url https://pinpointanswertoday.app/puzzles --start-date 2026-03-22 --end-date 2026-04-18 --query-limit 25
```

Supplemental country pull:

```bash
node <manual Search Console country query>
```

The country pull was used only to extend country coverage beyond the default top rows printed by `gsc:pinpoint`.

---

## 6. Baseline comparison anchors

These are the main anchors to compare after Phase 1 deploy:

1. Homepage title no longer contains `Archive`
2. Homepage meta / JSON-LD no longer lead with `archive / yesterday`
3. `/puzzles` no longer presents as “Archive & Guides”
4. `/puzzles` gets a real H1 instead of only a visible section title
5. Homepage keeps its current “today answer” H1 direction
6. `/puzzles` query mix is checked again against this frozen 28-day baseline

---

## 7. Immediate takeaways before implementation

1. Homepage underperformance is still primarily a ranking problem, not a pure CTR problem.
2. `/puzzles` is confirmed to have no real H1 in production HTML.
3. `/puzzles` is strong enough to justify the experiment, but weak enough that post-deploy observation must stay conservative.
