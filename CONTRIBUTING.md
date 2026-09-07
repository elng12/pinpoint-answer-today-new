# Contributing to Pinpoint Answer Today

Thank you for helping maintain this independent Pinpoint answer site. Small, focused changes are easier to review than broad rewrites. English and Chinese reports are welcome.

## Report a Bug

Search [existing issues](https://github.com/elng12/pinpoint-answer-today-new/issues) before opening one. Include:

- The affected page or command, and the puzzle number when relevant.
- Steps to reproduce, expected behavior, and actual behavior.
- Your commit, Node/npm versions, and browser when applicable.
- Relevant error output or a screenshot, with secrets and personal data removed.

For a wrong answer or explanation, identify the exact clue and provide a verifiable source for the correction. Do not upload copied private account data or fabricate evidence.

For sensitive security reports, do not post exploit details, tokens, or cookies in a public issue. Use GitHub's private vulnerability-reporting option if it is available on the repository's Security tab. If it is not available, open a minimal issue asking the maintainer for a private reporting channel, without disclosing the vulnerability itself. Do not test production without explicit authorization.

## Set Up Locally

Follow the [README quick start](README.md#local-quick-start). Use Node.js 22 or newer and `npm ci`. Normal page development uses bundled data; it does not require production credentials. Optional external keyword tools are not prerequisites.

Work on a branch in your clone or fork. Do not use the maintainer's accounts, notification destinations, or deployed Worker as your test environment. Review the existing GitHub workflows before enabling automation on a fork; some workflows write branches or manage releases.

## Make a Focused Change

- Keep one issue or behavior per pull request. Discuss large changes first.
- Follow existing TypeScript, React, and data patterns. Avoid unrelated formatting or dependency updates.
- Do not change the homepage's fixed `HOME_SEO_TITLE` or `HOME_SEO_DESCRIPTION` in `lib/seo/metadata.ts` as part of an unrelated fix.
- Do not weaken data validation or publishing protections to make a failing test pass.
- Add a regression test for the behavior you fix, including the relevant failure case.
- Mark synthetic test data as fixtures. Do not present fixtures as real puzzle evidence or live results.
- Keep secrets out of files, logs, screenshots, and issue/PR text. Never commit `.env.local` or export browser cookies into the repository.

Source-code and documentation contributions must be yours to contribute and are submitted under the repository's MIT License. Preserve third-party notices. Puzzle data and media have a separate [licensing boundary](README.md#license-and-content-boundary); adding them is not a declaration that they are MIT-licensed.

## Verify the Change

Choose checks that cover the affected behavior:

```bash
npm run validate:data
npm run lint
npm run typecheck
npm run test:pinpoint-guardrails
```

For the optional-tool wrapper, run `npm run test:keyword-tool-runner`. Its tests use synthetic local tool fixtures; they do not certify the external keyword-analysis engine.

For page or rendering changes, also run `npm run build` followed by `npm run test:pinpoint-rendered`, and inspect the affected page locally. For Worker changes, install its locked dependencies with `npm --prefix worker ci` and run `npm --prefix worker run typecheck`. Do not run a deploy command as a local test.

Generation regressions can involve AI requests and cost money. Read the [regression guide](docs/pinpoint-content-regression-sample-set.md) before running them. Report unrun or failing checks honestly; do not describe local checks as production verification.

## Open a Pull Request

Explain the problem, the changes, and the tests you actually ran. Link the issue if there is one. Add screenshots for visible changes and describe configuration or compatibility effects. Record meaningful maintenance changes in [docs/ITERATION.md](docs/ITERATION.md) without rewriting historical entries.

The maintainer handles production configuration and publishing. Passing CI is a prerequisite for relevant releases, not proof that a deployment or search-index update has happened. Please do not invoke production release, cookie refresh, GSC submission, or candidate-cleanup commands as part of an ordinary contribution.
