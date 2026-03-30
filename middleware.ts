import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const DETAIL_WITHOUT_SLASH = /^\/linkedin-pinpoint-answers\/[^/]+$/;
const DETAIL_WITH_SLASH = /^\/linkedin-pinpoint-answers\/[^/]+\/$/;
const PUBLIC_FILE = /\.[^/]+$/;
const WWW_HOST = "www.pinpointanswertoday.app";
const APEX_HOST = "pinpointanswertoday.app";

// Canonical URL policy:
// - Always normalize www -> apex host.
// - Detail pages keep a trailing slash (SEO + stable relative asset paths).
// - Everything else removes the trailing slash.
function normalizePathForCanonical(pathname: string): string {
  if (pathname === "/") {
    return pathname;
  }

  if (DETAIL_WITHOUT_SLASH.test(pathname)) {
    return `${pathname}/`;
  }

  if (DETAIL_WITH_SLASH.test(pathname)) {
    return pathname;
  }

  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function getRequestHostname(request: NextRequest, currentUrl: URL): string {
  return (request.headers.get("x-forwarded-host")
    ?? request.headers.get("host")
    ?? currentUrl.hostname)
    .replace(/:\d+$/, "");
}

function shouldBypassCanonicalization(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    PUBLIC_FILE.test(pathname)
  );
}

export function middleware(request: NextRequest) {
  const currentUrl = new URL(request.url);
  const { pathname } = currentUrl;
  const hostname = getRequestHostname(request, currentUrl);

  if (hostname === WWW_HOST) {
    const url = new URL(request.url);
    url.hostname = APEX_HOST;
    url.pathname = normalizePathForCanonical(pathname);
    return NextResponse.redirect(url, 308);
  }

  if (shouldBypassCanonicalization(pathname)) {
    return NextResponse.next();
  }

  const canonicalPathname = normalizePathForCanonical(pathname);
  if (canonicalPathname !== pathname) {
    const url = new URL(request.url);
    url.pathname = canonicalPathname;
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
