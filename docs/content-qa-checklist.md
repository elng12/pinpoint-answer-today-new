# Content QA Checklist

This checklist is part of the publish workflow for Pinpoint detail pages. Do not mark a release complete until the required daily check has been recorded.

## When to run

- Daily live publish: check the current live detail page within 4 hours of publish.
- FAQ, prompt, or template changes: check the current live detail page plus 2 representative older pages on the same day.
- Detail rendering or CTA changes: check the current live detail page plus 2 representative older pages on the same day.
- Weekly review: sample the latest 5 pages plus new GSC query-driven candidates.

## Severity

- `P0`: wrong answer, clue explanation runs backward, FAQ contradicts body copy, or noindex/sitemap signals conflict.
- `P1`: missing turning point, FAQ feels templated, opening paragraph spoils too early, or the page lacks Archive / Tips exits.

## Daily Checklist Template

Copy this block into the daily log before reviewing a page.

```md
## Pinpoint #NNN - YYYY-MM-DD

### Basic Completeness
- [ ] Turning point is present and specific.
- [ ] At least 2 clues have clue-specific, non-obvious explanations.
- [ ] A "why not other answers" explanation is present with a concrete rejected read.

### FAQ Quality
- [ ] At least 1 FAQ matches a real search intent.
- [ ] FAQ answers include puzzle-specific information, not just reusable filler.

### Opening Paragraph
- [ ] The opening paragraph does not reveal the answer word.
- [ ] The opening paragraph reads as 2-5 sentences.
- [ ] The opening creates a clear reason to keep reading.

### Internal Links
- [ ] The detail page exposes an Archive exit.
- [ ] The detail page exposes a Tips / Pro Tips exit.

### Result
- [ ] Pass
- [ ] Needs follow-up

### Notes
- Blocking issues:
- Follow-up owner:
- Follow-up due:
```

## Operating Rule

- Log the review in a dated doc under `docs/`.
- Fix `P0` issues the same day and revalidate the page.
- Fix `P1` issues within 24 hours.
- If the same `P1` pattern appears twice in one week, pause further rollout work until the template or generator rule is corrected.
