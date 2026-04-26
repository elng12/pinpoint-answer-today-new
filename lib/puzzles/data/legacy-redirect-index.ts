export type LegacyFamilyRedirectEntry = {
  slug: string;
  status: string;
  detailState?: string;
  mainAnswer?: string | null;
  category?: string | null;
};

export type LegacyRedirectResolution =
  | { state: "hit"; slug: string }
  | { state: "miss" }
  | { state: "ambiguous"; slugs: string[] };

export type LegacyFamilyRedirectIndex = {
  themes: Map<string, LegacyRedirectResolution>;
  connectors: Map<string, LegacyRedirectResolution>;
};

const MISS: LegacyRedirectResolution = { state: "miss" };

function slugifyLegacyLookupValue(value: string): string {
  return value
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getLegacyLookupVariants(value: string): string[] {
  const normalizedValue = value
    .normalize("NFKD")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');

  return Array.from(
    new Set([
      slugifyLegacyLookupValue(normalizedValue.replace(/['"]/g, "")),
      slugifyLegacyLookupValue(normalizedValue.replace(/['"]/g, "-")),
    ]),
  ).filter(Boolean);
}

export function normalizeLegacyLookupValue(value: string): string {
  return getLegacyLookupVariants(value)[0] ?? "";
}

export function extractLegacyConnectorKeys(value: string): string[] {
  const normalizedValue = value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');
  const patterns = [
    /\b(?:words|terms)\s+that\s+come\s+before\s*["']([^"']+)["']/i,
    /\b(?:words|terms)\s+that\s+come\s+after\s*["']([^"']+)["']/i,
    /\bwords\s+that\s+precede\s*["']([^"']+)["']/i,
    /\bwords\s+that\s+follow\s*["']([^"']+)["']/i,
    /\bphrases\s+formed\s+with\s*["']([^"']+)["']/i,
    /\b(?:words|terms)\s+that\s+come\s+before\s+([a-z0-9-]+)/i,
    /\b(?:words|terms)\s+that\s+come\s+after\s+([a-z0-9-]+)/i,
    /\bwords\s+that\s+precede\s+([a-z0-9-]+)/i,
    /\bwords\s+that\s+follow\s+([a-z0-9-]+)/i,
    /\bphrases\s+formed\s+with\s+([a-z0-9-]+)/i,
  ];

  const keys = new Set<string>();
  for (const pattern of patterns) {
    const match = normalizedValue.match(pattern);
    if (!match) continue;

    const key = normalizeLegacyLookupValue(match[1] ?? "");
    if (key) {
      keys.add(key);
    }
  }

  return Array.from(keys);
}

function resolveEntryDetailState(entry: LegacyFamilyRedirectEntry): string {
  if (entry.detailState) {
    return entry.detailState;
  }

  return entry.status === "draft" || entry.status === "preview" ? "draft" : "published";
}

function isPublicLegacyFamilyEntry(
  entry: LegacyFamilyRedirectEntry,
): entry is LegacyFamilyRedirectEntry & {
  mainAnswer: string;
  category: string;
  status: "live" | "archived";
} {
  const detailState = resolveEntryDetailState(entry);

  return (
    (entry.status === "live" || entry.status === "archived") &&
    (detailState === "published" || detailState === "fallback_full") &&
    !!entry.mainAnswer &&
    !!entry.category
  );
}

function addLegacyRedirectCandidate(
  map: Map<string, LegacyRedirectResolution>,
  key: string,
  slug: string,
) {
  if (!key) return;

  const existing = map.get(key);
  if (!existing) {
    map.set(key, { state: "hit", slug });
    return;
  }

  if (existing.state === "hit") {
    if (existing.slug === slug) return;
    map.set(key, {
      state: "ambiguous",
      slugs: [existing.slug, slug].sort(),
    });
    return;
  }

  if (existing.state === "ambiguous" && !existing.slugs.includes(slug)) {
    map.set(key, {
      state: "ambiguous",
      slugs: [...existing.slugs, slug].sort(),
    });
  }
}

export function buildLegacyFamilyRedirectIndex(
  entries: readonly LegacyFamilyRedirectEntry[],
): LegacyFamilyRedirectIndex {
  const themes = new Map<string, LegacyRedirectResolution>();
  const connectors = new Map<string, LegacyRedirectResolution>();

  for (const entry of entries) {
    if (!isPublicLegacyFamilyEntry(entry)) continue;

    for (const candidate of [entry.category, entry.mainAnswer]) {
      for (const key of getLegacyLookupVariants(candidate)) {
        addLegacyRedirectCandidate(themes, key, entry.slug);
      }

      for (const key of extractLegacyConnectorKeys(candidate)) {
        addLegacyRedirectCandidate(connectors, key, entry.slug);
      }
    }
  }

  return { themes, connectors };
}

function resolveLegacyRedirect(
  map: Map<string, LegacyRedirectResolution>,
  legacySlug: string,
): LegacyRedirectResolution {
  const key = normalizeLegacyLookupValue(legacySlug);
  if (!key) return MISS;
  return map.get(key) ?? MISS;
}

export function resolveLegacyThemeRedirect(
  index: LegacyFamilyRedirectIndex,
  legacySlug: string,
): LegacyRedirectResolution {
  return resolveLegacyRedirect(index.themes, legacySlug);
}

export function resolveLegacyConnectorRedirect(
  index: LegacyFamilyRedirectIndex,
  legacySlug: string,
): LegacyRedirectResolution {
  return resolveLegacyRedirect(index.connectors, legacySlug);
}

export function resolveLegacyThemeOrConnectorRedirect(
  index: LegacyFamilyRedirectIndex,
  legacySlug: string,
): LegacyRedirectResolution {
  const themeResolution = resolveLegacyThemeRedirect(index, legacySlug);
  if (themeResolution.state !== "miss") {
    return themeResolution;
  }

  return resolveLegacyConnectorRedirect(index, legacySlug);
}

export function getLegacyResolvedSlug(resolution: LegacyRedirectResolution): string | null {
  return resolution.state === "hit" ? resolution.slug : null;
}
