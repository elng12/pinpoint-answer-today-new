import { createSign } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const REGISTRY_PATH = resolve(ROOT, "data", "puzzles", "registry.json");
const DEFAULT_SITE_URL = "https://pinpointanswertoday.app";
const DEFAULT_SITE = "sc-domain:pinpointanswertoday.app";
const DETAIL_PATH_PREFIX = "/linkedin-pinpoint-answers/";
const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters";
const TOKEN_AUDIENCE = "https://oauth2.googleapis.com/token";
const CURL_BIN = process.env.CURL_BIN || "/usr/bin/curl";
const GOOGLEBOT_SMARTPHONE_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

function getOption(argv, name) {
  const index = argv.indexOf(name);
  if (index >= 0 && argv[index + 1]) {
    return argv[index + 1];
  }
  return null;
}

function hasFlag(argv, name) {
  return argv.includes(name);
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

function printHelp() {
  console.log(`
Usage:
  npm run gsc:submit-sitemap -- --credentials /path/key.json
  npm run gsc:submit-sitemap -- --credentials /path/key.json --puzzle-number 767
  npm run gsc:submit-sitemap -- --skip-submit

What it does:
  1. Finds the latest public Pinpoint detail page from data/puzzles/registry.json.
  2. Checks the live detail page as Googlebot Smartphone.
  3. Checks that sitemap.xml includes the detail URL with the expected lastmod.
  4. Submits sitemap.xml to Google Search Console through the official Sitemaps API.

Options:
  --credentials    Path to the Google service-account JSON file. Required unless --skip-submit is used.
  --site           Search Console property. Default: ${DEFAULT_SITE}
  --site-url       Public site URL. Default: ${DEFAULT_SITE_URL}
  --sitemap-url    Sitemap URL. Default: <site-url>/sitemap.xml
  --puzzle-number  Check a specific puzzle number from the local registry.
  --slug           Check a specific slug from the local registry.
  --page-url       Check an explicit detail URL instead of resolving from the registry.
  --skip-submit    Run live page and sitemap checks, but do not call Google.

Notes:
  - This submits the sitemap, not a force-index request.
  - The service account must have access to the Search Console property.
`.trim());
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

  const response = requestApi({
    method: "POST",
    url: credentials.token_uri || TOKEN_AUDIENCE,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.payload.access_token) {
    fail("Google auth did not return an access token.");
  }
  return response.payload.access_token;
}

async function readRegistry() {
  const raw = await readFile(REGISTRY_PATH, "utf8");
  return JSON.parse(raw);
}

function isPublicRegistryEntry(entry) {
  if (!entry || (entry.status !== "live" && entry.status !== "archived")) {
    return false;
  }
  const detailState = entry.detailState || "published";
  return detailState === "published" || detailState === "fallback_full";
}

function withTrailingSlash(url) {
  return url.endsWith("/") ? url : `${url}/`;
}

function resolveTarget(registry, args, siteUrl) {
  const pageUrl = getOption(args, "--page-url");
  if (pageUrl) {
    return {
      label: pageUrl,
      pageUrl: withTrailingSlash(pageUrl),
      entry: null,
    };
  }

  const puzzleNumber = getOption(args, "--puzzle-number");
  const slug = getOption(args, "--slug");
  let entry = null;

  if (puzzleNumber) {
    entry = registry.find((item) => Number(item.puzzleNumber) === Number(puzzleNumber));
  } else if (slug) {
    entry = registry.find((item) => item.slug === slug);
  } else {
    entry = [...registry]
      .filter(isPublicRegistryEntry)
      .sort((left, right) => Number(right.puzzleNumber) - Number(left.puzzleNumber))[0];
  }

  if (!entry) {
    fail("Could not resolve a public detail page from the local registry.");
  }
  if (!isPublicRegistryEntry(entry)) {
    fail(`Resolved ${entry.slug || `#${entry.puzzleNumber}`} but it is not public yet.`);
  }

  return {
    label: `Pinpoint #${entry.puzzleNumber}`,
    pageUrl: `${siteUrl.replace(/\/$/, "")}${DETAIL_PATH_PREFIX}${entry.slug}/`,
    entry,
  };
}

function normalizeUrl(value) {
  const parsed = new URL(value);
  parsed.hash = "";
  parsed.search = "";
  return parsed.toString();
}

function getHtmlAttribute(tag, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = tag.match(pattern);
  return match?.[2] || match?.[3] || match?.[4] || "";
}

function getCanonicalUrl(html) {
  const links = html.match(/<link\b[^>]*>/gi) || [];
  for (const link of links) {
    const rel = getHtmlAttribute(link, "rel").toLowerCase().split(/\s+/);
    if (rel.includes("canonical")) {
      return getHtmlAttribute(link, "href");
    }
  }
  return "";
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function htmlToText(html) {
  return decodeHtmlEntities(html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSitemapEntry(xml, loc) {
  const escapedLoc = escapeRegExp(loc.replace(/&/g, "&amp;"));
  const match = xml.match(new RegExp(`<url>\\s*<loc>${escapedLoc}</loc>[\\s\\S]*?</url>`, "i"));
  if (!match) return null;
  const lastmod = match[0].match(/<lastmod>(.*?)<\/lastmod>/i)?.[1] || "";
  return { block: match[0], lastmod };
}

function assertLiveDetailOk({ response, target }) {
  if (response.statusCode !== 200) {
    fail(`Detail page returned HTTP ${response.statusCode}: ${target.pageUrl}`);
  }

  const html = response.body;
  const text = htmlToText(html);
  const canonical = getCanonicalUrl(html);
  if (!canonical) {
    fail("Detail page is missing a canonical link.");
  }
  if (normalizeUrl(canonical) !== normalizeUrl(target.pageUrl)) {
    fail(`Detail canonical mismatch. Expected ${target.pageUrl}, got ${canonical}`);
  }

  const lowerHeaders = response.headers.toLowerCase();
  if (/x-robots-tag:[^\n\r]*noindex/i.test(lowerHeaders)) {
    fail("Detail page has an x-robots-tag noindex header.");
  }

  const robotsMetaTags = html.match(/<meta\b[^>]*name=["']robots["'][^>]*>/gi) || [];
  for (const tag of robotsMetaTags) {
    if (getHtmlAttribute(tag, "content").toLowerCase().includes("noindex")) {
      fail("Detail page has a robots noindex meta tag.");
    }
  }

  if (!/<title[\s>]/i.test(html)) {
    fail("Detail page is missing a <title> tag.");
  }
  if (!/<main[\s>]/i.test(html)) {
    fail("Detail page is missing a <main> element.");
  }

  if (target.entry) {
    const missing = [];
    if (!text.includes(normalizeText(target.entry.mainAnswer))) {
      missing.push("answer");
    }
    for (const clue of target.entry.clues || []) {
      if (!text.includes(normalizeText(clue))) {
        missing.push(`clue: ${clue}`);
      }
    }
    if (missing.length > 0) {
      fail(`Detail page is missing expected visible text: ${missing.join(", ")}`);
    }
  }
}

function assertSitemapOk({ response, sitemapUrl, target }) {
  if (response.statusCode !== 200) {
    fail(`Sitemap returned HTTP ${response.statusCode}: ${sitemapUrl}`);
  }
  if (!/xml/i.test(response.contentType || "")) {
    fail(`Sitemap content-type does not look like XML: ${response.contentType || "(missing)"}`);
  }

  const entry = extractSitemapEntry(response.body, target.pageUrl);
  if (!entry) {
    fail(`Sitemap does not include the detail URL: ${target.pageUrl}`);
  }

  if (target.entry?.updatedAt) {
    if (!entry.lastmod) {
      fail(`Sitemap entry is missing lastmod for ${target.pageUrl}`);
    }
    const expectedLastmod = new Date(target.entry.updatedAt).toISOString();
    const actualLastmod = new Date(entry.lastmod).toISOString();
    if (actualLastmod !== expectedLastmod) {
      fail(`Sitemap lastmod mismatch. Expected ${expectedLastmod}, got ${entry.lastmod}`);
    }
  }

  return entry;
}

async function requestText(url, { headers = {} } = {}) {
  const tempDir = await mkdtemp(join(tmpdir(), "pinpoint-gsc-sitemap-"));
  const headerPath = join(tempDir, "headers.txt");
  const bodyPath = join(tempDir, "body.txt");
  const args = [
    "-sS",
    "-L",
    "--max-time",
    "60",
    "-D",
    headerPath,
    "-o",
    bodyPath,
    "--write-out",
    "__STATUS__:%{http_code}\n__URL__:%{url_effective}\n__TYPE__:%{content_type}",
  ];

  for (const [key, value] of Object.entries(headers)) {
    args.push("-H", `${key}: ${value}`);
  }

  const proxyUrl = resolveProxyUrl();
  if (proxyUrl) {
    args.push("--proxy", proxyUrl);
  }

  args.push(url);

  try {
    const result = spawnSync(CURL_BIN, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status !== 0) {
      fail(`curl request failed for ${url}. ${String(result.stderr || result.stdout || "").trim()}`);
    }

    const writeOut = String(result.stdout || "");
    const statusCode = Number.parseInt(writeOut.match(/__STATUS__:(\d+)/)?.[1] || "0", 10);
    const effectiveUrl = writeOut.match(/__URL__:(.*)/)?.[1]?.trim() || url;
    const contentType = writeOut.match(/__TYPE__:(.*)/)?.[1]?.trim() || "";
    const [body, rawHeaders] = await Promise.all([readFile(bodyPath, "utf8"), readFile(headerPath, "utf8")]);

    return {
      statusCode,
      effectiveUrl,
      contentType,
      headers: rawHeaders,
      body,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function requestApi({ method, url, headers = {}, body = null }) {
  const args = ["-sS", "-L", "--max-time", "60", "-X", method];

  for (const [key, value] of Object.entries(headers)) {
    args.push("-H", `${key}: ${value}`);
  }

  const proxyUrl = resolveProxyUrl();
  if (proxyUrl) {
    args.push("--proxy", proxyUrl);
  }

  if (body !== null) {
    args.push("--data", body);
  }
  args.push("--write-out", "\n__STATUS__:%{http_code}", url);

  const result = spawnSync(CURL_BIN, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    fail(`curl API request failed. ${String(result.stderr || result.stdout || "").trim()}`);
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
    fail(`API request failed (${statusCode}). ${payload?.error?.message || text || "(empty response)"}`);
  }

  return { statusCode, payload };
}

async function submitSitemap({ credentialsPath, site, sitemapUrl }) {
  const accessToken = await getAccessToken(credentialsPath);
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/sitemaps/${encodeURIComponent(sitemapUrl)}`;
  return requestApi({
    method: "PUT",
    url: endpoint,
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (hasFlag(args, "--help") || hasFlag(args, "-h")) {
    printHelp();
    return;
  }

  const siteUrl = (getOption(args, "--site-url") || DEFAULT_SITE_URL).replace(/\/$/, "");
  const site = getOption(args, "--site") || DEFAULT_SITE;
  const sitemapUrl = getOption(args, "--sitemap-url") || `${siteUrl}/sitemap.xml`;
  const skipSubmit = hasFlag(args, "--skip-submit");
  const credentialsPath = getOption(args, "--credentials");

  if (!skipSubmit && !credentialsPath) {
    fail("Missing --credentials. Use --skip-submit if you only want to run checks.");
  }

  const registry = await readRegistry();
  const target = resolveTarget(registry, args, siteUrl);

  const detailResponse = await requestText(target.pageUrl, {
    headers: { "user-agent": GOOGLEBOT_SMARTPHONE_UA },
  });
  assertLiveDetailOk({ response: detailResponse, target });

  const sitemapResponse = await requestText(sitemapUrl, {
    headers: { "user-agent": GOOGLEBOT_SMARTPHONE_UA },
  });
  const sitemapEntry = assertSitemapOk({ response: sitemapResponse, sitemapUrl, target });

  console.log(`Target: ${target.label}`);
  console.log(`Detail URL: ${target.pageUrl}`);
  console.log(`Live detail: OK (${detailResponse.statusCode}, canonical/indexable/core text present)`);
  console.log(`Sitemap: OK (${sitemapResponse.statusCode}, lastmod=${sitemapEntry.lastmod || "present"})`);

  if (skipSubmit) {
    console.log("GSC submit: skipped by --skip-submit");
    return;
  }

  const submitResult = await submitSitemap({ credentialsPath, site, sitemapUrl });
  console.log(`GSC submit: OK (HTTP ${submitResult.statusCode})`);
  console.log("Reminder: this tells Google about the sitemap. It does not force instant indexing.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (!process.exitCode) {
    console.error(message);
    process.exitCode = 1;
  }
});
