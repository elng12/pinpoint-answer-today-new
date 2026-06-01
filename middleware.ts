import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import registryJson from "./data/puzzles/registry.json";
import {
  buildLegacyFamilyRedirectIndex,
  getLegacyResolvedSlug,
  resolveLegacyConnectorRedirect,
  resolveLegacyThemeOrConnectorRedirect,
} from "./lib/puzzles/data/legacy-redirect-index";

const DETAIL_WITHOUT_SLASH = /^\/linkedin-pinpoint-answers\/[^/]+$/;
const DETAIL_WITH_SLASH = /^\/linkedin-pinpoint-answers\/[^/]+\/$/;
const SOCIAL_IMAGE_PATHS =
  /^\/(?:(?:en|pt-BR|fr|de)\/)?(?:linkedin-pinpoint-answers\/[^/]+\/opengraph-image|opengraph-image)\/?$/;
const ARCHIVE_PATH = /^\/(?:(?:en|pt-BR|fr|de)\/)?puzzles\/?$/;
const LOCALE_DETAIL_PATH = /^\/(?:en|pt-BR|fr|de)\/linkedin-pinpoint-answers\/([^/]+)\/?$/;
const LEGACY_NUMBER_ALIAS_PATHS = [
  /^\/(?:(?:en|pt-BR|fr|de)\/)?puzzles\/(\d+)\/?$/,
  /^\/(?:(?:en|pt-BR|fr|de)\/)?puzzles\/pinpoint-answer-(\d+)\/?$/,
  /^\/(?:(?:en|pt-BR|fr|de)\/)?puzzles\/linkedin-pinpoint-answer-(\d+)\/?$/,
  /^\/(?:(?:en|pt-BR|fr|de)\/)?linkedin-pinpoint-answer\/pinpoint-(\d+)\/?$/,
  /^\/(?:(?:en|pt-BR|fr|de)\/)?pinpoint-answer-(\d+)\/?$/,
  /^\/(?:(?:en|pt-BR|fr|de)\/)?pinpoint\/(\d+)-analysis\/?$/,
  /^\/linkedin-pinpoint\/(\d+)\/?$/,
] as const;
const LEGACY_DATE_ALIAS_PATH = /^\/(?:(?:en|pt-BR|fr|de)\/)?pinpoint\/(\d{4}-\d{2}-\d{2})\/?$/;
const LEGACY_FAMILY_PATH =
  /^\/(?:(en|pt-BR|fr|de)\/)?puzzles\/(themes|connectors|connector)\/([^/]+)\/?$/;
const PUBLIC_FILE = /\.[^/]+$/;
const WWW_HOST = "www.pinpointanswertoday.app";
const APEX_HOST = "pinpointanswertoday.app";
const legacyFamilyRedirectIndex = buildLegacyFamilyRedirectIndex(registryJson);
const puzzleNumberToSlug = new Map(
  registryJson.map((entry) => [String(entry.puzzleNumber), entry.slug]),
);
const publishDateToSlug = new Map(
  registryJson.map((entry) => [entry.publishDate, entry.slug]),
);
const legacyRedirectRobotsHeader = "noindex, follow, noarchive";
const staticRedirectRobotsHeader = "noindex, noarchive";

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

function getArchiveSearchCanonicalUrl(currentUrl: URL): URL | null {
  if (!ARCHIVE_PATH.test(currentUrl.pathname)) {
    return null;
  }

  const canonicalSearchParams = new URLSearchParams();
  const query = currentUrl.searchParams.get("q")?.trim();
  if (query) {
    canonicalSearchParams.set("q", query);
  }

  if (currentUrl.pathname === "/puzzles" && canonicalSearchParams.toString() === currentUrl.searchParams.toString()) {
    return null;
  }

  const url = new URL(currentUrl);
  url.pathname = "/puzzles";
  const canonicalSearch = canonicalSearchParams.toString();
  url.search = canonicalSearch ? `?${canonicalSearch}` : "";
  return url;
}

function redirectWithRobots(url: URL, robotsHeader = legacyRedirectRobotsHeader): NextResponse {
  const response = NextResponse.redirect(url, 308);
  response.headers.set("X-Robots-Tag", robotsHeader);
  return response;
}

function resolveLegacyFamilyCanonicalPath(pathname: string): string | null {
  const match = LEGACY_FAMILY_PATH.exec(pathname);
  if (!match) {
    return null;
  }

  const [, , family, legacySlug] = match;
  const resolution =
    family === "themes"
      ? resolveLegacyThemeOrConnectorRedirect(legacyFamilyRedirectIndex, legacySlug)
      : resolveLegacyConnectorRedirect(legacyFamilyRedirectIndex, legacySlug);
  const detailSlug = getLegacyResolvedSlug(resolution);

  if (detailSlug) {
    return `/linkedin-pinpoint-answers/${detailSlug}/`;
  }

  return "/puzzles";
}

function resolveLegacyAliasCanonicalPath(pathname: string): string | null {
  const detailMatch = LOCALE_DETAIL_PATH.exec(pathname);
  if (detailMatch?.[1]) {
    return `/linkedin-pinpoint-answers/${detailMatch[1]}/`;
  }

  for (const pattern of LEGACY_NUMBER_ALIAS_PATHS) {
    const match = pattern.exec(pathname);
    const puzzleNumber = match?.[1];
    if (!puzzleNumber) {
      continue;
    }

    const slug = puzzleNumberToSlug.get(puzzleNumber);
    return slug ? `/linkedin-pinpoint-answers/${slug}/` : "/puzzles";
  }

  const dateMatch = LEGACY_DATE_ALIAS_PATH.exec(pathname);
  if (dateMatch?.[1]) {
    const slug = publishDateToSlug.get(dateMatch[1]);
    return slug ? `/linkedin-pinpoint-answers/${slug}/` : null;
  }

  return null;
}

function resolveSocialImageCanonicalPath(pathname: string): string | null {
  return SOCIAL_IMAGE_PATHS.test(pathname) ? "/og-image.png" : null;
}

export function middleware(request: NextRequest) {
  const currentUrl = new URL(request.url);
  const { pathname } = currentUrl;
  const hostname = getRequestHostname(request, currentUrl);
  const socialImageCanonicalPath = resolveSocialImageCanonicalPath(pathname);
  const legacyFamilyCanonicalPath = resolveLegacyFamilyCanonicalPath(pathname);
  const legacyAliasCanonicalPath = resolveLegacyAliasCanonicalPath(pathname);
  const archiveSearchCanonicalUrl = getArchiveSearchCanonicalUrl(currentUrl);

  if (
    hostname === WWW_HOST
    || socialImageCanonicalPath
    || legacyFamilyCanonicalPath
    || legacyAliasCanonicalPath
    || archiveSearchCanonicalUrl
  ) {
    const url = archiveSearchCanonicalUrl ?? new URL(request.url);
    if (hostname === WWW_HOST) {
      url.hostname = APEX_HOST;
    }
    url.pathname = normalizePathForCanonical(
      socialImageCanonicalPath
        ?? legacyFamilyCanonicalPath
        ?? legacyAliasCanonicalPath
        ?? url.pathname,
    );
    return redirectWithRobots(
      url,
      socialImageCanonicalPath ? staticRedirectRobotsHeader : legacyRedirectRobotsHeader,
    );
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
  /*
   * Match all request paths except:
   * - _next (static assets, image optimization)
   * - api (API routes — already bypassed by shouldBypassCanonicalization)
   * - static files (any path with a file extension)
   */
  matcher: "/((?!_next|api|.*\\.[a-z0-9]+$).*)",
};
