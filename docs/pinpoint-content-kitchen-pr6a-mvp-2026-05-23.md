# PR6A — Content Kitchen Contract MVP

Date: 2026-05-23
Status: execution ticket
Parent architecture doc: `docs/pinpoint-content-kitchen-competitor-derived-plan-2026-05-22.md`

## Goal

PR6A is the first small engineering step for the content kitchen.

It should create a small contract validator that can answer:

- which puzzle this candidate belongs to
- which canonical URL owns the page
- whether the candidate is `answer-first` or `full-analysis`
- which search policy should apply
- which issue codes explain a failure
- whether the next PRs can safely build on the same output shape

PR6A is not the content generator. It is not the queue. It is not the review UI. It is the smallest machine-checkable contract layer.

## PR6A Only Does

- Add content-kitchen type definitions.
- Add canonical identity helpers.
- Add policy enum derivation.
- Add minimal `validateCandidate`.
- Add a minimal fixture runner.
- Add at least 6 first fixtures.
- Add `npm run test:content-kitchen`.

## PR6A Does Not Do

- Does not change production rendering.
- Does not change sitemap behavior.
- Does not change Worker production push behavior.
- Does not connect to `validate:data`.
- Does not connect to CI or `build`.
- Does not call GSC.
- Does not call public production URLs.
- Does not call external search.
- Does not call a model.
- Does not implement evidence retrieval.
- Does not implement enrichment queue persistence.
- Does not implement review UI.
- Does not implement `legacy-adapter.ts`.
- Does not run shadow validation over real production data.
- Does not implement the full rendered HTML helper.

## Files To Add

| File | Purpose |
| --- | --- |
| `lib/puzzles/content-kitchen/types.ts` | Contract types and enums. |
| `lib/puzzles/content-kitchen/identity.ts` | Canonical slug, canonical URL, revision hash, and content hash helpers. |
| `lib/puzzles/content-kitchen/policies.ts` | Search policy derivation. |
| `lib/puzzles/content-kitchen/validate-candidate.ts` | Minimal validator entrypoint. |
| `lib/puzzles/content-kitchen/fixtures/*.json` | First fixture inputs and expected outputs. |
| `scripts/check-content-kitchen-contract.ts` | Fixture runner. |

## Files Not To Touch In PR6A

Avoid changing these unless a tiny import/export is absolutely required:

- `worker/src/index.ts`
- `app/sitemap.ts`
- `app/(detail)/linkedin-pinpoint-answers/[slug]/page.tsx`
- `scripts/validate-data.ts`
- `scripts/release-production.mjs`
- `lib/puzzles/data/public.ts`
- historical `data/puzzles/*.json`

## V0 SEO Default

V0 default:

```ts
const ALLOW_ANSWER_FIRST_INDEX = false;
```

When this flag is false:

- every `answer-first` candidate gets `indexPolicy="noindex"`
- every `answer-first` candidate gets `sitemapPolicy="exclude"`
- every `answer-first` candidate gets `schemaPolicy="none"` in PR6A v0
- no `answer-first` page is allowed to enter sitemap
- no `answer-first` page is treated as indexable, even if it has answer and clues visible

This is intentionally conservative. `answer-first` can solve user freshness without asking Google to index thin daily placeholders.

Later PRs may allow limited `answer-first` indexing only after shadow validation and canary pass.

## Publishable Is Not Indexable

PR6A must separate two ideas:

| Word | Meaning |
| --- | --- |
| publishable | The page can be shown to users without lying or breaking canonical identity. |
| indexable | The page is good enough to invite search engines through sitemap/index policy. |

In v0:

- `answer-first` may be publishable.
- `answer-first` is not indexable by default.
- `full-analysis` may be indexable only after PR6B+ validates the full structure.

## Minimal Types

```ts
type ContentMode = "answer-first" | "full-analysis";

type ValidationOutcome =
  | "pass_full_analysis"
  | "pass_answer_first"
  | "downgrade_to_answer_first"
  | "requires_review"
  | "block_publish";

type IndexPolicy = "index" | "noindex" | "review_required" | "block_publish";

type SitemapPolicy =
  | "include"
  | "exclude"
  | "remove_on_next_build"
  | "include_after_audit";

type SchemaPolicy =
  | "none"
  | "article_only"
  | "faq_allowed"
  | "block_schema";

type InternalLinkPolicy =
  | "normal"
  | "deemphasized"
  | "hidden_from_recent";

type RequiredAction =
  | "enrich"
  | "review"
  | "upgrade"
  | "rollback"
  | "degrade"
  | "create_fix_task"
  | "dead_letter"
  | "block_publish"
  | "keep_current";

type DegradationAction =
  | "remove_faq_schema"
  | "apply_noindex"
  | "remove_from_sitemap"
  | "hide_from_recent"
  | "create_fix_task";
```

`pass_full_analysis` is included in the shared enum so later PRs do not change the output shape. PR6A itself must not return `pass_full_analysis`; it is reserved for PR6B+.

## Minimal Input Shape

```ts
type L1PuzzleInput = {
  puzzleId: string;
  puzzleNumber?: number;
  logicalGameDate: string;
  siteTimezone: string;
  answer: string;
  answerAliases?: string[];
  clues: Array<{
    clueId: string;
    text: string;
    position: number;
  }>;
  capturedAt: string;
  source: "worker_capture" | "manual_import";
  inputSnapshotHash: string;
};

type ContentCandidate = {
  puzzleId: string;
  contentMode: ContentMode;
  slug: string;
  canonicalUrl: string;
  revisionId: string;
  inputSnapshotHash: string;
  contentHash: string;
  answer: string;
  clues: Array<{
    clueId: string;
    text: string;
    position: number;
  }>;
  summary?: string;
};

type ValidateCandidateInput = {
  l1Input: L1PuzzleInput;
  candidate: ContentCandidate;
  canonicalConfig: CanonicalConfig;
  renderedHtml?: string;
  allowAnswerFirstIndex?: boolean;
};
```

## Canonical Config

PR6A must not read `process.env` directly inside pure helper functions. Pass canonical URL settings as explicit config.

```ts
type CanonicalConfig = {
  siteBaseUrl: string;
  detailRoutePrefix: "/linkedin-pinpoint-answers";
  trailingSlash: true;
};
```

Rules:

- `siteBaseUrl` must be normalized by the caller before publishing, but helpers should still trim trailing slashes.
- `detailRoutePrefix` is fixed to the current public detail route prefix in PR6A.
- `trailingSlash` is always `true` in PR6A.
- `buildCanonicalUrl(config, slug)` must normalize duplicate slashes.
- returned canonical URLs must always end in `/`.
- slug must be URI-encoded by path segment, not by encoding the whole URL.
- current real route shape is `/linkedin-pinpoint-answers/{slug}/`; PR6A helper must match it.
- if `puzzleNumber` is missing, slug generation must use `logicalGameDate` plus stable `puzzleId`, not a guessed number.
- validator must check the slug itself, not only the URL:

```ts
const expectedSlug = buildCanonicalSlug(l1Input);
candidate.slug === expectedSlug;
candidate.canonicalUrl === buildCanonicalUrl(canonicalConfig, expectedSlug);
```

Fixture config should use:

```ts
const fixtureCanonicalConfig: CanonicalConfig = {
  siteBaseUrl: "https://example.com",
  detailRoutePrefix: "/linkedin-pinpoint-answers",
  trailingSlash: true,
};
```

## Hash Responsibility

PR6A must verify the L1 input hash. Do not only check that the field exists.

Required rule:

```ts
const expectedInputSnapshotHash = hashInputSnapshot(l1Input);
candidate.inputSnapshotHash === expectedInputSnapshotHash;
```

If the hash does not match, return `CANDIDATE_L1_MISMATCH`.

Hashing rules:

- `hashInputSnapshot` must use a stable JSON representation.
- object key order must not change the hash.
- clue order and clue positions must affect the hash.
- answer, clue text, clue order, logical date, puzzle id, and source must affect the hash.
- `inputSnapshotHash` itself must be excluded from the hash input.
- `capturedAt` should be excluded by default, unless the team explicitly decides that recapture time creates a new L1 snapshot.
- volatile metadata that is not part of L1 identity should not affect the hash.

PR6A only checks that `contentHash` exists and is non-empty.

`contentHash` recalculation can wait because the exact "substantive content" boundary belongs to later content rendering and artifact work.

## Minimal Output Shape

```ts
type ValidationIssue = {
  issueCode: string;
  severity: "P0" | "P1" | "P2";
  fieldPath: string;
  message: string;
  suggestedAction: string;
  blocking: boolean;
  candidateRevisionId?: string;
};

type ValidationPolicies = {
  indexPolicy: IndexPolicy;
  sitemapPolicy: SitemapPolicy;
  schemaPolicy: SchemaPolicy;
  internalLinkPolicy: InternalLinkPolicy;
  requiredAction: RequiredAction;
  degradationActions?: DegradationAction[];
};

type ValidateCandidateOutput = {
  outcome: ValidationOutcome;
  policies: ValidationPolicies;
  issues: ValidationIssue[];
};
```

## Minimal Validator Rules

Run checks in this order:

1. L1 input exists.
2. L1 answer is non-empty.
3. L1 has exactly five clues.
4. L1 clue positions are unique.
5. Candidate object exists.
6. Candidate mode is `answer-first` or `full-analysis`.
7. Candidate has non-empty `revisionId` and `contentHash`.
8. Candidate `puzzleId` matches L1 `puzzleId`.
9. Candidate `slug` equals `buildCanonicalSlug(l1Input)`.
10. Candidate canonical URL equals `buildCanonicalUrl(canonicalConfig, expectedSlug)`.
11. Candidate answer matches L1 answer.
12. Candidate has the same five clues as L1.
13. Candidate clue order matches L1 clue positions.
14. Candidate `inputSnapshotHash` equals `hashInputSnapshot(l1Input)`.
15. Derive preliminary policies.
16. If preliminary policies say `indexPolicy="index"`, `renderedHtml` must prove answer and all five L1 clues are visible.
17. Return one stable output shape.

Rendered HTML gating must use validator-derived policies, not a field supplied by the candidate:

```ts
const preliminaryPolicies = derivePolicies(input);

if (preliminaryPolicies.indexPolicy === "index") {
  requireRenderedHtmlProof();
}
```

## Rendered HTML Rule In PR6A

PR6A does not need a full rendered HTML parser.

It only needs this rule:

- if a candidate would be indexable and `renderedHtml` is missing, return `requires_review`
- do not silently pass
- do not fetch public URLs
- do not inspect built `.next` output

PR6A may use a simple string helper or a stub. Full local rendered HTML checks belong to PR6A.1 or PR6B.

## PR6A Policy Rules

| Situation | Outcome | Policies |
| --- | --- | --- |
| Candidate object is missing | `block_publish` | `block_publish`, `exclude`, `none`, `hidden_from_recent`, `block_publish` |
| Candidate mode is unsupported | `block_publish` | `block_publish`, `exclude`, `none`, `hidden_from_recent`, `block_publish` |
| Candidate `revisionId` or `contentHash` is missing | `block_publish` | `block_publish`, `exclude`, `none`, `hidden_from_recent`, `block_publish` |
| Missing L1 answer | `block_publish` | `block_publish`, `exclude`, `none`, `hidden_from_recent`, `block_publish` |
| L1 clue count is not five | `block_publish` | `block_publish`, `exclude`, `none`, `hidden_from_recent`, `block_publish` |
| Candidate `puzzleId` differs from L1 | `block_publish` | `block_publish`, `exclude`, `none`, `hidden_from_recent`, `block_publish` |
| Candidate slug differs from `buildCanonicalSlug(l1Input)` | `block_publish` | `block_publish`, `exclude`, `none`, `hidden_from_recent`, `block_publish` |
| Candidate answer differs from L1 | `block_publish` | `block_publish`, `exclude`, `none`, `hidden_from_recent`, `block_publish` |
| Candidate clues differ from L1 | `block_publish` | `block_publish`, `exclude`, `none`, `hidden_from_recent`, `block_publish` |
| Candidate `inputSnapshotHash` differs from recomputed L1 hash | `block_publish` | `block_publish`, `exclude`, `none`, `hidden_from_recent`, `block_publish` |
| Canonical URL mismatch | `block_publish` | `block_publish`, `exclude`, `none`, `hidden_from_recent`, `block_publish` |
| `answer-first`, default v0 | `pass_answer_first` | `noindex`, `exclude`, `none`, `hidden_from_recent`, `enrich` |
| `answer-first`, flag allows index, rendered answer/clues visible | `pass_answer_first` | `index`, `include`, `article_only`, `deemphasized`, `enrich` |
| `answer-first`, flag allows index, rendered HTML missing | `requires_review` | `review_required`, `exclude`, `none`, `hidden_from_recent`, `review` |
| basic `full-analysis` identity passes | `requires_review` | `review_required`, `include_after_audit`, `article_only`, `deemphasized`, `review` |

Policy tuple order above is:

1. `indexPolicy`
2. `sitemapPolicy`
3. `schemaPolicy`
4. `internalLinkPolicy`
5. `requiredAction`

## PR6A Issue Codes

Only implement these issue codes in PR6A:

| Code | Use when |
| --- | --- |
| `MISSING_L1_INPUT` | L1 input object is absent or cannot be loaded. |
| `INVALID_L1_INPUT` | L1 exists but answer is empty, clue count is not five, clue positions are invalid, or clue ids/text are empty. |
| `INVALID_CANDIDATE_METADATA` | Candidate object is missing, candidate mode is unsupported, or `revisionId` / `contentHash` is missing or empty. |
| `CANDIDATE_L1_MISMATCH` | Candidate `puzzleId`, answer, clues, clue order, or `inputSnapshotHash` does not match L1. |
| `CANONICAL_URL_MISMATCH` | Candidate slug or canonical URL does not match the canonical helper output from L1. |
| `ANSWER_HIDDEN_FROM_RENDERED_HTML` | Indexable candidate lacks rendered HTML proof, or rendered HTML lacks answer/clues. |
| `NOINDEX_REQUIRED_BUT_MISSING` | A later rendered check proves the page should be noindex but no noindex marker exists. |
| `FULL_ANALYSIS_STRUCTURE_NOT_VALIDATED` | Candidate is `full-analysis`, identity passed, but PR6B structural checks have not run yet. |

Do not implement PR7/PR8 evidence issue codes in PR6A.

Do not implement PR11 public fetch issue codes in PR6A.

## First Fixtures

Use at least 6 first fixtures. More are allowed when they remove ambiguity.

Positive fixtures:

| Fixture | Expected |
| --- | --- |
| `answer-first-default-noindex.valid.json` | `pass_answer_first`; `indexPolicy=noindex`; `sitemapPolicy=exclude`; `requiredAction=enrich` |

Review fixtures:

| Fixture | Expected |
| --- | --- |
| `answer-first-index-flag-rendered-html-missing.requires-review.json` | `allowAnswerFirstIndex=true`; missing `renderedHtml`; `outcome=requires_review`; `issueCode=ANSWER_HIDDEN_FROM_RENDERED_HTML`; `indexPolicy=review_required`; `requiredAction=review` |
| `full-analysis-basic-identity.requires-review.json` | identity checks pass; `outcome=requires_review`; `issueCode=FULL_ANALYSIS_STRUCTURE_NOT_VALIDATED`; `indexPolicy=review_required`; `sitemapPolicy=include_after_audit`; `requiredAction=review` |

Negative fixtures:

| Fixture | Expected issue |
| --- | --- |
| `missing-l1-input.invalid.json` | `MISSING_L1_INPUT` |
| `empty-l1-answer.invalid.json` | `INVALID_L1_INPUT` |
| `invalid-l1-clue-count.invalid.json` | `INVALID_L1_INPUT` |
| `missing-revision-id.invalid.json` | `INVALID_CANDIDATE_METADATA` |
| `missing-content-hash.invalid.json` | `INVALID_CANDIDATE_METADATA` |
| `unsupported-content-mode.invalid.json` | `INVALID_CANDIDATE_METADATA` |
| `candidate-puzzle-id-mismatch.invalid.json` | `CANDIDATE_L1_MISMATCH` |
| `candidate-answer-mismatch.invalid.json` | `CANDIDATE_L1_MISMATCH` |
| `candidate-input-hash-mismatch.invalid.json` | `CANDIDATE_L1_MISMATCH` |
| `candidate-slug-mismatch.invalid.json` | `CANONICAL_URL_MISMATCH` |
| `canonical-url-mismatch.invalid.json` | `CANONICAL_URL_MISMATCH` |

PR6A.1 can add deeper rendered HTML visibility fixtures.

PR6B can add full-analysis structure fixtures.

PR6C can add artifact fixtures.

## Fixture Runner

The runner should:

1. Load every fixture JSON.
2. Call `validateCandidate`.
3. Compare `outcome`.
4. Compare selected policy fields.
5. Compare required issue codes.
6. Print a short readable failure.
7. Exit 1 if any fixture fails.

Suggested package script:

```json
{
  "test:content-kitchen": "tsx scripts/check-content-kitchen-contract.ts"
}
```

Do not add this script to `build` in PR6A.

## PR6A Done

PR6A is done when:

- `npm run test:content-kitchen` passes.
- `npm run typecheck` passes.
- `npm run lint` passes.
- At least 6 fixtures are checked in.
- `answer-first` defaults to `noindex`.
- Missing rendered HTML cannot silently pass an indexable candidate.
- No production rendering behavior changes.
- No sitemap behavior changes.
- No Worker behavior changes.

## PR6A Not Done

PR6A is not done if:

- The validator returns only true/false.
- Policy enum values are still only prose.
- `answer-first` defaults to index.
- Fixture expectations are not machine-checked.
- The PR touches production publishing behavior.
- The PR requires GSC, external search, or model calls.
- The PR depends on a deployed URL.

## PR6A.1 Follow-Up

After PR6A lands, create PR6A.1 for:

- `rendered-html.ts`
- answer visibility check
- all five clues visibility check
- noindex marker check
- rendered HTML fixtures

## PR6A.2 Follow-Up

After PR6A.1 lands, create PR6A.2 for:

- `legacy-adapter.ts`
- shadow validation over selected real records
- no build blocking yet
- no production behavior changes

Suggested shadow sample:

- latest 10 public records
- known weak records `#701`, `#747`, `#748`, `#749`, `#750` when present
- one legacy `fallback_full` record
- one `bodyMode="short"` or `light-explainer` record if present

## Decisions Needed Before PR6A

- PR6A owner.
- Final enum names.
- Canonical URL helper behavior.
- `ALLOW_ANSWER_FIRST_INDEX=false` accepted as v0 default.
- Missing `renderedHtml` cannot pass indexable validation.
- PR6A stays out of production publish/build behavior.
