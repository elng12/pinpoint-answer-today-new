# Home / Archive SEO Tightening Precheck - 2026-04-20

> Status: completed before Phase 1 implementation  
> Captured at: 2026-04-20 22:45 CST  
> Output owner: Codex

---

## 1. Purpose

This file records the precheck required by the PRD before touching the four Phase 1 files.

It focuses on:

- `/puzzles` query intent mix
- SERP / title QA
- Header / Footer anchor text sanity
- Schema sanity
- Implementation-sensitive discoveries

---

## 2. `/puzzles` query intent grouping

Source window:

- `2026-03-22` -> `2026-04-18`
- GSC page: `https://pinpointanswertoday.app/puzzles`
- Visible top query rows returned by GSC: `25`
- Visible impressions represented by those rows: `49`
- Total impressions on page in same window: `108`

### 2.1 Grouped visible impressions

| Intent bucket | Visible impressions | Share of visible rows | Examples |
| --- | ---: | ---: | --- |
| `answer` | `45` | `91.8%` | `pinpoint 698 answer`, `goliath bull pinpoint answer`, `linkedin pinpoint answer` |
| `archive` | `0` | `0.0%` | none in visible top rows |
| `clue / phrase / other` | `4` | `8.2%` | `crenshaw citron`, `pad cap deep sock`, `marcha real pinpoint` |

### 2.2 Readout

- The visible query set is overwhelmingly `answer`-oriented.
- No visible top-row query contained an explicit archive term.
- This supports the PRD hypothesis that `/puzzles` is being tested on answer-like queries more than archive / lookup queries.
- It does **not** prove that page identity is the only cause of `0` clicks.

---

## 3. Device and GEO readout

### 3.1 Homepage `/`

- Desktop baseline is much weaker than mobile:
  - Desktop avg position `52.32`
  - Mobile avg position `14.08`
- Homepage country mix is diffuse; top rows are `IND`, `AUS`, `GBR`, `CAN`, `DEU`
- `USA` did not appear in the top 25 country rows returned for homepage baseline

### 3.2 Archive `/puzzles`

- Mobile baseline is meaningfully better than desktop:
  - Desktop avg position `20.82`
  - Mobile avg position `10.42`
- `USA` exists but is not dominant:
  - `USA`: `11` impressions, avg position `18.82`
  - `IND`: `26` impressions, avg position `8.50`
  - `GBR`: `10` impressions, avg position `19.60`

### 3.3 Precheck implication

- Phase 1 observation should not rely on all-country aggregate alone.
- Post-deploy review must keep `Mobile / Desktop` split and at least one `US` view.

---

## 4. SERP / title QA

### 4.1 Character counts

Current titles:

- Homepage current title: `61` chars
- `/puzzles` current title: `58` chars

Phase 1 frozen titles:

- Homepage proposed title: `63` chars
- `/puzzles` proposed title: `57` chars

### 4.2 Readout

- The new archive title is slightly shorter than current and is unlikely to worsen truncation risk.
- The new homepage title is slightly longer than current and should still keep the core `LinkedIn Pinpoint Answer Today` phrase intact.
- A dedicated browser-based pixel preview tool was **not** run inside this CLI precheck. This should be treated as a last QA step before merge, not as a blocker for implementation.

---

## 5. Header / Footer anchor text sanity

Current labels observed in live HTML and code:

### 5.1 Home-facing anchors

- Brand: `Pinpoint Answer Today`
- Nav: `Today`

### 5.2 Archive-facing anchors

- Nav: `Archive`
- Footer: `Open Full Archive`
- Footer CTA variants found in page source / components:
  - `Open Full Archive`
  - `Explore Full Archive`

### 5.3 Readout

- There is **no severe signal conflict** such as “Archive” pointing to homepage or “Today” pointing to `/puzzles`.
- Labeling is not perfectly unified, but it is directionally aligned with the intended `Today vs Archive` split.
- This should be recorded as future polish, not treated as a Phase 1 blocker.

---

## 6. Schema sanity

Current structured data found:

### 6.1 Homepage `/`

- `Organization`
- `WebSite`

Homepage `FAQPage` JSON-LD has been removed. Google currently limits FAQ rich results mainly to authoritative government/health sites, so homepage schema should stay limited to stable site-level types.

### 6.2 Archive `/puzzles`

- `CollectionPage`
- `ItemList`
- `BreadcrumbList`

These types remain directionally aligned with an archive / list page and are not an obvious conflict with the new positioning.

### 6.3 Readout

- No immediate schema-type conflict was found.
- The required next step is **validation**, not premature schema removal.
- Phase 1 gate should continue to use Rich Results Test to catch implementation mistakes after copy changes.

---

## 7. Implementation-sensitive discovery

### `/puzzles` currently has no real H1

This is the main technical discovery from precheck.

Evidence:

- Live rendered HTML for `/puzzles` did not contain an `<h1>`
- The visible heading text is `All Pinpoint Answers`
- `SectionHeading` defaults to `level = 2`
- `ArchiveHeader` does not override that level

Implication:

- Phase 1 should not be described as “rename existing H1”
- It is actually “introduce a real H1 on `/puzzles` while changing the visible heading text to `LinkedIn Pinpoint Archive`”

---

## 8. Screenshots and artifacts

Artifacts captured:

- Desktop home: [home.png](artifacts/home-archive-seo-tightening-2026-04-20/home.png)
- Mobile home: [home-mobile.png](artifacts/home-archive-seo-tightening-2026-04-20/home-mobile.png)
- Desktop puzzles: [puzzles.png](artifacts/home-archive-seo-tightening-2026-04-20/puzzles.png)
- Mobile puzzles: [puzzles-mobile.png](artifacts/home-archive-seo-tightening-2026-04-20/puzzles-mobile.png)

---

## 9. Commands used

```bash
curl -Lsf https://pinpointanswertoday.app/ -o /tmp/pat-home.html
curl -Lsf https://pinpointanswertoday.app/puzzles -o /tmp/pat-puzzles.html

npm run gsc:pinpoint -- page --credentials /Users/elng/Downloads/cursor-469606-0a5db422b4a4.json --page-url https://pinpointanswertoday.app/ --start-date 2026-03-22 --end-date 2026-04-18 --query-limit 25

npm run gsc:pinpoint -- page --credentials /Users/elng/Downloads/cursor-469606-0a5db422b4a4.json --page-url https://pinpointanswertoday.app/puzzles --start-date 2026-03-22 --end-date 2026-04-18 --query-limit 25

npx playwright screenshot --device="Desktop Chrome" https://pinpointanswertoday.app/ docs/artifacts/home-archive-seo-tightening-2026-04-20/home.png
npx playwright screenshot --device="Desktop Chrome" https://pinpointanswertoday.app/puzzles docs/artifacts/home-archive-seo-tightening-2026-04-20/puzzles.png
npx playwright screenshot --device="Pixel 5" https://pinpointanswertoday.app/ docs/artifacts/home-archive-seo-tightening-2026-04-20/home-mobile.png
npx playwright screenshot --device="Pixel 5" https://pinpointanswertoday.app/puzzles docs/artifacts/home-archive-seo-tightening-2026-04-20/puzzles-mobile.png
```

---

## 10. Precheck conclusion

### Proceed / Block

**Proceed.**

### Why proceeding is justified

1. The PRD hypothesis is supported enough to justify a copy-tightening experiment.
2. No severe nav anchor conflict was found.
3. No obvious schema-type conflict was found.
4. The main newly discovered issue (`/puzzles` lacks a real H1) is directly addressed by the planned Phase 1 change.

### What to carry into implementation

1. `/puzzles` needs a real `<h1>`, not just a renamed visible heading.
2. Post-deploy observation must keep device and GEO split.
3. GA4 can be useful as a supporting layer, but GSC remains the primary experiment readout.
