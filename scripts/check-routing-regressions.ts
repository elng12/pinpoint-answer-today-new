import assert from "node:assert/strict";
import nextConfig from "../next.config";
import { middleware } from "../middleware";
import { NextRequest } from "next/server";

type RedirectRule = {
  source: string;
  destination: string;
  permanent?: boolean;
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

  assertRedirectRule(rules, "/en", "/");
  assertRedirectRule(
    rules,
    "/pt-BR/linkedin-pinpoint-answers/:slug",
    "/linkedin-pinpoint-answers/:slug/",
  );
  assertRedirectRule(
    rules,
    "/de/linkedin-pinpoint-answers/:slug/opengraph-image",
    "/linkedin-pinpoint-answers/:slug/opengraph-image",
  );
  assertRedirectRule(rules, "/fr/puzzles/:number(\\d+)", "/linkedin-pinpoint-answers/pinpoint-answer-:number/");
  assertRedirectRule(rules, "/de/pinpoint/:date(\\d{4}-\\d{2}-\\d{2})", "/pinpoint/:date");
  assertRedirectRule(rules, "/en/linkedin-pinpoint", "/puzzles");
  assertRedirectRule(rules, "/puzzles/connectors", "/puzzles");
  assertRedirectRule(rules, "/feedback", "/contact-us");
  assertRedirectRule(rules, "/linkedin-pinpoint", "/puzzles");
  assertRedirectRule(rules, "/pinpoint-answer-:number(\\d+)", "/linkedin-pinpoint-answers/pinpoint-answer-:number/");

  console.log("ok: next.config.ts preserves key locale and legacy redirect rules");
}

function checkMiddlewareCanonicalization() {
  assertMiddlewarePassThrough("https://pinpointanswertoday.app/");
  assertMiddlewarePassThrough("https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-536/");
  assertMiddlewarePassThrough("https://pinpointanswertoday.app/favicon/favicon.ico");

  assertMiddlewareRedirect(
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-536",
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-536/",
  );
  assertMiddlewareRedirect("https://pinpointanswertoday.app/puzzles/", "https://pinpointanswertoday.app/puzzles");
  assertMiddlewareRedirect(
    "https://www.pinpointanswertoday.app/puzzles/",
    "https://pinpointanswertoday.app/puzzles",
  );
  assertMiddlewareRedirect(
    "https://www.pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-536",
    "https://pinpointanswertoday.app/linkedin-pinpoint-answers/pinpoint-answer-536/",
  );

  console.log("ok: middleware preserves canonical slash and host normalization");
}

async function main() {
  await checkRedirectConfig();
  checkMiddlewareCanonicalization();
  console.log("Pinpoint routing regression passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
