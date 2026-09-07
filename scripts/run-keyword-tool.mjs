import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { resolve } from "node:path";

const entrypoints = new Map([
  ["density", "check-aitdk-density.ts"],
  ["homepage", "audit-homepage-keywords.ts"],
  ["fixtures", "check-fixtures.ts"],
]);
const [command, ...args] = process.argv.slice(2);
const usage = "Usage: node scripts/run-keyword-tool.mjs <density|homepage|fixtures> [tool arguments]";

if (command === "--help") {
  console.log(`${usage}\nSet KEYWORD_DENSITY_TOOL_DIR to your optional external toolkit directory. See scripts/README.md.`);
  process.exit(0);
}

if (!entrypoints.has(command)) {
  console.error(usage);
  process.exit(1);
}

const directory = process.env.KEYWORD_DENSITY_TOOL_DIR?.trim();
if (!directory) {
  console.error(
    "This command needs the optional external keyword-density toolkit. " +
    "Set KEYWORD_DENSITY_TOOL_DIR in your shell to its directory. " +
    "It is not bundled or required for normal setup, build, or CI. See scripts/README.md.",
  );
  process.exit(1);
}

const script = resolve(directory, entrypoints.get(command));
try {
  if (!statSync(script).isFile()) {
    throw new Error("Expected a script file.");
  }
} catch {
  console.error(`Keyword toolkit script is missing or unreadable: ${script}. Check KEYWORD_DENSITY_TOOL_DIR.`);
  process.exit(1);
}

// Keep the caller's working directory and argv; never interpolate input into a shell.
const result = spawnSync(process.execPath, ["--import", "tsx", script, ...args], {
  stdio: "inherit",
});
if (result.error || result.signal) {
  console.error(`Keyword toolkit could not finish: ${result.error?.message ?? result.signal}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
