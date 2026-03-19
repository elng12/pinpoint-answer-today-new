import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const OUTPUT_PATH = resolve(ROOT, "data", "static-page-metadata.json");

const ROUTE_SOURCES = [
  {
    path: "/",
    files: [
      "app/(site)/(home)/page.tsx",
      "components/home/HomeBenefitsFaq.tsx",
      "components/home/HomeBookmarkStrip.tsx",
      "components/home/HomeCtaFooter.tsx",
      "components/home/HomeHero.tsx",
      "components/home/HomeNextUnlock.tsx",
      "components/home/HomeRecentAnswers.tsx",
      "components/home/HomeRevealSection.tsx",
      "components/home/HomeWhatIs.tsx",
      "components/layout/FooterBadgeWall.tsx",
    ],
  },
  {
    path: "/puzzles",
    files: [
      "app/(site)/puzzles/page.tsx",
      "components/archive/ArchiveExplorer.tsx",
      "components/archive/ArchiveHeader.tsx",
    ],
  },
  { path: "/about-us", files: ["app/(site)/about-us/page.tsx"] },
  {
    path: "/contact-us",
    files: [
      "app/(site)/contact-us/page.tsx",
      "components/contact/ContactFeedbackForm.tsx",
    ],
  },
  { path: "/privacy", files: ["app/(site)/privacy/page.tsx"] },
  { path: "/terms", files: ["app/(site)/terms/page.tsx"] },
  { path: "/disclaimer", files: ["app/(site)/disclaimer/page.tsx"] },
];

function toIsoString(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function getLatestIso(values) {
  return values.filter(Boolean).sort().at(-1) ?? null;
}

async function readExistingMetadata() {
  if (!existsSync(OUTPUT_PATH)) {
    return null;
  }

  try {
    const raw = await readFile(OUTPUT_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function getGitLastModified(filePath) {
  try {
    const { stdout } = await execFileAsync("git", ["log", "-1", "--format=%cI", "--", filePath], {
      cwd: ROOT,
    });
    return toIsoString(stdout.trim());
  } catch {
    return null;
  }
}

async function getRouteLastModified(routeEntry, existingMetadata, fallbackIso) {
  const values = await Promise.all(routeEntry.files.map((filePath) => getGitLastModified(filePath)));
  const known = values.filter(Boolean).sort().at(-1);
  if (known) {
    return known;
  }

  const existingValue = existingMetadata?.routes?.[routeEntry.path]?.lastModified;
  return toIsoString(existingValue) ?? fallbackIso;
}

async function main() {
  const existingMetadata = await readExistingMetadata();
  const fallbackIso = toIsoString(existingMetadata?.generatedAt) ?? new Date().toISOString();

  const routes = {};
  for (const routeEntry of ROUTE_SOURCES) {
    routes[routeEntry.path] = {
      lastModified: await getRouteLastModified(routeEntry, existingMetadata, fallbackIso),
      sourceFiles: routeEntry.files,
    };
  }

  const generatedAt = getLatestIso(
    Object.values(routes).map((route) => route.lastModified),
  ) ?? fallbackIso;

  const payload = {
    generatedAt,
    routes,
  };
  const nextRaw = `${JSON.stringify(payload, null, 2)}\n`;
  const previousRaw = existsSync(OUTPUT_PATH) ? await readFile(OUTPUT_PATH, "utf8") : null;

  if (previousRaw === nextRaw) {
    console.log(`Static page metadata already up to date for ${ROUTE_SOURCES.length} routes.`);
    return;
  }

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, nextRaw, "utf8");

  console.log(`Generated static page metadata for ${ROUTE_SOURCES.length} routes.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
