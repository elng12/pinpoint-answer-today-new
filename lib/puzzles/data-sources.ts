import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cache } from "react";
import { getBundledRegistryEntries } from "@/lib/puzzles/registry-bundled";
import {
  puzzleDetailContentSchema,
  registrySchema,
  type PuzzleDetailContentRecord,
  type PuzzleRegistryEntryRecord,
} from "@/lib/puzzles/schema";

function getGithubRawBase(): string {
  return process.env.GITHUB_RAW_BASE?.trim() ?? "";
}

function hasRemotePuzzleDataSource(): boolean {
  return getGithubRawBase().length > 0;
}

function resolveDataDir(): string {
  const cwd = process.cwd();
  const directDir = resolve(cwd, "data", "puzzles");
  if (existsSync(resolve(directDir, "registry.json"))) return directDir;
  return resolve(cwd, "new-pinpoint-site", "data", "puzzles");
}

function loadDetailContentFromFilesystem(slug: string): PuzzleDetailContentRecord {
  const filePath = resolve(resolveDataDir(), `${slug}.json`);
  const raw = readFileSync(filePath, "utf8");
  return puzzleDetailContentSchema.parse(JSON.parse(raw));
}

export function warnRemoteFallback(message: string, error: unknown) {
  const detail =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  console.warn(`[puzzles] ${message}${detail ? `: ${detail}` : ""}`);
}

async function fetchRegistryFromRemote(): Promise<PuzzleRegistryEntryRecord[]> {
  const baseUrl = getGithubRawBase();
  const res = await fetch(`${baseUrl}/data/puzzles/registry.json`, {
    next: { tags: ["registry"], revalidate: 3600 },
  });
  if (!res.ok) {
    throw new Error(`registry fetch failed with status ${res.status}`);
  }
  const json = await res.json();
  return registrySchema
    .parse(json)
    .slice()
    .sort((a, b) => b.puzzleNumber - a.puzzleNumber);
}

async function fetchPuzzleContentFromRemote(slug: string): Promise<PuzzleDetailContentRecord> {
  const baseUrl = getGithubRawBase();
  const res = await fetch(`${baseUrl}/data/puzzles/${slug}.json`, {
    next: { tags: [`puzzle:${slug}`], revalidate: 86400 },
  });
  if (!res.ok) {
    throw new Error(`detail fetch failed with status ${res.status}`);
  }
  const json = await res.json();
  return puzzleDetailContentSchema.parse(json);
}

type RegistryCacheEntry = { key: string; data: PuzzleRegistryEntryRecord[]; ts: number };
let registryCache: RegistryCacheEntry | null = null;
const REGISTRY_CACHE_TTL_MS = 30_000;

function getPuzzleDataSourceCacheKey(): string {
  return [
    process.env.NODE_ENV ?? "",
    getGithubRawBase(),
    resolveDataDir(),
  ].join("|");
}

export const fetchRegistry = cache(async (): Promise<PuzzleRegistryEntryRecord[]> => {
  // Short-lived module-level cache so consecutive ISR renders (e.g. from
  // generateMetadata → page component, or from crawler requests to nearby
  // pages) share the same parsed registry without re-running Zod.
  const cacheKey = getPuzzleDataSourceCacheKey();
  if (
    registryCache &&
    registryCache.key === cacheKey &&
    Date.now() - registryCache.ts < REGISTRY_CACHE_TTL_MS
  ) {
    return registryCache.data;
  }

  // In production we prefer remote first so publish + revalidate can reflect
  // new puzzles without waiting for a full redeploy artifact refresh.
  const shouldTryRemoteFirst =
    process.env.NODE_ENV === "production" && hasRemotePuzzleDataSource();

  let result: PuzzleRegistryEntryRecord[];

  if (shouldTryRemoteFirst) {
    try {
      result = await fetchRegistryFromRemote();
      registryCache = { key: cacheKey, data: result, ts: Date.now() };
      return result;
    } catch (error) {
      warnRemoteFallback("Remote registry unavailable, falling back to local file", error);
    }
  }

  // Try local filesystem (available during build/dev and as fallback in prod)
  try {
    const filePath = resolve(resolveDataDir(), "registry.json");
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, "utf8");
      result = registrySchema
        .parse(JSON.parse(raw))
        .slice()
        .sort((a, b) => b.puzzleNumber - a.puzzleNumber);
      registryCache = { key: cacheKey, data: result, ts: Date.now() };
      return result;
    }
  } catch {
    // fall through to final remote attempt
  }

  if (!hasRemotePuzzleDataSource()) {
    result = getBundledRegistryEntries();
    registryCache = { key: cacheKey, data: result, ts: Date.now() };
    return result;
  }

  // Final remote attempt (covers environments where filesystem is unavailable)
  try {
    result = await fetchRegistryFromRemote();
  } catch (error) {
    warnRemoteFallback("Falling back to bundled registry", error);
    result = getBundledRegistryEntries();
  }

  registryCache = { key: cacheKey, data: result, ts: Date.now() };
  return result;
});

const puzzleContentCache = new Map<string, { data: PuzzleDetailContentRecord; ts: number }>();
const PUZZLE_CONTENT_CACHE_TTL_MS = 60_000;

export const fetchPuzzleContent = cache(async (slug: string): Promise<PuzzleDetailContentRecord> => {
  // Short-lived module-level cache so generateMetadata → page component
  // double-render of the same slug shares the parsed detail JSON.
  const cached = puzzleContentCache.get(slug);
  if (cached && Date.now() - cached.ts < PUZZLE_CONTENT_CACHE_TTL_MS) {
    return cached.data;
  }

  // Match registry behavior so production revalidation can pull fresh detail JSON
  // without waiting for a fresh deployment artifact.
  const shouldTryRemoteFirst =
    process.env.NODE_ENV === "production" && hasRemotePuzzleDataSource();

  let result: PuzzleDetailContentRecord;

  if (shouldTryRemoteFirst) {
    try {
      result = await fetchPuzzleContentFromRemote(slug);
      puzzleContentCache.set(slug, { data: result, ts: Date.now() });
      return result;
    } catch (error) {
      warnRemoteFallback(
        `Remote detail JSON unavailable for ${slug}, falling back to local file`,
        error,
      );
    }
  }

  // Try local filesystem (available during build/dev and as fallback in prod)
  try {
    const filePath = resolve(resolveDataDir(), `${slug}.json`);
    if (existsSync(filePath)) {
      result = loadDetailContentFromFilesystem(slug);
      puzzleContentCache.set(slug, { data: result, ts: Date.now() });
      return result;
    }
  } catch {
    // fall through to optional remote fetch
  }

  if (!hasRemotePuzzleDataSource()) {
    result = loadDetailContentFromFilesystem(slug);
    puzzleContentCache.set(slug, { data: result, ts: Date.now() });
    return result;
  }

  // Final remote attempt (covers environments where filesystem is unavailable)
  try {
    result = await fetchPuzzleContentFromRemote(slug);
  } catch (error) {
    warnRemoteFallback(`Falling back to local detail JSON for ${slug}`, error);
    result = loadDetailContentFromFilesystem(slug);
  }

  puzzleContentCache.set(slug, { data: result, ts: Date.now() });
  return result;
});
