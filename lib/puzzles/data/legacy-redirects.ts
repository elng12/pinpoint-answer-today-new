import { cache } from "react";
import { fetchRegistry } from "@/lib/puzzles/data-sources";
import { isDetailEntry } from "@/lib/puzzles/data/registry";

function normalizeLegacyLookupValue(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u2018\u2019\u201C\u201D]/g, "")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function addLegacyRedirectCandidate(map: Map<string, string | null>, key: string, slug: string) {
  if (!key) return;

  const existing = map.get(key);
  if (!existing) {
    map.set(key, slug);
    return;
  }

  if (existing !== slug) {
    map.set(key, null);
  }
}

function extractLegacyConnectorKeys(value: string): string[] {
  const patterns = [
    /\b(?:words|terms)\s+that\s+come\s+before\s*[“"']([^”"']+)[”"']/i,
    /\b(?:words|terms)\s+that\s+come\s+after\s*[“"']([^”"']+)[”"']/i,
    /\bwords\s+that\s+precede\s*[“"']([^”"']+)[”"']/i,
    /\bwords\s+that\s+follow\s*[“"']([^”"']+)[”"']/i,
    /\bphrases\s+formed\s+with\s*[“"']([^”"']+)[”"']/i,
    /\b(?:words|terms)\s+that\s+come\s+before\s+([a-z0-9-]+)/i,
    /\b(?:words|terms)\s+that\s+come\s+after\s+([a-z0-9-]+)/i,
    /\bwords\s+that\s+precede\s+([a-z0-9-]+)/i,
    /\bwords\s+that\s+follow\s+([a-z0-9-]+)/i,
    /\bphrases\s+formed\s+with\s+([a-z0-9-]+)/i,
  ];

  const keys = new Set<string>();
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (!match) continue;

    const key = normalizeLegacyLookupValue(match[1] ?? "");
    if (key) {
      keys.add(key);
    }
  }

  return Array.from(keys);
}

const getLegacyThemeRedirectMap = cache(async (): Promise<Map<string, string | null>> => {
  const map = new Map<string, string | null>();
  const entries = (await fetchRegistry()).filter(isDetailEntry);

  for (const entry of entries) {
    for (const candidate of [entry.category, entry.mainAnswer]) {
      addLegacyRedirectCandidate(map, normalizeLegacyLookupValue(candidate), entry.slug);
    }
  }

  return map;
});

const getLegacyConnectorRedirectMap = cache(async (): Promise<Map<string, string | null>> => {
  const map = new Map<string, string | null>();
  const entries = (await fetchRegistry()).filter(isDetailEntry);

  for (const entry of entries) {
    for (const candidate of [entry.category, entry.mainAnswer]) {
      for (const key of extractLegacyConnectorKeys(candidate)) {
        addLegacyRedirectCandidate(map, key, entry.slug);
      }
    }
  }

  return map;
});

export async function getLegacyThemeRedirectSlug(legacySlug: string): Promise<string | null> {
  const map = await getLegacyThemeRedirectMap();
  return map.get(normalizeLegacyLookupValue(legacySlug)) ?? null;
}

export async function getLegacyConnectorRedirectSlug(legacySlug: string): Promise<string | null> {
  const map = await getLegacyConnectorRedirectMap();
  return map.get(normalizeLegacyLookupValue(legacySlug)) ?? null;
}

