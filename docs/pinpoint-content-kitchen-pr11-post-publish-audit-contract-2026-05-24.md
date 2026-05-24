# PR11 Post-Publish Audit Contract

This is the local contract note for PR11.1.

It defines the post-publish audit artifact shape and the first issue mapping.

It is intentionally local-only:

- it does not fetch public URLs
- it does not run a browser
- it does not read sitemap files
- it does not read production storage
- it does not write review queue storage
- it does not send Feishu messages
- it does not publish content
- it does not run Worker cron

## Artifact

Every audit result uses `artifactVersion: "content-kitchen-post-publish-audit-v0"`.

Every audit result uses `artifactType: "post_publish_audit"`.

Required identity fields:

- `artifactId`
- `puzzleId`
- `canonicalUrl`
- `revisionId`
- `contentMode`
- `fetchedUrl`
- `checkedAt`

Safety fields:

- `safety.rawRenderedHtmlIncluded: false`
- `safety.publicFetchPerformedByContract: false`
- `safety.publishAllowed: false`

PR11.1 consumes observed facts. It does not create those facts by fetching or rendering the live page.

## Outcomes

`auditOutcome` has three values:

- `publish_failed`: public fetch failed or returned a bad status
- `published_but_audit_failed`: public page exists, but one or more audit checks failed
- `published_and_audit_passed`: all checked facts match the expected published state

## Checks

The first local checks are:

- `public_fetch`
- `public_render`
- `answer_visible`
- `all_clues_visible`
- `canonical_matches`
- `robots_policy_matches`
- `sitemap_policy_matches`
- `sitemap_lastmod_matches`
- `schema_date_modified_matches`
- `schema_mode_matches`
- `internal_links_valid`

Each check returns `pass`, `fail`, or `not_checked`.

`not_checked` is explicit. It means the current local input did not have enough observed facts for that check, or the check does not apply to that policy.

## PR11 Issue Codes

PR11 owns these new issue codes:

- `PUBLIC_HTML_FETCH_FAILED`
- `PUBLIC_HTML_RENDER_FAILED`
- `SITEMAP_LASTMOD_MISSING`
- `SCHEMA_DATE_MODIFIED_MISSING`
- `SITEMAP_POLICY_MISMATCH`
- `ROBOTS_POLICY_MISMATCH`
- `DATE_MODIFIED_MISMATCH`
- `SCHEMA_MODE_MISMATCH`

PR11 can also reuse earlier issue codes when the public page proves the same problem:

- `ANSWER_HIDDEN_FROM_RENDERED_HTML`
- `MISSING_CLUE_ROW`
- `CANONICAL_URL_MISMATCH`
- `INTERNAL_LINK_BROKEN`

## Policy Mapping

P0 audit failures:

- `auditOutcome` becomes `publish_failed` when public fetch failed
- otherwise `auditOutcome` becomes `published_but_audit_failed`
- `recommendedAction` becomes `rollback`
- `recommendedPolicies.sitemapPolicy` becomes `remove_on_next_build`
- `recommendedPolicies.schemaPolicy` becomes `block_schema`
- `recommendedPolicies.internalLinkPolicy` becomes `hidden_from_recent`

P1 and P2 audit failures:

- `auditOutcome` becomes `published_but_audit_failed`
- `recommendedAction` becomes `create_fix_task` by default
- sitemap or robots policy mismatch can recommend `degrade`
- non-P0 failures do not automatically publish, rollback, or write storage

Clean audit:

- `auditOutcome` becomes `published_and_audit_passed`
- `issueCodes` is empty
- `recommendedAction` is `none`
- `recommendedPolicies` preserves the expected publish policies

## Local Test Coverage

The content-kitchen contract test proves:

- clean full-analysis audit passes
- public fetch failure becomes `publish_failed`
- fetch failure skips render-only checks instead of guessing
- answer-first sitemap mismatch becomes `published_but_audit_failed`
- policy mismatch can recommend exact degradation actions
- missing schema `dateModified` creates `SCHEMA_DATE_MODIFIED_MISSING`
- PR11 issue codes are registered with `phaseOwner: "PR11"`
- audit artifacts do not include raw rendered HTML
- PR11.1 does not fetch public URLs itself

## Local Runner

PR11.2 adds a local runner.

Input uses `content-kitchen-post-publish-audit-runner-input-v0`.

Runner result uses `content-kitchen-post-publish-audit-runner-result-v0`.

Run it with:

```bash
npm run content-kitchen:post-publish-audit -- \
  --input lib/puzzles/content-kitchen/examples/post-publish-audit-pass.input.example.json \
  --output /tmp/content-kitchen-post-publish-audit.json \
  --pretty
```

The output file is the audit artifact itself.

Example inputs:

- `post-publish-audit-pass.input.example.json`
- `post-publish-audit-policy-mismatch.input.example.json`

Runner rules:

- `--input` is required
- `--output` is optional
- `--output` must not equal `--input`
- the runner rejects raw rendered HTML, model prompts, and obvious secrets in the input file
- the runner does not fetch public URLs
- the runner does not run a browser
- the runner does not send Feishu messages
- the runner does not write review queue storage
- the runner does not publish content

## Observed Facts Builder

PR11.3 adds a local observed facts builder.

Input uses `content-kitchen-post-publish-observed-facts-builder-input-v0`.

Builder result uses `content-kitchen-post-publish-observed-facts-builder-result-v0`.

Run it with:

```bash
npm run content-kitchen:post-publish-observed-facts -- \
  --input lib/puzzles/content-kitchen/examples/post-publish-observed-facts-pass.input.example.json \
  --output /tmp/content-kitchen-post-publish-audit-input.json \
  --pretty
```

The output file is audit runner input. It can be passed to:

```bash
npm run content-kitchen:post-publish-audit -- \
  --input /tmp/content-kitchen-post-publish-audit-input.json \
  --output /tmp/content-kitchen-post-publish-audit.json \
  --pretty
```

Example files:

- `post-publish-observed-facts-pass.input.example.json`
- `post-publish-observed-facts-pass.html.example`
- `post-publish-observed-facts-sitemap.xml.example`

The builder reads local files only:

- `sources.htmlPath`
- `sources.sitemapPath` when provided

It extracts:

- public fetch status from the local builder input
- visible answer
- visible L1 clues
- canonical URL
- robots noindex state
- sitemap inclusion and `lastmod`
- JSON-LD schema types
- JSON-LD `dateModified`
- internal links

Builder rules:

- `--input` is required
- `--output` is optional
- `--output` must not equal `--input`
- `--output` must not equal `sources.htmlPath`
- `--output` must not equal `sources.sitemapPath`
- output must not include raw HTML
- the builder does not fetch public URLs
- the builder does not run a browser
- the builder does not send Feishu messages
- the builder does not write review queue storage
- the builder does not publish content
