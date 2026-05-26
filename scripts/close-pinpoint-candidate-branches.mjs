import { spawnSync } from "node:child_process";
import process from "node:process";

const DEFAULT_REPO = "elng12/pinpoint-answer-today-new";
const CANDIDATE_PREFIX = "pinpoint/candidate/";
const REQUIRED_CHECK_NAME = "Lint, Typecheck, Guardrails";

function readArg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  if (result.status !== 0) {
    const detail = options.inherit
      ? `${command} failed`
      : String(result.stderr || result.stdout || `${command} failed`).trim();
    throw new Error(`${command} ${args.join(" ")} failed: ${detail}`);
  }
  return options.inherit ? "" : String(result.stdout || "").trim();
}

function git(args, options) {
  return run("git", args, options);
}

function parseCandidateBranch(branch) {
  const match = String(branch || "").match(/^pinpoint\/candidate\/(\d{4}-\d{2}-\d{2})-(pinpoint-answer-\d+)$/);
  if (!match) throw new Error(`Invalid candidate branch name: ${branch || "(missing)"}`);
  return { publishDate: match[1], slug: match[2] };
}

function listCandidateBranches(branchFilter) {
  const raw = git(["ls-remote", "--heads", "origin", `${CANDIDATE_PREFIX}*`]);
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/)[1] || "")
    .filter(Boolean)
    .map((ref) => ref.replace(/^refs\/heads\//, ""))
    .filter((branch) => !branchFilter || branch === branchFilter)
    .sort();
}

function fetchBranch(branch) {
  git(["fetch", "origin", `+refs/heads/${branch}:refs/remotes/origin/${branch}`]);
}

function fetchMain() {
  git(["fetch", "origin", "+main:refs/remotes/origin/main"]);
}

function isAncestor(ancestor, descendant) {
  const result = spawnSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
}

function commitAgeMinutes(ref) {
  const committedAt = git(["show", "-s", "--format=%cI", ref]);
  const timestamp = Date.parse(committedAt);
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
}

function parseActionsRunId(run) {
  const urls = [run?.details_url, run?.html_url, run?.check_suite?.url]
    .map((value) => String(value || ""));
  for (const url of urls) {
    const match = url.match(/\/actions\/runs\/(\d+)/);
    if (match) return match[1];
  }
  return "";
}

async function githubJson(pathname, { method = "GET", body, token }) {
  const response = await fetch(`https://api.github.com/${pathname.replace(/^\/+/, "")}`, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "pinpoint-candidate-watchdog/0.1",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  if (!response.ok) {
    throw new Error(`GitHub API ${method} ${pathname} failed HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  return json;
}

async function getCandidateCheckState({ repo, sha, token }) {
  const json = await githubJson(`repos/${repo}/commits/${sha}/check-runs?per_page=100`, { token });
  const runs = Array.isArray(json.check_runs) ? json.check_runs : [];
  const matches = runs
    .filter((run) => {
      const name = String(run?.name || "");
      return name === REQUIRED_CHECK_NAME || name.endsWith(` / ${REQUIRED_CHECK_NAME}`);
    })
    .sort((a, b) => String(b?.started_at || "").localeCompare(String(a?.started_at || "")));
  const latest = matches[0];
  if (!latest) return { state: "missing", detail: `${REQUIRED_CHECK_NAME} check is missing` };
  const runId = parseActionsRunId(latest);
  if (latest.status !== "completed") {
    return { state: "pending", detail: `${REQUIRED_CHECK_NAME} is ${latest.status}`, runId };
  }
  if (latest.conclusion === "success") {
    return { state: "success", detail: `${REQUIRED_CHECK_NAME} passed`, runId };
  }
  return { state: "failed", detail: `${REQUIRED_CHECK_NAME} concluded ${latest.conclusion || "unknown"}`, runId };
}

async function rerunWorkflowRun({ repo, token, runId }) {
  if (!runId) return false;
  await githubJson(`repos/${repo}/actions/runs/${runId}/rerun`, {
    method: "POST",
    token,
  });
  return true;
}

async function createOrCommentIssue({ repo, token, branch, body }) {
  const title = `Pinpoint candidate stuck: ${branch}`;
  const query = encodeURIComponent(`repo:${repo} is:issue is:open in:title "${title}"`);
  const search = await githubJson(`search/issues?q=${query}`, { token });
  const existing = Array.isArray(search.items) ? search.items.find((item) => item?.title === title) : null;
  if (existing?.number) {
    await githubJson(`repos/${repo}/issues/${existing.number}/comments`, {
      method: "POST",
      token,
      body: { body },
    });
    return { action: "commented", number: existing.number };
  }
  const created = await githubJson(`repos/${repo}/issues`, {
    method: "POST",
    token,
    body: { title, body },
  });
  return { action: "created", number: created.number };
}

function deleteRemoteBranch(branch, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] would delete ${branch}`);
    return;
  }
  const exists = spawnSync("git", ["ls-remote", "--exit-code", "--heads", "origin", branch], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).status === 0;
  if (!exists) return;
  git(["push", "origin", "--delete", branch], { inherit: true });
  const stillExists = spawnSync("git", ["ls-remote", "--exit-code", "--heads", "origin", branch], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).status === 0;
  if (stillExists) throw new Error(`candidate branch still exists after delete: ${branch}`);
}

function promoteCandidate({ branchRef, dryRun }) {
  if (dryRun) {
    console.log(`[dry-run] would fast-forward main to ${branchRef}`);
    return;
  }
  git(["checkout", "-B", "main", "origin/main"]);
  git(["merge", "--ff-only", branchRef]);
  git(["push", "origin", "HEAD:main"], { inherit: true });
}

function verifyCandidateRelease({ branch, sha, dryRun }) {
  if (dryRun) {
    console.log(`[dry-run] would verify public release for ${branch} ${sha}`);
    return;
  }
  run("node", [
    "scripts/verify-pinpoint-candidate-release.mjs",
    "--candidate-branch",
    branch,
    "--sha",
    sha,
  ], { inherit: true });
}

async function closeCandidateBranch({ branch, repo, token, maxPendingMinutes, dryRun }) {
  parseCandidateBranch(branch);
  fetchMain();
  fetchBranch(branch);

  const candidateRef = `refs/remotes/origin/${branch}`;
  const candidateSha = git(["rev-parse", candidateRef]);
  const ageMinutes = commitAgeMinutes(candidateRef);
  const mainContainsCandidate = isAncestor(candidateSha, "origin/main");

  if (mainContainsCandidate) {
    verifyCandidateRelease({ branch, sha: candidateSha, dryRun });
    deleteRemoteBranch(branch, dryRun);
    return { branch, sha: candidateSha, closed: true, action: "verified-and-deleted" };
  }

  const baseIsAncestor = isAncestor("origin/main", candidateRef);
  if (!baseIsAncestor) {
    return {
      branch,
      sha: candidateSha,
      closed: false,
      severity: ageMinutes >= maxPendingMinutes ? "failure" : "pending",
      reason: `candidate is not based on current main; age=${ageMinutes}m`,
    };
  }

  run("node", [
    "scripts/check-pinpoint-candidate-branch.mjs",
    "--base",
    "origin/main",
    "--head",
    candidateRef,
    "--branch",
    branch,
  ]);

  const checkState = await getCandidateCheckState({ repo, sha: candidateSha, token });
  if (checkState.state !== "success") {
    const reran = checkState.state === "failed"
      ? await rerunWorkflowRun({ repo, token, runId: checkState.runId }).catch((error) => {
        console.error(`could not rerun failed candidate CI for ${branch}: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      })
      : false;
    return {
      branch,
      sha: candidateSha,
      closed: false,
      severity: ageMinutes >= maxPendingMinutes ? "failure" : "pending",
      reason: `${checkState.detail}${reran ? "; rerun requested" : ""}; age=${ageMinutes}m`,
    };
  }

  promoteCandidate({ branchRef: candidateRef, dryRun });
  verifyCandidateRelease({ branch, sha: candidateSha, dryRun });
  deleteRemoteBranch(branch, dryRun);
  return { branch, sha: candidateSha, closed: true, action: "promoted-verified-and-deleted" };
}

async function main() {
  const repo = readArg("--repo", process.env.GITHUB_REPOSITORY || DEFAULT_REPO);
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  const branchFilter = readArg("--branch", "");
  const maxPendingMinutes = Number.parseInt(readArg("--max-pending-minutes", "45"), 10);
  const createIssue = hasFlag("--create-issue");
  const dryRun = hasFlag("--dry-run");
  if (!token) throw new Error("Missing GITHUB_TOKEN or GH_TOKEN");

  const branches = listCandidateBranches(branchFilter);
  if (branches.length === 0) {
    console.log("ok: no Pinpoint candidate branches found");
    return;
  }

  const failures = [];
  const pending = [];
  const closed = [];

  for (const branch of branches) {
    try {
      const result = await closeCandidateBranch({
        branch,
        repo,
        token,
        maxPendingMinutes: Number.isFinite(maxPendingMinutes) ? maxPendingMinutes : 45,
        dryRun,
      });
      if (result.closed) {
        closed.push(result);
        console.log(`closed: ${branch} (${result.action})`);
      } else if (result.severity === "pending") {
        pending.push(result);
        console.log(`pending: ${branch} - ${result.reason}`);
      } else {
        failures.push(result);
        console.error(`stuck: ${branch} - ${result.reason}`);
      }
    } catch (error) {
      const failure = {
        branch,
        closed: false,
        severity: "failure",
        reason: error instanceof Error ? error.message : String(error),
      };
      failures.push(failure);
      console.error(`stuck: ${branch} - ${failure.reason}`);
    }
  }

  if (failures.length > 0 && createIssue) {
    for (const failure of failures) {
      const body = [
        "A Pinpoint candidate branch could not be closed automatically.",
        "",
        `Branch: \`${failure.branch}\``,
        failure.sha ? `SHA: \`${failure.sha}\`` : "",
        `Reason: ${failure.reason}`,
        "",
        "Close condition:",
        "- candidate payload is on `main`",
        "- public fetch audit passes",
        "- candidate branch is deleted",
        "- candidate branch count returns to 0",
      ].filter(Boolean).join("\n");
      const issue = await createOrCommentIssue({ repo, token, branch: failure.branch, body });
      console.error(`issue ${issue.action}: #${issue.number} for ${failure.branch}`);
    }
  }

  console.log(JSON.stringify({
    ok: failures.length === 0,
    closed,
    pending,
    failures,
  }, null, 2));

  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
