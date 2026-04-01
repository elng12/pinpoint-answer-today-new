import { readFile } from "node:fs/promises";
import { createSign } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const REGISTRY_PATH = resolve(ROOT, "data", "puzzles", "registry.json");
const DEFAULT_SITE = "sc-domain:pinpointanswertoday.app";
const DETAIL_PATH_PREFIX = "/linkedin-pinpoint-answers/";
const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const TOKEN_AUDIENCE = "https://oauth2.googleapis.com/token";

function getOption(argv, name) {
  const index = argv.indexOf(name);
  if (index >= 0 && argv[index + 1]) {
    return argv[index + 1];
  }
  return null;
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

function printHelp() {
  console.log(`
Usage:
  npm run gsc:pinpoint -- page --credentials /path/key.json --puzzle-number 700
  npm run gsc:pinpoint -- recent --credentials /path/key.json --count 30
  npm run gsc:pinpoint -- find --credentials /path/key.json --puzzle-number 700

Commands:
  page    Show one Pinpoint detail page's clicks, impressions, top queries, devices, and countries.
  recent  Show the most recent Pinpoint detail pages sorted by clicks within the chosen date range.
  find    Show raw Search Console page rows that match a slug/number fragment across canonical and legacy URL variants.

Options:
  --credentials  Path to the Google service-account JSON file. Required.
  --site         Search Console property. Default: sc-domain:pinpointanswertoday.app
  --start-date   YYYY-MM-DD. Default: yesterday in local time.
  --end-date     YYYY-MM-DD. Default: today in local time.

Page-only options:
  --puzzle-number  Resolve the page URL from the local registry by puzzle number.
  --slug           Resolve the page URL from the local registry by slug.
  --page-url       Use an explicit page URL instead of looking it up locally.
  --query-limit    Number of top queries to print. Default: 10.

Recent-only options:
  --count          How many recent puzzle numbers to include. Default: 30.
  --detail-limit   How many rows to print. Default: 15.

Find-only options:
  --contains       Raw page substring to match in Search Console.
  --row-limit      How many matching page rows to print. Default: 20.

Notes:
  - Same-day Search Console data can be incomplete.
  - This script reads local data/puzzles/registry.json to resolve puzzle numbers and recent pages.
`.trim());
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

function formatDate(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDefaultDateRange() {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 1);
  return {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
  };
}

function toBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signJwt(unsignedToken, privateKey) {
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  return signer.sign(privateKey, "base64url");
}

async function getAccessToken(credentialsPath) {
  const raw = await readFile(credentialsPath, "utf8");
  const credentials = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: credentials.client_email,
    scope: SEARCH_CONSOLE_SCOPE,
    aud: credentials.token_uri || TOKEN_AUDIENCE,
    exp: now + 3600,
    iat: now,
  };

  const unsignedToken = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(payload))}`;
  const signedToken = `${unsignedToken}.${signJwt(unsignedToken, credentials.private_key)}`;
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: signedToken,
  });

  const tokenPayload = postJson(credentials.token_uri || TOKEN_AUDIENCE, {
    "content-type": "application/x-www-form-urlencoded",
  }, body.toString());
  return tokenPayload.access_token;
}

async function readRegistry() {
  const raw = await readFile(REGISTRY_PATH, "utf8");
  return JSON.parse(raw);
}

function toDetailUrl(slug) {
  return `https://pinpointanswertoday.app${DETAIL_PATH_PREFIX}${slug}/`;
}

function resolvePageTarget(registry, { puzzleNumber, slug, pageUrl }) {
  if (pageUrl) {
    return {
      label: pageUrl,
      pageUrl,
      entry: null,
    };
  }

  let entry = null;
  if (puzzleNumber) {
    entry = registry.find((item) => Number(item.puzzleNumber) === Number(puzzleNumber));
  } else if (slug) {
    entry = registry.find((item) => item.slug === slug);
  }

  if (!entry) {
    fail("Could not resolve the page. Pass --puzzle-number, --slug, or --page-url.");
  }

  return {
    label: `Pinpoint #${entry.puzzleNumber}`,
    pageUrl: toDetailUrl(entry.slug),
    entry,
  };
}

async function querySearchConsole({ accessToken, site, body }) {
  const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
  return postJson(endpoint, {
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
  }, JSON.stringify(body));
}

function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function formatPosition(value) {
  return Number(value || 0).toFixed(2);
}

function extractSlug(value) {
  const match = String(value || "").match(/pinpoint-answer-\d+/);
  return match?.[0] || null;
}

function resolveFindExpression(args) {
  const explicitContains = getOption(args, "--contains");
  if (explicitContains) {
    return explicitContains;
  }

  const slug = getOption(args, "--slug");
  if (slug) {
    return slug;
  }

  const puzzleNumber = getOption(args, "--puzzle-number");
  if (puzzleNumber) {
    return `pinpoint-answer-${puzzleNumber}`;
  }

  const pageUrl = getOption(args, "--page-url");
  if (pageUrl) {
    const slugFromUrl = extractSlug(pageUrl);
    if (slugFromUrl) {
      return slugFromUrl;
    }
    try {
      return new URL(pageUrl).pathname;
    } catch {
      return pageUrl;
    }
  }

  fail('Missing find target. Pass --contains, --puzzle-number, --slug, or --page-url.');
}

function printMetricLine(prefix, row) {
  console.log(
    `${prefix}clicks=${row.clicks ?? 0} impressions=${row.impressions ?? 0} ctr=${formatPercent(row.ctr)} position=${formatPosition(row.position)}`,
  );
}

function printRows(title, rows, formatter) {
  console.log(`\n${title}`);
  if (!rows || rows.length === 0) {
    console.log("  (no rows)");
    return;
  }
  rows.forEach((row, index) => {
    console.log(formatter(row, index));
  });
}

async function runPageReport(args) {
  const credentialsPath = getOption(args, "--credentials");
  if (!credentialsPath) {
    fail("Missing --credentials.");
  }

  const registry = await readRegistry();
  const site = getOption(args, "--site") || DEFAULT_SITE;
  const { startDate, endDate } = {
    ...getDefaultDateRange(),
    startDate: getOption(args, "--start-date") || getDefaultDateRange().startDate,
    endDate: getOption(args, "--end-date") || getDefaultDateRange().endDate,
  };
  const queryLimit = Number.parseInt(getOption(args, "--query-limit") || "10", 10);
  const target = resolvePageTarget(registry, {
    puzzleNumber: getOption(args, "--puzzle-number"),
    slug: getOption(args, "--slug"),
    pageUrl: getOption(args, "--page-url"),
  });
  const accessToken = await getAccessToken(credentialsPath);

  const filterGroup = [
    {
      filters: [
        {
          dimension: "page",
          operator: "equals",
          expression: target.pageUrl,
        },
      ],
    },
  ];

  const [totals, queries, devices, countries] = await Promise.all([
    querySearchConsole({
      accessToken,
      site,
      body: {
        startDate,
        endDate,
        type: "web",
        dataState: "all",
        dimensionFilterGroups: filterGroup,
      },
    }),
    querySearchConsole({
      accessToken,
      site,
      body: {
        startDate,
        endDate,
        type: "web",
        dataState: "all",
        dimensions: ["query"],
        rowLimit: queryLimit,
        dimensionFilterGroups: filterGroup,
      },
    }),
    querySearchConsole({
      accessToken,
      site,
      body: {
        startDate,
        endDate,
        type: "web",
        dataState: "all",
        dimensions: ["device"],
        rowLimit: 10,
        dimensionFilterGroups: filterGroup,
      },
    }),
    querySearchConsole({
      accessToken,
      site,
      body: {
        startDate,
        endDate,
        type: "web",
        dataState: "all",
        dimensions: ["country"],
        rowLimit: 10,
        dimensionFilterGroups: filterGroup,
      },
    }),
  ]);

  const totalRow = totals.rows?.[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };

  console.log(`Page report: ${target.label}`);
  console.log(`URL: ${target.pageUrl}`);
  console.log(`Site: ${site}`);
  console.log(`Range: ${startDate} -> ${endDate}`);
  console.log("");
  printMetricLine("Total: ", totalRow);

  printRows("Top queries", queries.rows, (row, index) => {
    const query = row.keys?.[0] || "(unknown)";
    return `  ${index + 1}. ${query} | clicks=${row.clicks} impressions=${row.impressions} ctr=${formatPercent(row.ctr)} position=${formatPosition(row.position)}`;
  });

  printRows("By device", devices.rows, (row) => {
    const device = row.keys?.[0] || "(unknown)";
    return `  ${device} | clicks=${row.clicks} impressions=${row.impressions} ctr=${formatPercent(row.ctr)} position=${formatPosition(row.position)}`;
  });

  printRows("By country", countries.rows, (row) => {
    const country = row.keys?.[0] || "(unknown)";
    return `  ${country} | clicks=${row.clicks} impressions=${row.impressions} ctr=${formatPercent(row.ctr)} position=${formatPosition(row.position)}`;
  });

  if ((queries.rows?.length || 0) === 0) {
    const findHintTarget =
      target.entry?.slug || extractSlug(target.pageUrl) || getOption(args, "--puzzle-number") || null;
    if (findHintTarget) {
      console.log("");
      console.log(
        `Hint: exact URL rows can miss legacy or non-canonical variants. Try: npm run gsc:pinpoint -- find --credentials ${credentialsPath} --contains ${findHintTarget}`,
      );
    }
  }
}

async function runRecentReport(args) {
  const credentialsPath = getOption(args, "--credentials");
  if (!credentialsPath) {
    fail("Missing --credentials.");
  }

  const site = getOption(args, "--site") || DEFAULT_SITE;
  const defaults = getDefaultDateRange();
  const startDate = getOption(args, "--start-date") || defaults.startDate;
  const endDate = getOption(args, "--end-date") || defaults.endDate;
  const count = Number.parseInt(getOption(args, "--count") || "30", 10);
  const detailLimit = Number.parseInt(getOption(args, "--detail-limit") || "15", 10);
  const accessToken = await getAccessToken(credentialsPath);
  const registry = await readRegistry();
  const recentEntries = [...registry]
    .sort((left, right) => Number(right.puzzleNumber) - Number(left.puzzleNumber))
    .slice(0, count);

  const payload = await querySearchConsole({
    accessToken,
    site,
    body: {
      startDate,
      endDate,
      type: "web",
      dataState: "all",
      dimensions: ["page"],
      rowLimit: 25000,
      dimensionFilterGroups: [
        {
          filters: [
            {
              dimension: "page",
              operator: "contains",
              expression: DETAIL_PATH_PREFIX,
            },
          ],
        },
      ],
    },
  });

  const rowsByPage = new Map((payload.rows || []).map((row) => [row.keys?.[0], row]));
  const mergedRows = recentEntries.map((entry) => {
    const pageUrl = toDetailUrl(entry.slug);
    const row = rowsByPage.get(pageUrl) || {
      clicks: 0,
      impressions: 0,
      ctr: 0,
      position: 0,
    };
    return {
      entry,
      pageUrl,
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? 0,
    };
  });

  const sortedByClicks = [...mergedRows].sort((left, right) => {
    if (right.clicks !== left.clicks) return right.clicks - left.clicks;
    if (right.impressions !== left.impressions) return right.impressions - left.impressions;
    return right.entry.puzzleNumber - left.entry.puzzleNumber;
  });

  const totalClicks = mergedRows.reduce((sum, row) => sum + row.clicks, 0);
  const totalImpressions = mergedRows.reduce((sum, row) => sum + row.impressions, 0);

  console.log(`Recent report: latest ${count} puzzle pages`);
  console.log(`Site: ${site}`);
  console.log(`Range: ${startDate} -> ${endDate}`);
  console.log(`Pages with any clicks: ${mergedRows.filter((row) => row.clicks > 0).length}/${mergedRows.length}`);
  console.log(`Aggregate clicks=${totalClicks} impressions=${totalImpressions}`);

  printRows(`Top ${Math.min(detailLimit, sortedByClicks.length)} recent pages`, sortedByClicks.slice(0, detailLimit), (row, index) => {
    return `  ${index + 1}. #${row.entry.puzzleNumber} | clicks=${row.clicks} impressions=${row.impressions} ctr=${formatPercent(row.ctr)} position=${formatPosition(row.position)} | ${row.pageUrl}`;
  });

  const winners = sortedByClicks.filter((row) => row.clicks > 0);
  if (winners.length > 0) {
    const topWinner = winners[0];
    console.log("");
    console.log(
      `Best recent page: #${topWinner.entry.puzzleNumber} with ${topWinner.clicks} clicks from ${topWinner.impressions} impressions.`,
    );
  }

  const hiddenButShowing = sortedByClicks.filter((row) => row.clicks === 0 && row.impressions > 0);
  if (hiddenButShowing.length > 0) {
    printRows("Pages with impressions but no clicks", hiddenButShowing.slice(0, 10), (row) => {
      return `  #${row.entry.puzzleNumber} | clicks=${row.clicks} impressions=${row.impressions} ctr=${formatPercent(row.ctr)} position=${formatPosition(row.position)}`;
    });
  }
}

async function runFindReport(args) {
  const credentialsPath = getOption(args, "--credentials");
  if (!credentialsPath) {
    fail("Missing --credentials.");
  }

  const site = getOption(args, "--site") || DEFAULT_SITE;
  const defaults = getDefaultDateRange();
  const startDate = getOption(args, "--start-date") || defaults.startDate;
  const endDate = getOption(args, "--end-date") || defaults.endDate;
  const rowLimit = Number.parseInt(getOption(args, "--row-limit") || "20", 10);
  const expression = resolveFindExpression(args);
  const accessToken = await getAccessToken(credentialsPath);

  const payload = await querySearchConsole({
    accessToken,
    site,
    body: {
      startDate,
      endDate,
      type: "web",
      dataState: "all",
      dimensions: ["page"],
      rowLimit,
      dimensionFilterGroups: [
        {
          filters: [
            {
              dimension: "page",
              operator: "contains",
              expression,
            },
          ],
        },
      ],
    },
  });

  const rows = payload.rows || [];
  const totalClicks = rows.reduce((sum, row) => sum + (row.clicks ?? 0), 0);
  const totalImpressions = rows.reduce((sum, row) => sum + (row.impressions ?? 0), 0);

  console.log(`Find report: page contains "${expression}"`);
  console.log(`Site: ${site}`);
  console.log(`Range: ${startDate} -> ${endDate}`);
  console.log(`Matched rows: ${rows.length}`);
  console.log(`Aggregate clicks=${totalClicks} impressions=${totalImpressions}`);

  printRows("Matching page rows", rows, (row, index) => {
    const page = row.keys?.[0] || "(unknown)";
    return `  ${index + 1}. ${page} | clicks=${row.clicks} impressions=${row.impressions} ctr=${formatPercent(row.ctr)} position=${formatPosition(row.position)}`;
  });
}

function postJson(url, headers, body) {
  const proxyUrl = resolveProxyUrl();
  const args = [
    "-sS",
    "-L",
    "--max-time",
    "60",
    "-X",
    "POST",
  ];

  for (const [key, value] of Object.entries(headers)) {
    args.push("-H", `${key}: ${value}`);
  }

  if (proxyUrl) {
    args.push("--proxy", proxyUrl);
  }

  args.push("--data", body, "--write-out", "\n__STATUS__:%{http_code}", url);

  const result = spawnSync("curl", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    fail(`curl request failed. ${String(result.stderr || result.stdout || "").trim()}`);
  }

  const rawOutput = String(result.stdout || "");
  const marker = "\n__STATUS__:";
  const markerIndex = rawOutput.lastIndexOf(marker);
  const text = markerIndex >= 0 ? rawOutput.slice(0, markerIndex) : rawOutput;
  const statusCode = Number.parseInt(
    markerIndex >= 0 ? rawOutput.slice(markerIndex + marker.length).trim() : "0",
    10,
  );

  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    fail(`Could not parse API response as JSON. ${text}`);
  }

  if (statusCode < 200 || statusCode >= 300) {
    fail(`API request failed (${statusCode}). ${payload?.error?.message || text}`);
  }

  return payload;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "page") {
    await runPageReport(args.slice(1));
    return;
  }

  if (command === "recent") {
    await runRecentReport(args.slice(1));
    return;
  }

  if (command === "find") {
    await runFindReport(args.slice(1));
    return;
  }

  fail(`Unknown command "${command}". Use "page", "recent", or "find".`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (!process.exitCode) {
    console.error(message);
    process.exitCode = 1;
  }
});
