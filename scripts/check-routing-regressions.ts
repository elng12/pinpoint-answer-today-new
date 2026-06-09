import assert from "node:assert/strict";
import { generateStaticParams as generateDetailStaticParams } from "../app/(detail)/linkedin-pinpoint-answers/[slug]/page";
import nextConfig from "../next.config";
import { middleware } from "../middleware";
import { NextRequest } from "next/server";
import { GET as getTrafficAdviceRoute } from "../app/.well-known/traffic-advice/route";
import { getAllDetailSlugs } from "../lib/puzzles/data";
import {
  getLegacyConnectorRedirectSlug,
  getLegacyThemeOrConnectorRedirectSlug,
  getLegacyThemeRedirectSlug,
} from "../lib/puzzles/data/legacy-redirects";

type RedirectRule = {
  source: string;
  destination: string;
  permanent?: boolean;
};

type HeaderRule = {
  source: string;
  headers: Array<{ key: string; value: string }>;
};

async function getRedirectRules(): Promise<RedirectRule[]> {
  const redirects = nextConfig.redirects;
  assert.equal(typeof redirects, "function", "next.config.ts must expose redirects()");
  if (!redirects) {
    throw new Error("next.config.ts redirects() is unavailable");
  }
  const rules = await redirects();
  assert.ok(Array.isArray(rules), "redirects() must return an array");
  return rules as RedirectRule[];
}

async function getHeaderRules(): Promise<HeaderRule[]> {
  const headers = nextConfig.headers;
  assert.equal(typeof headers, "function", "next.config.ts must expose headers()");
  if (!headers) {
    throw new Error("next.config.ts headers() is unavailable");
  }
  const rules = await headers();
  assert.ok(Array.isArray(rules), "headers() must return an array");
  return rules as HeaderRule[];
}

function assertRedirectRule(
  rules: RedirectRule[],
  source: string,
  destination: string,
  permanent = true,
) {
  const rule = rules.find((entry) => entry.source === source);
  assert.ok(rule, `missing redirect rule for ${source}`);
  assert.equal(rule.destination, destination, `${source} should redirect to ${destination}`);
  assert.equal(rule.permanent, permanent, `${source} should preserve permanent=${String(permanent)}`);
}

function assertNoRedirectRule(rules: RedirectRule[], source: string) {
  const rule = rules.find((entry) => entry.source === source);
  assert.equal(rule, undefined, `${source} should not be handled by next.config.ts redirects`);
}

function assertHeaderRule(
  rules: HeaderRule[],
  source: string,
  key: string,
  value: string,
) {
  const rule = rules.find((entry) => entry.source === source);
  assert.ok(rule, `missing header rule for ${source}`);

  const header = rule.headers.find((entry) => entry.key.toLowerCase() === key.toLowerCase());
  assert.ok(header, `${source} should publish ${key}`);
  assert.equal(header.value, value, `${source} should keep its ${key} policy`);
}

function assertMiddlewareRedirect(inputUrl: string, expectedLocation: string) {
  const response = middleware(new NextRequest(inputUrl));
  assert.equal(response.status, 308, `${inputUrl} should issue a 308 redirect`);
  assert.equal(response.headers.get("location"), expectedLocation, `${inputUrl} redirected to an unexpected URL`);
}

function assertMiddlewarePassThrough(inputUrl: string, headers?: Record<string, string>) {
  const response = middleware(new NextRequest(inputUrl, { headers }));
  assert.equal(response.status, 200, `${inputUrl} should pass through middleware`);
  assert.equal(response.headers.get("x-middleware-next"), "1", `${inputUrl} should keep x-middleware-next`);
  assert.equal(response.headers.get("location"), null, `${inputUrl} should not emit a Location header`);
}

async function checkRedirectConfig() {
  const rules = await getRedirectRules();
  const seenSources = new Set<string>();
  for (const rule of rules) {
    assert.ok(!seenSources.has(rule.source), `duplicate redirect source in next.config.ts: ${rule.source}`);
    seenSources.add(rule.source);
  }
  assert.ok(
    rules.length <= 256,
    `next.config.ts redirects should stay compact and avoid per-puzzle expansion; found ${rules.length}`,
  );

  assertRedirectRule(rules, "/en", "/");
  assertNoRedirectRule(rules, "/pt-BR/linkedin-pinpoint-answers/:slug");
  assertNoRedirectRule(rules, "/de/linkedin-pinpoint-answers/:slug/opengraph-image");
  assertNoRedirectRule(rules, "/en/puzzles");
  assertNoRedirectRule(rules, "/fr/puzzles/:number(\\d+)");
  assertNoRedirectRule(rules, "/de/pinpoint/:date(\\d{4}-\\d{2}-\\d{2})");
  assertRedirectRule(rules, "/en/linkedin-pinpoint", "/linkedin-pinpoint-answers");
  assertRedirectRule(rules, "/de/linkedin-pinpoint-answer", "/linkedin-pinpoint-answers");
  assertRedirectRule(rules, "/puzzles/connectors", "/linkedin-pinpoint-answers");
  assertRedirectRule(rules, "/sitemaps/pt-BR.xml", "/sitemap.xml");
  assertRedirectRule(rules, "/feedback", "/contact-us");
  assertRedirectRule(rules, "/linkedin-pinpoint", "/linkedin-pinpoint-answers");
  assertRedirectRule(rules, "/linkedin-pinpoint-answer", "/linkedin-pinpoint-answers");
  assertNoRedirectRule(rules, "/opengraph-image");
  assertNoRedirectRule(rules, "/linkedin-pinpoint-answers/:slug/opengraph-image");
  assertNoRedirectRule(rules, "/pinpoint-answer-:number(\\d+)");
  assertNoRedirectRule(rules, "/linkedin-pinpoint/:number(\\d+)");
  assertNoRedirectRule(rules, "/linkedin-pinpoint-answer/pinpoint-:number(\\d+)");
  assertNoRedirectRule(rules, "/puzzles/pinpoint-answer-:number(\\d+)");
  assertNoRedirectRule(rules, "/fr/puzzles/pinpoint-answer-:number(\\d+)");
  assertNoRedirectRule(rules, "/fr/linkedin-pinpoint-answer/pinpoint-:number(\\d+)");
  assertNoRedirectRule(rules, "/fr/pinpoint/:number(\\d+)-analysis");
  assertNoRedirectRule(rules, "/fr/pinpoint-answer-:number(\\d+)");
  assertNoRedirectRule(rules, "/pinpoint-answer-725");
  assertNoRedirectRule(rules, "/linkedin-pinpoint/725");
  assertNoRedirectRule(rules, "/puzzles/pinpoint-answer-725");
  assertNoRedirectRule(rules, "/fr/puzzles/themes/:slug");
  assertNoRedirectRule(rules, "/fr/puzzles/connectors/:slug");
  assertNoRedirectRule(rules, "/fr/puzzles/connector/:slug");
  assertNoRedirectRule(rules, "/puzzles/themes/types-of-dances");
  assertNoRedirectRule(rules, "/puzzles/connectors/course");

  console.log("ok: next.config.ts preserves key locale and legacy redirect rules");
}

async function checkHeaderConfig() {
  const rules = await getHeaderRules();
  assertHeaderRule(
    rules,
    "/api/:path*",
    "X-Robots-Tag",
    "noindex, nofollow, noarchive",
  );
  assertHeaderRule(
    rules,
    "/_next/static/:path*",
    "X-Robots-Tag",
    "noindex, noarchive",
  );
  assertHeaderRule(
    rules,
    "/:locale(en|pt-BR|fr|de)/:path*",
    "X-Robots-Tag",
    "noindex, follow, noarchive",
  );
  assertHeaderRule(
    rules,
    "/:locale(en|pt-BR|fr|de)",
    "X-Robots-Tag",
    "noindex, follow, noarchive",
  );
  assertHeaderRule(
    rules,
    "/pinpoint/:value",
    "X-Robots-Tag",
    "noindex, follow, noarchive",
  );
  assertHeaderRule(
    rules,
    "/og-image.png",
    "X-Robots-Tag",
    "noindex, follow, noarchive",
  );
  assertHeaderRule(
    rules,
    "/linkedin-pinpoint-answers/:slug/opengraph-image",
    "X-Robots-Tag",
    "noindex, follow, noarchive",
  );

  const previewRule = rules.find((entry) => entry.source === "/next-pinpoint-preview");
  assert.equal(
    previewRule,
    undefined,
    "preview page should not force an X-Robots-Tag override that conflicts with page metadata",
  );

  console.log("ok: next.config.ts keeps API noindex headers without overriding the preview page");
}

function checkMiddlewareCanonicalization() {
  assertMiddlewarePassThrough("https://pinpointanswertoday.app/");
  assertMiddlewarePassThrough("https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-536/");
  assertMiddlewarePassThrough("https://pinpointanswertoday.app/favicon/favicon.ico");
  assertMiddlewarePassThrough("https://pinpointanswertoday.app/linkedin-pinpoint-answers?q=boots");

  assertMiddlewareRedirect(
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-536",
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-536/",
  );
  assertMiddlewareRedirect("https://pinpointanswertoday.app/puzzles/", "https://pinpointanswertoday.app/linkedin-pinpoint-answers");
  assertMiddlewareRedirect(
    "https://www.pinpointanswertoday.app/puzzles/",
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers",
  );
  assertMiddlewareRedirect(
    "https://www.pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-536",
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-536/",
  );
  assertMiddlewareRedirect(
    "https://pinpointanswertoday.app/fr/linkedin-pinpoint-answers/pinpoint-answer-536",
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-536/",
  );
  assertMiddlewareRedirect(
    "https://pinpointanswertoday.app/de/pinpoint-answer-583",
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-583/",
  );
  assertMiddlewareRedirect(
    "https://pinpointanswertoday.app/fr/puzzles/583",
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-583/",
  );
  assertMiddlewareRedirect(
    "https://pinpointanswertoday.app/fr/puzzles/pinpoint-answer-583",
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-583/",
  );
  assertMiddlewareRedirect(
    "https://pinpointanswertoday.app/en/puzzles/linkedin-pinpoint-answer-552",
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-552/",
  );
  assertMiddlewareRedirect(
    "https://pinpointanswertoday.app/en/puzzles/linkedin-pinpoint-answer-232",
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers",
  );
  assertMiddlewareRedirect(
    "https://pinpointanswertoday.app/linkedin-pinpoint-answer/pinpoint-583",
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-583/",
  );
  assertMiddlewareRedirect(
    "https://pinpointanswertoday.app/linkedin-pinpoint/583",
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-583/",
  );
  assertMiddlewareRedirect(
    "https://pinpointanswertoday.app/fr/pinpoint/2025-12-04",
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-583/",
  );
  assertMiddlewareRedirect(
    "https://pinpointanswertoday.app/pinpoint/2025-11-01",
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-550/",
  );
  assertMiddlewareRedirect(
    "https://pinpointanswertoday.app/puzzles?theme=words%20with%20double%20vowels%20in%20the%20center",
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers",
  );
  assertMiddlewareRedirect(
    "https://pinpointanswertoday.app/puzzles?q=boots&theme=old",
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers?q=boots",
  );
  assertMiddlewareRedirect(
    "https://pinpointanswertoday.app/en/puzzles?difficulty=3",
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers",
  );
  assertMiddlewareRedirect(
    "https://pinpointanswertoday.app/pt-BR/puzzles?q=boots&difficulty=3",
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers?q=boots",
  );
  assertMiddlewareRedirect(
    "https://pinpointanswertoday.app/puzzles/themes/types-of-dances",
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-474/",
  );
  assertMiddlewareRedirect(
    "https://pinpointanswertoday.app/fr/puzzles/themes/things-you-d-find-at-a-doctor-s-office",
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-495/",
  );
  assertMiddlewareRedirect(
    "https://pinpointanswertoday.app/de/puzzles/themes/coat",
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-560/",
  );
  assertMiddlewareRedirect(
    "https://pinpointanswertoday.app/en/puzzles/connectors/coat",
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-560/",
  );
  assertMiddlewareRedirect(
    "https://pinpointanswertoday.app/pt-BR/puzzles/connector/coat",
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-560/",
  );
  assertMiddlewareRedirect(
    "https://pinpointanswertoday.app/fr/puzzles/themes/definitely-not-a-real-legacy-slug",
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers",
  );
  assertMiddlewareRedirect(
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-712/opengraph-image",
    "https://pinpointanswertoday.app/og-image.png",
  );
  assertMiddlewareRedirect(
    "https://pinpointanswertoday.app/opengraph-image",
    "https://pinpointanswertoday.app/og-image.png",
  );
  assertMiddlewareRedirect(
    "https://www.pinpointanswertoday.app/fr/puzzles/connectors/coat",
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-560/",
  );

  console.log("ok: middleware preserves canonical slash and host normalization");
}

async function checkLegacyFamilyRedirectLookup() {
  assert.equal(
    await getLegacyThemeRedirectSlug("things-you-d-find-at-a-doctor-s-office"),
    "pinpoint-answer-495",
    "legacy theme slugs should still resolve when apostrophes were flattened into dash-separated slugs",
  );
  assert.equal(
    await getLegacyThemeOrConnectorRedirectSlug("coat"),
    "pinpoint-answer-560",
    "legacy theme pages should fall back to connector lookups for mislabeled old links",
  );
  assert.equal(
    await getLegacyConnectorRedirectSlug("coat"),
    "pinpoint-answer-560",
    "legacy connector slugs should keep resolving to canonical detail pages",
  );

  console.log("ok: legacy family lookups handle apostrophe slugs and theme-to-connector fallback");
}

function checkDetailStaticParamsCoverAllPublicSlugs() {
  const expectedSlugs = getAllDetailSlugs();
  const staticParams = generateDetailStaticParams();
  const actualSlugs = staticParams.map((param) => param.slug);

  assert.ok(
    expectedSlugs.length > 50,
    "detail static params guardrail should cover the full archive, not only a recent subset",
  );
  assert.deepEqual(
    actualSlugs,
    expectedSlugs,
    "detail generateStaticParams() should pre-render every public detail slug",
  );

  console.log("ok: detail static params cover every public detail slug");
}

async function checkTrafficAdviceRoute() {
  const response = await getTrafficAdviceRoute();

  assert.equal(response.status, 200, "traffic advice endpoint should return 200");
  assert.equal(
    response.headers.get("content-type"),
    "application/trafficadvice+json; charset=utf-8",
    "traffic advice endpoint should use the registered media type",
  );
  assert.equal(
    response.headers.get("cache-control"),
    "public, max-age=1800, must-revalidate",
    "traffic advice endpoint should publish a short-lived cache policy",
  );
  assert.equal(await response.text(), "[]", "traffic advice endpoint should return an empty advice list");

  console.log("ok: traffic advice well-known endpoint returns a valid empty policy");
}

async function main() {
  await checkRedirectConfig();
  await checkHeaderConfig();
  checkMiddlewareCanonicalization();
  await checkLegacyFamilyRedirectLookup();
  checkDetailStaticParamsCoverAllPublicSlugs();
  await checkTrafficAdviceRoute();
  console.log("Pinpoint routing regression passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
