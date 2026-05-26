import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const WORKER_DIR = path.join(ROOT, "worker");
const INITIAL_ENV_KEYS = new Set(Object.keys(process.env));
const ENV_FILE_PATHS = [
  path.join(ROOT, ".env.local"),
  path.join(ROOT, ".env.override.local"),
  path.join(ROOT, "..", ".env.local"),
  path.join(ROOT, "..", ".env.override.local"),
];

const WORKER_BASE_URLS = {
  prod: "https://pinpoint-worker.2296744453m.workers.dev",
  staging: "https://pinpoint-worker-staging.2296744453m.workers.dev",
  shadow: "https://pinpoint-worker-shadow.2296744453m.workers.dev",
};

const GITHUB_REPO = "elng12/pinpoint-answer-today-new";
const CANDIDATE_BRANCH_PREFIX = "pinpoint/candidate/";
const USER_AGENT = "curl/8.0 (pinpoint-worker-ops)";

function loadEnvFile(filePath) {
  try {
    const text = readFileSync(filePath, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      if (!key || INITIAL_ENV_KEYS.has(key)) continue;

      let value = line.slice(eq + 1).trim();
      const hasDoubleQuotes = value.startsWith("\"") && value.endsWith("\"");
      const hasSingleQuotes = value.startsWith("'") && value.endsWith("'");
      if ((hasDoubleQuotes || hasSingleQuotes) && value.length >= 2) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // ok: env file is optional
  }
}

function normalizeEnvName(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized || normalized === "prod" || normalized === "production") return "prod";
  if (normalized === "stage" || normalized === "staging") return "staging";
  if (normalized === "shadow") return "shadow";
  throw new Error(`Unknown --env "${value}". Use prod, staging, or shadow.`);
}

function getOption(argv, name) {
  const idx = argv.indexOf(name);
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
  return null;
}

function printUsage() {
  // Keep this short; the README holds the full runbook.
  console.log(`Usage:
  node scripts/worker-ops.mjs preflight [--env prod|staging|shadow] [--date YYYY-MM-DD]
  node scripts/worker-ops.mjs health    [--env prod|staging|shadow]
  node scripts/worker-ops.mjs release-queue-dry-run [--env staging|shadow|prod] [--date YYYY-MM-DD] [--puzzle-number N]
  node scripts/worker-ops.mjs release-queue-status-check [--env prod|staging|shadow] [--json]
  node scripts/worker-ops.mjs release-queue-observe [--env prod|staging|shadow] [--date YYYY-MM-DD] [--puzzle-number N] [--json]
  node scripts/worker-ops.mjs refresh-cookie [--targets prod,staging,shadow|all]
	`);
}

function requireAdminSecret() {
  const secret = (process.env.ADMIN_SECRET || process.env.ADMIN_PASSPHRASE || "").trim();
  if (!secret) {
    throw new Error(
      `Missing admin secret. Set ADMIN_SECRET or ADMIN_PASSPHRASE (recommended: via ${ENV_FILE_PATHS.join(" or ")}).`,
    );
  }
  return secret;
}

function parseScutilProxy(text) {
  const out = {};
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const match = rawLine.match(/^\s*([A-Za-z0-9]+)\s*:\s*(.+?)\s*$/);
    if (!match) continue;
    out[match[1]] = match[2];
  }
  return out;
}

function resolveProxyUrl() {
  const explicit =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy ||
    "";
  if (explicit.trim()) return explicit.trim();

  if (process.platform !== "darwin") return "";

  const result = spawnSync("scutil", ["--proxy"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return "";

  const proxy = parseScutilProxy(result.stdout);
  if (proxy.HTTPSEnable === "1" && proxy.HTTPSProxy && proxy.HTTPSPort) {
    return `http://${proxy.HTTPSProxy}:${proxy.HTTPSPort}`;
  }
  if (proxy.HTTPEnable === "1" && proxy.HTTPProxy && proxy.HTTPPort) {
    return `http://${proxy.HTTPProxy}:${proxy.HTTPPort}`;
  }
  return "";
}

function fetchJsonViaCurl(url, proxyUrl, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const args = [
    "-sS",
    "-L",
    "--max-time",
    "20",
    "--proxy",
    proxyUrl,
    "-H",
    `user-agent: ${USER_AGENT}`,
    "-H",
    "accept: application/json",
    ...(method !== "GET" ? ["-X", method] : []),
    "--write-out",
    "\n__STATUS__:%{http_code}",
    url,
  ];
  const result = spawnSync("curl", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "curl failed").trim();
    throw new Error(`curl fetch failed via proxy ${proxyUrl}: ${detail}`);
  }

  const raw = String(result.stdout || "");
  const marker = "\n__STATUS__:";
  const markerIndex = raw.lastIndexOf(marker);
  const text = markerIndex >= 0 ? raw.slice(0, markerIndex) : raw;
  const statusRaw = markerIndex >= 0 ? raw.slice(markerIndex + marker.length).trim() : "200";
  const status = Number.parseInt(statusRaw, 10) || 0;

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return { ok: status >= 200 && status < 300, status, json, text };
}

async function fetchJson(url, options = {}) {
  const proxyUrl = resolveProxyUrl();
  if (proxyUrl) {
    return fetchJsonViaCurl(url, proxyUrl, options);
  }

  const res = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/json",
    },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json, text };
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || `${command} failed`).trim();
    throw new Error(`${command} ${args.join(" ")} failed: ${detail}`);
  }
  return String(result.stdout || "").trim();
}

function ghJson(pathname) {
  const raw = runCommand("gh", ["api", pathname]);
  return JSON.parse(raw);
}

function listGitHubBranchNames(repo) {
  const raw = runCommand("gh", ["api", "--paginate", `repos/${repo}/branches?per_page=100`, "--jq", ".[].name"]);
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatShortSha(sha) {
  return String(sha || "").slice(0, 7);
}

function resolveVercelCommitStatus(statusJson) {
  const statuses = Array.isArray(statusJson?.statuses) ? statusJson.statuses : [];
  return statuses.find((item) => String(item?.context || "").trim().toLowerCase() === "vercel") || null;
}

function getReleaseQueueDryRunScenarios(nowIso) {
  return [
    {
      name: "queued",
      params: { deploymentState: "queued" },
      expectedAction: "write-candidate",
      expectedReasonCode: "production-deployment-queued",
    },
    {
      name: "building",
      params: { deploymentState: "building" },
      expectedAction: "write-candidate",
      expectedReasonCode: "production-deployment-building",
    },
    {
      name: "unknown",
      params: { deploymentState: "unknown" },
      expectedAction: "write-candidate",
      expectedReasonCode: "production-deployment-unknown",
    },
    {
      name: "failed",
      params: { deploymentState: "failed" },
      expectedAction: "hold-review",
      expectedReasonCode: "production-deployment-failed",
    },
    {
      name: "same-slug-budget",
      params: {
        deploymentState: "ready",
        lastProductionPushAt: nowIso,
        now: nowIso,
      },
      expectedAction: "write-candidate",
      expectedReasonCode: "production-push-budget-exhausted",
    },
    {
      name: "override-second-push",
      params: {
        deploymentState: "ready",
        lastProductionPushAt: nowIso,
        now: nowIso,
        overrideSecondProductionPush: "1",
      },
      expectedAction: "push-production",
      expectedReasonCode: "production-push-allowed",
    },
  ];
}

function extractEdgeCookie() {
  const py = `
import browser_cookie3
jar = browser_cookie3.edge(domain_name='linkedin.com')
seen = set()
parts = []
for c in jar:
  if c.name in seen:
    continue
  seen.add(c.name)
  parts.append(f"{c.name}={c.value}")
print('; '.join(parts), end='')
`.trim();

  const result = spawnSync("python3", ["-c", py], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });

  if (result.status !== 0) {
    throw new Error("Failed to extract LinkedIn cookies from Edge. Is python3 + browser_cookie3 installed?");
  }

  const cookie = String(result.stdout || "").trim();
  if (!cookie.includes("li_at=") || !cookie.includes("JSESSIONID=")) {
    throw new Error(
      'Edge LinkedIn cookies missing li_at/JSESSIONID. Please log into LinkedIn in Microsoft Edge, then retry.',
    );
  }

  return cookie;
}

function putWranglerSecret({ envName, value }) {
  const args = ["wrangler", "secret", "put", "GRAPHQL_COOKIE", "--env", envName === "prod" ? "" : envName];
  const child = spawnSync("npx", args, {
    cwd: WORKER_DIR,
    input: `${value}\n`,
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (child.status !== 0) {
    throw new Error(`wrangler secret put failed for env=${envName}`);
  }
}

async function main() {
  for (const filePath of ENV_FILE_PATHS) {
    loadEnvFile(filePath);
  }

  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (!cmd) {
    printUsage();
    process.exit(1);
  }

  if (cmd === "preflight") {
    const envName = normalizeEnvName(getOption(argv, "--env") || "prod");
    const date = getOption(argv, "--date");
    const secret = requireAdminSecret();
    const baseUrl = WORKER_BASE_URLS[envName];

    const url = new URL(`${baseUrl}/admin/preflight-linkedin`);
    url.searchParams.set("secret", secret);
    if (date) url.searchParams.set("date", date);

    const { ok, status, json, text } = await fetchJson(url.toString());
    if (!ok) {
      console.error(`[${envName}] preflight failed: HTTP ${status}`);
      console.error(String(text || "").slice(0, 500));
      process.exit(1);
    }

    if (!json || json.ok !== true) {
      console.error(`[${envName}] preflight returned unexpected payload`);
      console.error(String(text || "").slice(0, 800));
      process.exit(1);
    }

    const words = Array.isArray(json.words) ? json.words.join(" | ") : "";
    console.log(
      `[${envName}] ok source=${json.source} probeDate=${json.probeDate} words=${words} mainAnswer=${json.mainAnswer ?? ""}`,
    );
    return;
  }

  if (cmd === "health") {
    const envName = normalizeEnvName(getOption(argv, "--env") || "prod");
    const baseUrl = WORKER_BASE_URLS[envName];
    const { ok, status, json, text } = await fetchJson(`${baseUrl}/health`);

    if (!ok) {
      console.error(`[${envName}] health failed: HTTP ${status}`);
      console.error(String(text || "").slice(0, 500));
      process.exit(1);
    }

    const puzzleDate = json?.puzzleDate ?? null;
    const source = json?.source ?? null;
    const fetchedAt = json?.fetchedAt ?? null;
    const mainAnswer = json?.mainAnswer ?? json?.theme ?? null;
    const words = Array.isArray(json?.answers)
      ? json.answers
          .map((item) => String(item?.word || "").trim())
          .filter(Boolean)
          .slice(0, 5)
          .join(" | ")
      : "";

    if (!puzzleDate || !source) {
      console.log(`[${envName}] health ok (no doc yet)`);
      return;
    }

    console.log(
      `[${envName}] puzzleDate=${puzzleDate} source=${source} fetchedAt=${fetchedAt ?? ""} words=${words} mainAnswer=${mainAnswer ?? ""}`,
    );
    return;
  }

  if (cmd === "release-queue-dry-run") {
    const envName = normalizeEnvName(getOption(argv, "--env") || "staging");
    const date = getOption(argv, "--date") || new Date().toISOString().slice(0, 10);
    const puzzleNumber = getOption(argv, "--puzzle-number") || getOption(argv, "--puzzleNumber");
    const secret = requireAdminSecret();
    const baseUrl = WORKER_BASE_URLS[envName];
    const nowIso = new Date().toISOString();
    const scenarios = getReleaseQueueDryRunScenarios(nowIso);

    for (const scenario of scenarios) {
      const url = new URL(`${baseUrl}/admin/release-queue-dry-run`);
      url.searchParams.set("secret", secret);
      url.searchParams.set("simulatePrimary", "1");
      url.searchParams.set("releaseQueueEnabled", "1");
      url.searchParams.set("date", date);
      if (puzzleNumber) url.searchParams.set("puzzleNumber", puzzleNumber);
      for (const [key, value] of Object.entries(scenario.params)) {
        url.searchParams.set(key, String(value));
      }

      const { ok, status, json, text } = await fetchJson(url.toString(), { method: "POST" });
      if (!ok) {
        console.error(`[${envName}] release queue dry-run ${scenario.name} failed: HTTP ${status}`);
        console.error(String(text || "").slice(0, 500));
        process.exit(1);
      }

      const action = json?.decision?.action;
      const reasonCode = json?.decision?.reasonCode;
      if (
        json?.ok !== true ||
        json?.readOnly !== true ||
        json?.queueEligible !== true ||
        action !== scenario.expectedAction ||
        reasonCode !== scenario.expectedReasonCode
      ) {
        console.error(`[${envName}] release queue dry-run ${scenario.name} returned unexpected decision`);
        console.error(JSON.stringify({
          ok: json?.ok,
          readOnly: json?.readOnly,
          queueEligible: json?.queueEligible,
          action,
          reasonCode,
          expectedAction: scenario.expectedAction,
          expectedReasonCode: scenario.expectedReasonCode,
        }, null, 2));
        process.exit(1);
      }

      console.log(`[${envName}] ${scenario.name} ok action=${action} reason=${reasonCode}`);
    }

    console.log(`[${envName}] release queue dry-run matrix passed (${scenarios.length} scenarios)`);
    return;
  }

  if (cmd === "release-queue-status-check") {
    const envName = normalizeEnvName(getOption(argv, "--env") || "prod");
    const emitJson = argv.includes("--json");
    const secret = requireAdminSecret();
    const baseUrl = WORKER_BASE_URLS[envName];
    const url = new URL(`${baseUrl}/admin/release-queue-status-check`);
    url.searchParams.set("secret", secret);

    const { ok, status, json } = await fetchJson(url.toString());
    const check = json?.statusCheck || {};
    const printStatusCheck = () => {
      console.log(`[${envName}] release queue status check`);
      console.log(`repo: ${check.repo || ""}`);
      console.log(`base: ${check.baseBranch || ""} ${formatShortSha(check.baseCommitSha || "")}`);
      console.log(`deploymentState: ${check.deploymentState || "unknown"}`);
      console.log(
        `github: ref=${check.github?.refStatus ?? ""} status=${check.github?.statusStatus ?? ""} combined=${check.github?.combinedState ?? ""}`,
      );
      console.log(
        `vercel: found=${check.vercel?.found === true ? "yes" : "no"} state=${check.vercel?.state || ""} ${check.vercel?.description || ""}`,
      );
      if (check.error) {
        console.log(`error: ${check.error}`);
      }
    };

    if (emitJson) {
      console.log(JSON.stringify(json, null, 2));
      if (!ok || json?.ok !== true || check.ok !== true) process.exit(1);
      return;
    }

    if (!ok || json?.ok !== true || check.ok !== true) {
      printStatusCheck();
      console.error(`[${envName}] release queue status check unhealthy: HTTP ${status}`);
      process.exit(1);
    }

    printStatusCheck();
    return;
  }

  if (cmd === "release-queue-observe") {
    const envName = normalizeEnvName(getOption(argv, "--env") || "prod");
    const emitJson = argv.includes("--json");
    const requestedDate = getOption(argv, "--date");
    const requestedPuzzleNumber = getOption(argv, "--puzzle-number") || getOption(argv, "--puzzleNumber");
    const requestedSlug = getOption(argv, "--slug");
    const baseUrl = WORKER_BASE_URLS[envName];

    const healthResult = await fetchJson(`${baseUrl}/health`);
    if (!healthResult.ok) {
      console.error(`[${envName}] health failed: HTTP ${healthResult.status}`);
      console.error(String(healthResult.text || "").slice(0, 500));
      process.exit(1);
    }

    const health = healthResult.json || {};
    const observationDate = requestedDate || health.puzzleDate || new Date().toISOString().slice(0, 10);
    const slug = requestedSlug || (requestedPuzzleNumber ? `pinpoint-answer-${requestedPuzzleNumber}` : "");
    const mainCommit = ghJson(`repos/${GITHUB_REPO}/commits/main`);
    const mainSha = String(mainCommit?.sha || "");
    const statusJson = ghJson(`repos/${GITHUB_REPO}/commits/${mainSha}/status`);
    const vercelStatus = resolveVercelCommitStatus(statusJson);
    const candidateBranches = listGitHubBranchNames(GITHUB_REPO)
      .filter((name) => name.startsWith(CANDIDATE_BRANCH_PREFIX));
    const matchingCandidates = candidateBranches.filter((name) => {
      if (slug) return name.includes(`${observationDate}-${slug}`);
      return name.includes(observationDate);
    });

    const report = {
      env: envName,
      checkedAt: new Date().toISOString(),
      worker: {
        baseUrl,
        healthOk: true,
        puzzleDate: health.puzzleDate || null,
        source: health.source || null,
        fetchedAt: health.fetchedAt || null,
        mainAnswer: health.mainAnswer || health.theme || null,
        words: Array.isArray(health.answers)
          ? health.answers
              .map((item) => String(item?.word || "").trim())
              .filter(Boolean)
              .slice(0, 5)
          : [],
      },
      github: {
        repo: GITHUB_REPO,
        mainSha,
        mainShortSha: formatShortSha(mainSha),
        mainCommitDate: mainCommit?.commit?.author?.date || null,
        mainCommitTitle: String(mainCommit?.commit?.message || "").split(/\r?\n/)[0] || null,
      },
      deploymentStatus: {
        combinedState: statusJson?.state || "unknown",
        vercelState: vercelStatus?.state || "missing",
        vercelDescription: vercelStatus?.description || "",
        vercelTargetUrl: vercelStatus?.target_url || "",
      },
      releaseQueue: {
        observationDate,
        slug: slug || null,
        candidateBranchCount: candidateBranches.length,
        matchingCandidateBranches: matchingCandidates,
      },
    };

    if (emitJson) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log(`[${envName}] release queue observation`);
    console.log(
      `worker health: puzzleDate=${report.worker.puzzleDate ?? ""} source=${report.worker.source ?? ""} mainAnswer=${report.worker.mainAnswer ?? ""}`,
    );
    console.log(
      `main: ${report.github.mainShortSha} status=${report.deploymentStatus.combinedState} vercel=${report.deploymentStatus.vercelState} title=${report.github.mainCommitTitle ?? ""}`,
    );
    if (report.deploymentStatus.vercelDescription) {
      console.log(`vercel: ${report.deploymentStatus.vercelDescription}`);
    }
    console.log(
      `candidates: total=${report.releaseQueue.candidateBranchCount} matching=${report.releaseQueue.matchingCandidateBranches.length}`,
    );
    for (const branch of report.releaseQueue.matchingCandidateBranches.slice(0, 10)) {
      console.log(`- ${branch}`);
    }
    if (report.releaseQueue.matchingCandidateBranches.length > 10) {
      console.log(`- ... ${report.releaseQueue.matchingCandidateBranches.length - 10} more`);
    }
    return;
  }

  if (cmd === "refresh-cookie") {
    const targetsRaw = (getOption(argv, "--targets") || "all").trim();
    const targets =
      targetsRaw === "all"
        ? ["prod", "staging", "shadow"]
        : targetsRaw
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
            .map(normalizeEnvName);

    const cookie = extractEdgeCookie();
    for (const envName of targets) {
      putWranglerSecret({ envName, value: cookie });
      console.log(`[${envName}] GRAPHQL_COOKIE updated`);
    }
    return;
  }

  console.error(`Unknown command "${cmd}"`);
  printUsage();
  process.exit(1);
}

await main();
