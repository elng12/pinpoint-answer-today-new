/**
 * Shared HTTP response header helpers for API routes.
 *
 * DRY extraction from:
 * - app/api/health/route.ts
 * - app/api/pinpoint/today/route.ts
 * - app/api/fallback/worker-pinpoint/route.ts
 */

export function buildCachedHeaders(contentType?: string | null): Headers {
  const headers = new Headers({
    "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
  });
  if (contentType) headers.set("content-type", contentType);
  return headers;
}

/**
 * Build a no-store Cache-Control header set.
 *
 * Accepts either:
 * - a content-type string (e.g. "application/json")
 * - a HeadersInit record (e.g. { "Retry-After": "300" })
 */
export function buildNoStoreHeaders(extra?: string | HeadersInit): HeadersInit {
  if (typeof extra === "string") {
    return { "Cache-Control": "no-store", "content-type": extra };
  }
  return {
    "Cache-Control": "no-store",
    ...Object.fromEntries(
      extra instanceof Headers
        ? extra.entries()
        : Array.isArray(extra)
          ? extra
          : Object.entries(extra ?? {}),
    ),
  };
}
