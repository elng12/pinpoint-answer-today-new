import type {
  ReviewUiActionButtonV0,
  ReviewUiInputV0,
  ReviewUiIssueGroupV0,
} from "../lib/puzzles/content-kitchen/types";

export const REVIEW_UI_SURFACE_VERSION = "content-kitchen-review-ui-surface-v0";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderField(label: string, value: unknown): string {
  return `
    <div class="field">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value ?? "n/a")}</dd>
    </div>`;
}

function renderIssueGroup(group: ReviewUiIssueGroupV0): string {
  const issues = group.issues.map((issue) => `
    <li>
      <strong>${escapeHtml(issue.issueCode)}</strong>
      <span>${escapeHtml(issue.message)}</span>
      <small>${escapeHtml(issue.fieldPath)} | ${escapeHtml(issue.suggestedAction)}</small>
    </li>`).join("");

  return `
    <section class="band">
      <h2>${escapeHtml(group.severity)} issues</h2>
      <ul class="issue-list">${issues}</ul>
    </section>`;
}

function renderAction(action: ReviewUiActionButtonV0): string {
  return `
    <li class="action ${action.enabled ? "enabled" : "disabled"}">
      <span>${escapeHtml(action.action)}</span>
      <small>${escapeHtml(action.enabled ? "available" : "disabled")} - ${escapeHtml(action.reason)}</small>
    </li>`;
}

function renderClues(input: ReviewUiInputV0): string {
  if (input.puzzle.snapshotStatus === "missing") {
    return `
      <section class="band warning">
        <h2>Puzzle snapshot missing</h2>
        <p>This local surface does not invent answer or clue text. Provide a puzzle snapshot before a real review UI shows clue rows.</p>
      </section>`;
  }

  const clues = input.puzzle.clues.map((clue) => `
    <li>
      <span>${escapeHtml(clue.position)}</span>
      <strong>${escapeHtml(clue.text)}</strong>
      <small>${escapeHtml(clue.clueId || "no clue id")}</small>
    </li>`).join("");

  return `
    <section class="band">
      <h2>Five L1 clues</h2>
      <ol class="clue-list">${clues}</ol>
    </section>`;
}

function renderQueueAndNotification(input: ReviewUiInputV0): string {
  const queueLines = input.queueDraft.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("");
  const notificationLines = input.notificationDraft?.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("");

  return `
    <section class="band">
      <h2>Queue draft</h2>
      <dl>
        ${renderField("Draft id", input.queueDraft.draftId)}
        ${renderField("Draft only", input.queueDraft.draftOnly)}
        ${renderField("Persistence", input.queueDraft.persistenceStatus)}
        ${renderField("Reason", input.queueDraft.reason)}
      </dl>
      <ul class="plain-list">${queueLines}</ul>
    </section>

    <section class="band">
      <h2>Notification draft</h2>
      <dl>
        ${renderField("Channel", input.notificationDraft?.channel)}
        ${renderField("Dispatch", input.notificationDraft?.dispatchStatus)}
        ${renderField("Title", input.notificationDraft?.title)}
      </dl>
      <p>Draft only: not sent to Feishu.</p>
      ${notificationLines ? `<ul class="plain-list">${notificationLines}</ul>` : ""}
    </section>`;
}

export function renderReviewUiInputHtml(input: ReviewUiInputV0): string {
  const issueGroups = input.validation.issueGroups.length > 0
    ? input.validation.issueGroups.map(renderIssueGroup).join("")
    : '<section class="band"><h2>Issues</h2><p>No issue rows.</p></section>';
  const actions = input.allowedActions.map(renderAction).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Content Kitchen Review - ${escapeHtml(input.artifact.artifactId)}</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #182026;
      --muted: #5e6a72;
      --line: #d9e1e7;
      --soft: #f5f8fa;
      --warn: #fff7e0;
      --accent: #126c6a;
      --danger: #b42318;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: var(--ink);
      background: #ffffff;
      line-height: 1.45;
    }
    main {
      max-width: 1180px;
      margin: 0 auto;
      padding: 24px;
    }
    header {
      border-bottom: 1px solid var(--line);
      padding-bottom: 18px;
      margin-bottom: 18px;
    }
    h1 {
      font-size: 30px;
      margin: 0 0 8px;
      letter-spacing: 0;
    }
    h2 {
      font-size: 18px;
      margin: 0 0 12px;
      letter-spacing: 0;
    }
    p { margin: 0; color: var(--muted); }
    .status-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 14px;
    }
    .pill {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 6px 10px;
      background: var(--soft);
      font-size: 13px;
      color: var(--ink);
    }
    .pill.danger { border-color: #f2b8b5; color: var(--danger); background: #fff4f2; }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      align-items: start;
    }
    .band {
      border-top: 1px solid var(--line);
      padding: 18px 0;
    }
    .warning {
      background: var(--warn);
      border: 1px solid #ecdca8;
      padding: 16px;
      border-radius: 6px;
    }
    dl {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px 16px;
      margin: 0;
    }
    .field dt {
      font-size: 12px;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 4px;
    }
    .field dd {
      margin: 0;
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    ul, ol {
      margin: 0;
      padding-left: 20px;
    }
    li { margin: 8px 0; }
    .plain-list {
      margin-top: 12px;
    }
    .issue-list li,
    .action {
      border-left: 3px solid var(--accent);
      padding-left: 10px;
      list-style: none;
    }
    .issue-list small,
    .action small,
    .clue-list small {
      display: block;
      color: var(--muted);
      font-size: 12px;
      margin-top: 2px;
    }
    .action.disabled {
      border-left-color: var(--line);
      color: var(--muted);
    }
    .safety {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
    }
    .safety span {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px;
      background: var(--soft);
      font-size: 13px;
    }
    @media (max-width: 760px) {
      main { padding: 16px; }
      .grid, dl, .safety { grid-template-columns: 1fr; }
      h1 { font-size: 24px; }
    }
  </style>
</head>
<body data-surface-version="${REVIEW_UI_SURFACE_VERSION}">
  <main>
    <header>
      <h1>Content Kitchen Review</h1>
      <p>Read-only local surface. It does not render production content, send Feishu messages, write storage, or publish.</p>
      <div class="status-row">
        <span class="pill">${escapeHtml(input.reviewUiInputVersion)}</span>
        <span class="pill">${escapeHtml(REVIEW_UI_SURFACE_VERSION)}</span>
        <span class="pill">${escapeHtml(input.route.route)}</span>
        <span class="pill ${input.queueDraft.priority === "high_priority" ? "danger" : ""}">${escapeHtml(input.queueDraft.priority)}</span>
        <span class="pill">${escapeHtml(input.renderStatus)}</span>
      </div>
    </header>

    <section class="band">
      <h2>Review target</h2>
      <dl>
        ${renderField("Artifact", input.artifact.artifactId)}
        ${renderField("Puzzle", input.puzzle.puzzleId)}
        ${renderField("Puzzle number", input.puzzle.puzzleNumber)}
        ${renderField("Logical date", input.puzzle.logicalDate)}
        ${renderField("Candidate revision", input.revisions.candidateRevisionId)}
        ${renderField("Published revision", input.revisions.publishedRevisionId)}
        ${renderField("Candidate mode", input.revisions.candidateAttemptedMode)}
        ${renderField("Validation outcome", input.validation.outcome)}
        ${renderField("Recommended action", input.recommendedAction)}
        ${renderField("Public URL", input.publicUrl)}
        ${renderField("Review URL", input.reviewUrl)}
        ${renderField("Rendered preview URL", input.renderedPreviewUrl)}
      </dl>
    </section>

    <div class="grid">
      <section class="band">
        <h2>Policy output</h2>
        <dl>
          ${renderField("Index", input.validation.policies.indexPolicy)}
          ${renderField("Sitemap", input.validation.policies.sitemapPolicy)}
          ${renderField("Schema", input.validation.policies.schemaPolicy)}
          ${renderField("Internal links", input.validation.policies.internalLinkPolicy)}
          ${renderField("Required action", input.validation.policies.requiredAction)}
        </dl>
      </section>

      <section class="band">
        <h2>Evidence summary</h2>
        <dl>
          ${renderField("Evidence refs", input.evidenceSummary?.evidenceRefCount)}
          ${renderField("Source levels", input.evidenceSummary?.sourceLevels?.join(", "))}
          ${renderField("Notes", input.evidenceSummary?.notes?.join(" | "))}
        </dl>
      </section>
    </div>

    ${renderClues(input)}
    ${issueGroups}
    ${renderQueueAndNotification(input)}

    <section class="band">
      <h2>Read-only action readiness</h2>
      <ul>${actions}</ul>
    </section>

    <section class="band">
      <h2>Safety flags</h2>
      <div class="safety">
        <span>Raw HTML included: ${input.safety.rawRenderedHtmlIncluded}</span>
        <span>Model prompt included: ${input.safety.modelPromptIncluded}</span>
        <span>Secrets included: ${input.safety.secretsIncluded}</span>
        <span>Publish allowed: ${input.safety.publishAllowed}</span>
      </div>
    </section>
  </main>
</body>
</html>`;
}
