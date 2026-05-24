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
