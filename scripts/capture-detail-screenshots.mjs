import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

function todayIsoDate() {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseArgs(argv) {
  const numbers = [];
  let baseUrl = "http://localhost:3004";
  let outDir = `tmp/visual-baseline/${todayIsoDate()}`;
  let viewport = "1440,900";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (!arg) continue;

    if (arg === "--base-url") {
      baseUrl = argv[i + 1] ?? baseUrl;
      i += 1;
      continue;
    }

    if (arg === "--out-dir") {
      outDir = argv[i + 1] ?? outDir;
      i += 1;
      continue;
    }

    if (arg === "--viewport") {
      viewport = argv[i + 1] ?? viewport;
      i += 1;
      continue;
    }

    if (/^\d+$/.test(arg)) {
      numbers.push(Number(arg));
      continue;
    }
  }

  return { numbers, baseUrl, outDir, viewport };
}

function run(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", rejectPromise);
    child.once("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function main() {
  const { numbers, baseUrl, outDir, viewport } = parseArgs(process.argv.slice(2));
  const chosenNumbers = numbers.length > 0 ? numbers : [695, 697, 698];

  await mkdir(resolve(outDir), { recursive: true });

  for (const puzzleNumber of chosenNumbers) {
    const slug = `pinpoint-answer-${puzzleNumber}`;
    const url = `${baseUrl.replace(/\/$/, "")}/linkedin-pinpoint-answers/${slug}/`;
    const filename = resolve(outDir, `detail-${puzzleNumber}.png`);

    // Keep this as a CLI call on purpose: the repo does not rely on Playwright APIs directly.
    await run(process.platform === "win32" ? "npx.cmd" : "npx", [
      "--yes",
      "playwright",
      "screenshot",
      "--viewport-size",
      viewport,
      "--full-page",
      "--wait-for-selector",
      "main.detail-page-main",
      url,
      filename,
    ]);
  }

  console.log(`ok: screenshots saved in ${outDir}`);
}

main().catch((error) => {
  console.error("fatal: capture-detail-screenshots failed");
  console.error(error);
  process.exitCode = 1;
});

