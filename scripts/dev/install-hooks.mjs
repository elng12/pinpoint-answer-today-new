import { writeFile, chmod } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const hooksDir = resolve(process.cwd(), ".git", "hooks");

// Skip if not inside a git repo (e.g. Vercel build environment)
if (!existsSync(hooksDir)) {
  process.exit(0);
}

if (!existsSync(hooksDir)) {
  mkdirSync(hooksDir, { recursive: true });
}

const prePushPath = resolve(hooksDir, "pre-push");
const content = `#!/bin/sh
# Validate puzzle data before every push to prevent broken Vercel builds.
npm run validate:data
`;

await writeFile(prePushPath, content, "utf8");
await chmod(prePushPath, 0o755);
console.log("Git hooks installed.");
