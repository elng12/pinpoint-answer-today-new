# Pinpoint Evidence Ref Current Policy

Date: 2026-05-31

This is the current operating rule for detail pages and auto-publish.

## Decision

`evidenceRefs` are optional for the current Pinpoint detail-page publish path.

If a page has:

- the correct puzzle number
- the correct answer
- exactly five clues
- five complete and specific clue explanations
- visible answer, clue cards, reasoning, teaching items, recent links, schema, and keyword order

then `MISSING_EVIDENCE_REF` is only an informational note.

It does not block publish.
It does not require a follow-up task.
It does not mean the page is incomplete.

## Why

The current page quality standard is based on visible correctness, clue-to-answer explanation quality, rendered HTML checks, and keyword-density order.

Real dictionary/source evidence can still be useful for deeper audits, but it is not part of the current release requirement.

## Current Gate Behavior

When fast clue explanations are complete and specific, the pre-publish gate may still print `MISSING_EVIDENCE_REF` as info.

That output should be read as:

> This page is acceptable under the current fast clue-explanation path.

Do not turn that info note into a next-step action unless the release policy changes again.
