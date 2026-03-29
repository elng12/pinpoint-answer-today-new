import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const ENV_LOCAL_PATH = path.join(ROOT, ".env.local");
const WORKER_DIR = path.join(ROOT, "worker");

const WORKER_BASE_URLS = {
  prod: "https://pinpoint-worker.2296744453m.workers.dev",
  staging: "https://pinpoint-worker-staging.2296744453m.workers.dev",
  shadow: "https://pinpoint-worker-shadow.2296744453m.workers.dev",
};

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
      if (!key || key in process.env) continue;

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
  node scripts/worker-ops.mjs refresh-cookie [--targets prod,staging,shadow|all]
`);
}

function requireAdminSecret() {
  const secret = (process.env.ADMIN_SECRET || process.env.ADMIN_PASSPHRASE || "").trim();
  if (!secret) {
    throw new Error(
      `Missing admin secret. Set ADMIN_SECRET or ADMIN_PASSPHRASE (recommended: via ${ENV_LOCAL_PATH}).`,
    );
  }
  return secret;
}

async function fetchJson(url) {
  const res = await fetch(url, {
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
  loadEnvFile(ENV_LOCAL_PATH);

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

