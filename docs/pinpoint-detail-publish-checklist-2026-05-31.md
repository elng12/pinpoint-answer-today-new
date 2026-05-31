# Pinpoint Detail Publish Checklist

Date: 2026-05-31

This is the fixed checklist for every LinkedIn Pinpoint detail page.

Use `{number}` for the current puzzle number. Do not hard-code an old number like `760`.

## Before Editing

- Confirm the current puzzle number, date, answer, and five clues.
- Confirm the page route is `/linkedin-pinpoint-answers/pinpoint-answer-{number}/`.
- Do not change homepage SEO title or description unless that is the explicit task.
- Do not make `evidenceRefs` a publish blocker. Under the current policy, `MISSING_EVIDENCE_REF` is info only when the page has five complete and specific clue explanations.

## Required Page Shape

The detail page must have:

- H1: `Pinpoint {number} Answer & LinkedIn Analysis`
- page title that includes `LinkedIn Pinpoint`, `{number}`, and `Answer`
- visible published date
- exactly five clue cards in the correct order
- visible answer in rendered HTML
- `LinkedIn Pinpoint {number} Answer Reasoning`
- short reasoning blocks, not one giant wall of text
- `What This Pinpoint Teaches` as the merged teaching area
- recent Pinpoint answer links
- archive link back to `/puzzles`
- Article JSON-LD, BreadcrumbList JSON-LD, and recent ItemList JSON-LD

Do not bring back these old modules:

- `Clue Connections`
- `Words & How They Fit`
- `Category`
- `Lessons Learned`
- `Compact FAQ`
- table-style clue-by-clue blocks

`What This Pinpoint Teaches` may contain lesson-like items and question-like items, but they must use the same item style. Do not split them into separate visible modules.

## Keyword Order

Follow `docs/pinpoint-detail-keyword-density-rules-2026-05-30.md`.

The short version:

| Group | Fixed order |
| --- | --- |
| 1 word | `pinpoint` first, `answer` second, `linkedin` third |
| 2 words | `pinpoint answer` first, `linkedin pinpoint` second, then clue combinations |
| 3 words | clue combinations first, `linkedin pinpoint answer` near the front |
| 4 words | clue combinations first |
| 5 words | full clue path first |

The browser plugin filters numbers, so it may show `pinpoint answer` instead of `pinpoint {number} answer`.

The raw page still must include current-number phrases:

- `pinpoint {number}`
- `pinpoint {number} answer`
- `linkedin pinpoint {number} answer`

## Local Checks

Run these before considering the page ready:

```bash
npm run validate:data
npm run typecheck
npm run lint
npm run build
npm run test:pinpoint-rendered
npm run pinpoint:prepublish-gate -- --use-existing-build --slug pinpoint-answer-{number}
npm run detail:keyword-audit -- --url http://localhost:3004/linkedin-pinpoint-answers/pinpoint-answer-{number}/ --top 12
```

If the template changed, also check the previous public detail page so the new template did not damage old pages.

## Production Checks

After deploy, check the real URL:

```bash
npm run detail:publish-check -- --slug pinpoint-answer-{number}
npm run detail:keyword-audit -- --url https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-{number}/ --top 12
curl -I -L https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-{number}/
npx vercel ls pinpoint-answer-today-new --scope team_funPiYWRgqIN2bAClbNEdWJ8
```

`detail:publish-check` is the main command. The other commands are kept here for manual debugging when that command fails.

`release:production` runs `detail:publish-check` automatically after deploy. If it fails, the release script sends a Feishu/Slack alert when a webhook is configured. P0 failures also try to pause the next auto-publish run.

The Cloudflare Worker cannot run this Node command directly, so it has a lightweight post-publish public audit with the same P0/P1 action rule. Worker P0 failures send Feishu/Slack and pause the next auto-publish run.

Failure levels:

- P0: wrong page, wrong answer, missing clues, runtime error, wrong summary API, or Vercel not ready. Action: alert, pause auto-publish, consider rollback.
- P1: SEO or page-shape issue, such as title/H1, keyword order, teaching items, recent links, or JSON-LD. Action: alert and fix without automatic rollback.
- P2: record-only note. Action: do not block publish.

Also verify:

- detail URL returns `200`
- Vercel says the production deployment is `Ready`
- homepage links to `/linkedin-pinpoint-answers/pinpoint-answer-{number}/`
- `/api/puzzles/summary` returns the same `{number}` and slug
- production HTML has the correct H1, five clue cards, answer, reasoning, and teaching items
- production HTML does not show old module labels like `Clue Connections`
- no runtime error text appears in the page

## Pass Or Block

Pass when:

- local checks pass
- production checks pass
- keyword audit follows the fixed order
- current puzzle number is correct everywhere

Block when:

- the page has the wrong number, date, clues, or answer
- keyword audit fails
- answer or clues are missing from rendered HTML
- old removed modules reappear
- production still serves an old page
- runtime error text appears

Do not block only because `MISSING_EVIDENCE_REF` appears as an info note under the current policy.
