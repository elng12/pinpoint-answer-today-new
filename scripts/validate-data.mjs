import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { puzzleDetailContentSchema, registrySchema } from "../lib/puzzles/schema.shared.mjs";

async function main() {
  const dataDir = resolve(process.cwd(), "data", "puzzles");
  const registryPath = resolve(dataDir, "registry.json");
  const rawRegistry = await readFile(registryPath, "utf8");
  const registry = registrySchema.parse(JSON.parse(rawRegistry));

  const numbers = new Set();
  const slugs = new Set();
  const dates = new Set();
  let liveCount = 0;
  let previewCount = 0;

  for (const entry of registry) {
    if (numbers.has(entry.puzzleNumber)) {
      throw new Error(`Duplicate puzzleNumber detected: ${entry.puzzleNumber}`);
    }
    if (slugs.has(entry.slug)) {
      throw new Error(`Duplicate slug detected: ${entry.slug}`);
    }
    if (dates.has(entry.publishDate)) {
      throw new Error(`Duplicate publishDate detected: ${entry.publishDate}`);
    }

    numbers.add(entry.puzzleNumber);
    slugs.add(entry.slug);
    dates.add(entry.publishDate);

    if (entry.status === "live") {
      liveCount += 1;
    }
    if (entry.status === "preview") {
      previewCount += 1;
    }

    if ((entry.status === "live" || entry.status === "archived") && (!entry.mainAnswer || !entry.category)) {
      throw new Error(`Published puzzle is missing answer/category: ${entry.slug}`);
    }

    if (entry.status === "live" || entry.status === "archived") {
      const detailPath = resolve(dataDir, `${entry.slug}.json`);
      if (!existsSync(detailPath)) {
        throw new Error(`Missing detail file for ${entry.slug}`);
      }
      const rawDetail = await readFile(detailPath, "utf8");
      const detail = puzzleDetailContentSchema.parse(JSON.parse(rawDetail));
      if (detail.slug !== entry.slug) {
        throw new Error(`Detail file slug mismatch for ${entry.slug}`);
      }
    }
  }

  if (liveCount !== 1) {
    throw new Error(`Expected exactly one live puzzle, received ${liveCount}`);
  }

  if (previewCount > 1) {
    throw new Error(`Expected at most one preview puzzle, received ${previewCount}`);
  }

  console.log(`Validated ${registry.length} registry records successfully.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
