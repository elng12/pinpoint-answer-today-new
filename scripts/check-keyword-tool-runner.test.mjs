import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const runner = fileURLToPath(new URL("./run-keyword-tool.mjs", import.meta.url));
const fixtureDir = mkdtempSync(join(tmpdir(), "pinpoint keyword fixture "));
after(() => rmSync(fixtureDir, { recursive: true, force: true }));

function run(args, directory = "") {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd: root,
    env: { ...process.env, KEYWORD_DENSITY_TOOL_DIR: directory },
    encoding: "utf8",
    timeout: 10_000,
  });
}

test("help works without an installed external toolkit", () => {
  const result = run(["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /KEYWORD_DENSITY_TOOL_DIR/);
});

test("all three optional commands fail clearly when unconfigured", () => {
  for (const command of ["density", "homepage", "fixtures"]) {
    const result = run([command], "   ");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /optional external keyword-density toolkit/);
    assert.equal(result.stdout, "");
  }
});

test("missing and unknown commands are rejected", () => {
  for (const args of [[], ["unknown"], ["constructor"], ["../other.ts"]]) {
    const result = run(args, fixtureDir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage:/);
  }
});

test("missing script, nonexistent directory, and directory in place of script fail", () => {
  const emptyDir = join(fixtureDir, "empty");
  mkdirSync(emptyDir);
  for (const directory of [emptyDir, join(fixtureDir, "does not exist")]) {
    const result = run(["density"], directory);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /missing or unreadable/);
  }
  mkdirSync(join(emptyDir, "check-aitdk-density.ts"));
  const result = run(["density"], emptyDir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing or unreadable/);
});

// Synthetic tools test the launcher only, not keyword-analysis correctness.
test("each entrypoint runs TypeScript and preserves argv, stdout, and cwd", () => {
  for (const [command, filename] of [
    ["density", "check-aitdk-density.ts"],
    ["homepage", "audit-homepage-keywords.ts"],
    ["fixtures", "check-fixtures.ts"],
  ]) {
    writeFileSync(join(fixtureDir, filename), `
      const args: string[] = process.argv.slice(2);
      console.log(JSON.stringify({ entrypoint: ${JSON.stringify(filename)}, args, cwd: process.cwd() }));
    `);
    const args = ["--text", "words with spaces; $(echo not-a-shell)", "--json"];
    const result = run([command, ...args], fixtureDir);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      entrypoint: filename,
      args,
      cwd: resolve(root),
    });
  }
});

test("child failures retain stderr and their nonzero exit code", () => {
  const failureDir = join(fixtureDir, "failure");
  mkdirSync(failureDir);
  writeFileSync(join(failureDir, "check-fixtures.ts"), 'console.error("synthetic failure"); process.exit(7);');
  const result = run(["fixtures"], failureDir);
  assert.equal(result.status, 7);
  assert.match(result.stderr, /synthetic failure/);
});

test("a terminated child is not reported as success", () => {
  const signalDir = join(fixtureDir, "signal");
  mkdirSync(signalDir);
  writeFileSync(join(signalDir, "check-fixtures.ts"), 'process.kill(process.pid, "SIGTERM");');
  const result = run(["fixtures"], signalDir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /could not finish: SIGTERM/);
});
