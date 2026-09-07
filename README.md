# Pinpoint Answer Today

An independent website for LinkedIn Pinpoint answers, clue explanations, and a searchable daily archive. The repository contains the Next.js site, structured puzzle data, content checks, and the Cloudflare Worker used by the maintainer's publishing workflow.

[Website](https://pinpointanswertoday.app) | [Contributing](CONTRIBUTING.md) | [Documentation](docs/README.md) | [CI](https://github.com/elng12/pinpoint-answer-today-new/actions/workflows/ci.yml)

This is a maintained, site-specific application, not a general-purpose publishing framework. It is not affiliated with or endorsed by LinkedIn.

## What Is Here

- Daily answer pages with progressive hints, clue explanations, and answer reveal.
- A searchable archive, puzzle detail routes, and preview pages.
- A JSON registry plus one JSON file per puzzle.
- Data validation, routing and SEO tests, and checks against built page HTML.
- A Worker publishing workflow with candidate branches, CI checks, release verification, and operational diagnostics.

The code can be inspected and adapted as an example of maintaining a daily content site. Reusing the full deployment requires your own services and configuration; repository-specific URLs and resources are not a hosted service for forks.

## Local Quick Start

Use Node.js 22 or newer and npm. Node 22 also satisfies the Worker toolchain requirement. The lockfile is committed; use `npm ci` rather than updating dependencies during setup.

```bash
git clone https://github.com/elng12/pinpoint-answer-today-new.git
cd pinpoint-answer-today-new
npm ci
npm run dev
```

Open [localhost:3004](http://localhost:3004). If that port is occupied, use `npm run dev -- --port 3018` and open that port instead.

The homepage, archive, and existing detail pages use the repository's bundled puzzle data by default. Basic browsing does not require an AI key, LinkedIn cookies, a Cloudflare account, or a Vercel account. It shows the data in your checkout, not a promise of today's live answer.

`npm ci` runs the existing `prepare` script. In a regular clone, this installs the project's pre-push data-validation hook. Review `scripts/install-hooks.mjs` before installing in a checkout with an existing custom pre-push hook; it writes that hook path.

### Optional Services

You do not need an `.env.local` file for basic browsing. See [.env.example](.env.example) when configuring a specific integration. Keep credentials in an ignored local environment file or your deployment's secret store, never in a commit or issue. Example token values are placeholders, not usable credentials.

| Capability | Additional setup |
| --- | --- |
| AI draft generation | Your own AI provider credentials and local admin authentication; see the [Worker guide](worker/README.md). |
| Contact delivery | Your own feedback webhook. |
| Analytics | Optional GA4 configuration; disabled by default. |
| Scheduled publishing | Your own Worker, storage, GitHub authorization, and site deployment. |
| Keyword-density toolkit | An optional external toolkit directory; see below. |

`/api/health` and `/api/pinpoint/today` are Worker proxies, not offline demo endpoints. Without an override, they target the maintainer's production Worker. Avoid calling them for local smoke tests; `/api/puzzles/summary` reads the normal site data instead. Do not enable remote data or Worker fallback merely to view bundled pages.

## Checks

These checks do not require production credentials:

```bash
npm run validate:data
npm run lint
npm run typecheck
npm run test:pinpoint-guardrails
npm run test:keyword-tool-runner
```

For changes affecting rendered pages, build and check the output:

```bash
npm run build
npm run test:pinpoint-rendered
```

`build` runs data validation first. Do not bypass a failed check to publish. Use [scripts/README.md](scripts/README.md) for the full command catalog. Broader generation regressions may invoke AI services; read the [regression guide](docs/pinpoint-content-regression-sample-set.md) and configure only your own credentials before using them.

### Optional Keyword Tools

The three commands below use the maintainer's separate keyword-density toolkit. That toolkit is not bundled, automatically downloaded, or required for normal setup, site builds, or CI. If you already have an authorized copy, configure its directory in your shell:

```bash
export KEYWORD_DENSITY_TOOL_DIR="/absolute/path/to/your/keyword-toolkit"
npm run check:aitdk-density -- --text "pinpoint answer today" --offline-stop-words
npm run homepage:keyword-audit -- --text "pinpoint answer today" --offline-stop-words
npm run test:homepage-keyword-audit
```

The directory must contain `check-aitdk-density.ts`, `audit-homepage-keywords.ts`, or `check-fixtures.ts` for the corresponding command, plus that tool's own supporting files. The wrapper uses this repository's installed `tsx` and preserves arguments and failure exit codes. It does not load `.env.local`; export the variable in the shell. Missing configuration fails with an explanation instead of a misleading success.

These are maintainer-only extras, not a reproducible dependency of this public repository. The separate `detail:keyword-audit` command is implemented inside this repository and does not need the external toolkit.

## Repository Map

| Path | Responsibility |
| --- | --- |
| `app/`, `components/` | Pages, API routes, and UI components. |
| `lib/puzzles/` | Data loading, content structures, and rendering support. |
| `lib/seo/` | Metadata and structured data. |
| `data/puzzles/` | Registry and puzzle records; see the content licensing boundary below. |
| `scripts/` | Validation, tests, and maintainer operations. |
| `worker/` | Scheduled ingestion and publishing. |
| `.github/workflows/` | CI and candidate release automation. |
| `docs/` | Maintainer guides, iteration records, and historical notes. |

## Contributing and Maintenance

Bug reports, reproducible test cases, documentation corrections, and focused fixes are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md). Do not post credentials, cookies, personal data, or sensitive vulnerability details in public issues.

The maintainer's ongoing work includes reviewing code changes, updating dependencies, investigating failed content checks, and verifying releases. Review the actual [pull requests](https://github.com/elng12/pinpoint-answer-today-new/pulls), [CI runs](https://github.com/elng12/pinpoint-answer-today-new/actions), and [iteration log](docs/ITERATION.md) for evidence. Historical notes describe their own dates and environments; they are not a guarantee of current production health, uptime, external adoption, or search indexing.

## Maintainer Operations

This section is not part of contributor setup. Production release commands can push commits, deploy services, and perform other external operations. Use them only with explicit authority over the configured resources.

- [Worker guide](worker/README.md): credentials, environments, and publishing diagnostics.
- [Scripts guide](scripts/README.md): validation, release, visual checks, and GSC operations.
- [Detail publish checklist](docs/pinpoint-detail-publish-checklist-2026-05-31.md): post-release verification.
- [Content generation guide](docs/pinpoint-content-generation-best-practice-2026-03-17.md): generation and review expectations.
- [Iteration log](docs/ITERATION.md): maintenance history and unresolved verification boundaries.

Before deploying a fork, replace the original repository, domain, Worker, storage, notification, and deployment targets with resources you control. Review workflows before enabling Actions or providing secrets. A site deployment does not deploy the Worker automatically.

Keep `public/startupranking1371053120245110.html` in place when maintaining the original site; it is an existing site-verification file, not a credential or a reusable verification claim for forks.

## License and Content Boundary

Original project source code and maintainer-written documentation are available under the [MIT License](LICENSE). Keep existing third-party license and attribution notices when reusing code.

The MIT grant does **not** cover the puzzle dataset under `data/`, puzzle content reproduced in source files, fixtures, or examples, or media and fonts under `public/`. This repository does not grant redistribution rights to those materials; obtain permission or follow their separately applicable licenses before republishing them. Third-party software retains its own license. LinkedIn and Pinpoint names, logos, and other trademarks are not licensed by this project. A code license is not permission to access a third-party account or bypass service restrictions.
