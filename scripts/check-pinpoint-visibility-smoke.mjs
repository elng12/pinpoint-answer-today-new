import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DEFAULT_BASE_URL = "http://127.0.0.1:3004";
const DEFAULT_OUT_DIR = "output/playwright/visibility-smoke";
const VIEWPORTS = [
  ["desktop", "1440,900"],
  ["mobile", "390,844"],
];

const SELECTOR_PROBES = [
  ["h1", "h1.legacy-detail-title"],
  ["fifth-clue-card", ".legacy-reveal-clue-grid .legacy-reveal-clue-card:nth-of-type(5)"],
  ["answer-button", ".legacy-answer-button"],
  ["analysis", ".legacy-analysis-shell"],
  ["fifth-clue-row", ".legacy-clue-table tbody tr:nth-child(5)"],
  ["second-faq-card", "#faq .legacy-faq-card:nth-of-type(2)"],
  ["recent-link", ".legacy-next-list a"],
];

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    outDir: DEFAULT_OUT_DIR,
    slug: "",
    timeout: "15000",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base-url") {
      options.baseUrl = argv[i + 1] ?? options.baseUrl;
      i += 1;
      continue;
    }
    if (arg === "--out-dir") {
      options.outDir = argv[i + 1] ?? options.outDir;
      i += 1;
      continue;
    }
    if (arg === "--slug") {
      options.slug = argv[i + 1] ?? options.slug;
      i += 1;
      continue;
    }
    if (arg === "--timeout") {
      options.timeout = argv[i + 1] ?? options.timeout;
      i += 1;
    }
  }

  return options;
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: options.stdio ?? "inherit",
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", rejectPromise);
    child.once("exit", (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      const errorDetail = stderr ? `\n${stderr}` : "";
      rejectPromise(new Error(`${command} ${args.join(" ")} exited with code ${code}${errorDetail}`));
    });
  });
}

function npxCommand() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

async function assertNpxAvailable() {
  await run(npxCommand(), ["--version"], { stdio: "pipe" });
}

function readLatestPublicSlug() {
  const registryPath = resolve(ROOT, "data", "puzzles", "registry.json");
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  const entry = registry.find((item) => {
    const detailState =
      item.detailState ??
      (item.status === "draft" || item.status === "preview" ? "draft" : "published");
    return (
      (item.status === "live" || item.status === "archived") &&
      item.mainAnswer &&
      item.category &&
      (detailState === "published" || detailState === "fallback_full")
    );
  });
  if (!entry?.slug) {
    throw new Error("Could not find a public Pinpoint detail slug in registry.json.");
  }
  return entry.slug;
}

function detailUrl(baseUrl, slug) {
  return `${baseUrl.replace(/\/$/, "")}/linkedin-pinpoint-answers/${slug}/`;
}

async function assertServerReachable(url) {
  const response = await fetch(url, { method: "GET" }).catch(() => {
    throw new Error(`Could not reach ${url}. Start the site first, for example: npm run start`);
  });
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}.`);
  }
}

async function waitForVisibleSelector({ url, selector, viewport, timeout, screenshotPath }) {
  await run(npxCommand(), [
    "--yes",
    "playwright",
    "screenshot",
    "--viewport-size",
    viewport,
    "--timeout",
    timeout,
    "--wait-for-selector",
    selector,
    url,
    screenshotPath,
  ]);
}

async function captureFullPage({ url, viewport, timeout, screenshotPath }) {
  await run(npxCommand(), [
    "--yes",
    "playwright",
    "screenshot",
    "--viewport-size",
    viewport,
    "--timeout",
    timeout,
    "--full-page",
    "--wait-for-selector",
    "main.detail-page-main",
    url,
    screenshotPath,
  ]);
}

async function main() {
  const { baseUrl, outDir, slug: requestedSlug, timeout } = parseArgs(process.argv.slice(2));
  const slug = requestedSlug || readLatestPublicSlug();
  const url = detailUrl(baseUrl, slug);
  const resolvedOutDir = resolve(ROOT, outDir);

  await assertNpxAvailable();
  await assertServerReachable(url);
  await mkdir(resolvedOutDir, { recursive: true });

  for (const [label, viewport] of VIEWPORTS) {
    for (const [probeName, selector] of SELECTOR_PROBES) {
      const tempPath = resolve(resolvedOutDir, `.${slug}-${label}-${probeName}.png`);
      await waitForVisibleSelector({ url, selector, viewport, timeout, screenshotPath: tempPath });
      await rm(tempPath, { force: true });
    }

    const finalPath = resolve(resolvedOutDir, `${slug}-${label}.png`);
    await captureFullPage({ url, viewport, timeout, screenshotPath: finalPath });
  }

  console.log(`ok: Playwright visibility smoke passed for ${url}`);
  console.log(`ok: screenshots saved in ${outDir}`);
}

main().catch((error) => {
  console.error("fatal: Pinpoint visibility smoke failed");
  console.error(error);
  process.exitCode = 1;
});
