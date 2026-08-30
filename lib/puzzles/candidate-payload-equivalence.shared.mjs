import { isDeepStrictEqual } from "node:util";

const REGISTRY_LIFECYCLE_FIELDS = new Set(["status", "updatedAt"]);

function registryEntries(value) {
  return Array.isArray(value) ? value : [];
}

function findRegistryEntry(registry, slug) {
  return registryEntries(registry).find((entry) => String(entry?.slug || "") === slug) || null;
}

function withoutLifecycleFields(entry) {
  return Object.fromEntries(
    Object.entries(entry || {}).filter(([key]) => !REGISTRY_LIFECYCLE_FIELDS.has(key)),
  );
}

export function assessCandidatePayloadOnMain({
  slug,
  publishDate,
  candidateDetail,
  mainDetail,
  candidateRegistry,
  mainRegistry,
} = {}) {
  const normalizedSlug = String(slug || "").trim();
  const normalizedPublishDate = String(publishDate || "").trim();
  if (!normalizedSlug || !normalizedPublishDate) {
    return { equivalent: false, reason: "candidate identity is incomplete" };
  }

  const candidateEntry = findRegistryEntry(candidateRegistry, normalizedSlug);
  const mainEntry = findRegistryEntry(mainRegistry, normalizedSlug);
  if (!candidateEntry || !mainEntry) {
    return { equivalent: false, reason: `registry entry missing for ${normalizedSlug}` };
  }
  if (
    String(candidateEntry.publishDate || "") !== normalizedPublishDate ||
    String(mainEntry.publishDate || "") !== normalizedPublishDate
  ) {
    return { equivalent: false, reason: `registry publishDate mismatch for ${normalizedSlug}` };
  }
  if (!isDeepStrictEqual(candidateDetail, mainDetail)) {
    return { equivalent: false, reason: `detail JSON differs for ${normalizedSlug}` };
  }
  if (!isDeepStrictEqual(withoutLifecycleFields(candidateEntry), withoutLifecycleFields(mainEntry))) {
    return { equivalent: false, reason: `registry content differs for ${normalizedSlug}` };
  }

  return { equivalent: true, reason: `candidate payload for ${normalizedSlug} is already on main` };
}
