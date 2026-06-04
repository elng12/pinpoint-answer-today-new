import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const REPAIRABLE_CODES = [
  "solutionEmergence.tooShort",
  "sections.overlap",
  "solutionEmergence.genericPivot",
] as const;

type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

function run(command: string, args: string[], options: { inherit?: boolean } = {}): Promise<RunResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: process.env,
      stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    if (!options.inherit) {
      child.stdout?.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });
    }

    child.on("error", rejectPromise);
    child.on("close", (code) => {
      resolvePromise({
        code: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

function outputOf(result: RunResult): string {
  return `${result.stdout}${result.stderr}`.trim();
}

function repairReasons(output: string): string[] {
  return REPAIRABLE_CODES.filter((code) => output.includes(code));
}

function writeOriginalFailure(result: RunResult) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

async function main() {
  const first = await run("npm", ["run", "validate:data"]);
  if (first.code === 0) {
    process.stdout.write(first.stdout);
    process.stderr.write(first.stderr);
    return;
  }

  const firstOutput = outputOf(first);
  const reasons = repairReasons(firstOutput);
  if (reasons.length === 0) {
    writeOriginalFailure(first);
    process.exitCode = first.code;
    return;
  }

  console.log(`[auto-repair] validate:data failed with ${reasons.join(", ")}.`);
  console.log("[auto-repair] Rewriting the latest public puzzle solution narrative, then validating again.");
  await run(
    "npm",
    [
      "run",
      "pinpoint:repair-solution-narrative",
      "--",
      "--reason",
      reasons.join(","),
    ],
    { inherit: true },
  );

  const second = await run("npm", ["run", "validate:data"]);
  if (second.code === 0) {
    process.stdout.write(second.stdout);
    process.stderr.write(second.stderr);
    console.log("[auto-repair] validate:data passed after repair.");
    return;
  }

  process.stderr.write("[auto-repair] Repair ran, but validate:data still failed.\n");
  writeOriginalFailure(second);
  process.exitCode = second.code;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
