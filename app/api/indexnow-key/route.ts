import { NextResponse } from "next/server";

/**
 * Serves the IndexNow key file for domain verification.
 * IndexNow requires this endpoint to validate site ownership.
 *
 * Set INDEXNOW_KEY in environment variables.
 * Then verify at: https://www.bing.com/indexnow
 */
export function GET() {
  const key = process.env.INDEXNOW_KEY ?? "";

  if (!key) {
    return new NextResponse("Not configured", { status: 404 });
  }

  return new NextResponse(key, {
    headers: { "Content-Type": "text/plain" },
  });
}
