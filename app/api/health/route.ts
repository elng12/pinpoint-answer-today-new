import { NextResponse } from "next/server";
import { buildCachedHeaders, buildNoStoreHeaders } from "@/lib/api-headers";
import { parseAndValidateUrl } from "@/lib/security/url-allowlist";

export const runtime = "nodejs";
export const revalidate = 60;

const DEFAULT_WORKER_HEALTH_URL = "https://pinpoint-worker.2296744453m.workers.dev/health";

function resolveWorkerHealthUrl(): URL {
  const raw = String(process.env.PINPOINT_WORKER_HEALTH_URL || DEFAULT_WORKER_HEALTH_URL).trim();
  try {
    return parseAndValidateUrl(
      raw,
      {
        allowedSchemes: ["https:"],
        allowedHosts: ["pinpoint-worker.2296744453m.workers.dev"],
        allowedHostSuffixes: [".workers.dev"],
        allowLocalhost: process.env.NODE_ENV !== "production",
      },
      "PINPOINT_WORKER_HEALTH_URL",
    );
  } catch {
    return new URL(DEFAULT_WORKER_HEALTH_URL);
  }
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
  } catch {
    return NextResponse.json(
      { error: "upstream unavailable" },
      { status: 503, headers: buildNoStoreHeaders("application/json") },
    );
  }
}
