import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  resolveVercelProductionDeploymentSnapshot,
  selectVercelProductionDeployment,
} from "../lib/puzzles/vercel-production.shared.mjs";

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

const PUBLIC_SITE_BASE_URL = "https://pinpointanswertoday.app";
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
  node scripts/worker-ops.mjs publish-window-diagnose [--env prod|staging|shadow] [--date YYYY-MM-DD] [--puzzle-number N] [--slug SLUG] [--json]
  node scripts/worker-ops.mjs auto-publish-pause-status [--env prod|staging|shadow] [--json]
  node scripts/worker-ops.mjs auto-publish-pause [--env prod|staging|shadow] [--reason TEXT]
  node scripts/worker-ops.mjs auto-publish-resume [--env prod|staging|shadow]
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

function getBeijingTodayDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function asText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function formatStage(stage) {
  if (!stage || typeof stage !== "object") return "unknown";
  return [
    asText(stage.status, "unknown"),
    stage.detailState ? `detail=${stage.detailState}` : "",
    stage.reason ? `reason=${stage.reason}` : "",
  ].filter(Boolean).join(" / ");
}

function latestSummaryMatchesDate(summaryJson, date) {
  const latest = summaryJson?.latest || {};
  const iso = asText(latest.isoPublishedAt);
  return Boolean(iso && iso.startsWith(`${date}T`));
}

async function readDiagnosticJson(label, url, options = {}) {
  try {
    const result = await fetchJson(url, options);
    return { label, ...result, error: null };
  } catch (error) {
    return {
      label,
      ok: false,
      status: 0,
      json: null,
      text: "",
      error: error instanceof Error ? error.message : String(error || "unknown error"),
    };
  }
}

function buildPublishWindowDiagnosis(report) {
  const pauseStatus = report.pauseStatus.json?.status || {};
  if (pauseStatus.paused === true) {
    return {
      stage: "自动发布暂停",
      conclusion: "卡在：自动发布暂停。",
      nextStep: `先看暂停原因：${pauseStatus.reason || "没有写原因"}。确认后再执行 npm run worker:auto-publish-resume。`,
    };
  }

  if (!report.workerHealth.ok) {
    return {
      stage: "Worker 健康接口",
      conclusion: "卡在：Worker 健康接口读不到。",
      nextStep: "先看 Cloudflare Worker 是否正常，再跑 npm run worker:health。",
    };
  }

  const workerDate = asText(report.workerHealth.json?.puzzleDate);
  if (workerDate !== report.date) {
    return {
      stage: "抓取",
      conclusion: `卡在：抓取。Worker 最新题日期是 ${workerDate || "空"}，还不是 ${report.date}。`,
      nextStep: "先跑 npm run worker:preflight；如果 LinkedIn 401，就刷新 cookie。",
    };
  }

  const heartbeat = report.cronStatus.json?.byDate || report.cronStatus.json?.latest || null;
  if (!heartbeat) {
    return {
      stage: "Worker cron",
      conclusion: "卡在：Worker cron 没有今天的运行记录。",
      nextStep: "先看 Cloudflare Worker Triggers 和 tail 日志。",
    };
  }

  if (heartbeat.outcome === "failed") {
    return {
      stage: "Worker 运行失败",
      conclusion: `卡在：Worker 运行失败。错误：${heartbeat.error || "没有错误详情"}`,
      nextStep: "先看 Worker tail 日志，再看今天的 webhook 告警。",
    };
  }

  const enrich = heartbeat.enrich || {};
  if (enrich.detailState === "generating") {
    return {
      stage: "内容生成",
      conclusion: "卡在：内容生成。",
      nextStep: "等下一次 cron 重试；如果超过 15 分钟，查看 LLM/内容生成日志。",
    };
  }
  if (enrich.detailState === "validated") {
    return {
      stage: "内容校验",
      conclusion: "卡在：内容校验。",
      nextStep: "看内容校验失败原因，优先修模板或生成结果。",
    };
  }
  if (enrich.status === "queued") {
    return {
      stage: "发布入队",
      conclusion: "卡在：内容发布入队。",
      nextStep: "看候选分支和 release queue 状态。",
    };
  }
  if (enrich.status === "failed") {
    return {
      stage: "内容发布失败",
      conclusion: `卡在：内容发布失败。原因：${enrich.reason || "没有原因详情"}`,
      nextStep: "先看内容发布失败摘要，再决定是否手动修复。",
    };
  }

  const statusCheck = report.releaseQueueStatus.json?.statusCheck || {};
  const deploymentState = asText(statusCheck.deploymentState, "unknown");
  if (!report.releaseQueueStatus.ok || deploymentState !== "ready") {
    return {
      stage: "GitHub / Vercel",
      conclusion: `卡在：GitHub / Vercel。当前部署状态是 ${deploymentState}。`,
      nextStep: "先跑 npm run worker:release-queue-status-check，看 Vercel 部署链接。",
    };
  }

  if (!report.siteSummary.ok) {
    return {
      stage: "正式站 summary / 缓存",
      conclusion: "卡在：正式站 summary 读不到。",
      nextStep: "先打开正式站 /api/puzzles/summary，再看 Vercel Functions 状态。",
    };
  }

  if (!latestSummaryMatchesDate(report.siteSummary.json, report.date)) {
    const latest = report.siteSummary.json?.latest || {};
    return {
      stage: "正式站 summary / 缓存",
      conclusion: `卡在：正式站 summary / 缓存。正式站 latest 还是 #${latest.puzzleNumber || "未知"} ${latest.isoPublishedAt || "空"}。`,
      nextStep: "先触发 revalidate；如果还不变，再看 Vercel 缓存和构建产物。",
    };
  }

  return {
    stage: "已发布",
    conclusion: "已发布：Worker、GitHub、Vercel、正式站 summary 都是今天。",
    nextStep: "不用处理。继续观察明天 15:00 窗口。",
  };
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

function extractLinkedInCookie() {
  const py = `
import browser_cookie3

providers = [
  ("edge", getattr(browser_cookie3, "edge", None)),
  ("chrome", getattr(browser_cookie3, "chrome", None)),
  ("chromium", getattr(browser_cookie3, "chromium", None)),
  ("brave", getattr(browser_cookie3, "brave", None)),
  ("opera", getattr(browser_cookie3, "opera", None)),
  ("vivaldi", getattr(browser_cookie3, "vivaldi", None)),
  ("firefox", getattr(browser_cookie3, "firefox", None)),
  ("safari", getattr(browser_cookie3, "safari", None)),
]

errors = []

for name, fn in providers:
  if not fn:
    errors.append(f"{name}: unsupported")
    continue
  try:
    jar = fn(domain_name='linkedin.com')
  except Exception as exc:
    errors.append(f"{name}: {type(exc).__name__}")
    continue

  seen = set()
  parts = []
  for c in jar:
    if c.name in seen:
      continue
    seen.add(c.name)
    parts.append(f"{c.name}={c.value}")

  cookie = '; '.join(parts).strip()
  has_li_at = 'li_at=' in cookie
  has_jsession = 'JSESSIONID=' in cookie
  if has_li_at and has_jsession:
    print(f"OK::{name}::{cookie}", end='')
    raise SystemExit(0)

  errors.append(f"{name}: li_at={'yes' if has_li_at else 'no'}, JSESSIONID={'yes' if has_jsession else 'no'}")

print("ERR::" + " | ".join(errors), end='')
`.trim();

  const result = spawnSync("python3", ["-c", py], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });

  if (result.status !== 0) {
    throw new Error("Failed to extract LinkedIn cookies. Is python3 + browser_cookie3 installed?");
  }

  const raw = String(result.stdout || "").trim();
  if (!raw.startsWith("OK::")) {
    throw new Error(
      `LinkedIn cookies missing li_at/JSESSIONID across supported browsers. ${raw.replace(/^ERR::/, "")}. Please log into LinkedIn in a supported local browser, then retry.`,
    );
  }

  const [, browserName = "unknown", cookie = ""] = raw.split("::");
  if (!cookie.includes("li_at=") || !cookie.includes("JSESSIONID=")) {
    throw new Error(`LinkedIn cookie extraction returned an incomplete cookie from ${browserName}.`);
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
        `github: ref=${check.github?.refStatus ?? ""} deployments=${check.github?.deploymentsStatus ?? ""} statuses=${check.github?.deploymentStatusesStatus ?? ""} production=${check.github?.productionDeploymentFound === true ? "yes" : "no"}`,
      );
      console.log(
        `vercel: found=${check.vercel?.found === true ? "yes" : "no"} environment=${check.vercel?.environment || ""} state=${check.vercel?.state || ""} ${check.vercel?.description || ""}`,
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
    const deployments = ghJson(`repos/${GITHUB_REPO}/deployments?sha=${encodeURIComponent(mainSha)}&per_page=100`);
    const productionDeployment = selectVercelProductionDeployment(deployments, mainSha);
    const deploymentStatuses = productionDeployment?.id
      ? ghJson(`repos/${GITHUB_REPO}/deployments/${productionDeployment.id}/statuses?per_page=100`)
      : [];
    const productionSnapshot = resolveVercelProductionDeploymentSnapshot({
      deployments,
      statuses: deploymentStatuses,
      expectedSha: mainSha,
    });
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
        productionState: productionSnapshot.state,
        environment: productionDeployment?.environment || null,
        deploymentId: productionDeployment?.id || null,
        vercelState: productionSnapshot.status?.state || "missing",
        vercelDescription: productionSnapshot.status?.description || "",
        vercelTargetUrl:
          productionSnapshot.status?.environment_url ||
          productionSnapshot.status?.target_url ||
          "",
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
      `main: ${report.github.mainShortSha} production=${report.deploymentStatus.productionState} vercel=${report.deploymentStatus.vercelState} title=${report.github.mainCommitTitle ?? ""}`,
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

  if (cmd === "publish-window-diagnose") {
    const envName = normalizeEnvName(getOption(argv, "--env") || "prod");
    const emitJson = argv.includes("--json");
    const date = getOption(argv, "--date") || getBeijingTodayDate();
    const requestedPuzzleNumber = getOption(argv, "--puzzle-number") || getOption(argv, "--puzzleNumber");
    const requestedSlug = getOption(argv, "--slug");
    const secret = requireAdminSecret();
    const baseUrl = WORKER_BASE_URLS[envName];

    const cronUrl = new URL(`${baseUrl}/monitor/cron-status`);
    cronUrl.searchParams.set("date", date);
    cronUrl.searchParams.set("limit", "10");

    const releaseQueueUrl = new URL(`${baseUrl}/admin/release-queue-status-check`);
    releaseQueueUrl.searchParams.set("secret", secret);

    const pauseUrl = new URL(`${baseUrl}/admin/auto-publish-pause`);
    pauseUrl.searchParams.set("secret", secret);

    const summaryUrl = new URL(`${PUBLIC_SITE_BASE_URL}/api/puzzles/summary`);
    summaryUrl.searchParams.set("cb", `publish-window-diagnose-${Date.now()}`);

    const [
      workerHealth,
      cronStatus,
      releaseQueueStatus,
      pauseStatus,
      siteSummary,
    ] = await Promise.all([
      readDiagnosticJson("worker health", `${baseUrl}/health`),
      readDiagnosticJson("cron status", cronUrl.toString()),
      readDiagnosticJson("release queue status", releaseQueueUrl.toString()),
      readDiagnosticJson("auto publish pause", pauseUrl.toString()),
      readDiagnosticJson("site summary", summaryUrl.toString()),
    ]);

    const latest = siteSummary.json?.latest || {};
    const slug = requestedSlug || (requestedPuzzleNumber ? `pinpoint-answer-${requestedPuzzleNumber}` : asText(latest.slug));
    let candidateBranches = {
      ok: true,
      total: 0,
      matching: [],
      error: null,
    };
    try {
      const branches = listGitHubBranchNames(GITHUB_REPO)
        .filter((name) => name.startsWith(CANDIDATE_BRANCH_PREFIX));
      const matching = branches.filter((name) => {
        if (slug) return name.includes(`${date}-${slug}`);
        return name.includes(date);
      });
      candidateBranches = {
        ok: true,
        total: branches.length,
        matching,
        error: null,
      };
    } catch (error) {
      candidateBranches = {
        ok: false,
        total: 0,
        matching: [],
        error: error instanceof Error ? error.message : String(error || "unknown gh error"),
      };
    }

    const report = {
      env: envName,
      date,
      checkedAt: new Date().toISOString(),
      workerBaseUrl: baseUrl,
      publicSiteBaseUrl: PUBLIC_SITE_BASE_URL,
      requested: {
        puzzleNumber: requestedPuzzleNumber || null,
        slug: requestedSlug || null,
      },
      workerHealth,
      cronStatus,
      releaseQueueStatus,
      pauseStatus,
      siteSummary,
      candidateBranches,
    };
    const diagnosis = buildPublishWindowDiagnosis(report);

    if (emitJson) {
      console.log(JSON.stringify({ ...report, diagnosis }, null, 2));
      if (diagnosis.stage !== "已发布") process.exitCode = 1;
      return;
    }

    const health = workerHealth.json || {};
    const healthWords = Array.isArray(health.answers)
      ? health.answers
          .map((item) => String(item?.word || "").trim())
          .filter(Boolean)
          .slice(0, 5)
          .join(" | ")
      : "";
    const heartbeat = cronStatus.json?.byDate || cronStatus.json?.latest || {};
    const pause = pauseStatus.json?.status || {};
    const statusCheck = releaseQueueStatus.json?.statusCheck || {};
    const summaryLatest = siteSummary.json?.latest || {};

    console.log(`[${envName}] publish window diagnose`);
    console.log(`日期: ${date}`);
    console.log(
      `Worker: ${workerHealth.ok ? "可读" : "失败"} puzzleDate=${health.puzzleDate || ""} source=${health.source || ""} fetchedAt=${health.fetchedAt || ""}`,
    );
    if (healthWords) {
      console.log(`答案词: ${healthWords}`);
    }
    if (health.mainAnswer || health.theme) {
      console.log(`主题: ${health.mainAnswer || health.theme}`);
    }
    console.log(
      `Cron: outcome=${heartbeat.outcome || "unknown"} quick=${formatStage(heartbeat.quickPublish)} enrich=${formatStage(heartbeat.enrich)}`,
    );
    console.log(
      `自动发布: ${pause.paused === true ? "已暂停" : "未暂停"} source=${pause.source || "none"} reason=${pause.reason || ""}`,
    );
    console.log(
      `GitHub/Vercel: deployment=${statusCheck.deploymentState || "unknown"} production=${statusCheck.github?.productionDeploymentFound === true ? "yes" : "no"} environment=${statusCheck.vercel?.environment || ""} vercel=${statusCheck.vercel?.state || ""} ${statusCheck.vercel?.description || ""}`,
    );
    console.log(
      `正式站 summary: #${summaryLatest.puzzleNumber || "未知"} ${summaryLatest.isoPublishedAt || "空"} slug=${summaryLatest.slug || ""}`,
    );
    console.log(
      `候选分支: ${candidateBranches.ok ? `total=${candidateBranches.total} matching=${candidateBranches.matching.length}` : `读取失败 ${candidateBranches.error || ""}`}`,
    );
    for (const branch of candidateBranches.matching.slice(0, 5)) {
      console.log(`- ${branch}`);
    }
    if (candidateBranches.matching.length > 5) {
      console.log(`- ... ${candidateBranches.matching.length - 5} more`);
    }
    console.log(`结论: ${diagnosis.conclusion}`);
    console.log(`下一步: ${diagnosis.nextStep}`);
    if (diagnosis.stage !== "已发布") process.exitCode = 1;
    return;
  }

  if (cmd === "auto-publish-pause-status" || cmd === "auto-publish-pause" || cmd === "auto-publish-resume") {
    const envName = normalizeEnvName(getOption(argv, "--env") || "prod");
    const emitJson = argv.includes("--json");
    const secret = requireAdminSecret();
    const baseUrl = WORKER_BASE_URLS[envName];
    const url = new URL(`${baseUrl}/admin/auto-publish-pause`);
    url.searchParams.set("secret", secret);

    let method = "GET";
    if (cmd === "auto-publish-pause") {
      method = "POST";
      url.searchParams.set("paused", "1");
      url.searchParams.set("reason", getOption(argv, "--reason") || "manual pause from worker-ops");
    } else if (cmd === "auto-publish-resume") {
      method = "POST";
      url.searchParams.set("paused", "0");
    }

    const { ok, status, json, text } = await fetchJson(url.toString(), { method });
    if (!ok || json?.ok !== true) {
      console.error(`[${envName}] auto-publish pause command failed: HTTP ${status}`);
      console.error(String(text || "").slice(0, 500));
      process.exit(1);
    }

    if (emitJson) {
      console.log(JSON.stringify(json, null, 2));
      return;
    }

    const pause = json.status || {};
    console.log(
      `[${envName}] autoPublishPaused=${pause.paused === true ? "yes" : "no"} source=${pause.source || "none"} reason=${pause.reason || ""}`,
    );
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

    const cookie = extractLinkedInCookie();
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
