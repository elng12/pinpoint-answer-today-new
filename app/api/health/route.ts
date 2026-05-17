import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 60;

const DEFAULT_WORKER_HEALTH_URL = "https://pinpoint-worker.2296744453m.workers.dev/health";

function resolveWorkerHealthUrl(): URL {
  const raw = String(process.env.PINPOINT_WORKER_HEALTH_URL || DEFAULT_WORKER_HEALTH_URL).trim();
  try {
    return new URL(raw);
  } catch {
    return new URL(DEFAULT_WORKER_HEALTH_URL);
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
 * GET /api/health
 *
 * Proxies the Cloudflare Worker health endpoint so monitors can use a stable URL
 * on the Vercel-hosted main domain.
 */
export async function GET() {
  const workerHealthUrl = resolveWorkerHealthUrl();

  try {
    const upstream = await fetch(workerHealthUrl, { cache: "no-store" });
    const body = await upstream.text();
    const contentType = upstream.headers.get("content-type") || "application/json";

    return new NextResponse(body, {
      status: upstream.status,
      headers: upstream.ok ? buildCachedHeaders(contentType) : buildNoStoreHeaders(contentType),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "upstream unavailable";
    return NextResponse.json(
      { error: message, workerHealthUrl: workerHealthUrl.toString() },
      { status: 503, headers: buildNoStoreHeaders("application/json") },
    );
  }
}
