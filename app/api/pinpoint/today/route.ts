import { NextResponse } from "next/server";
import { buildCachedHeaders, buildNoStoreHeaders } from "@/lib/api-headers";
import { parseAndValidateUrl } from "@/lib/security/url-allowlist";

export const runtime = "nodejs";
export const revalidate = 60;

const DEFAULT_WORKER_HEALTH_URL = "https://pinpoint-worker.2296744453m.workers.dev/health";

function resolveWorkerBaseUrl(): URL {
  const raw = String(process.env.PINPOINT_WORKER_HEALTH_URL || DEFAULT_WORKER_HEALTH_URL).trim();
  try {
    const url = parseAndValidateUrl(
      raw,
      {
        allowedSchemes: ["https:"],
        allowedHosts: ["pinpoint-worker.2296744453m.workers.dev"],
        allowedHostSuffixes: [".workers.dev"],
        allowLocalhost: process.env.NODE_ENV !== "production",
      },
      "PINPOINT_WORKER_HEALTH_URL",
    );
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return new URL("https://pinpoint-worker.2296744453m.workers.dev");
  }
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
  } catch {
    return NextResponse.json(
      { error: "upstream unavailable" },
      { status: 503, headers: buildNoStoreHeaders("application/json") },
    );
  }
}
