import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 60;

const DEFAULT_WORKER_HEALTH_URL = "https://pinpoint-worker.2296744453m.workers.dev/health";

function resolveWorkerBaseUrl(): URL {
  const raw = String(process.env.PINPOINT_WORKER_HEALTH_URL || DEFAULT_WORKER_HEALTH_URL).trim();
  try {
    const url = new URL(raw);
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return new URL("https://pinpoint-worker.2296744453m.workers.dev");
  }
}

function buildCachedHeaders(contentType?: string | null): Headers {
  const headers = new Headers({
    "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
  });
  if (contentType) headers.set("content-type", contentType);
  return headers;
}

function buildNoStoreHeaders(contentType?: string | null): Headers {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (contentType) headers.set("content-type", contentType);
  return headers;
}

/**
 * GET /api/pinpoint/today
 *
 * Proxies the Cloudflare Worker endpoint so the main domain can serve the legacy
 * JSON response without relying on Cloudflare routing in front of Vercel.
 */
export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const workerBaseUrl = resolveWorkerBaseUrl();
  const upstreamUrl = new URL("/api/pinpoint/today", workerBaseUrl);
  upstreamUrl.search = requestUrl.search;

  try {
    const upstream = await fetch(upstreamUrl, { cache: "no-store" });
    const body = await upstream.text();
    const contentType = upstream.headers.get("content-type") || "application/json";

    return new NextResponse(body, {
      status: upstream.status,
      headers: upstream.ok ? buildCachedHeaders(contentType) : buildNoStoreHeaders(contentType),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "upstream unavailable";
    return NextResponse.json(
      { error: message, upstreamUrl: upstreamUrl.toString() },
      { status: 503, headers: buildNoStoreHeaders("application/json") },
    );
  }
}
