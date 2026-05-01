import { spawn } from "node:child_process";
import process from "node:process";
import { dirname, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const WORKER_DIR = resolve(ROOT, "worker");
const DEFAULT_SITE_URL = process.env.PINPOINT_SITE_URL || "https://pinpointanswertoday.app";
const DEFAULT_WORKER_HEALTH_URL =
  process.env.PINPOINT_WORKER_HEALTH_URL || "https://pinpoint-worker.2296744453m.workers.dev/health";
const STATUS_TIMEOUT_MS = 10 * 60 * 1000;
const STATUS_POLL_MS = 5000;
const DETAIL_VERIFY_TIMEOUT_MS = 2 * 60 * 1000;
const DETAIL_VERIFY_POLL_MS = 5000;

function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

function printHelp() {
  console.log(`
Usage:
  npm run release:production
  npm run release:production -- --dry-run

What it does:
  1. Ensure the repo is on main and clean
  2. Install worker dependencies, then run guardrails, typecheck, validate:data, and worker typecheck
  3. Push main to origin
  4. Wait for the Vercel deployment tied to HEAD
  5. Deploy the production Cloudflare Worker
  6. Verify homepage, summary API, and worker health

Options:
  --dry-run   Run all local preflight checks, then stop before push/deploy
`.trim());
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function logStep(message) {
  console.log(`\n==> ${message}`);
}

function run(command, args, options = {}) {
  const {
    cwd = ROOT,
    capture = false,
    env,
  } = options;

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      shell: false,
    });

    let stdout = "";
    let stderr = "";

    if (capture) {
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
    }

    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }

      const detail = capture ? `\n${stdout}${stderr}`.trim() : "";
      rejectPromise(new Error(`Command failed: ${command} ${args.join(" ")}${detail ? `\n${detail}` : ""}`));
    });
  });
}

async function capture(command, args, options = {}) {
  const result = await run(command, args, { ...options, capture: true });
  return result.stdout.trim();
}

function extractGitHubRepo(remoteUrl) {
  const normalized = String(remoteUrl || "").trim();
  const sshMatch = normalized.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/i);
  if (sshMatch?.[1]) {
    return sshMatch[1];
  }
  throw new Error(`Could not parse GitHub repo from remote URL: ${normalized}`);
}

async function ensureMainBranch() {
  const branch = await capture("git", ["branch", "--show-current"]);
  if (branch !== "main") {
    throw new Error(`Production release must run from main. Current branch: ${branch}`);
  }
}

async function ensureCleanWorktree() {
  const status = await capture("git", ["status", "--porcelain"]);
  if (status) {
    throw new Error("Worktree is not clean. Commit or stash local changes before running release:production.");
  }
}

async function waitForVercelDeployment(repo, sha) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < STATUS_TIMEOUT_MS) {
    const raw = await capture("gh", ["api", `repos/${repo}/commits/${sha}/status`]);
    const payload = JSON.parse(raw);
    const statuses = Array.isArray(payload.statuses) ? payload.statuses : [];
    const vercelStatus = statuses.find((entry) => entry.context === "Vercel");

    if (!vercelStatus) {
      console.log("Waiting for Vercel to attach a deployment status...");
      await sleep(STATUS_POLL_MS);
      continue;
    }

    const state = String(vercelStatus.state || "");
    const description = String(vercelStatus.description || "").trim();
    const targetUrl = String(vercelStatus.target_url || "").trim();

    console.log(`Vercel status: ${state}${description ? ` - ${description}` : ""}`);

    if (state === "success") {
      return { targetUrl };
    }

    if (state === "failure" || state === "error") {
      throw new Error(`Vercel deployment failed${targetUrl ? `: ${targetUrl}` : ""}`);
    }

    await sleep(STATUS_POLL_MS);
  }

  throw new Error("Timed out waiting for Vercel deployment to finish.");
}

async function checkHttpOk(url, label) {
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok && response.status !== 307 && response.status !== 308) {
    throw new Error(`${label} check failed with HTTP ${response.status}: ${url}`);
  }

  return response;
}

async function checkSummaryApi(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Summary API check failed with HTTP ${response.status}: ${url}`);
  }

  const payload = await response.json();
  if (!payload?.latest?.slug || !payload?.latest?.isoPublishedAt || payload?.latest?.status !== "live") {
    throw new Error(`Summary API payload is incomplete: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function checkWorkerHealth(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Worker health check failed with HTTP ${response.status}: ${url}`);
  }

  const payload = await response.json();
  const answers = Array.isArray(payload?.answers) ? payload.answers : [];
  if (!payload?.puzzleDate || answers.length !== 5) {
    throw new Error(`Worker health payload is incomplete: ${JSON.stringify(payload)}`);
  }

  return payload;
}

function decodeCommonEntities(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function extractSearchableText(html) {
  return decodeCommonEntities(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

async function loadPublishedPuzzle(slug) {
  const filePath = resolve(ROOT, "data", "puzzles", `${slug}.json`);
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function loadRegistryEntries() {
  const filePath = resolve(ROOT, "data", "puzzles", "registry.json");
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function loadLiveRegistryEntry() {
  const registry = await loadRegistryEntries();
  const liveEntry = Array.isArray(registry)
    ? registry.find((entry) => String(entry?.status || "") === "live")
    : null;

  if (!liveEntry?.slug) {
    throw new Error("registry.json does not contain a live puzzle entry");
  }

  return liveEntry;
}

function assertReleaseEligibleDetail(slug, puzzle, contextLabel) {
  const detailState = String(puzzle?.detailState || "published").trim().toLowerCase();
  if (detailState !== "published" && detailState !== "fallback_full") {
    throw new Error(
      `${contextLabel} is not publicly releasable for ${slug}. detailState=${detailState}`,
    );
  }

  const bodyMode = String(puzzle?.bodyMode || "").trim().toLowerCase();
  if (bodyMode === "short") {
    throw new Error(
      `${contextLabel} is still short mode for ${slug}. Production release only allows formal full detail pages.`,
    );
  }
}

function buildDetailVerificationStrings(puzzle) {
  const clues = Array.isArray(puzzle?.clues) ? puzzle.clues.filter(Boolean) : [];
  const bodyBlocks = Array.isArray(puzzle?.articleBlocks) && puzzle.articleBlocks.length
    ? puzzle.articleBlocks
    : Array.isArray(puzzle?.fullAnalysis)
      ? puzzle.fullAnalysis
      : [];
  const bodySnippet = bodyBlocks.find((entry) => String(entry || "").trim());
  const faqSnippet = Array.isArray(puzzle?.faqs)
    ? puzzle.faqs.find((item) => String(item?.answer || "").trim())?.answer
    : "";

  return [puzzle?.answer, clues[0], clues.at(-1), bodySnippet, faqSnippet]
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
}

function buildDetailHtmlExpectations(puzzle) {
  const bodyMode = String(puzzle?.bodyMode || "").trim();
  if (bodyMode === "short") {
    return {
      required: [],
      forbidden: ["compact guide"],
    };
  }

  return {
    required: [],
    forbidden: ["compact guide"],
  };
}

async function waitForLatestDetailContent(siteUrl, slug, puzzle) {
  const startedAt = Date.now();
  const expectedStrings = buildDetailVerificationStrings(puzzle);
  const htmlExpectations = buildDetailHtmlExpectations(puzzle);
  const detailUrl = `${siteUrl.replace(/\/$/, "")}/linkedin-pinpoint-answers/${slug}/`;
  let lastMissing = expectedStrings;
  let lastMissingHtml = htmlExpectations.required;
  let lastForbiddenHtml = [];

  while (Date.now() - startedAt < DETAIL_VERIFY_TIMEOUT_MS) {
    const cacheBust = `release-check=${Date.now()}`;
    const response = await fetch(`${detailUrl}?${cacheBust}`, {
      signal: AbortSignal.timeout(15000),
      headers: {
        "cache-control": "no-cache",
        pragma: "no-cache",
      },
    });

    if (!response.ok) {
      throw new Error(`Detail page check failed with HTTP ${response.status}: ${detailUrl}`);
    }

    const html = await response.text();
    const text = extractSearchableText(html);
    const missing = expectedStrings.filter((entry) => !text.includes(entry));
    const missingHtml = htmlExpectations.required.filter((entry) => !html.includes(entry));
    const forbiddenHtml = htmlExpectations.forbidden.filter((entry) => html.includes(entry));
    if (missing.length === 0 && missingHtml.length === 0 && forbiddenHtml.length === 0) {
      return { detailUrl, checkedStrings: expectedStrings };
    }

    lastMissing = missing;
    lastMissingHtml = missingHtml;
    lastForbiddenHtml = forbiddenHtml;
    console.log(
      `Waiting for live detail content to update... missing ${missing.length} text snippet(s), ${missingHtml.length} html marker(s), ${forbiddenHtml.length} stale html marker(s).`,
    );
    await sleep(DETAIL_VERIFY_POLL_MS);
  }

  throw new Error(
    `Detail page did not refresh to the expected content in time: ${slug}\nMissing text: ${lastMissing.join(" | ") || "(none)"}\nMissing html: ${lastMissingHtml.join(" | ") || "(none)"}\nStale html still present: ${lastForbiddenHtml.join(" | ") || "(none)"}`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  logStep("Checking git state");
  await ensureMainBranch();
  await run("npm", ["run", "generate:static-page-metadata"]);
  await ensureCleanWorktree();

  const localLiveEntry = await loadLiveRegistryEntry();
  const localLivePuzzle = await loadPublishedPuzzle(localLiveEntry.slug);
  assertReleaseEligibleDetail(localLiveEntry.slug, localLivePuzzle, "Local live detail JSON");

  logStep("Installing worker dependencies");
  await run("npm", ["ci"], { cwd: WORKER_DIR });

  logStep("Running local release checks");
  await run("npm", ["run", "test:pinpoint-guardrails"]);
  await run("npm", ["run", "typecheck"]);
  await run("npm", ["run", "validate:data"]);
  await run("npm", ["run", "typecheck"], { cwd: WORKER_DIR });

  const sha = await capture("git", ["rev-parse", "HEAD"]);
  const remoteUrl = await capture("git", ["remote", "get-url", "origin"]);
  const repo = extractGitHubRepo(remoteUrl);

  if (args.dryRun) {
    logStep("Dry run complete");
    console.log(`Would push commit ${sha} to origin/main`);
    console.log("Would wait for the matching Vercel deployment to succeed");
    console.log("Would deploy the production Cloudflare Worker");
    console.log(`Would verify ${DEFAULT_SITE_URL}/, ${DEFAULT_SITE_URL}/api/puzzles/summary, and ${DEFAULT_WORKER_HEALTH_URL}`);
    return;
  }

  logStep("Pushing main to origin");
  await run("git", ["push", "origin", "main"]);

  logStep("Waiting for Vercel deployment");
  const vercel = await waitForVercelDeployment(repo, sha);

  logStep("Deploying production worker");
  await run("npx", ["wrangler", "deploy", "--env="], { cwd: WORKER_DIR });

  logStep("Running final health checks");
  await checkHttpOk(`${DEFAULT_SITE_URL}/`, "Homepage");
  const summary = await checkSummaryApi(`${DEFAULT_SITE_URL}/api/puzzles/summary`);
  const workerHealth = await checkWorkerHealth(DEFAULT_WORKER_HEALTH_URL);
  const publishedPuzzle = await loadPublishedPuzzle(summary.latest.slug);
  assertReleaseEligibleDetail(summary.latest.slug, publishedPuzzle, "Published detail JSON");
  const detail = await waitForLatestDetailContent(DEFAULT_SITE_URL, summary.latest.slug, publishedPuzzle);

  logStep("Production release finished");
  console.log(`Commit: ${sha}`);
  console.log(`Vercel: ${vercel.targetUrl || "success"}`);
  console.log(`Summary slug: ${summary.latest.slug}`);
  console.log(`Summary publishedAt: ${summary.latest.isoPublishedAt}`);
  console.log(`Worker puzzleDate: ${workerHealth.puzzleDate}`);
  console.log(`Verified detail page: ${detail.detailUrl}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
