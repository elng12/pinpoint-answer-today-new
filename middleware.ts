import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const DETAIL_WITHOUT_SLASH = /^\/linkedin-pinpoint-answers\/[^/]+$/;
const DETAIL_WITH_SLASH = /^\/linkedin-pinpoint-answers\/[^/]+\/$/;
const PUBLIC_FILE = /\.[^/]+$/;

export function middleware(request: NextRequest) {
  const currentUrl = new URL(request.url);
  const { pathname } = currentUrl;

  if (
    pathname === "/" ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  if (DETAIL_WITHOUT_SLASH.test(pathname)) {
    const url = new URL(request.url);
    url.pathname = `${pathname}/`;
    return Response.redirect(url, 308);
  }

  if (DETAIL_WITH_SLASH.test(pathname)) {
    return NextResponse.next();
  }

  if (pathname.endsWith("/")) {
    const url = new URL(request.url);
    url.pathname = pathname.slice(0, -1);
    return Response.redirect(url, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
