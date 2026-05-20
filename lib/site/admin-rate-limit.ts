import { NextResponse } from "next/server";
import { createInMemoryRateLimiter, readPositiveIntegerEnv } from "@/lib/rate-limit";

const adminRateLimitWindowMs = readPositiveIntegerEnv("ADMIN_RATE_LIMIT_WINDOW_MS", 10 * 60 * 1000);
const adminRateLimitMaxRequests = readPositiveIntegerEnv("ADMIN_RATE_LIMIT_MAX", 20);

const getAdminRateLimitRetryAfter = createInMemoryRateLimiter({
  storeKey: "admin-api",
  windowMs: adminRateLimitWindowMs,
  maxRequests: adminRateLimitMaxRequests,
});

export function enforceAdminRateLimit(req: Request): NextResponse | null {
  const retryAfter = getAdminRateLimitRetryAfter(req);
  if (retryAfter === null) return null;

  return NextResponse.json(
    {
      message: "Too many admin requests. Please wait a few minutes and try again.",
    },
    {
      status: 429,
      headers: {
        "retry-after": String(retryAfter),
      },
    },
  );
}
