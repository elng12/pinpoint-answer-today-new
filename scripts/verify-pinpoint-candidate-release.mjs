import { appendFile, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const DEFAULT_SITE_URL = "https://pinpointanswertoday.app";
const DEFAULT_REPO = "elng12/pinpoint-answer-today-new";
const VERCEL_TIMEOUT_MS = 10 * 60 * 1000;
const VERCEL_POLL_MS = 5000;
const PUBLIC_AUDIT_TIMEOUT_MS = 10 * 60 * 1000;
const PUBLIC_AUDIT_POLL_MS = 5000;

function readArg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || `${command} failed`).trim();
    throw new Error(`${command} ${args.join(" ")} failed: ${detail}`);
  }
  return String(result.stdout || "").trim();
}

function parseCandidateBranch(branch) {
  const match = String(branch || "").match(/^pinpoint\/candidate\/(\d{4}-\d{2}-\d{2})-(pinpoint-answer-\d+)$/);
  if (!match) {
    throw new Error(`Candidate branch name is not allowed: ${branch || "(missing)"}`);
  }
  return { publishDate: match[1], slug: match[2] };
}

function findPreviousPublicDetailPath(registry, slug) {
  if (!Array.isArray(registry)) return "";
  const index = registry.findIndex((entry) => String(entry?.slug || "") === slug);
  if (index < 0) return "";
  const previous = registry.slice(index + 1).find((entry) => {
    const status = String(entry?.status || "");
    const detailState = String(entry?.detailState || "published");
    return (status === "live" || status === "archived") &&
      (detailState === "published" || detailState === "fallback_full") &&
      Boolean(entry?.slug);
  });
  return previous?.slug ? `/linkedin-pinpoint-answers/${previous.slug}/` : "";
}

function buildAuditInput({ siteUrl, sha, registry, registryEntry, puzzle }) {
  const slug = String(registryEntry?.slug || puzzle?.slug || "").trim();
  const puzzleNumber = registryEntry?.puzzleNumber ?? puzzle?.puzzleNumber ?? puzzle?.number;
  const publishDate = String(registryEntry?.publishDate || puzzle?.publishDate || puzzle?.isoDate || "").trim();
  const updatedAt = String(registryEntry?.updatedAt || puzzle?.updatedAt || "").trim();
  const answer = String(puzzle?.answer || registryEntry?.mainAnswer || "").trim();
  const clues = Array.isArray(puzzle?.clues) && puzzle.clues.length
    ? puzzle.clues
    : Array.isArray(registryEntry?.clues)
      ? registryEntry.clues
      : [];

  if (!slug || !puzzleNumber || !publishDate || !updatedAt || !answer || clues.length !== 5) {
    throw new Error(`Cannot build public fetch audit input for ${slug || "(missing slug)"}.`);
  }

  const normalizedSiteUrl = siteUrl.replace(/\/$/, "");
  const previousDetailPath = findPreviousPublicDetailPath(registry, slug);
  return {
    schemaVersion: "content-kitchen-post-publish-public-fetch-audit-input-v0",
    artifactId: `candidate-post-publish-public-fetch-${slug}-${sha.slice(0, 12)}`,
    checkedAt: new Date().toISOString(),
    expected: {
      puzzleId: `pinpoint-${puzzleNumber}-${publishDate}`,
      canonicalUrl: `${normalizedSiteUrl}/linkedin-pinpoint-answers/${slug}/`,
      revisionId: sha,
      contentMode: "full-analysis",
      answer,
      clues,
      policies: {
        indexPolicy: "index",
        sitemapPolicy: "include",
        schemaPolicy: "faq_allowed",
        internalLinkPolicy: "normal",
        requiredAction: "none",
      },
      schemaTypes: ["Article", "Game", "ItemList", "BreadcrumbList"],
      sitemapLastmod: updatedAt,
      schemaDateModified: updatedAt,
      ...(previousDetailPath ? { expectedInternalLinks: [previousDetailPath] } : {}),
    },
    publicFetch: {
      sitemapUrl: `${normalizedSiteUrl}/sitemap.xml`,
      timeoutMs: 15000,
      userAgent: `PinpointCandidateReleaseAudit/0.1 ${sha.slice(0, 12)}`,
    },
  };
}

async function githubJson(pathname, token) {
  const response = await fetch(`https://api.github.com/${pathname.replace(/^\/+/, "")}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "pinpoint-candidate-release/0.1",
    },
  });
  const text = await response.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = {};
  }
  if (!response.ok) {
    throw new Error(`GitHub API ${pathname} failed HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  return json;
}

async function waitForVercel(repo, sha, token) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < VERCEL_TIMEOUT_MS) {
    const status = await githubJson(`repos/${repo}/commits/${sha}/status`, token);
    const statuses = Array.isArray(status.statuses) ? status.statuses : [];
    const vercel = statuses.find((entry) => String(entry?.context || "").trim().toLowerCase() === "vercel");
    if (!vercel) {
      console.log("Waiting for Vercel to attach a deployment status...");
      await sleep(VERCEL_POLL_MS);
      continue;
    }

    const state = String(vercel.state || "");
    const description = String(vercel.description || "").trim();
    console.log(`Vercel status: ${state}${description ? ` - ${description}` : ""}`);
    if (state === "success") return vercel;
    if (state === "failure" || state === "error") {
      throw new Error(`Vercel deployment failed for ${sha}: ${vercel.target_url || "(no target url)"}`);
    }
    await sleep(VERCEL_POLL_MS);
  }
  console.warn(`Timed out waiting for Vercel deployment status for ${sha}; public fetch audit remains the final gate.`);
  return null;
}

async function fetchSummarySnapshot(siteUrl) {
  try {
    const response = await fetch(`${siteUrl.replace(/\/$/, "")}/api/puzzles/summary?candidate-check=${Date.now()}`, {
      headers: { "cache-control": "no-cache", pragma: "no-cache" },
    });
    if (!response.ok) {
      return { ok: false, status: response.status };
    }
    return { ok: true, latest: (await response.json())?.latest || null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function runPublicFetchAuditOnce(input) {
  const tmp = await mkdtemp(resolve(tmpdir(), "pinpoint-candidate-audit-"));
  const inputPath = resolve(tmp, "input.json");
  const outputPath = resolve(tmp, "audit.json");
  await writeFile(inputPath, JSON.stringify(input, null, 2));
  run("npm", [
    "run",
    "content-kitchen:post-publish-public-fetch-audit",
    "--",
    "--input",
    inputPath,
    "--output",
    outputPath,
    "--compact",
  ]);
  const artifact = JSON.parse(await readFile(outputPath, "utf8"));
  if (artifact.auditOutcome !== "published_and_audit_passed") {
    throw new Error(`Public fetch audit failed: ${artifact.auditOutcome} (${(artifact.issueCodes || []).join(", ") || "no issue codes"})`);
  }
  return { outputPath, auditOutcome: artifact.auditOutcome };
}

async function waitForPublicFetchAudit(input) {
  const startedAt = Date.now();
  let lastError = "";
  while (Date.now() - startedAt < PUBLIC_AUDIT_TIMEOUT_MS) {
    try {
      return await runPublicFetchAuditOnce(input);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.log(`Waiting for public fetch audit to pass... ${lastError}`);
      await sleep(PUBLIC_AUDIT_POLL_MS);
    }
  }
  throw new Error(`Public fetch audit did not pass in time: ${lastError || "unknown error"}`);
}

async function appendStepSummary({ status, slug = "", sha = "", vercel = null, audit = null, reason = "" }) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  const lines = [
    "## Pinpoint Candidate Release",
    "",
    `- Status: ${status}`,
    slug ? `- Puzzle: ${slug}` : "",
    sha ? `- SHA: ${sha}` : "",
    vercel?.target_url ? `- Vercel: ${vercel.target_url}` : "",
    audit?.auditOutcome ? `- Public audit: ${audit.auditOutcome}` : "",
    status === "passed"
      ? "- Site status: production has the candidate content and public fetch audit passed."
      : "",
    reason ? `- Reason: ${reason}` : "",
  ].filter(Boolean);

  await appendFile(summaryPath, `${lines.join("\n")}\n\n`, "utf8").catch((error) => {
    console.warn(`Could not write GitHub step summary: ${error instanceof Error ? error.message : String(error)}`);
  });
}

async function main() {
  const branch = readArg("--candidate-branch", process.env.GITHUB_REF_NAME || "");
  const sha = readArg("--sha", process.env.GITHUB_SHA || "");
  const repo = readArg("--repo", process.env.GITHUB_REPOSITORY || DEFAULT_REPO);
  const siteUrl = readArg("--site-url", process.env.PINPOINT_SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, "");
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  if (!sha) throw new Error("Missing --sha or GITHUB_SHA");
  if (!token) throw new Error("Missing GITHUB_TOKEN or GH_TOKEN");

  const { publishDate, slug } = parseCandidateBranch(branch);
  const registry = JSON.parse(await readFile("data/puzzles/registry.json", "utf8"));
  const puzzle = JSON.parse(await readFile(`data/puzzles/${slug}.json`, "utf8"));
  const registryEntry = Array.isArray(registry)
    ? registry.find((entry) => String(entry?.slug || "") === slug)
    : null;
  if (!registryEntry) throw new Error(`registry.json does not contain ${slug}`);
  if (String(registryEntry.publishDate || "") !== publishDate) {
    throw new Error(`registry publishDate mismatch for ${slug}`);
  }

  const vercel = await waitForVercel(repo, sha, token);
  const summary = await fetchSummarySnapshot(siteUrl);
  const audit = await waitForPublicFetchAudit(buildAuditInput({ siteUrl, sha, registry, registryEntry, puzzle }));

  await appendStepSummary({ status: "passed", slug, sha, vercel, audit });

  console.log(JSON.stringify({
    ok: true,
    slug,
    sha,
    vercel,
    summary,
    audit,
  }, null, 2));
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  await appendStepSummary({ status: "failed", reason: message });
  console.error(message);
  process.exitCode = 1;
});
