import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { normalizeGeneratedPuzzleContent } from "../lib/puzzle-generation";
import {
  validateDraftLanguage,
  validateDraftStructure,
} from "../lib/puzzles/draft-validator";
import { validateContentContract } from "../lib/puzzles/content-contract";
import { validateEvidenceContract } from "../lib/puzzles/evidence-contract";
import { collectSemanticLintIssues } from "../lib/puzzles/semantic-lint";
import {
  buildLightweightPublishFailureSummary,
  updateLightweightPublishFailureStreak,
} from "../lib/puzzles/publish-failure-summary.shared.mjs";
import { validatePublishEligibility } from "../lib/puzzles/publish-eligibility.shared.mjs";
import { validatePinpointEvidenceV1 } from "../lib/puzzles/pinpoint-evidence-v1.shared.mjs";
import { validateReleaseOverrideDryRun } from "../lib/puzzles/release-override.shared.mjs";
import { decidePinpointReleaseQueueAction } from "../lib/puzzles/release-queue-policy.shared.mjs";
import {
  repairSolutionNarrative,
  shouldRepairSolutionNarrative,
} from "../lib/puzzles/solution-narrative-repair";
import { resolveWorkerFetchRoute } from "../worker/src/routes/dispatch";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const CANDIDATE_BRANCH_PREFIX = "pinpoint/candidate/";
const GUARDRAIL_ADMIN_TOKEN = process.env.DEV_ADMIN_TOKEN || "guardrail-local-admin-token";
const OFFICIAL_SITE_HOST = "pinpointanswertoday.app";
const COMPETITOR_SITE_HOST = "pinpointanswer.today";
process.env.DEV_ADMIN_TOKEN = GUARDRAIL_ADMIN_TOKEN;

type RegistryEntry = {
  puzzleNumber: number;
  slug: string;
  publishDate: string;
  status: string;
  detailState?: string;
};

function addUtcDays(isoDate: string, days: number): string {
  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

async function readLiveRegistryEntry(): Promise<RegistryEntry> {
  const raw = await readFile(resolve(ROOT, "data", "puzzles", "registry.json"), "utf8");
  const registry = JSON.parse(raw) as RegistryEntry[];
  const liveEntry = registry.find((entry) => {
    if (entry.status !== "live" && entry.status !== "archived") return false;
    const detailState = entry.detailState || "published";
    return detailState === "published" || detailState === "fallback_full";
  });
  assert.ok(liveEntry, "registry.json must contain one public puzzle");
  return liveEntry;
}

async function readProjectFile(relativePath: string): Promise<string> {
  return readFile(resolve(ROOT, relativePath), "utf8");
}

async function checkOfficialDomainGuardrail() {
  const officialRuntimeFiles = [
    {
      path: "middleware.ts",
      required: [OFFICIAL_SITE_HOST, `www.${OFFICIAL_SITE_HOST}`],
    },
    {
      path: "app/api/revalidate/route.ts",
      required: [`https://${OFFICIAL_SITE_HOST}`],
    },
    {
      path: "scripts/release-production.mjs",
      required: [`https://${OFFICIAL_SITE_HOST}`],
    },
    {
      path: "scripts/gsc-pinpoint.mjs",
      required: [`sc-domain:${OFFICIAL_SITE_HOST}`, `https://${OFFICIAL_SITE_HOST}`],
    },
    {
      path: "worker/src/index.ts",
      required: [`https://${OFFICIAL_SITE_HOST}`],
    },
    {
      path: "worker/wrangler.toml",
      required: [
        `https://${OFFICIAL_SITE_HOST}/api/fallback/worker-pinpoint`,
        `NEW_SITE_URL                = "https://${OFFICIAL_SITE_HOST}"`,
      ],
    },
    {
      path: "lib/site/config.ts",
      required: [`support@${OFFICIAL_SITE_HOST}`, `${OFFICIAL_SITE_HOST}/contact-us`],
    },
  ];

  for (const file of officialRuntimeFiles) {
    const source = await readProjectFile(file.path);
    for (const requiredText of file.required) {
      assert.ok(source.includes(requiredText), `${file.path} must use official domain ${requiredText}`);
    }
    assert.ok(
      !source.includes(COMPETITOR_SITE_HOST),
      `${file.path} must not use competitor domain ${COMPETITOR_SITE_HOST} as a runtime site default`,
    );
  }

  const workerFallbackSource = await readProjectFile("lib/puzzles/worker-fallback.ts");
  assert.ok(
    workerFallbackSource.includes(`const DEFAULT_COMPETITOR_URL = "https://${COMPETITOR_SITE_HOST}/";`) &&
      workerFallbackSource.includes(`allowedHosts: ["${COMPETITOR_SITE_HOST}"]`),
    "competitor fallback may reference pinpointanswer.today only as the competitor source",
  );

  console.log("ok: official domain guardrail keeps runtime defaults on pinpointanswertoday.app");
}

async function withMockWorkerHealth<T>(
  payload: unknown,
  callback: (url: string) => Promise<T>,
): Promise<T> {
  const body = JSON.stringify(payload);
  const server = createServer((request, response) => {
    if (request.url !== "/health") {
      response.writeHead(404).end("not found");
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(body);
  });

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.listen(0, "127.0.0.1", () => resolvePromise());
    server.once("error", rejectPromise);
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string", "mock worker server should expose a TCP port");
  const url = `http://127.0.0.1:${address.port}/health`;

  try {
    return await callback(url);
  } finally {
    await new Promise<void>((resolvePromise, rejectPromise) => {
      server.close((error) => {
        if (error) {
          rejectPromise(error);
          return;
        }
        resolvePromise();
      });
    });
  }
}

async function withMockPuzzleDataSource<T>(
  payload: {
    registry: unknown;
    details: Record<string, unknown>;
  },
  callback: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (url.pathname === "/data/puzzles/registry.json") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(payload.registry));
      return;
    }

    const detailMatch = url.pathname.match(/^\/data\/puzzles\/(.+)\.json$/);
    if (detailMatch) {
      const detailPayload = payload.details[detailMatch[1] ?? ""];
      if (detailPayload) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(detailPayload));
        return;
      }
    }

    response.writeHead(404).end("not found");
  });

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.listen(0, "127.0.0.1", () => resolvePromise());
    server.once("error", rejectPromise);
  });

  const address = server.address();
  assert.ok(
    address && typeof address !== "string",
    "mock puzzle data server should expose a TCP port",
  );
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    return await callback(baseUrl);
  } finally {
    await new Promise<void>((resolvePromise, rejectPromise) => {
      server.close((error) => {
        if (error) {
          rejectPromise(error);
          return;
        }
        resolvePromise();
      });
    });
  }
}

async function checkPublishedSummaryRoute() {
  const liveEntry = await readLiveRegistryEntry();
  const unpublishedWorkerDate = addUtcDays(liveEntry.publishDate, 1);
  const previousWorkerHealthUrl = process.env.PINPOINT_WORKER_HEALTH_URL;

  await withMockWorkerHealth(
    {
      puzzleDate: unpublishedWorkerDate,
      fetchedAt: `${unpublishedWorkerDate}T08:01:00.000Z`,
      answers: [
        { rank: 1, word: "Mock One" },
        { rank: 2, word: "Mock Two" },
        { rank: 3, word: "Mock Three" },
        { rank: 4, word: "Mock Four" },
        { rank: 5, word: "Mock Five" },
      ],
      mainAnswer: "Things associated with mock city",
    },
    async (mockWorkerHealthUrl) => {
      process.env.PINPOINT_WORKER_HEALTH_URL = mockWorkerHealthUrl;

      const dataModulePath = "../lib/puzzles/data.ts";
      const routeModulePath = "../app/api/puzzles/summary/route.ts";
      const dataModule = (await import(dataModulePath)) as {
        getCurrentPuzzle: (options?: { allowLiveWorkerFallback?: boolean }) => Promise<{
          isoDate: string;
          slug: string;
        }>;
      };
      const routeModule = (await import(routeModulePath)) as {
        GET: () => Promise<Response>;
      };

      const currentPublic = await dataModule.getCurrentPuzzle();
      assert.equal(
        currentPublic.slug,
        liveEntry.slug,
        "default published lookup should stay pinned to the registry live slug",
      );

      const currentWithFallback = await dataModule.getCurrentPuzzle({ allowLiveWorkerFallback: true });
      assert.equal(
        currentWithFallback.isoDate,
        unpublishedWorkerDate,
        "explicit live fallback lookup should still be able to pick up the worker payload",
      );

      const currentPublished = await dataModule.getCurrentPuzzle({ allowLiveWorkerFallback: false });
      assert.equal(
        currentPublished.slug,
        liveEntry.slug,
        "published-only lookup should stay pinned to the registry live slug",
      );

      const response = await routeModule.GET();
      assert.equal(response.status, 200, "/api/puzzles/summary should return 200");

      const payload = (await response.json()) as {
        latest?: {
          puzzleNumber?: number;
          slug?: string;
          isoPublishedAt?: string;
          status?: string;
        };
      };

      assert.equal(
        payload.latest?.puzzleNumber,
        liveEntry.puzzleNumber,
        "summary route should expose the published registry puzzle number",
      );
      assert.equal(
        payload.latest?.slug,
        liveEntry.slug,
        "summary route should expose the published registry slug",
      );
      assert.equal(
        payload.latest?.isoPublishedAt,
        `${liveEntry.publishDate}T00:00:00.000Z`,
        "summary route should expose the registry publish date instead of worker live fallback timing",
      );
      assert.equal(
        payload.latest?.status,
        liveEntry.status,
        "summary route should expose the published registry status",
      );
    },
  );

  if (previousWorkerHealthUrl === undefined) {
    delete process.env.PINPOINT_WORKER_HEALTH_URL;
  } else {
    process.env.PINPOINT_WORKER_HEALTH_URL = previousWorkerHealthUrl;
  }

  console.log("ok: published summary route ignores worker live fallback");
}

async function checkRevalidateRejectsUnpublishedOrLiveRequests() {
  const liveEntry = await readLiveRegistryEntry();
  const unpublishedWorkerDate = addUtcDays(liveEntry.publishDate, 1);
  const unpublishedSlug = `pinpoint-answer-${liveEntry.puzzleNumber + 1}`;
  const previousWorkerHealthUrl = process.env.PINPOINT_WORKER_HEALTH_URL;
  const previousRevalidateSecret = process.env.REVALIDATE_SECRET;

  await withMockWorkerHealth(
    {
      puzzleDate: unpublishedWorkerDate,
      fetchedAt: `${unpublishedWorkerDate}T08:01:00.000Z`,
      answers: [
        { rank: 1, word: "Mock One" },
        { rank: 2, word: "Mock Two" },
        { rank: 3, word: "Mock Three" },
        { rank: 4, word: "Mock Four" },
        { rank: 5, word: "Mock Five" },
      ],
      mainAnswer: "Things associated with mock city",
    },
    async (mockWorkerHealthUrl) => {
      process.env.PINPOINT_WORKER_HEALTH_URL = mockWorkerHealthUrl;
      process.env.REVALIDATE_SECRET = "guardrail-secret";

      const routeModulePath = `../app/api/revalidate/route.ts?revalidate-guardrail=${Date.now()}`;
      const routeModule = (await import(routeModulePath)) as {
        POST: (request: NextRequest) => Promise<Response>;
      };

      const liveModeRequest = new NextRequest(
        `http://localhost/api/revalidate?slug=${liveEntry.slug}&mode=live`,
        {
          method: "POST",
          headers: { "x-revalidate-secret": "guardrail-secret" },
        },
      );
      const liveModeResponse = await routeModule.POST(liveModeRequest);
      assert.equal(liveModeResponse.status, 409, "live-mode revalidate requests should be rejected");

      const unpublishedRequest = new NextRequest(
        `http://localhost/api/revalidate?slug=${unpublishedSlug}`,
        {
          method: "POST",
          headers: { "x-revalidate-secret": "guardrail-secret" },
        },
      );
      const unpublishedResponse = await routeModule.POST(unpublishedRequest);
      assert.equal(
        unpublishedResponse.status,
        409,
        "revalidate should reject unpublished slugs even when worker live fallback has them",
      );
    },
  );

  if (previousWorkerHealthUrl === undefined) {
    delete process.env.PINPOINT_WORKER_HEALTH_URL;
  } else {
    process.env.PINPOINT_WORKER_HEALTH_URL = previousWorkerHealthUrl;
  }

  if (previousRevalidateSecret === undefined) {
    delete process.env.REVALIDATE_SECRET;
  } else {
    process.env.REVALIDATE_SECRET = previousRevalidateSecret;
  }

  console.log("ok: revalidate route rejects live-mode and unpublished-slug requests");
}

async function checkTodayRouteShowsPublishingPlaceholder() {
  const liveEntry = await readLiveRegistryEntry();
  const unpublishedWorkerDate = addUtcDays(liveEntry.publishDate, 1);
  const previousWorkerHealthUrl = process.env.PINPOINT_WORKER_HEALTH_URL;

  await withMockWorkerHealth(
    {
      puzzleDate: unpublishedWorkerDate,
      fetchedAt: `${unpublishedWorkerDate}T08:01:00.000Z`,
      answers: [
        { rank: 1, word: "Mock One" },
        { rank: 2, word: "Mock Two" },
        { rank: 3, word: "Mock Three" },
        { rank: 4, word: "Mock Four" },
        { rank: 5, word: "Mock Five" },
      ],
      mainAnswer: "Things associated with mock city",
    },
    async (mockWorkerHealthUrl) => {
      process.env.PINPOINT_WORKER_HEALTH_URL = mockWorkerHealthUrl;

      const routeModulePath = `../app/(site)/pinpoint/today/route.ts?today-guardrail=${Date.now()}`;
      const routeModule = (await import(routeModulePath)) as {
        GET: (request: NextRequest) => Promise<Response>;
      };

      const request = new NextRequest("http://localhost/pinpoint/today", {
        method: "GET",
      });
      const response = await routeModule.GET(request);
      const body = await response.text();

      assert.equal(response.status, 503, "/pinpoint/today should return 503 while the new puzzle is still publishing");
      assert.equal(response.headers.get("retry-after"), "120", "publishing placeholder should advertise retry-after");
      assert.match(
        response.headers.get("cache-control") || "",
        /no-store/i,
        "publishing placeholder should disable caching",
      );
      assert.match(body, /still publishing/i, "publishing placeholder should explain the rollout delay");
    },
  );

  if (previousWorkerHealthUrl === undefined) {
    delete process.env.PINPOINT_WORKER_HEALTH_URL;
  } else {
    process.env.PINPOINT_WORKER_HEALTH_URL = previousWorkerHealthUrl;
  }

  console.log("ok: /pinpoint/today returns a 503 publishing placeholder for unpublished worker puzzles");
}

async function checkWorkerProxyErrorsDoNotExposeInternalUrls() {
  const previousWorkerHealthUrl = process.env.PINPOINT_WORKER_HEALTH_URL;
  const internalWorkerUrl = "http://127.0.0.1:9/health";
  process.env.PINPOINT_WORKER_HEALTH_URL = internalWorkerUrl;

  try {
    const healthRouteModulePath = `../app/api/health/route.ts?proxy-error-guardrail=${Date.now()}`;
    const todayRouteModulePath = `../app/api/pinpoint/today/route.ts?proxy-error-guardrail=${Date.now()}`;
    const healthRouteModule = (await import(healthRouteModulePath)) as {
      GET: () => Promise<Response>;
    };
    const todayRouteModule = (await import(todayRouteModulePath)) as {
      GET: (request: NextRequest) => Promise<Response>;
    };

    const healthResponse = await healthRouteModule.GET();
    const todayResponse = await todayRouteModule.GET(
      new NextRequest("http://localhost/api/pinpoint/today", { method: "GET" }),
    );

    for (const [label, response] of [
      ["health", healthResponse],
      ["today", todayResponse],
    ] as const) {
      assert.equal(response.status, 503, `${label} proxy should return 503 when the worker fetch fails`);
      const body = await response.text();
      assert.doesNotMatch(body, /workers\.dev/i, `${label} proxy error must not expose workers.dev URLs`);
      assert.doesNotMatch(body, /workerHealthUrl|upstreamUrl/i, `${label} proxy error must not expose internal URL keys`);
      assert.match(body, /upstream unavailable/i, `${label} proxy error should keep a generic public message`);
    }
  } finally {
    if (previousWorkerHealthUrl === undefined) {
      delete process.env.PINPOINT_WORKER_HEALTH_URL;
    } else {
      process.env.PINPOINT_WORKER_HEALTH_URL = previousWorkerHealthUrl;
    }
  }

  console.log("ok: worker proxy errors do not expose internal URLs");
}

async function checkRemoteUrlAllowlistsRejectUnsafeHosts() {
  const env = process.env as Record<string, string | undefined>;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousGithubRawBase = process.env.GITHUB_RAW_BASE;
  const previousPinpointBaseUrl = process.env.PINPOINT_BASE_URL;
  const previousAllowLocalDataSource = process.env.PINPOINT_ALLOW_LOCAL_DATA_SOURCE;

  try {
    env.NODE_ENV = "production";
    delete env.PINPOINT_ALLOW_LOCAL_DATA_SOURCE;
    env.GITHUB_RAW_BASE = "https://githubusercontent.com.evil.test/raw";
    env.PINPOINT_BASE_URL = "https://pinpointanswer.today.evil.test/";

    const dataModulePath = `../lib/puzzles/data.ts?unsafe-url-guardrail=${Date.now()}`;
    const allowlistModulePath = `../lib/security/url-allowlist.ts?unsafe-url-guardrail=${Date.now()}`;
    const workerFallbackModulePath = `../lib/puzzles/worker-fallback.ts?unsafe-url-guardrail=${Date.now()}`;
    const dataModule = (await import(dataModulePath)) as {
      getPuzzleBySlug: (
        slug: string,
        options?: { allowLiveWorkerFallback?: boolean },
      ) => Promise<{ slug: string } | null>;
    };
    const allowlistModule = (await import(allowlistModulePath)) as {
      parseAndValidateUrl: (raw: string, rule: {
        allowedSchemes: readonly string[];
        allowedHosts?: readonly string[];
        allowedHostSuffixes?: readonly string[];
      }, label: string) => URL;
    };
    const workerFallbackModule = (await import(workerFallbackModulePath)) as {
      loadCompetitorWorkerFallback: (date?: string) => Promise<unknown>;
    };

    await assert.rejects(
      () => dataModule.getPuzzleBySlug("pinpoint-answer-695", { allowLiveWorkerFallback: false }),
      /GITHUB_RAW_BASE.*host/i,
      "unsafe GITHUB_RAW_BASE host should be rejected",
    );

    assert.throws(
      () => allowlistModule.parseAndValidateUrl(
        "https://workers.dev.evil.test/health",
        {
          allowedSchemes: ["https:"],
          allowedHosts: ["pinpoint-worker.2296744453m.workers.dev"],
          allowedHostSuffixes: [".workers.dev"],
        },
        "PINPOINT_WORKER_HEALTH_URL",
      ),
      /PINPOINT_WORKER_HEALTH_URL.*host/i,
      "unsafe worker health host should be rejected by allowlist",
    );

    assert.throws(
      () => allowlistModule.parseAndValidateUrl(
        "file:///etc/passwd",
        {
          allowedSchemes: ["https:"],
          allowedHosts: ["pinpointanswer.today"],
        },
        "PINPOINT_BASE_URL",
      ),
      /PINPOINT_BASE_URL.*scheme/i,
      "file URLs should be rejected by allowlist",
    );

    assert.throws(
      () => allowlistModule.parseAndValidateUrl(
        "https://user:password@pinpointanswer.today/",
        {
          allowedSchemes: ["https:"],
          allowedHosts: ["pinpointanswer.today"],
        },
        "PINPOINT_BASE_URL",
      ),
      /PINPOINT_BASE_URL.*credentials/i,
      "credential-bearing URLs should be rejected by allowlist",
    );

    await assert.rejects(
      () => workerFallbackModule.loadCompetitorWorkerFallback(),
      /PINPOINT_BASE_URL.*host/i,
      "unsafe competitor URL host should be rejected",
    );
  } finally {
    if (previousNodeEnv === undefined) {
      delete env.NODE_ENV;
    } else {
      env.NODE_ENV = previousNodeEnv;
    }

    if (previousGithubRawBase === undefined) {
      delete env.GITHUB_RAW_BASE;
    } else {
      env.GITHUB_RAW_BASE = previousGithubRawBase;
    }

    if (previousPinpointBaseUrl === undefined) {
      delete env.PINPOINT_BASE_URL;
    } else {
      env.PINPOINT_BASE_URL = previousPinpointBaseUrl;
    }

    if (previousAllowLocalDataSource === undefined) {
      delete env.PINPOINT_ALLOW_LOCAL_DATA_SOURCE;
    } else {
      env.PINPOINT_ALLOW_LOCAL_DATA_SOURCE = previousAllowLocalDataSource;
    }
  }

  console.log("ok: remote URL allowlists reject unsafe hosts");
}

async function checkProductionDetailUsesRemoteFirst() {
  const slug = "pinpoint-answer-695";
  const env = process.env as Record<string, string | undefined>;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousGithubRawBase = process.env.GITHUB_RAW_BASE;
  const previousAllowLocalDataSource = process.env.PINPOINT_ALLOW_LOCAL_DATA_SOURCE;
  const registry = JSON.parse(
    await readFile(resolve(ROOT, "data", "puzzles", "registry.json"), "utf8"),
  ) as unknown;
  const detail = JSON.parse(
    await readFile(resolve(ROOT, "data", "puzzles", `${slug}.json`), "utf8"),
  ) as {
    articleBlocks?: string[];
  };

  const remoteOnlyLead =
    "Remote detail payload wins in production so revalidated pages can show fresh article content.";
  const remoteDetail = {
    ...detail,
    articleBlocks: [
      remoteOnlyLead,
      ...(detail.articleBlocks?.slice(1) ?? []),
    ],
  };

  try {
    await withMockPuzzleDataSource(
      {
        registry,
        details: {
          [slug]: remoteDetail,
        },
      },
      async (mockBaseUrl) => {
        env.NODE_ENV = "production";
        env.GITHUB_RAW_BASE = mockBaseUrl;
        env.PINPOINT_ALLOW_LOCAL_DATA_SOURCE = "true";

        const dataModulePath = `../lib/puzzles/data.ts?remote-detail=${Date.now()}`;
        const dataModule = (await import(dataModulePath)) as {
          getPuzzleBySlug: (
            slug: string,
            options?: { allowLiveWorkerFallback?: boolean },
          ) => Promise<{ articleBlocks: string[] } | null>;
        };

        const puzzle = await dataModule.getPuzzleBySlug(slug, {
          allowLiveWorkerFallback: false,
        });

        assert.ok(puzzle, "expected the mocked production detail lookup to resolve");
        assert.equal(
          puzzle.articleBlocks[0],
          remoteOnlyLead,
          "production detail lookups should prefer remote JSON over bundled local content",
        );
      },
    );
  } finally {
    if (previousNodeEnv === undefined) {
      delete env.NODE_ENV;
    } else {
      env.NODE_ENV = previousNodeEnv;
    }

    if (previousGithubRawBase === undefined) {
      delete env.GITHUB_RAW_BASE;
    } else {
      env.GITHUB_RAW_BASE = previousGithubRawBase;
    }

    if (previousAllowLocalDataSource === undefined) {
      delete env.PINPOINT_ALLOW_LOCAL_DATA_SOURCE;
    } else {
      env.PINPOINT_ALLOW_LOCAL_DATA_SOURCE = previousAllowLocalDataSource;
    }
  }

  console.log("ok: production detail lookups prefer remote JSON over local files");
}

async function checkCurrentPuzzleSkipsNonPublicLiveEntry() {
  const env = process.env as Record<string, string | undefined>;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousGithubRawBase = process.env.GITHUB_RAW_BASE;
  const previousAllowLocalDataSource = process.env.PINPOINT_ALLOW_LOCAL_DATA_SOURCE;
  const registry = JSON.parse(
    await readFile(resolve(ROOT, "data", "puzzles", "registry.json"), "utf8"),
  ) as Array<RegistryEntry & { detailState?: string }>;
  const liveEntry = registry.find((entry) => entry.status === "live");
  const fallbackEntry = registry.find((entry) => entry.status === "archived");

  assert.ok(liveEntry, "expected a live registry entry for detailState fallback test");
  assert.ok(fallbackEntry, "expected an archived registry entry for detailState fallback test");

  const liveDetail = JSON.parse(
    await readFile(resolve(ROOT, "data", "puzzles", `${liveEntry.slug}.json`), "utf8"),
  ) as Record<string, unknown>;
  const fallbackDetail = JSON.parse(
    await readFile(resolve(ROOT, "data", "puzzles", `${fallbackEntry.slug}.json`), "utf8"),
  ) as Record<string, unknown>;

  const remoteRegistry = registry.map((entry) => ({
    ...entry,
    detailState: entry.slug === liveEntry.slug ? "failed" : "published",
  }));

  try {
    await withMockPuzzleDataSource(
      {
        registry: remoteRegistry,
        details: {
          [liveEntry.slug]: { ...liveDetail, detailState: "failed" },
          [fallbackEntry.slug]: { ...fallbackDetail, detailState: "published" },
        },
      },
      async (mockBaseUrl) => {
        env.NODE_ENV = "production";
        env.GITHUB_RAW_BASE = mockBaseUrl;
        env.PINPOINT_ALLOW_LOCAL_DATA_SOURCE = "true";

        const dataModulePath = `../lib/puzzles/data.ts?detail-state-current=${Date.now()}`;
        const dataModule = (await import(dataModulePath)) as {
          getCurrentPuzzle: (options?: { allowLiveWorkerFallback?: boolean }) => Promise<{
            slug: string;
            detailState: string;
          }>;
          getPuzzleBySlug: (
            slug: string,
            options?: { allowLiveWorkerFallback?: boolean },
          ) => Promise<{ slug: string } | null>;
        };

        const current = await dataModule.getCurrentPuzzle({ allowLiveWorkerFallback: false });
        assert.equal(
          current.slug,
          fallbackEntry.slug,
          "public current puzzle lookup should fall back to the newest published detail entry when the live entry is non-public",
        );
        assert.equal(current.detailState, "published");

        const liveLookup = await dataModule.getPuzzleBySlug(liveEntry.slug, { allowLiveWorkerFallback: false });
        assert.equal(liveLookup, null, "non-public live slug should not resolve through public detail lookups");
      },
    );
  } finally {
    if (previousNodeEnv === undefined) {
      delete env.NODE_ENV;
    } else {
      env.NODE_ENV = previousNodeEnv;
    }

    if (previousGithubRawBase === undefined) {
      delete env.GITHUB_RAW_BASE;
    } else {
      env.GITHUB_RAW_BASE = previousGithubRawBase;
    }

    if (previousAllowLocalDataSource === undefined) {
      delete env.PINPOINT_ALLOW_LOCAL_DATA_SOURCE;
    } else {
      env.PINPOINT_ALLOW_LOCAL_DATA_SOURCE = previousAllowLocalDataSource;
    }
  }

  console.log("ok: public current puzzle lookup skips live entries whose detailState is not public");
}

async function checkWorkerDetailShape() {
  const workerModulePath = "../worker/src/index.ts";
  const workerModule = (await import(workerModulePath)) as {
    buildPublishedPuzzleDetailRecord: (input: {
      puzzleNumber: number;
      slug: string;
      puzzleDate: string;
      answer: string;
      words: string[];
      sections: Record<string, unknown>;
      analysis: Record<string, unknown>;
      summary?: unknown;
      detailState?: "published" | "fallback_full" | "generating" | "validated" | "failed";
      questionType?: string;
      difficultyBand?: string;
      solvePath?: Record<string, unknown>;
      turningPoint?: Record<string, unknown>;
      clueRows?: Array<Record<string, unknown>>;
      faqItems?: Array<Record<string, unknown>>;
      uniquenessSignals?: Record<string, unknown>;
      wrongGuessCandidates?: Array<Record<string, unknown>>;
      setValidationSummary?: string;
      categoryPrecisionNote?: string;
    }) => unknown;
    resolvePublicDetailExperienceDecision: (input: {
      incoming: Record<string, unknown>;
      existingBranchSummary: {
        slug: string;
        detailState: string;
        bodyMode: "full" | "short";
        articleBlocksWordCount: number;
        minRequiredWords: number;
      } | null;
      primaryBranchSummary?: {
        slug: string;
        detailState: string;
        bodyMode: "full" | "short";
        articleBlocksWordCount: number;
        minRequiredWords: number;
      } | null;
    }) => {
      action: string;
      record?: Record<string, unknown>;
      reason?: string;
    };
    buildCronHeartbeatAlerts: (
      heartbeat: {
        enrich: {
          detailState?: "published" | "fallback_full" | "generating" | "validated" | "failed";
          updatedAt: string;
        };
      } | null,
      nowMs?: number,
    ) => Array<{
      code: string;
      detailState: string;
      minutesStuck: number;
      message: string;
    }>;
  };

  const clues = [
    "Fog",
    "Cable cars",
    "Ghirardelli Square",
    "Alcatraz Island",
    "Golden Gate Bridge",
  ];

  const record = workerModule.buildPublishedPuzzleDetailRecord({
    puzzleNumber: 687,
    slug: "pinpoint-answer-687",
    puzzleDate: "2026-03-18",
    answer: "San Francisco icons",
    words: clues,
    sections: {
      overview:
        "The board looks broader than it is because the clues span atmosphere, transit, and landmarks. Once Golden Gate Bridge appears, the city frame becomes specific enough to re-check the earlier clues against one place.",
      solutionEmergence:
        "I first read Fog and Cable cars as a loose travel board. Golden Gate Bridge is the clue that made the city frame impossible to miss, and the earlier clues then snapped into the same San Francisco picture.",
      clueDetails: clues.map((clue) => ({
        clue,
        phrase: clue,
        explanation: `${clue} points back to the same San Francisco frame once the city read becomes clear.`,
      })),
      lessons: [
        {
          title: "Wait for the place-defining clue",
          body: "When a city board starts broad, the clue that makes the place unmistakable matters more than the earliest loose hint.",
        },
      ],
      faqs: [
        {
          question: "What is the answer to LinkedIn Pinpoint #687?",
          answer: "The answer is San Francisco icons because every clue belongs to the same city picture.",
        },
        {
          question: "What is the connection in LinkedIn Pinpoint #687?",
          answer: "The connection is San Francisco icons because Fog, Cable cars, Ghirardelli Square, Alcatraz Island, and Golden Gate Bridge all lock into the same city frame once the board is tested together.",
        },
        {
          question: "Which clue really unlocks LinkedIn Pinpoint #687?",
          answer: "Golden Gate Bridge is the turning clue because it makes the city read precise enough to send the earlier clues back through the same San Francisco lens.",
        },
      ],
    },
    analysis: {
      detailedBreakdown:
        "The board mixes atmosphere, transit, and landmarks, which can make the first read feel broader than it is. Golden Gate Bridge is the clue that tightens the frame enough to prove every clue belongs to one city rather than a loose travel bucket. Once that clue lands, Fog, Cable cars, Ghirardelli Square, and Alcatraz Island all read as parts of the same San Francisco collage instead of unrelated tourist references.",
    },
    summary: "Pinpoint #687 asks what links Fog, Cable cars, Ghirardelli Square, Alcatraz Island, and Golden Gate Bridge.",
  }) as {
    spoilerHints?: Record<string, string>;
    questionType?: string;
    difficultyBand?: string;
    solvePath?: {
      firstRead?: string;
      breakingClue?: string;
    };
    turningPoint?: {
      clue?: string;
    };
    clueRows?: Array<{
      clue?: string;
      resolvedPhraseOrMember?: string;
      nonObviousWhy?: string;
    }>;
    faqItems?: Array<{
      question?: string;
      tiedClue?: string | null;
    }>;
    display?: {
      connectorSummary?: string;
      fastStrategy?: string;
      clueTableRows?: Array<{
        clue?: string;
        examplePhrase?: string;
        connectionExplained?: string;
      }>;
    };
    wrongGuessCandidates?: Array<{
      label?: string;
      whyPlausible?: string;
      whyRejected?: string;
    }>;
    setValidationSummary?: string;
    categoryPrecisionNote?: string;
  };

  const spoilerHintKeys = Object.keys(record.spoilerHints ?? {});
  assert.deepEqual(
    spoilerHintKeys,
    clues,
    "worker-published detail payload should include spoilerHints for every clue in order",
  );

  spoilerHintKeys.forEach((clue) => {
    assert.ok(
      record.spoilerHints?.[clue]?.trim(),
      `spoilerHints.${clue} should be a non-empty string`,
    );
  });

  assert.ok(
    record.display?.connectorSummary?.trim(),
    "worker-published detail payload should include display.connectorSummary",
  );
  assert.ok(
    record.display?.fastStrategy?.trim(),
    "worker-published detail payload should include display.fastStrategy",
  );
  assert.equal(
    (record as { detailState?: unknown }).detailState,
    "published",
    "worker-published detail payload should include detailState=published",
  );
  assert.equal(
    record.questionType,
    "category",
    "worker-published detail payload should classify the answer into a v2 questionType",
  );
  assert.ok(
    record.difficultyBand === "obvious" || record.difficultyBand === "medium" || record.difficultyBand === "hard",
    "worker-published detail payload should include a v2 difficultyBand",
  );
  assert.ok(
    record.solvePath?.firstRead?.trim(),
    "worker-published detail payload should include solvePath.firstRead",
  );
  assert.ok(
    record.turningPoint?.clue?.trim(),
    "worker-published detail payload should include turningPoint.clue",
  );
  assert.ok(
    Array.isArray(record.wrongGuessCandidates) &&
      record.wrongGuessCandidates.length >= (record.difficultyBand === "obvious" ? 1 : 2),
    "worker-published detail payload should include enough structured wrongGuessCandidates for its difficulty band",
  );
  record.wrongGuessCandidates?.forEach((candidate, index) => {
    assert.ok(
      candidate.label?.trim(),
      `worker-published detail payload should include wrongGuessCandidates[${index}].label`,
    );
    assert.ok(
      candidate.whyPlausible?.trim(),
      `worker-published detail payload should include wrongGuessCandidates[${index}].whyPlausible`,
    );
  });
  assert.ok(
    record.setValidationSummary?.trim(),
    "worker-published detail payload should include setValidationSummary",
  );
  assert.ok(
    record.categoryPrecisionNote?.trim(),
    "worker-published detail payload should include categoryPrecisionNote",
  );
  assert.equal(
    record.clueRows?.length,
    clues.length,
    "worker-published detail payload should include one v2 clueRows item per clue",
  );
  assert.equal(
    record.faqItems?.length,
    3,
    "worker-published detail payload should derive one v2 faqItems row per legacy FAQ row",
  );

  const evidenceIssues = validateEvidenceContract(
    {
      rawWords: clues,
      mainAnswer: "San Francisco icons",
      questionType: record.questionType,
      difficultyBand: record.difficultyBand,
      solvePath: record.solvePath,
      turningPoint: record.turningPoint,
      clueRows: record.clueRows,
      faqItems: record.faqItems,
    },
    { requireEvidenceFields: true },
  ).filter((issue) => issue.level === "error");
  assert.equal(
    evidenceIssues.length,
    0,
    `worker-published detail payload should satisfy the v2 evidence contract: ${evidenceIssues.map((issue) => issue.code).join(", ")}`,
  );

  const providedEvidenceRecord = workerModule.buildPublishedPuzzleDetailRecord({
    puzzleNumber: 695,
    slug: "pinpoint-answer-695",
    puzzleDate: "2026-03-28",
    answer: "Words that come after paper",
    words: ["Tiger", "Plane", "Travel", "Weight", "Clip"],
    sections: {
      overview: "Legacy sections should not overwrite richer v2 evidence fields when the worker already receives them from the site.",
      solutionEmergence: "The worker should preserve explicit evidence fields instead of re-inferring them into a weaker old-shell version.",
      clueDetails: [
        { clue: "Tiger", phrase: "Paper tiger", explanation: "Paper tiger is the exact phrase." },
        { clue: "Plane", phrase: "Paper plane", explanation: "Paper plane is the exact phrase." },
        { clue: "Travel", phrase: "Paper trail", explanation: "Paper trail is the exact phrase even though the clue reads Travel." },
        { clue: "Weight", phrase: "Paperweight", explanation: "Paperweight is the exact phrase." },
        { clue: "Clip", phrase: "Paper clip", explanation: "Paper clip is the exact phrase." },
      ],
      faqs: [
        { question: "Legacy FAQ 1", answer: "Legacy FAQ answer 1." },
        { question: "Legacy FAQ 2", answer: "Legacy FAQ answer 2." },
        { question: "Legacy FAQ 3", answer: "Legacy FAQ answer 3." },
      ],
    },
    analysis: {
      detailedBreakdown:
        "This payload intentionally includes richer v2 evidence fields so the worker can prove it preserves them instead of falling back to a weaker inferred structure.",
    },
    questionType: "phrase",
    difficultyBand: "hard",
    solvePath: {
      firstRead: "I first looked for office supplies because Weight and Clip both seemed literal.",
      falseStarts: [
        {
          guess: "office supplies",
          whyItSeemedPlausible: "Weight and Clip both sound like desk objects at first.",
          whyItFailed: "Tiger and Plane do not naturally fit that bucket.",
        },
      ],
      breakingClue: "Weight",
      whyBreakingClueMatters: "Weight is where the missing word becomes specific enough to test across the full board.",
      fullBoardConfirmation: "Paper tiger, paper plane, paper trail, paperweight, and paper clip all confirm the same connector.",
    },
    turningPoint: {
      clue: "Weight",
      whyDecisive: "Weight is the clue that makes the paper connector feel exact instead of loose.",
      whatChangedAfterIt: "Once Weight lands, the earlier clues can all be retested under the same paper frame.",
    },
    clueRows: [
      { clue: "Tiger", resolvedPhraseOrMember: "Paper tiger", nonObviousWhy: "The clue sounds animal-first until the paper phrase re-reads it as a metaphor." },
      { clue: "Plane", resolvedPhraseOrMember: "Paper plane", nonObviousWhy: "Plane looks like transport, but the paper phrase turns it into a folded object." },
      { clue: "Travel", resolvedPhraseOrMember: "Paper trail", nonObviousWhy: "Travel pushes the solver toward movement, but the answer actually lands on trail as a document path." },
      { clue: "Weight", resolvedPhraseOrMember: "Paperweight", nonObviousWhy: "Weight is the clue that makes the paper connector concrete enough to test across the board." },
      { clue: "Clip", resolvedPhraseOrMember: "Paper clip", nonObviousWhy: "Clip confirms the connector in a very ordinary phrase once paper is in view." },
    ],
    faqItems: [
      { question: "What is the answer to LinkedIn Pinpoint #695?", answer: "The answer is words that come after paper.", tiedClue: null, intentType: "answer" },
      { question: "Why does Weight matter so much here?", answer: "Weight is the turning clue because it makes the paper connector precise enough to test across every clue.", tiedClue: "Weight", intentType: "clue_background" },
      { question: "How does Travel fit this board?", answer: "Travel points to paper trail once the paper connector is visible.", tiedClue: "Travel", intentType: "clue_background" },
    ],
    uniquenessSignals: {
      angle: "missing-word phrase board built around paper compounds and paper-adjacent phrases",
      relatedEntities: ["paper tiger", "paper plane", "paper trail", "paperweight", "paper clip"],
      doNotRepeatPatterns: ["office supplies opener", "generic category board", "loose desk object angle"],
    },
    wrongGuessCandidates: [
      {
        label: "office supplies",
        whyPlausible: "Weight and Clip both sound like desk objects before the phrase slot becomes clear.",
        whyRejected: "Tiger and Plane only fit once the repeated paper connector is visible.",
      },
      {
        label: "desk accessories",
        whyPlausible: "Clip and Weight can overemphasize the office read on a quick skim.",
        whyRejected: "The full board resolves through fixed paper phrases, not through one object shelf.",
      },
    ],
    setValidationSummary:
      "Paper tiger, paper plane, paper trail, paperweight, and paper clip all confirm the same repeated connector, so the full board behaves like one exact phrase family.",
    categoryPrecisionNote:
      "one shared opening word placed before each clue, not a loose office-supplies topic",
  }) as {
    questionType?: string;
    difficultyBand?: string;
    solvePath?: { breakingClue?: string };
    turningPoint?: { clue?: string };
    clueRows?: Array<{ clue?: string; resolvedPhraseOrMember?: string }>;
    faqItems?: Array<{ tiedClue?: string | null }>;
    uniquenessSignals?: { angle?: string };
    wrongGuessCandidates?: Array<{ label?: string }>;
    setValidationSummary?: string;
    categoryPrecisionNote?: string;
  };
  assert.equal(
    providedEvidenceRecord.questionType,
    "phrase",
    "worker detail builder should preserve an explicit v2 questionType when the site already generated one",
  );
  assert.equal(
    providedEvidenceRecord.difficultyBand,
    "hard",
    "worker detail builder should preserve an explicit v2 difficultyBand when the site already generated one",
  );
  assert.equal(
    providedEvidenceRecord.solvePath?.breakingClue,
    "Weight",
    "worker detail builder should preserve an explicit v2 solvePath instead of re-inferring a weaker breaking clue",
  );
  assert.equal(
    providedEvidenceRecord.turningPoint?.clue,
    "Weight",
    "worker detail builder should preserve an explicit v2 turningPoint instead of falling back to a later clue mention",
  );
  assert.equal(
    providedEvidenceRecord.clueRows?.[2]?.resolvedPhraseOrMember,
    "Paper trail",
    "worker detail builder should preserve explicit v2 clueRows when the generated payload already fixed tricky clue mappings",
  );
  assert.equal(
    providedEvidenceRecord.faqItems?.[1]?.tiedClue,
    "Weight",
    "worker detail builder should preserve clue-specific v2 FAQ bindings from the generated payload",
  );
  assert.ok(
    providedEvidenceRecord.uniquenessSignals?.angle?.trim(),
    "worker detail builder should preserve explicit v2 uniqueness signals from the generated payload",
  );
  assert.equal(
    providedEvidenceRecord.wrongGuessCandidates?.[0]?.label,
    "office supplies",
    "worker detail builder should preserve explicit wrongGuessCandidates instead of overwriting them",
  );
  assert.match(
    providedEvidenceRecord.setValidationSummary || "",
    /phrase family/i,
    "worker detail builder should preserve an explicit setValidationSummary",
  );
  assert.match(
    providedEvidenceRecord.categoryPrecisionNote || "",
    /shared opening word/i,
    "worker detail builder should preserve an explicit categoryPrecisionNote",
  );

  const fallbackFullRecord = workerModule.buildPublishedPuzzleDetailRecord({
    puzzleNumber: 687,
    slug: "pinpoint-answer-687",
    puzzleDate: "2026-03-18",
    answer: "San Francisco icons",
    words: clues,
    sections: {
      overview: "Fallback full keeps the clue-by-clue walkthrough public even when the richer AI draft fails quality gates.",
      solutionEmergence: "The template fallback still checks every clue against one connector and publishes a readable full page.",
      clueDetails: clues.map((clue) => ({
        clue,
        phrase: clue,
        explanation: `${clue} still maps back to the same San Francisco frame in the fallback full walkthrough.`,
      })),
    },
    analysis: {
      detailedBreakdown:
        "Fallback full should still produce a complete walkthrough instead of a short placeholder, and the published detail state must make that downgrade explicit.",
    },
    detailState: "fallback_full",
  }) as { detailState?: unknown };
  assert.equal(
    fallbackFullRecord.detailState,
    "fallback_full",
    "worker detail builder should preserve fallback_full when the publish pipeline degrades to a public fallback page",
  );
  assert.ok(
    (fallbackFullRecord as { solvePath?: { firstRead?: string } }).solvePath?.firstRead?.trim(),
    "fallback_full detail records should still include solvePath evidence so public fallback pages keep the v2 structure",
  );
  assert.ok(
    (fallbackFullRecord as { turningPoint?: { clue?: string } }).turningPoint?.clue?.trim(),
    "fallback_full detail records should still include turningPoint evidence so downgraded pages do not fall back to the old shell",
  );

  const downgradeCandidate = workerModule.buildPublishedPuzzleDetailRecord({
    puzzleNumber: 698,
    slug: "pinpoint-answer-698",
    puzzleDate: "2026-03-31",
    answer: 'Words that come after "paper"',
    words: ["Tiger", "Plane", "Travel", "Weight", "Clip"],
    sections: {
      overview:
        "The board reads like a phrase puzzle once Weight shows up, but this test intentionally provides a thin solvePath so the publish state machine has to downgrade the public page to a light explainer instead of shipping a weak full-analysis shell.",
      solutionEmergence:
        "The shared connector becomes obvious after Weight, yet the richer full-analysis structure is intentionally incomplete in this test payload.",
      clueDetails: [
        { clue: "Tiger", phrase: "Paper tiger", explanation: "Paper tiger is the exact phrase." },
        { clue: "Plane", phrase: "Paper plane", explanation: "Paper plane is the exact phrase." },
        { clue: "Travel", phrase: "Paper trail", explanation: "Travel shifts to paper trail once the connector appears." },
        { clue: "Weight", phrase: "Paperweight", explanation: "Paperweight is the proof clue that sharpens the board." },
        { clue: "Clip", phrase: "Paper clip", explanation: "Paper clip confirms the connector with an everyday phrase." },
      ],
      faqs: [
        { question: "What is the answer to LinkedIn Pinpoint #698?", answer: 'The answer is "Words that come after paper".' },
        { question: "Why does Weight matter?", answer: "Weight matters because paperweight makes the connector exact enough to test." },
        { question: "How does Travel fit?", answer: "Travel shifts into paper trail once the same connector is tested across the board." },
      ],
    },
    analysis: {
      detailedBreakdown:
        "The five clues first look like they could drift into office supplies or general travel nouns, but Weight is the clue that makes the paper connector precise enough to test across the full board. Once paperweight lands, paper tiger, paper plane, paper trail, and paper clip all sound exact rather than approximate. This test payload keeps the walkthrough readable on purpose, but the solvePath only includes one false start so the public publish guard has to demote it to a light explainer instead of pretending it is a complete long-form analysis page.",
    },
    difficultyBand: "hard",
    solvePath: {
      firstRead: "I first leaned toward office supplies because Weight and Clip both sounded literal.",
      falseStarts: ["office supplies"],
      whyFalseStartPlausible: [
        "Weight and Clip both sound like desk objects before the phrase pattern becomes concrete.",
      ],
      breakingClue: "Weight",
      pivot: "Weight makes the paper connector exact enough to test across the full board.",
      fullBoardConfirmation: "Paper tiger, paper plane, paper trail, paperweight, and paper clip all confirm the same connector.",
    },
    turningPoint: {
      clue: "Weight",
      whyDecisive: "Weight is decisive because paperweight is an exact phrase instead of a loose category read.",
      whatChangedAfterIt: "Once Weight lands, the earlier clues can all be retested under paper and they stop feeling broad.",
    },
    clueRows: [
      { clue: "Tiger", resolvedPhraseOrMember: "Paper tiger", nonObviousWhy: "Tiger sounds animal-first until paper turns it into a fixed phrase." },
      { clue: "Plane", resolvedPhraseOrMember: "Paper plane", nonObviousWhy: "Plane sounds like travel until paper makes it a folded object." },
      { clue: "Travel", resolvedPhraseOrMember: "Paper trail", nonObviousWhy: "Travel redirects into trail once the connector is visible." },
      { clue: "Weight", resolvedPhraseOrMember: "Paperweight", nonObviousWhy: "Weight is the clue that proves the shared connector." },
      { clue: "Clip", resolvedPhraseOrMember: "Paper clip", nonObviousWhy: "Clip confirms the same connector in an ordinary phrase." },
    ],
    faqItems: [
      { question: "What is the answer to LinkedIn Pinpoint #698?", answer: 'The answer is "Words that come after paper".', tiedClue: null, intentType: "definition" },
      { question: "Why does Weight matter?", answer: "Weight matters because paperweight is the exact proof clue.", tiedClue: "Weight", intentType: "clue_background" },
      { question: "How does Travel fit?", answer: "Travel shifts into paper trail once paper is in view.", tiedClue: "Travel", intentType: "clue_background" },
    ],
    uniquenessSignals: {
      angle: "paper phrase board with a proof clue from a household term",
      relatedEntities: ["paper tiger", "paper plane", "paper trail", "paperweight", "paper clip"],
      doNotRepeatPatterns: ["office supplies opener", "generic category board", "travel-only read"],
    },
  }) as Record<string, unknown>;

  const downgradedDecision = workerModule.resolvePublicDetailExperienceDecision({
    incoming: downgradeCandidate,
    existingBranchSummary: null,
    primaryBranchSummary: null,
  });
  assert.equal(
    downgradedDecision.action,
    "downgrade-to-light-explainer",
    "public publish guard should demote weak full-analysis records into light-explainer mode instead of shipping a thin long page",
  );
  assert.equal(
    downgradedDecision.record?.bodyMode,
    "short",
    "downgraded public records should switch to short bodyMode for the light explainer shell",
  );
  assert.equal(
    downgradedDecision.record?.pageExperienceMode,
    "light-explainer",
    "downgraded public records should explicitly mark pageExperienceMode=light-explainer",
  );
  assert.ok(
    Array.isArray(downgradedDecision.record?.articleBlocks) &&
      (downgradedDecision.record?.articleBlocks as unknown[]).length >= 3,
    "downgraded public records should still carry a compact walkthrough instead of collapsing to an empty shell",
  );

  const unrecoverableIncoming = {
    slug: "pinpoint-answer-799",
    puzzleNumber: 799,
    publishDate: "2026-04-01",
    isoDate: "2026-04-01",
    detailState: "published",
    bodyMode: "full",
    pageExperienceMode: "full-analysis",
    difficultyBand: "hard",
    answer: "Thin payload",
    clues: ["A", "B", "C", "D", "E"],
    articleBlocks: ["Too thin."],
    solutionNarrative: [],
    lessons: [],
    faqs: [],
    clueRows: [],
    faqItems: [],
    display: { connectorSummary: "", fastStrategy: "" },
    solvePath: {
      firstRead: "This payload is intentionally incomplete.",
      falseStarts: [],
      whyFalseStartPlausible: [],
    },
  } as Record<string, unknown>;

  const preservedDecision = workerModule.resolvePublicDetailExperienceDecision({
    incoming: unrecoverableIncoming,
    existingBranchSummary: {
      slug: "pinpoint-answer-799",
      detailState: "published",
      bodyMode: "full",
      articleBlocksWordCount: 132,
      minRequiredWords: 80,
    },
    primaryBranchSummary: null,
  });
  assert.equal(
    preservedDecision.action,
    "defer-to-existing-protection",
    "public publish guard should defer to existing healthy content when neither full-analysis nor light-explainer can pass",
  );

  const blockedDecision = workerModule.resolvePublicDetailExperienceDecision({
    incoming: unrecoverableIncoming,
    existingBranchSummary: null,
    primaryBranchSummary: null,
  });
  assert.equal(
    blockedDecision.action,
    "block",
    "public publish guard should hard-block only when no healthy published detail exists to preserve",
  );

  const generatingRecord = workerModule.buildPublishedPuzzleDetailRecord({
    puzzleNumber: 687,
    slug: "pinpoint-answer-687",
    puzzleDate: "2026-03-18",
    answer: "San Francisco icons",
    words: clues,
    sections: {
      overview: "Generating state should still produce a complete hidden detail record while the public page stays on the previous puzzle.",
      solutionEmergence: "The worker can store a non-public detail payload without exposing it to readers yet.",
      clueDetails: clues.map((clue) => ({
        clue,
        phrase: clue,
        explanation: `${clue} is preserved inside the non-public generating payload.`,
      })),
    },
    analysis: {
      detailedBreakdown:
        "Generating state should remain explicit in the detail payload so the public site can keep the previous puzzle live while the new article is still being prepared.",
    },
    detailState: "generating",
  }) as { detailState?: unknown };
  assert.equal(
    generatingRecord.detailState,
    "generating",
    "worker detail builder should preserve generating when the new puzzle is stored as a non-public in-progress state",
  );

  const validatedRecord = workerModule.buildPublishedPuzzleDetailRecord({
    puzzleNumber: 687,
    slug: "pinpoint-answer-687",
    puzzleDate: "2026-03-18",
    answer: "San Francisco icons",
    words: clues,
    sections: {
      overview: "Validated state means the article has passed contract checks but has not been flipped to the public page yet.",
      solutionEmergence: "The validated payload should stay non-public until the final public publish succeeds.",
      clueDetails: clues.map((clue) => ({
        clue,
        phrase: clue,
        explanation: `${clue} remains available inside the validated payload before the public switch happens.`,
      })),
    },
    analysis: {
      detailedBreakdown:
        "Validated state should be preserved so operators can tell the difference between draft generation still running and content that is ready but waiting on the final publish step.",
    },
    detailState: "validated",
  }) as { detailState?: unknown };
  assert.equal(
    validatedRecord.detailState,
    "validated",
    "worker detail builder should preserve validated when content has passed checks but is not yet publicly released",
  );

  const staleGeneratingAlerts = workerModule.buildCronHeartbeatAlerts(
    {
      enrich: {
        detailState: "generating",
        updatedAt: "2026-03-28T00:00:00.000Z",
      },
    },
    Date.parse("2026-03-28T00:20:00.000Z"),
  );
  assert.equal(
    staleGeneratingAlerts[0]?.code,
    "detail_state.stuck",
    "worker heartbeat alerts should flag generating detail states that stay non-public too long",
  );
  assert.equal(
    staleGeneratingAlerts[0]?.detailState,
    "generating",
    "worker heartbeat alerts should report the stuck non-public detailState",
  );

  const freshValidatedAlerts = workerModule.buildCronHeartbeatAlerts(
    {
      enrich: {
        detailState: "validated",
        updatedAt: "2026-03-28T00:10:00.000Z",
      },
    },
    Date.parse("2026-03-28T00:20:00.000Z"),
  );
  assert.equal(
    freshValidatedAlerts.length,
    0,
    "worker heartbeat alerts should stay quiet until the validated state has been stuck longer than the threshold",
  );
  assert.equal(
    record.display?.clueTableRows?.length,
    clues.length,
    "worker-published detail payload should include one display.clueTableRows item per clue",
  );

  record.display?.clueTableRows?.forEach((row, index) => {
    assert.equal(row.clue, clues[index], `display.clueTableRows[${index}] should preserve clue order`);
    assert.ok(
      row.examplePhrase?.trim(),
      `display.clueTableRows[${index}].examplePhrase should be non-empty`,
    );
    assert.ok(
      row.connectionExplained?.trim(),
      `display.clueTableRows[${index}].connectionExplained should be non-empty`,
    );
  });

  console.log("ok: worker publish detail payload includes v2 evidence fields, spoilerHints, display, and publish detail state");
}

async function checkPhraseFallbackDirection() {
  const fallbackModulePath = "../lib/puzzles/fallback-copy.ts";
  const fallbackModule = (await import(fallbackModulePath)) as {
    buildSharedFallbackArticleBlocks: (input: {
      kind: "typed-category" | "category" | "association";
      clues: string[];
      answer: string;
      turningPoint: string;
      connectorSummary: string;
      sampleReads: string[];
      finalChecks: string[];
      wrongGuessCandidates?: Array<{
        label: string;
        whyPlausible: string;
        whyRejected?: string;
      }>;
      setValidationSummary?: string;
      categoryPrecisionNote?: string;
    }) => string[];
    buildSharedFallbackFaqs: (input: {
      puzzleNumber: number;
      kind: "before" | "after" | "typed-category" | "category" | "association";
      answer: string;
      turningPoint: string;
      connectorSummary: string;
      clues?: string[];
    }) => Array<{ question: string; answer: string }>;
    buildSharedFallbackLessons: (input: {
      kind: "before" | "after" | "typed-category" | "category" | "association";
      turningPoint: string;
      clues?: string[];
      answer?: string;
    }) => Array<{ title: string; body: string }>;
    buildSharedFallbackSolutionNarrative: (input: {
      kind: "typed-category" | "category" | "association";
      wrongGuess: string;
      turningPoint: string;
      clues?: string[];
    }) => string[];
  };

  const beforeFaqs = fallbackModule.buildSharedFallbackFaqs({
    puzzleNumber: 690,
    kind: "before",
    answer: 'Words that come before "spoon"',
    turningPoint: "Soup",
    connectorSummary: "familiar phrases completed by one shared ending word",
  });
  const afterFaqs = fallbackModule.buildSharedFallbackFaqs({
    puzzleNumber: 695,
    kind: "after",
    answer: 'Words that come after "paper"',
    turningPoint: "Weight",
    connectorSummary: "familiar phrases and everyday terms built with one shared opening word",
  });

  assert.match(
    beforeFaqs[1]?.answer || "",
    /\bafter every clue\b/i,
    '"before" phrase fallback copy should say the shared word fits after every clue',
  );
  assert.match(
    afterFaqs[1]?.answer || "",
    /\bbefore every clue\b/i,
    '"after" phrase fallback copy should say the shared word fits before every clue',
  );

  const typedCategoryArticle = fallbackModule.buildSharedFallbackArticleBlocks({
    kind: "typed-category",
    clues: ["Goliath", "Bull", "Pacman", "Red-eyed Tree", "Poison dart"],
    answer: '"Types of frogs"',
    turningPoint: "Red-eyed Tree",
    connectorSummary: "a category board focused on frogs",
    sampleReads: ["Goliath frog", "Bullfrog"],
    finalChecks: ["Red-eyed Tree frog", "Poison dart frog"],
  });
  assert.match(
    typedCategoryArticle.join(" "),
    /what kind of frog/i,
    'typed-category fallback copy should ask what kind of singular member each clue describes',
  );
  const typedCategoryFaqs = fallbackModule.buildSharedFallbackFaqs({
    puzzleNumber: 725,
    kind: "typed-category",
    answer: "Types of guitars",
    turningPoint: "Air",
    connectorSummary: "a category board focused on guitars",
    clues: ["Bass", "Electric", "Acoustic", "Classical", "Air"],
  });
  const typedCategoryLessons = fallbackModule.buildSharedFallbackLessons({
    kind: "typed-category",
    turningPoint: "Air",
    answer: "Types of guitars",
    clues: ["Bass", "Electric", "Acoustic", "Classical", "Air"],
  });
  const typedCategoryCopy = [
    ...typedCategoryFaqs.flatMap((item) => [item.question, item.answer]),
    ...typedCategoryLessons.flatMap((item) => [item.title, item.body]),
  ].join(" ");
  assert.doesNotMatch(
    typedCategoryCopy,
    /\ba guitars\b|\bkind of guitars\b|\brecognizable guitars\b/i,
    "typed-category fallback copy should not use plural category nouns with singular articles",
  );
  assert.match(
    typedCategoryCopy,
    /\ba guitar\b|\bkind of guitar\b|\brecognizable guitar\b/i,
    "typed-category fallback copy should singularize plural category nouns in FAQs and lessons",
  );

  const visualCategoryArticle = fallbackModule.buildSharedFallbackArticleBlocks({
    kind: "category",
    clues: ["☀️", "🌤️", "☁️", "🌧️", "⛈️"],
    answer: '"Weather emojis"',
    turningPoint: "🌧️",
    connectorSummary: "a category board focused on weather",
    sampleReads: ["☀️", "🌤️"],
    finalChecks: ["🌧️", "⛈️"],
  });
  assert.match(
    visualCategoryArticle.join(" "),
    /\bvisual family\b|\bvisual set\b|\bemoji mood list\b/i,
    "visual category fallback copy should treat emoji-heavy boards as one visual system instead of generic category prose",
  );

  const associationFaqs = fallbackModule.buildSharedFallbackFaqs({
    puzzleNumber: 687,
    kind: "association",
    answer: '"Things associated with San Francisco"',
    turningPoint: "Golden Gate Bridge",
    connectorSummary: "a board centered on the theme of San Francisco",
    clues: ["Fog", "Cable cars", "Ghirardelli Square", "Alcatraz Island", "Golden Gate Bridge"],
  });
  assert.match(
    associationFaqs[1]?.answer || "",
    /\bshared context\b|\bsame subject\b/i,
    "association fallback FAQ copy should talk about shared context instead of only literal category labels",
  );

  const visualNarrative = fallbackModule.buildSharedFallbackSolutionNarrative({
    kind: "category",
    wrongGuess: "a loose emoji mood list",
    turningPoint: "🌧️",
    clues: ["☀️", "🌤️", "☁️", "🌧️", "⛈️"],
  });
  assert.match(
    visualNarrative.join(" "),
    /\bemoji\b|\bicon\b|\bvisual\b/i,
    "visual category fallback narrative should acknowledge the icon-heavy solve path",
  );

  const genericCategoryNarrative = fallbackModule.buildSharedFallbackSolutionNarrative({
    kind: "category",
    wrongGuess: "a loose shape theme",
    turningPoint: "CDs and DVDs (it's the last D)",
    clues: ["Plates", "Coins", "Frisbees", "Manhole covers", "CDs and DVDs (it's the last D)"],
  });
  assert.doesNotMatch(
    genericCategoryNarrative.join(" "),
    /\bstopped feeling broad and started reading like parts of one real set\b/i,
    "category fallback narrative should not reuse the old generic one-real-set pivot",
  );
  assert.match(
    genericCategoryNarrative.join(" "),
    /\bPlates and Coins\b/i,
    "category fallback narrative should name early clues when it explains the pivot",
  );
  assert.ok(
    countWords(genericCategoryNarrative.join(" ")) >= 90,
    "category fallback narrative should be long enough for the public solutionEmergence gate",
  );

  const genericFallbackIssueCodes = collectSemanticLintIssues({
    mainAnswer: "Things shaped like discs",
    solutionEmergence:
      'I did not have a clean answer from the first clue. I initially drifted toward a broader umbrella topic, but that line of thinking never explained "CDs and DVDs (it\'s the last D)" cleanly enough. The turn came when I let "CDs and DVDs (it\'s the last D)" lead the solve. Once the answer sharpened, the earlier clues stopped feeling broad and started reading like parts of one real set.',
    lessons: [
      {
        title: "Wait for the clue that makes the set concrete",
        body: "When the opening clues feel broad, wait for the clue that turns one fuzzy theme into a testable answer.",
      },
    ],
  }).map((issue) => issue.code);
  assert.ok(
    genericFallbackIssueCodes.includes("solutionEmergence.genericPivot"),
    "semantic lint should block the old generic one-real-set pivot",
  );
  assert.ok(
    genericFallbackIssueCodes.includes("lessons.genericTitle"),
    "semantic lint should block the old generic set-concrete lesson title",
  );

  const structuredCategoryArticle = fallbackModule.buildSharedFallbackArticleBlocks({
    kind: "category",
    clues: ["Mercury", "Venus", "Earth", "Mars", "Jupiter"],
    answer: '"Planets"',
    turningPoint: "Jupiter",
    connectorSummary: "a category board focused on planets",
    sampleReads: ["Mercury", "Venus"],
    finalChecks: ["Mars", "Jupiter"],
    wrongGuessCandidates: [
      {
        label: "a broader space topic",
        whyPlausible: "Mercury and Venus can initially feel like a loose astronomy board.",
        whyRejected: 'Jupiter is the clue that narrows the board into one exact planet family.',
      },
      {
        label: "named celestial objects",
        whyPlausible: "The clues all look like recognizable proper nouns from the sky.",
      },
    ],
    setValidationSummary:
      "Mars and Jupiter keep the board at the same category level, so the full set reads like one exact family instead of a broad space shelf.",
    categoryPrecisionNote:
      "one concrete category with members that stay at the same level of specificity as planets",
  });
  assert.match(
    structuredCategoryArticle.join(" "),
    /\ba broader space topic\b/i,
    "structured fallback article copy should pull wrongGuessCandidates into the public walkthrough instead of leaving them as dead JSON fields",
  );
  assert.match(
    structuredCategoryArticle.join(" "),
    /\bsame category level\b|\bexact family\b/i,
    "structured fallback article copy should use setValidationSummary and categoryPrecisionNote to thicken the walkthrough",
  );

  console.log("ok: phrase fallback copy keeps shared-word direction straight");
}

async function checkEvidenceContractGuardsMeaningfulV2Fields() {
  const clues = ["Tiger", "Plane", "Travel", "Weight", "Clip"];

  const strongIssues = validateEvidenceContract(
    {
      rawWords: clues,
      mainAnswer: 'Words that come after "paper"',
      questionType: "phrase",
      difficultyBand: "medium",
      solvePath: {
        firstRead: "The opening clues first felt like a loose travel bucket rather than one exact phrase pattern.",
        falseStarts: ["travel objects"],
        whyFalseStartPlausible: [
          "Tiger, Plane, and Travel can all sit inside a broad transportation or trip vocabulary if the board is still fuzzy.",
        ],
        breakingClue: "Weight",
        pivot: "Weight makes the shared word concrete because paperweight is an exact everyday phrase instead of a loose theme read.",
        fullBoardConfirmation: "Once paperweight lands, paper tiger, paper plane, paper clip, and travel papers all stop sounding approximate and start sounding exact.",
      },
      turningPoint: {
        clue: "Weight",
        whyDecisive: "Weight is decisive because paperweight is the first clue that forces one exact phrase instead of a fuzzy travel bucket.",
        whatChangedAfterIt: "After Weight lands, the earlier clues can all be re-tested with paper and they read like natural phrases rather than a stitched set.",
      },
      clueRows: clues.map((clue) => ({
        clue,
        surfaceMisread: "travel objects",
        resolvedPhraseOrMember: `paper ${clue.toLowerCase()}`.replace("paper travel", "travel papers"),
        nonObviousWhy:
          clue === "Weight"
            ? "Weight is the proof clue because paperweight is exact right away, which sharpens the shared word for the rest of the board."
            : `${clue} matters because the resolved phrase sounds natural once paper is placed before it instead of staying inside a vague travel bucket.`,
      })),
      faqItems: [
        {
          intentType: "definition",
          question: "What is the answer to LinkedIn Pinpoint #695?",
          answer: 'The answer is "Words that come after paper" because each clue forms a natural phrase once paper is placed before it.',
        },
        {
          intentType: "category_context",
          question: "What is the connection in LinkedIn Pinpoint #695?",
          answer: "The connection is one shared opening word, and Weight is the clue that proves the phrase pattern is exact instead of broad.",
        },
        {
          intentType: "clue_background",
          question: "Why is Weight the key clue in LinkedIn Pinpoint #695?",
          answer: "Weight is the key clue because paperweight is an exact household phrase that lets the earlier clues be checked under the same shared word.",
          tiedClue: "Weight",
        },
      ],
      uniquenessSignals: {
        angle: "every clue becomes a familiar paper phrase instead of a broad travel object",
        relatedEntities: ["paper tiger", "paper plane", "travel papers", "paperweight", "paper clip"],
        doNotRepeatPatterns: ["paper phrase board", "proof clue from a household term", "travel misread that collapses"],
      },
    },
    { requireEvidenceFields: true },
  );
  assert.equal(
    strongIssues.filter((issue) => issue.level === "error").length,
    0,
    "strong v2 evidence payload should pass the evidence contract",
  );

  const thinIssues = validateEvidenceContract(
    {
      rawWords: clues,
      mainAnswer: 'Words that come after "paper"',
      questionType: "phrase",
      difficultyBand: "medium",
      solvePath: {
        firstRead: "It looked broad.",
        falseStarts: ["travel things"],
        whyFalseStartPlausible: [],
        breakingClue: "Unknown clue",
      },
      turningPoint: {
        clue: "Unknown clue",
        whyDecisive: "It fit the same frame.",
        whatChangedAfterIt: "Everything matched after that.",
      },
      clueRows: clues.slice(0, 4).map((clue) => ({
        clue,
        resolvedPhraseOrMember: clue,
        nonObviousWhy: "It fits the same answer.",
      })),
      faqItems: [
        {
          intentType: "definition",
          question: "What is the answer?",
          answer: "It is the same answer.",
        },
      ],
    },
    { requireEvidenceFields: true },
  );

  const thinErrorCodes = thinIssues.filter((issue) => issue.level === "error").map((issue) => issue.code);
  assert.ok(
    thinErrorCodes.includes("evidence.turningPoint.clue.invalid"),
    "thin v2 evidence payload should reject invalid turningPoint clues",
  );
  assert.ok(
    thinErrorCodes.includes("evidence.solvePath.falseStarts.reasonCount"),
    "thin v2 evidence payload should reject missing false-start explanations",
  );
  assert.ok(
    thinErrorCodes.includes("evidence.clueRows.count"),
    "thin v2 evidence payload should reject incomplete clueRows",
  );
  assert.ok(
    thinErrorCodes.includes("evidence.faqItems.count"),
    "thin v2 evidence payload should reject underfilled faqItems",
  );

  console.log("ok: v2 evidence contract blocks thin turningPoint/clueRows/faqItems payloads");
}

function checkContentContractRequiresThreeCompleteFaqs() {
  const rawWords = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"];
  const baseInput = {
    puzzleNumber: 901,
    bodyMode: "standard" as const,
    locale: "en",
    rawWords,
    mainAnswer: "Greek letters",
    summary: "Alpha, Beta, Gamma, Delta, and Epsilon point to Greek letters.",
    seoTitle: "LinkedIn Pinpoint #901 Answer: Alpha, Beta, Gamma, Delta, Epsilon",
    seoDescription:
      "LinkedIn Pinpoint #901 answer for Alpha, Beta, Gamma, Delta, and Epsilon, with the full clue-by-clue explanation and the shared Greek letters connection.",
    overview:
      "Alpha and Beta make the board look like a sequence at first, but Gamma, Delta, and Epsilon keep the same naming pattern in view. The answer works because every clue is a common member of one familiar ordered set, so the board can be checked without forcing a loose category.",
    solutionEmergence:
      "I first read Alpha and Beta as a simple opening pair, then Gamma, Delta, and Epsilon made the shared set harder to miss. I checked the clues together and the cleanest answer stayed Greek letters because every clue names one of those letters directly, without needing a second meaning or a stretched phrase.",
    clueDetails: rawWords.map((clue) => ({
      clue,
      phrase: `${clue} is a Greek letter`,
      explanation: `${clue} fits because it is one of the Greek letters in the shared set.`,
    })),
  };

  const tooFewFaqIssues = validateContentContract({
    ...baseInput,
    faqs: [
      { question: "What is the answer?", answer: "The answer is Greek letters." },
      { question: "Why does Alpha fit?", answer: "Alpha is a Greek letter." },
    ],
  });
  assert.ok(
    tooFewFaqIssues.some((issue) => issue.level === "error" && issue.code === "faqs.count"),
    "content contract must block drafts with fewer than three FAQ items",
  );

  const incompleteFaqIssues = validateContentContract({
    ...baseInput,
    faqs: [
      { question: "What is the answer?", answer: "The answer is Greek letters." },
      { question: "Why does Alpha fit?", answer: "Alpha is a Greek letter." },
      { question: "Why does Beta fit?", answer: "" },
    ],
  });
  assert.ok(
    incompleteFaqIssues.some((issue) => issue.level === "error" && issue.code === "faqs.missingFields"),
    "content contract must block incomplete FAQ rows",
  );

  console.log("ok: content contract requires three complete FAQ items");
}

async function checkTypedCategoryGenerationKeepsGrammarNatural() {
  const generationModulePath = "../lib/puzzle-generation.ts";
  const workerModulePath = "../worker/src/index.ts";
  const generationModule = (await import(generationModulePath)) as {
    buildDeterministicPuzzleContent: (
      puzzleData: {
        puzzleNumber: number;
        rawWords: string[];
        mainAnswer: string;
      },
      slots?: Record<string, unknown>,
    ) => {
      difficultyBand?: string;
      pageExperienceMode?: string;
      sections?: {
        clueDetails?: Array<{ phrase?: string }>;
      };
      clueRows?: Array<{ resolvedPhraseOrMember?: string; surfaceMisread?: string }>;
      wrongGuessCandidates?: Array<{ label?: string; whyPlausible?: string }>;
      setValidationSummary?: string;
      categoryPrecisionNote?: string;
    };
  };
  const workerModule = (await import(workerModulePath)) as {
    sanitizePublishedAnswerLabel: (raw: unknown) => string;
  };

  const puzzleData = {
    puzzleNumber: 700,
    rawWords: ["Panel", "One-on-one", "Behavioral", "Technical", "Phone screen"],
    mainAnswer: "Types of interviews in a job search",
  };

  const generated = generationModule.buildDeterministicPuzzleContent(puzzleData, {
    heroIntroSpoilerSafe:
      "At first glance, Panel, One-on-one, and Behavioral feel broad, but a later clue finally shows the tighter hiring pattern underneath the board.",
    connectorSummary: "a category board focused on interview formats used in hiring",
    turningPoint: "Phone screen is the clue that finally points the whole board toward hiring.",
    falseStarts: ["science terms", "famous names"],
    difficultyReason:
      "The board feels trickier because the clues mix interview formats and content styles before one clue makes the hiring frame concrete.",
    portableTakeaway:
      "Wait for the clue that turns a broad work context into one exact hiring category.",
    clueDetails: [
      {
        clue: "Panel",
        surfaceRead: "a broad workplace label",
        phrase: "Panel interviews in a job search",
        whyItWorks: "Panel interviews are a recognizable hiring format with multiple interviewers.",
      },
      {
        clue: "One-on-one",
        surfaceRead: "a broad workplace label",
        phrase: "One-on-one interviews in a job search",
        whyItWorks: "One-on-one interviews are a standard hiring setup with one interviewer and one candidate.",
      },
      {
        clue: "Behavioral",
        surfaceRead: "a broad workplace label",
        phrase: "Behavioral interviews in a job search",
        whyItWorks: "Behavioral interviews are a common hiring category focused on past actions.",
      },
      {
        clue: "Technical",
        surfaceRead: "a broad workplace label",
        phrase: "Technical interviews in a job search",
        whyItWorks: "Technical interviews test the job-specific skills needed for a role.",
      },
      {
        clue: "Phone screen",
        surfaceRead: "a broad workplace label",
        phrase: "Phone screen interviews in a job search",
        whyItWorks: "Phone screen interviews are short first-pass hiring calls used to filter candidates.",
      },
    ],
  });

  assert.equal(
    workerModule.sanitizePublishedAnswerLabel("Types of interviews in a job search"),
    "Types of interviews in a job search",
    "worker publish sanitizer should not pluralize the tail of multi-word typed-category answers",
  );
  assert.equal(
    generated.sections?.clueDetails?.[0]?.phrase,
    "Panel interviews in a job search",
    "typed-category generated clue phrases should preserve the singular tail in multi-word answers",
  );
  assert.equal(
    generated.clueRows?.[0]?.resolvedPhraseOrMember,
    "Panel interviews in a job search",
    "typed-category clueRows should preserve the singular tail in multi-word answers",
  );
  assert.ok(
    generated.clueRows?.every((row) => !row.surfaceMisread),
    "bucket-style false starts like \"science terms\" should stay out of the clue evidence table",
  );
  assert.equal(
    generated.pageExperienceMode,
    "full-analysis",
    "deterministic generated long-form drafts should mark themselves as full-analysis",
  );
  assert.equal(
    generated.difficultyBand,
    "hard",
    "two plausible false starts should keep the generated draft in a structured hard band",
  );
  assert.ok(
    Array.isArray(generated.wrongGuessCandidates) && generated.wrongGuessCandidates.length >= 2,
    "deterministic generated drafts should include enough structured wrongGuessCandidates for hard mode",
  );
  generated.wrongGuessCandidates?.forEach((candidate, index) => {
    assert.ok(candidate.label?.trim(), `generated wrongGuessCandidates[${index}] should include label`);
    assert.ok(candidate.whyPlausible?.trim(), `generated wrongGuessCandidates[${index}] should include whyPlausible`);
  });
  assert.ok(
    generated.setValidationSummary?.trim(),
    "deterministic generated drafts should include setValidationSummary",
  );
  assert.ok(
    generated.categoryPrecisionNote?.trim(),
    "deterministic generated drafts should include categoryPrecisionNote",
  );

  console.log("ok: typed-category generation keeps singular tails and emits structured publish fields");
}

function countWords(value: unknown): number {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

function checkWorkerLlmSlotsOnlyDraftNormalizesBeforeValidation() {
  const puzzleData = {
    puzzleNumber: 749,
    rawWords: ["Thermal", "Laser", "3D", "Dot matrix", "Inkjet"],
    mainAnswer: "Types of printers",
  };
  const candidate = {
    pageExperienceMode: "full-analysis",
    wrongGuessCandidates: [
      {
        label: "office technology",
        whyPlausible: "The opening clues can sound like a broad workplace technology category.",
        whyRejected: "Dot matrix makes the exact printer category harder to avoid.",
      },
    ],
    setValidationSummary:
      "Thermal, Laser, 3D, Dot matrix, and Inkjet all behave like specific printer types, so the board stays precise.",
    categoryPrecisionNote: "a typed category where each clue names a specific printer family",
    slots: {
      heroIntroSpoilerSafe:
        "Thermal, Laser, and 3D first look like broad technology clues, but the later entries narrow the board into a much more specific device family.",
      connectorSummary: "a category board focused on printer types",
      turningPoint:
        "Dot matrix is the clue that turns broad office technology into a printer-specific read.",
      falseStarts: ["office technology", "printing materials"],
      rejectedGuess: {
        guess: "office technology",
        explanation:
          "That broad read fits Laser and 3D loosely, but Dot matrix and Inkjet demand a more exact device family.",
      },
      clueDetails: [
        {
          clue: "Thermal",
          surfaceRead: "a heat or science clue",
          phrase: "Thermal printer",
          whyItWorks:
            "Thermal printers use heat-based printing, so the clue names a recognizable member of the category.",
        },
        {
          clue: "Laser",
          surfaceRead: "a light or physics clue",
          phrase: "Laser printer",
          whyItWorks:
            "Laser printers are a common office printer type, which makes the clue concrete rather than just scientific.",
        },
        {
          clue: "3D",
          surfaceRead: "a design or modeling clue",
          phrase: "3D printer",
          whyItWorks:
            "3D printers are additive manufacturing devices, so the clue stays inside the printer family.",
        },
        {
          clue: "Dot matrix",
          surfaceRead: "an old display or pattern clue",
          phrase: "Dot matrix printer",
          whyItWorks:
            "Dot matrix printers are a classic impact printer type, and this clue makes the category unmistakable.",
        },
        {
          clue: "Inkjet",
          surfaceRead: "an ink technology clue",
          phrase: "Inkjet printer",
          whyItWorks:
            "Inkjet printers are a standard consumer printer type, confirming the same device category.",
        },
      ],
      difficultyReason:
        "The board feels tricky because early clues can sound like technologies before the printer family becomes exact.",
      portableTakeaway:
        "Wait for the clue that turns broad technology into one exact device category.",
    },
    sections: {
      articleBlocks: [
        "At first, this looked more like office technology than printer types.",
        "Thermal pushed me in that direction immediately.",
        "Laser kept that theory alive for a moment, but Dot matrix still did not quite fit.",
        "That was the moment the first idea stopped working.",
        "Then Dot matrix made me stop thinking about office technology and start thinking about printer types.",
        "Thermal made sense as a thermal printer.",
        "Laser made sense as a laser printer.",
        "The answer was Types of printers.",
        "3D and Inkjet then felt less surprising and more like the last pieces falling into place.",
        "Looking back, the answer feels obvious in the best way.",
      ],
    },
  };

  const normalized = normalizeGeneratedPuzzleContent(candidate, puzzleData);
  const errors = [
    ...validateDraftStructure(puzzleData, normalized),
    ...validateDraftLanguage(normalized),
  ].filter((issue) => issue.level === "error");

  assert.equal(
    errors.length,
    0,
    `slots-only Worker LLM draft should validate after normalization: ${errors.map((issue) => issue.message).join(" | ")}`,
  );
  assert.ok(
    countWords(normalized.sections.overview) >= 65,
    "slots-only Worker LLM draft should receive a full overview before validation",
  );
  assert.ok(
    countWords(normalized.sections.solutionEmergence) >= 90,
    "slots-only Worker LLM draft should receive a first-person solutionEmergence before validation",
  );
  assert.deepEqual(
    normalized.clueRows?.map((row) => row.clue),
    puzzleData.rawWords,
    "normalized Worker LLM evidence clueRows should preserve original clue order",
  );
  assert.match(
    normalized.faqItems?.[0]?.answer || "",
    /Types of printers/,
    "normalized Worker LLM FAQ evidence should preserve the exact answer text",
  );

  console.log("ok: Worker LLM slots-only drafts normalize before validation");
}

async function checkValidateDraftDoesNotNormalizeEmptySlots() {
  const routeModulePath = `../app/api/admin/validate-draft/route.ts?empty-slots-guardrail=${Date.now()}`;
  const routeModule = (await import(routeModulePath)) as {
    POST: (request: NextRequest) => Promise<Response>;
  };
  const request = new NextRequest("http://localhost/api/admin/validate-draft", {
    method: "POST",
    headers: {
      authorization: `Bearer ${GUARDRAIL_ADMIN_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      puzzleNumber: 749,
      rawWords: ["Thermal", "Laser", "3D", "Dot matrix", "Inkjet"],
      mainAnswer: "Types of printers",
      candidate: { slots: {} },
    }),
  });

  const response = await routeModule.POST(request);
  const body = await response.json() as {
    valid?: boolean;
    candidate?: unknown;
    issues?: Array<{ code?: string; message?: string }>;
  };

  assert.equal(response.status, 200, "validate-draft should return validation result for empty slots");
  assert.equal(body.valid, false, "validate-draft must not pass empty slots through deterministic normalization");
  assert.deepEqual(body.candidate, { slots: {} }, "validate-draft should preserve an underfilled raw candidate");
  assert.ok(
    body.issues?.some((issue) => issue.code === "overview.tooShort"),
    "empty slots should still surface the original content-contract failure",
  );

  console.log("ok: validate-draft rejects empty slots instead of template-normalizing them");
}

async function checkValidateDraftDoesNotNormalizeIncompleteSlotRows() {
  const routeModulePath = `../app/api/admin/validate-draft/route.ts?incomplete-slots-guardrail=${Date.now()}`;
  const routeModule = (await import(routeModulePath)) as {
    POST: (request: NextRequest) => Promise<Response>;
  };
  const request = new NextRequest("http://localhost/api/admin/validate-draft", {
    method: "POST",
    headers: {
      authorization: `Bearer ${GUARDRAIL_ADMIN_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      puzzleNumber: 749,
      rawWords: ["Thermal", "Laser", "3D", "Dot matrix", "Inkjet"],
      mainAnswer: "Types of printers",
      candidate: {
        slots: {
          heroIntroSpoilerSafe:
            "Thermal, Laser, and 3D first look broad, but later entries point toward one specific device family.",
          connectorSummary: "a category board focused on printer types",
          turningPoint:
            "Dot matrix is the clue that turns broad office technology into a printer-specific read.",
          clueDetails: [
            { clue: "Thermal", surfaceRead: "a heat clue", phrase: "Thermal printer" },
            { clue: "Laser", surfaceRead: "a light clue", phrase: "Laser printer" },
            { clue: "3D", surfaceRead: "a design clue", phrase: "3D printer" },
            { clue: "Dot matrix", surfaceRead: "a pattern clue", phrase: "Dot matrix printer" },
            { clue: "Inkjet", surfaceRead: "an ink clue", phrase: "Inkjet printer" },
          ],
        },
      },
    }),
  });

  const response = await routeModule.POST(request);
  const body = await response.json() as {
    valid?: boolean;
    candidate?: { slots?: { clueDetails?: Array<{ whyItWorks?: string }> } };
    issues?: Array<{ code?: string; message?: string }>;
  };

  assert.equal(response.status, 200, "validate-draft should return validation result for incomplete slots");
  assert.equal(body.valid, false, "validate-draft must not normalize slot rows missing whyItWorks");
  assert.equal(
    body.candidate?.slots?.clueDetails?.some((detail) => detail.whyItWorks),
    false,
    "validate-draft should preserve incomplete raw clueDetails instead of filling them",
  );
  assert.ok(
    body.issues?.some((issue) => issue.code === "overview.tooShort"),
    "incomplete slot rows should still fail before deterministic article synthesis",
  );

  console.log("ok: validate-draft rejects incomplete slot rows instead of template-normalizing them");
}

async function checkAdminApiRateLimit() {
  const previousWindowMs = process.env.ADMIN_RATE_LIMIT_WINDOW_MS;
  const previousMax = process.env.ADMIN_RATE_LIMIT_MAX;
  process.env.ADMIN_RATE_LIMIT_WINDOW_MS = "600000";
  process.env.ADMIN_RATE_LIMIT_MAX = "20";

  try {
    const cacheBust = Date.now();
    const validateRouteModulePath = `../app/api/admin/validate-draft/route.ts?admin-rate-limit=${cacheBust}`;
    const generateRouteModulePath = `../app/api/admin/generate-draft/route.ts?admin-rate-limit=${cacheBust}`;
    const validateRouteModule = (await import(validateRouteModulePath)) as {
      POST: (request: NextRequest) => Promise<Response>;
    };
    const generateRouteModule = (await import(generateRouteModulePath)) as {
      POST: (request: NextRequest) => Promise<Response>;
    };

    function buildValidateRequest(index: number) {
      return new NextRequest("http://localhost/api/admin/validate-draft", {
        method: "POST",
        headers: {
          authorization: `Bearer ${GUARDRAIL_ADMIN_TOKEN}`,
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.20",
          "user-agent": "admin-rate-limit-guardrail",
        },
        body: JSON.stringify({
          puzzleNumber: 749,
          rawWords: ["Thermal", "Laser", "3D", "Dot matrix", "Inkjet"],
          mainAnswer: "Types of printers",
          candidate: { slots: {}, requestIndex: index },
        }),
      });
    }

    for (let index = 1; index <= 20; index += 1) {
      const response = await validateRouteModule.POST(buildValidateRequest(index));
      assert.notEqual(response.status, 429, `admin request ${index} should be allowed before the limit`);
    }

    const limitedResponse = await generateRouteModule.POST(
      new NextRequest("http://localhost/api/admin/generate-draft", {
        method: "POST",
        headers: {
          authorization: `Bearer ${GUARDRAIL_ADMIN_TOKEN}`,
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.20",
          "user-agent": "admin-rate-limit-guardrail",
        },
        body: JSON.stringify({
          puzzleNumber: 749,
          rawWords: ["Thermal", "Laser", "3D", "Dot matrix", "Inkjet"],
          mainAnswer: "Types of printers",
        }),
      }),
    );
    const limitedBody = await limitedResponse.json() as { message?: string };

    assert.equal(limitedResponse.status, 429, "admin routes should share the same rate-limit bucket");
    assert.match(
      limitedBody.message ?? "",
      /too many admin requests/i,
      "admin rate-limit response should include a clear public message",
    );
    assert.ok(
      Number(limitedResponse.headers.get("retry-after")) > 0,
      "admin rate-limit response should include retry-after",
    );
  } finally {
    if (previousWindowMs === undefined) {
      delete process.env.ADMIN_RATE_LIMIT_WINDOW_MS;
    } else {
      process.env.ADMIN_RATE_LIMIT_WINDOW_MS = previousWindowMs;
    }

    if (previousMax === undefined) {
      delete process.env.ADMIN_RATE_LIMIT_MAX;
    } else {
      process.env.ADMIN_RATE_LIMIT_MAX = previousMax;
    }
  }

  console.log("ok: admin APIs enforce shared rate limiting");
}

function checkPublishEligibilityBlocksShortPublishedAsFullAnalysis() {
  const result = validatePublishEligibility({
    slug: "pinpoint-answer-750",
    expectedMode: "full-analysis",
    answerFirstPublicEnabled: false,
    registryEntry: {
      puzzleNumber: 750,
      slug: "pinpoint-answer-750",
      publishDate: "2026-05-20",
      status: "live",
      detailState: "published",
      clues: ["False", "Paper", "Nature", "Campaign", "Breadcrumb"],
      mainAnswer: "Types of trails",
    },
    detail: {
      slug: "pinpoint-answer-750",
      detailState: "published",
      bodyMode: "short",
      pageExperienceMode: "light-explainer",
      answer: "Types of trails",
      clues: ["False", "Paper", "Nature", "Campaign", "Breadcrumb"],
    },
  });

  assert.equal(result.ok, false, "short/light detail must not pass as full-analysis");
  const codes = result.issues.map((issue) => issue.code);
  assert.ok(
    codes.includes("publishMode.bodyModeMismatch"),
    "short body mode should return publishMode.bodyModeMismatch",
  );
  assert.ok(
    codes.includes("publishMode.pageExperienceMismatch"),
    "light explainer should return publishMode.pageExperienceMismatch",
  );
  assert.ok(
    codes.includes("publishMode.answerFirstDisabled"),
    "answer-first should be blocked when public answer-first is disabled",
  );

  console.log("ok: publish eligibility blocks short published payloads as full-analysis");
}

function checkLightweightPublishFailureSummary() {
  const gateResult = validatePublishEligibility({
    slug: "pinpoint-answer-750",
    expectedMode: "full-analysis",
    answerFirstPublicEnabled: false,
    registryEntry: {
      puzzleNumber: 750,
      slug: "pinpoint-answer-750",
      publishDate: "2026-05-20",
      status: "live",
      detailState: "published",
      clues: ["False", "Paper", "Nature", "Campaign", "Breadcrumb"],
      mainAnswer: "Types of trails",
    },
    detail: {
      slug: "pinpoint-answer-750",
      detailState: "published",
      bodyMode: "short",
      pageExperienceMode: "light-explainer",
      answer: "Types of trails",
      clues: ["False", "Paper", "Nature", "Campaign", "Breadcrumb"],
    },
  });

  const summary = buildLightweightPublishFailureSummary({
    slug: gateResult.slug,
    logicalGameDate: "2026-05-20",
    puzzleNumber: gateResult.puzzleNumber,
    publishMode: gateResult.publishMode,
    issues: gateResult.issues,
    sourceConfidence: "unknown",
    generatedAt: "2026-05-20T18:30:00.000Z",
    reason: "publish eligibility blocked",
  });

  assert.equal(summary.kind, "pinpoint-lightweight-publish-failure-summary");
  assert.equal(summary.slug, "pinpoint-answer-750");
  assert.equal(summary.logicalGameDate, "2026-05-20");
  assert.equal(summary.puzzleNumber, 750);
  assert.equal(summary.publishMode, "answer-first");
  assert.equal(summary.sourceConfidence, "unknown");
  assert.ok(
    summary.blockingIssueCodes.includes("publishMode.answerFirstDisabled"),
    "failure summary should preserve blocking issue codes",
  );
  assert.ok(
    summary.nextAction.includes("publish eligibility issue codes"),
    "failure summary should include an actionable next step",
  );

  const day1 = updateLightweightPublishFailureStreak(null, {
    ...summary,
    logicalGameDate: "2026-05-20",
  }, {
    threshold: 3,
    updatedAt: "2026-05-20T18:30:00.000Z",
  });
  const sameDay = updateLightweightPublishFailureStreak(day1, {
    ...summary,
    logicalGameDate: "2026-05-20",
  }, {
    threshold: 3,
    updatedAt: "2026-05-20T18:45:00.000Z",
  });
  const day2 = updateLightweightPublishFailureStreak(sameDay, {
    ...summary,
    logicalGameDate: "2026-05-21",
    slug: "pinpoint-answer-751",
  }, {
    threshold: 3,
    updatedAt: "2026-05-21T18:30:00.000Z",
  });
  const day3 = updateLightweightPublishFailureStreak(day2, {
    ...summary,
    logicalGameDate: "2026-05-22",
    slug: "pinpoint-answer-752",
  }, {
    threshold: 3,
    updatedAt: "2026-05-22T18:30:00.000Z",
  });

  assert.equal(day1.count, 1, "first failure should start the streak");
  assert.equal(sameDay.count, 1, "same-day retries should not inflate the failure streak");
  assert.equal(day2.count, 2, "next-day failure should increment the streak");
  assert.equal(day3.count, 3, "third consecutive day should reach the streak threshold");
  assert.equal(day3.triggered, true, "third consecutive failure should trigger the alert");

  console.log("ok: lightweight publish failure summary preserves issue codes and streaks");
}

async function checkPinpointEvidenceV1Guards724Mapping() {
  const fixturePath = resolve(ROOT, "tests/fixtures/pinpoint/evidence/pinpoint-answer-724.evidence.fixture.json");
  const badFixturePath = resolve(ROOT, "tests/fixtures/pinpoint/evidence/pinpoint-answer-724.bad-mapping.evidence.fixture.json");
  const goodEvidence = JSON.parse(await readFile(fixturePath, "utf8"));
  const badEvidence = JSON.parse(await readFile(badFixturePath, "utf8"));
  const registryEntry = {
    puzzleNumber: 724,
    slug: "pinpoint-answer-724",
    publishDate: "2026-04-24",
    status: "live",
    detailState: "published",
    clues: ["Stand", "Shake", "Made", "Writing", "Kerchief"],
    mainAnswer: "Words that come after “hand”",
  };
  const detail = {
    slug: "pinpoint-answer-724",
    puzzleNumber: 724,
    publishDate: "2026-04-24",
    detailState: "published",
    publishMode: "full-analysis",
    answer: "Words that come after “hand”",
    clues: ["Stand", "Shake", "Made", "Writing", "Kerchief"],
    clueRows: [
      { clue: "Stand", resolvedPhraseOrMember: "Handstand", nonObviousWhy: "Stand combines with hand.", evidenceRef: "clue-0-stand" },
      { clue: "Shake", resolvedPhraseOrMember: "Handshake", nonObviousWhy: "Shake combines with hand.", evidenceRef: "clue-1-shake" },
      { clue: "Made", resolvedPhraseOrMember: "Handmade", nonObviousWhy: "Made combines with hand.", evidenceRef: "clue-2-made" },
      { clue: "Writing", resolvedPhraseOrMember: "Handwriting", nonObviousWhy: "Writing combines with hand.", evidenceRef: "clue-3-writing" },
      { clue: "Kerchief", resolvedPhraseOrMember: "Handkerchief", nonObviousWhy: "Kerchief combines with hand.", evidenceRef: "clue-4-kerchief" },
    ],
  };

  const goodIssues = validatePinpointEvidenceV1({
    evidence: goodEvidence,
    artifactPath: "tests/fixtures/pinpoint/evidence/pinpoint-answer-724.evidence.fixture.json",
    production: false,
    detail,
    registryEntry,
  });
  assert.deepEqual(goodIssues, [], "valid #724 evidence fixture should pass dry-run validation");

  const badIssues = validatePinpointEvidenceV1({
    evidence: badEvidence,
    artifactPath: "tests/fixtures/pinpoint/evidence/pinpoint-answer-724.bad-mapping.evidence.fixture.json",
    production: false,
    detail,
    registryEntry,
  });
  const badCodes = badIssues.map((issue) => issue.code);
  assert.ok(
    badCodes.includes("evidence.clueTextMismatch"),
    "#724 bad fixture should catch swapped clue mapping",
  );
  assert.ok(
    badCodes.includes("evidence.weakFit"),
    "#724 bad fixture should catch weak clue support",
  );

  const productionFixtureIssues = validatePublishEligibility({
    slug: "pinpoint-answer-724",
    expectedMode: "full-analysis",
    answerFirstPublicEnabled: false,
    requireEvidenceForFullAnalysis: true,
    productionEvidence: true,
    evidenceArtifact: goodEvidence,
    evidenceArtifactPath: "tests/fixtures/pinpoint/evidence/pinpoint-answer-724.evidence.fixture.json",
    registryEntry,
    detail,
  });
  assert.equal(productionFixtureIssues.ok, false, "fixture evidence must not pass production eligibility");
  assert.ok(
    productionFixtureIssues.issues.some((issue) => issue.code === "evidence.fixtureInProduction"),
    "production eligibility should return evidence.fixtureInProduction for fixture paths",
  );

  const missingEvidence = validatePublishEligibility({
    slug: "pinpoint-answer-724",
    expectedMode: "full-analysis",
    answerFirstPublicEnabled: false,
    requireEvidenceForFullAnalysis: true,
    registryEntry,
    detail,
  });
  assert.equal(missingEvidence.ok, false, "required evidence should block full-analysis without an artifact");
  assert.ok(
    missingEvidence.issues.some((issue) => issue.code === "evidence.missingArtifact"),
    "required evidence should produce evidence.missingArtifact",
  );

  console.log("ok: Pinpoint evidence V1 catches #724 mapping, weak support, and fixture production use");
}

function checkReleaseOverrideDryRunSchema() {
  const nowMs = Date.parse("2026-05-21T00:00:00.000Z");
  const missing = validateReleaseOverrideDryRun({
    override: {
      slug: "pinpoint-answer-750",
      issueCodes: ["publishMode.inferredLegacy"],
    },
    slug: "pinpoint-answer-750",
    activeIssueCodes: ["publishMode.inferredLegacy"],
    nowMs,
  });
  const missingCodes = missing.issues.map((issue) => issue.code);
  assert.ok(missingCodes.includes("override.reviewerMissing"), "override dry-run should require reviewer");
  assert.ok(missingCodes.includes("override.reasonMissing"), "override dry-run should require reason");
  assert.ok(missingCodes.includes("override.createdAtMissing"), "override dry-run should require createdAt");
  assert.ok(missingCodes.includes("override.expiresAtMissing"), "override dry-run should require expiresAt");

  const expired = validateReleaseOverrideDryRun({
    override: {
      slug: "pinpoint-answer-750",
      issueCodes: ["publishMode.inferredLegacy"],
      reviewer: "release-maintainer",
      reason: "Dry-run fixture for non-blocking warning override.",
      createdAt: "2026-05-18T00:00:00.000Z",
      expiresAt: "2026-05-20T00:00:00.000Z",
    },
    slug: "pinpoint-answer-750",
    activeIssueCodes: ["publishMode.inferredLegacy"],
    nowMs,
  });
  assert.ok(
    expired.issues.some((issue) => issue.code === "override.expired"),
    "override dry-run should reject expired overrides",
  );

  const disallowed = validateReleaseOverrideDryRun({
    override: {
      slug: "pinpoint-answer-750",
      issueCodes: ["answer.missing"],
      reviewer: "release-maintainer",
      reason: "Should never override missing answer.",
      createdAt: "2026-05-21T00:00:00.000Z",
      expiresAt: "2026-05-21T12:00:00.000Z",
    },
    slug: "pinpoint-answer-750",
    activeIssueCodes: ["answer.missing"],
    nowMs,
  });
  assert.ok(
    disallowed.issues.some((issue) => issue.code === "override.disallowedIssueCode"),
    "override dry-run should reject core blocking issue overrides",
  );

  const dryRunOk = validateReleaseOverrideDryRun({
    override: {
      slug: "pinpoint-answer-750",
      issueCodes: ["publishMode.inferredLegacy"],
      reviewer: "release-maintainer",
      reason: "Dry-run only; production effectiveness remains disabled.",
      createdAt: "2026-05-21T00:00:00.000Z",
      expiresAt: "2026-05-22T00:00:00.000Z",
    },
    slug: "pinpoint-answer-750",
    activeIssueCodes: ["publishMode.inferredLegacy"],
    nowMs,
  });
  assert.equal(dryRunOk.ok, true, "well-formed warning override should pass dry-run schema validation");
  assert.equal(dryRunOk.productionEffective, false, "PR3 override dry-run must not enable production bypass");

  console.log("ok: release override schema validates dry-run only without production bypass");
}

function checkIntermediateStateCommitDetection() {
  const scriptPath = resolve(ROOT, "scripts/pinpoint-intermediate-state.mjs");
  const generating = execFileSync(
    process.execPath,
    [scriptPath, "json", "--range=eb2763d^..eb2763d"],
    { encoding: "utf8" },
  );
  const generatingResult = JSON.parse(generating) as {
    isIntermediateStateOnly?: boolean;
    afterState?: string;
  };
  assert.equal(
    generatingResult.isIntermediateStateOnly,
    true,
    "historical #751 generating state-only commit should be detected as skippable",
  );
  assert.equal(generatingResult.afterState, "generating");

  const published = execFileSync(
    process.execPath,
    [scriptPath, "json", "--range=a953f0d^..a953f0d"],
    { encoding: "utf8" },
  );
  const publishedResult = JSON.parse(published) as {
    isIntermediateStateOnly?: boolean;
    afterState?: string;
  };
  assert.equal(
    publishedResult.isIntermediateStateOnly,
    false,
    "historical #751 publish commit must not be detected as skippable",
  );
  assert.equal(publishedResult.afterState, "published");

  console.log("ok: intermediate-state commit detector skips only non-public state-only updates");
}

async function checkWorkerEnrichCommitsOnlyFinalPublicPayload() {
  const workerSource = await readFile(resolve(ROOT, "worker/src/index.ts"), "utf8");
  const start = workerSource.indexOf("async function enrichPublishToSite(");
  const end = workerSource.indexOf("async function localizePublishOne(");
  assert.ok(start >= 0 && end > start, "worker enrich publish function should be present");

  const enrichSource = workerSource.slice(start, end);
  const githubPublishCalls = Array.from(enrichSource.matchAll(/publishToNewSiteGitHub\(/g));
  assert.equal(
    githubPublishCalls.length,
    1,
    "worker enrich path should write GitHub only once, after the final public payload is ready",
  );
  assert.ok(
    enrichSource.includes('await options.onDetailStateChange?.("generating")') &&
      enrichSource.includes('await options.onDetailStateChange?.("validated")'),
    "worker enrich path should keep generating and validated progress in heartbeat state",
  );
  assert.ok(
    !enrichSource.includes("generatingPayload") &&
      !enrichSource.includes("validatedPayload") &&
      !enrichSource.includes("failedPayload"),
    "worker enrich path must not build GitHub payloads for non-public intermediate states",
  );
  assert.ok(
    !workerSource.includes("publishToNewSiteGitHub(env, date, doc, enrichResult.payload"),
    "manual and scheduled callers must not duplicate the final GitHub publish already handled by enrichPublishToSite",
  );

  console.log("ok: worker enrich writes only final public payloads to GitHub");
}

function checkReleaseQueuePolicy() {
  const baseInput = {
    slug: "pinpoint-answer-752",
    logicalGameDate: "2026-05-22",
    publishMode: "full-analysis",
    nowMs: Date.parse("2026-05-22T08:30:00.000Z"),
  };

  const queued = decidePinpointReleaseQueueAction({
    ...baseInput,
    deploymentState: "queued",
  });
  assert.equal(queued.action, "write-candidate", "queued production deployment should write candidate");
  assert.equal(queued.reasonCode, "production-deployment-queued");
  assert.equal(queued.productionPushSkipped, true);

  const building = decidePinpointReleaseQueueAction({
    ...baseInput,
    deploymentState: "building",
  });
  assert.equal(building.action, "write-candidate", "building production deployment should write candidate");

  const unknown = decidePinpointReleaseQueueAction({
    ...baseInput,
    deploymentState: "does-not-exist",
  });
  assert.equal(unknown.action, "write-candidate", "unknown deployment state should not push production");
  assert.equal(unknown.notificationFields.deploymentState, "unknown");

  const recentPush = decidePinpointReleaseQueueAction({
    ...baseInput,
    deploymentState: "ready",
    lastProductionPushAt: "2026-05-22T08:00:00.000Z",
  });
  assert.equal(recentPush.action, "write-candidate", "second production push inside SLA window needs override");
  assert.equal(recentPush.reasonCode, "production-push-budget-exhausted");
  assert.ok(
    typeof recentPush.notificationFields.remainingWindowMs === "number" &&
      recentPush.notificationFields.remainingWindowMs > 0,
    "recent production push decision should expose remaining window",
  );

  const overridden = decidePinpointReleaseQueueAction({
    ...baseInput,
    deploymentState: "ready",
    lastProductionPushAt: "2026-05-22T08:00:00.000Z",
    overrideSecondProductionPush: true,
  });
  assert.equal(overridden.action, "push-production", "override can allow second production push");

  const staleCandidate = decidePinpointReleaseQueueAction({
    ...baseInput,
    deploymentState: "ready",
    candidateBranchExists: true,
    candidateIsCurrent: false,
  });
  assert.equal(staleCandidate.action, "write-candidate", "stale candidate should be updated before production push");
  assert.equal(staleCandidate.reasonCode, "candidate-branch-outdated");

  const currentCandidateAwaitingPromotion = decidePinpointReleaseQueueAction({
    ...baseInput,
    deploymentState: "ready",
    candidateBranchExists: true,
    candidateIsCurrent: true,
  });
  assert.equal(
    currentCandidateAwaitingPromotion.action,
    "write-candidate",
    "current candidate should wait for a machine promotion path",
  );
  assert.equal(currentCandidateAwaitingPromotion.reasonCode, "candidate-branch-awaiting-promotion");

  const machinePromotedCandidate = decidePinpointReleaseQueueAction({
    ...baseInput,
    deploymentState: "ready",
    candidateBranchExists: true,
    candidateIsCurrent: true,
    allowCandidatePromotion: true,
  });
  assert.equal(machinePromotedCandidate.action, "push-production", "machine promotion can publish a current candidate");

  const failed = decidePinpointReleaseQueueAction({
    ...baseInput,
    deploymentState: "failed",
  });
  assert.equal(failed.action, "hold-review", "failed production deployment should be blocked by machine checks");

  const allowed = decidePinpointReleaseQueueAction({
    ...baseInput,
    deploymentState: "none",
  });
  assert.equal(allowed.action, "push-production", "no active deployment and no recent push can push production");
  assert.equal(
    allowed.notificationFields.candidateBranch,
    "pinpoint/candidate/2026-05-22-pinpoint-answer-752",
  );

  console.log("ok: release queue policy blocks duplicate production pushes and unsafe deployment states");
}

function checkWorkerRouteDispatchResolver() {
  function routeFor(path: string, options: { method?: string; host?: string } = {}) {
    const method = options.method ?? "GET";
    const host = options.host ?? "example.workers.dev";
    const request = new Request(`https://${host}${path}`, { method });
    return resolveWorkerFetchRoute(request, new URL(request.url));
  }

  assert.equal(routeFor("/"), "root");
  assert.equal(routeFor("/graphql"), "graphql");
  assert.equal(routeFor("/api/pinpoint/today"), "pinpointToday");
  assert.equal(routeFor("/admin/seed"), "adminSeed");
  assert.equal(routeFor("/admin/seed", { host: "pinpointanswertoday.app" }), "notFound");
  assert.equal(routeFor("/admin/preflight-linkedin"), "adminPreflightLinkedin");
  assert.equal(routeFor("/admin/test-fallback"), "adminTestFallback");
  assert.equal(routeFor("/admin/candidate-branch-dry-run", { method: "POST" }), "adminCandidateBranchDryRun");
  assert.equal(routeFor("/admin/candidate-branch-dry-run"), "notFound");
  assert.equal(routeFor("/admin/release-queue-dry-run", { method: "POST" }), "adminReleaseQueueDryRun");
  assert.equal(routeFor("/admin/release-queue-dry-run"), "notFound");
  assert.equal(routeFor("/admin/release-queue-status-check"), "adminReleaseQueueStatusCheck");
  assert.equal(routeFor("/admin/auto-publish-pause"), "adminAutoPublishPause");
  assert.equal(routeFor("/admin/auto-publish-pause", { method: "POST" }), "adminAutoPublishPause");
  assert.equal(routeFor("/admin/run"), "adminRun");
  assert.equal(routeFor("/admin/put-doc", { method: "POST" }), "adminPutDoc");
  assert.equal(routeFor("/admin/put-doc"), "notFound");
  assert.equal(routeFor("/admin/upload-ops", { method: "POST" }), "adminUploadOps");
  assert.equal(routeFor("/admin/upload-ops"), "notFound");
  assert.equal(routeFor("/health"), "health");
  assert.equal(routeFor("/monitor/cron-status"), "monitorCronStatus");
  assert.equal(routeFor("/missing"), "notFound");

  console.log("ok: worker route resolver preserves fetch route matching");
}

async function checkCandidateBranchDryRunRouteSafety() {
  const workerSource = await readFile(resolve(ROOT, "worker/src/index.ts"), "utf8");
  const dispatchSource = await readFile(resolve(ROOT, "worker/src/routes/dispatch.ts"), "utf8");

  assert.ok(
    dispatchSource.includes('url.pathname === "/admin/candidate-branch-dry-run" && req.method === "POST"'),
    "candidate branch dry-run route must be POST-only",
  );
  assert.equal(
    resolveWorkerFetchRoute(
      new Request("https://example.workers.dev/admin/candidate-branch-dry-run", { method: "GET" }),
      new URL("https://example.workers.dev/admin/candidate-branch-dry-run"),
    ),
    "notFound",
    "candidate branch dry-run must not match GET requests",
  );
  assert.equal(
    resolveWorkerFetchRoute(
      new Request("https://example.workers.dev/admin/candidate-branch-dry-run", { method: "POST" }),
      new URL("https://example.workers.dev/admin/candidate-branch-dry-run"),
    ),
    "adminCandidateBranchDryRun",
    "candidate branch dry-run must match POST requests",
  );
  assert.ok(
    workerSource.includes("candidate dry-run is blocked on the primary branch"),
    "candidate branch dry-run route must reject primary-branch environments",
  );
  assert.ok(
    workerSource.includes("PINPOINT_CANDIDATE_BRANCH_ENABLED must be true for dry-run"),
    "candidate branch dry-run route must require explicit candidate flag enablement",
  );
  assert.ok(
    workerSource.includes("productionBranchTouched: false") &&
      workerSource.includes("revalidateTriggered: false"),
    "candidate branch dry-run response must report that production branch and revalidate are not touched",
  );

  console.log("ok: candidate branch dry-run route is admin-gated and blocked on primary branch");
}

async function checkReleaseQueueDryRunRouteSafety() {
  const workerSource = await readFile(resolve(ROOT, "worker/src/index.ts"), "utf8");
  const dispatchSource = await readFile(resolve(ROOT, "worker/src/routes/dispatch.ts"), "utf8");
  const routeStart = workerSource.indexOf('case "adminReleaseQueueDryRun"');
  const routeEnd = workerSource.indexOf('case "adminRun"', routeStart);
  assert.ok(routeStart >= 0, "release queue dry-run route must exist and be POST-only");
  assert.ok(routeEnd > routeStart, "release queue dry-run route must stay before the real admin run route");
  assert.ok(
    dispatchSource.includes('url.pathname === "/admin/release-queue-dry-run" && req.method === "POST"'),
    "release queue dry-run route must be POST-only in the route resolver",
  );
  assert.equal(
    resolveWorkerFetchRoute(
      new Request("https://example.workers.dev/admin/release-queue-dry-run", { method: "GET" }),
      new URL("https://example.workers.dev/admin/release-queue-dry-run"),
    ),
    "notFound",
    "release queue dry-run must not match GET requests",
  );
  assert.equal(
    resolveWorkerFetchRoute(
      new Request("https://example.workers.dev/admin/release-queue-dry-run", { method: "POST" }),
      new URL("https://example.workers.dev/admin/release-queue-dry-run"),
    ),
    "adminReleaseQueueDryRun",
    "release queue dry-run must match POST requests",
  );

  const routeSource = workerSource.slice(routeStart, routeEnd);
  assert.ok(routeSource.includes("getAdminSecret(env)"), "release queue dry-run route must be admin-gated");
  assert.ok(routeSource.includes("readOnly: true"), "release queue dry-run response must identify itself as read-only");
  assert.ok(
    routeSource.includes("simulatePrimary") && routeSource.includes("queueEligible"),
    "release queue dry-run route must support staging-safe primary-branch simulation",
  );
  assert.ok(
    !routeSource.includes("publishToNewSiteGitHub(") &&
      !routeSource.includes("ensureBranchRef(") &&
      !routeSource.includes("notifyPinpointReleaseQueueDecision("),
    "release queue dry-run route must not write GitHub refs or send queue notifications",
  );

  console.log("ok: release queue dry-run route is admin-gated and read-only");
}

async function checkReleaseQueueDryRunOpsScript() {
  const opsSource = await readFile(resolve(ROOT, "scripts/worker-ops.mjs"), "utf8");
  const packageJson = JSON.parse(await readFile(resolve(ROOT, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };

  assert.ok(
    packageJson.scripts?.["worker:release-queue-dry-run"]?.includes("release-queue-dry-run"),
    "package.json must expose the release queue dry-run matrix script",
  );
  assert.ok(
    opsSource.includes('cmd === "release-queue-dry-run"') &&
      opsSource.includes("/admin/release-queue-dry-run"),
    "worker ops script must call the release queue dry-run endpoint",
  );
  assert.ok(
    opsSource.includes("simulatePrimary") &&
      opsSource.includes("releaseQueueEnabled") &&
      opsSource.includes("queueEligible"),
    "worker ops script must simulate the primary queue path without changing Worker config",
  );
  for (const expectedReason of [
    "production-deployment-queued",
    "production-deployment-building",
    "production-deployment-unknown",
    "production-deployment-failed",
    "production-push-budget-exhausted",
    "production-push-allowed",
  ]) {
    assert.ok(
      opsSource.includes(expectedReason),
      `worker ops release queue matrix must cover ${expectedReason}`,
    );
  }

  console.log("ok: worker ops exposes release queue dry-run matrix");
}

async function checkReleaseQueueObservationOpsScript() {
  const opsSource = await readFile(resolve(ROOT, "scripts/worker-ops.mjs"), "utf8");
  const packageJson = JSON.parse(await readFile(resolve(ROOT, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };

  assert.ok(
    packageJson.scripts?.["worker:release-queue-observe"]?.includes("release-queue-observe"),
    "package.json must expose the production release queue observation script",
  );
  assert.ok(
    opsSource.includes('cmd === "release-queue-observe"') &&
      opsSource.includes("/health") &&
      opsSource.includes("commits/main") &&
      opsSource.includes(CANDIDATE_BRANCH_PREFIX),
    "worker ops observation must check Worker health, main commit status, and candidate branches",
  );
  assert.ok(
    !opsSource.includes('cmd === "release-queue-observe"') ||
      !opsSource.slice(
        opsSource.indexOf('cmd === "release-queue-observe"'),
        Math.min(
          ...[
            opsSource.indexOf('cmd === "auto-publish-pause-status"', opsSource.indexOf('cmd === "release-queue-observe"')),
            opsSource.indexOf('cmd === "refresh-cookie"', opsSource.indexOf('cmd === "release-queue-observe"')),
          ].filter((index) => index > 0),
        ),
      ).includes("requireAdminSecret()"),
    "release queue observation must not require admin secrets",
  );

  console.log("ok: worker ops exposes production release queue observation");
}

async function checkReleaseQueueStatusCheckRouteAndOps() {
  const workerSource = await readFile(resolve(ROOT, "worker/src/index.ts"), "utf8");
  const dispatchSource = await readFile(resolve(ROOT, "worker/src/routes/dispatch.ts"), "utf8");
  const opsSource = await readFile(resolve(ROOT, "scripts/worker-ops.mjs"), "utf8");
  const packageJson = JSON.parse(await readFile(resolve(ROOT, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };

  assert.ok(
    dispatchSource.includes('url.pathname === "/admin/release-queue-status-check"'),
    "release queue status check route must be exposed through the route resolver",
  );
  assert.equal(
    resolveWorkerFetchRoute(
      new Request("https://example.workers.dev/admin/release-queue-status-check"),
      new URL("https://example.workers.dev/admin/release-queue-status-check"),
    ),
    "adminReleaseQueueStatusCheck",
    "release queue status check route must resolve",
  );
  const routeStart = workerSource.indexOf('case "adminReleaseQueueStatusCheck"');
  const routeEnd = workerSource.indexOf('case "adminRun"', routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart, "release queue status check route must be before adminRun");
  const routeSource = workerSource.slice(routeStart, routeEnd);
  assert.ok(routeSource.includes("getAdminSecret(env)"), "release queue status check must be admin-gated");
  assert.ok(routeSource.includes("readOnly: true"), "release queue status check must identify as read-only");
  assert.ok(
    routeSource.includes("ok: healthy") &&
      routeSource.includes("status: healthy ? 200 : 424"),
    "release queue status check must fail hard when Worker token status is unhealthy",
  );
  assert.ok(
    routeSource.includes("inspectNewSiteBaseDeploymentStatus(env)") &&
      !routeSource.includes("publishToNewSiteGitHub(") &&
      !routeSource.includes("notifyPinpointReleaseQueueDecision("),
    "release queue status check must inspect Worker token status without publishing or notifying",
  );
  assert.ok(
    packageJson.scripts?.["worker:release-queue-status-check"]?.includes("release-queue-status-check"),
    "package.json must expose the Worker-token release queue status check",
  );
  assert.ok(
    opsSource.includes('cmd === "release-queue-status-check"') &&
      opsSource.includes("/admin/release-queue-status-check") &&
      opsSource.includes("requireAdminSecret()") &&
      opsSource.includes("status check unhealthy") &&
      opsSource.includes("process.exit(1)"),
    "worker ops must call the Worker-token status check endpoint with admin auth and fail when unhealthy",
  );

  console.log("ok: worker ops exposes Worker-token release queue status check");
}

async function checkCandidateBranchWorkflowAutoPromotes() {
  const ciWorkflow = await readFile(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");
  const candidateVerifySource = await readFile(resolve(ROOT, "scripts/verify-pinpoint-candidate-release.mjs"), "utf8");

  assert.ok(
    ciWorkflow.includes('"pinpoint/candidate/**"'),
    "CI must run on Pinpoint candidate branch pushes",
  );
  assert.ok(
    ciWorkflow.includes("promote-pinpoint-candidate") &&
      ciWorkflow.includes("startsWith(github.ref, 'refs/heads/pinpoint/candidate/')"),
    "CI must include a candidate auto-promotion job after machine checks pass",
  );
  assert.ok(
      ciWorkflow.includes("needs: checks") &&
      ciWorkflow.includes("Validate candidate branch scope") &&
      ciWorkflow.includes("check-pinpoint-candidate-branch.mjs") &&
      ciWorkflow.includes("git show origin/main:scripts/check-pinpoint-candidate-branch.mjs > /tmp/check-pinpoint-candidate-branch.mjs") &&
      ciWorkflow.includes("git fetch origin main:refs/remotes/origin/main") &&
      ciWorkflow.includes("git checkout -B main origin/main") &&
      ciWorkflow.includes('git merge --ff-only "$GITHUB_SHA"') &&
      ciWorkflow.includes("git push origin HEAD:main"),
    "candidate auto-promotion must fast-forward main only after the checked candidate commit passes",
  );
  assert.ok(
    ciWorkflow.includes("verify-pinpoint-candidate-release.mjs") &&
      ciWorkflow.includes("Delete promoted candidate branch") &&
      ciWorkflow.includes('git push origin --delete "$GITHUB_REF_NAME"') &&
      ciWorkflow.includes("candidate branch still exists after delete") &&
      candidateVerifySource.includes("const PUBLIC_AUDIT_TIMEOUT_MS = 10 * 60 * 1000") &&
      candidateVerifySource.includes("public fetch audit remains the final gate"),
    "candidate auto-promotion must verify public production and delete the branch only after verification",
  );

  console.log("ok: candidate branches auto-promote through machine checks and production verification");
}

async function checkMainFailureContentRecoveryCreatesAutoPromotedCandidate() {
  const recoveryWorkflow = await readFile(resolve(ROOT, ".github/workflows/pinpoint-main-recovery.yml"), "utf8");
  const recoverySource = await readFile(resolve(ROOT, "scripts/recover-pinpoint-main-content.mjs"), "utf8");
  const candidateCheckSource = await readFile(resolve(ROOT, "scripts/check-pinpoint-candidate-branch.mjs"), "utf8");
  const packageJson = JSON.parse(await readFile(resolve(ROOT, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };

  assert.ok(
    packageJson.scripts?.["pinpoint:main-recovery"]?.includes("recover-pinpoint-main-content.mjs"),
    "package.json must expose the main content recovery command",
  );
  assert.ok(
    recoveryWorkflow.includes("workflow_run:") &&
      recoveryWorkflow.includes("github.event.workflow_run.conclusion == 'failure'") &&
      recoveryWorkflow.includes("github.event.workflow_run.head_branch == 'main'") &&
      recoveryWorkflow.includes("recover-pinpoint-main-content.mjs --require-origin-main") &&
      recoveryWorkflow.includes("contents: write"),
    "main recovery workflow must run only after failed main CI and have permission to push a repair candidate",
  );
  assert.ok(
    recoverySource.includes('run("npm", ["run", "validate:data:auto-repair"]') &&
      recoverySource.includes('run("npm", ["run", "validate:data"]') &&
      recoverySource.includes("resolveChangedDetailPath") &&
      recoverySource.includes("Main recovery may only change one detail JSON file") &&
      recoverySource.includes("remoteBranchExists(branch)") &&
      recoverySource.includes('git(["push", "origin", `HEAD:${branch}`]'),
    "main recovery script must only auto-repair known content data and push a candidate branch",
  );
  assert.ok(
    candidateCheckSource.includes("baseAlreadyPublishesSlug") &&
      candidateCheckSource.includes('Candidate branch is missing required file change: data/puzzles/registry.json') &&
      candidateCheckSource.includes("!baseAlreadyPublishesSlug"),
    "candidate checker must allow recovery candidates to change only the detail JSON when main already has the live registry entry",
  );

  console.log("ok: failed main content gates recover through an auto-promoted candidate branch");
}

async function checkCandidateBranchWatchdogClosesStuckBranches() {
  const workflowSource = await readFile(resolve(ROOT, ".github/workflows/pinpoint-candidate-watchdog.yml"), "utf8");
  const watchdogSource = await readFile(resolve(ROOT, "scripts/close-pinpoint-candidate-branches.mjs"), "utf8");
  const packageJson = JSON.parse(await readFile(resolve(ROOT, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };

  assert.ok(
    packageJson.scripts?.["pinpoint:candidate-close"]?.includes("close-pinpoint-candidate-branches.mjs"),
    "package.json must expose the candidate branch closure watchdog",
  );
  assert.ok(
    workflowSource.includes("workflow_run:") &&
      workflowSource.includes("schedule:") &&
      workflowSource.includes("*/30 * * * *") &&
      workflowSource.includes("actions: write") &&
      workflowSource.includes("contents: write") &&
      workflowSource.includes("checks: read") &&
      workflowSource.includes("issues: write") &&
      workflowSource.includes("close-pinpoint-candidate-branches.mjs") &&
      workflowSource.includes("--create-issue"),
    "candidate watchdog workflow must run after CI and on a schedule with permissions to close branches and open issues",
  );
  assert.ok(
    watchdogSource.includes("listCandidateBranches") &&
      watchdogSource.includes("rerunWorkflowRun") &&
      watchdogSource.includes("verify-pinpoint-candidate-release.mjs") &&
      watchdogSource.includes('git(["push", "origin", "HEAD:main"]') &&
      watchdogSource.includes('git(["push", "origin", "--delete", branch]') &&
      watchdogSource.includes("Pinpoint candidate stuck:") &&
      watchdogSource.includes("candidate branch count returns to 0"),
    "candidate watchdog must promote verified branches, delete closed branches, and create a tracked issue when it cannot close one",
  );

  console.log("ok: candidate branch watchdog closes or escalates stuck candidates");
}

async function checkPublicVerificationCopyUsesMachineReview() {
  const publicCopySources = [
    await readFile(resolve(ROOT, "components/detail/PuzzleDetail.tsx"), "utf8"),
    await readFile(resolve(ROOT, "app/(site)/about-us/page.tsx"), "utf8"),
  ].join("\n");

  assert.ok(
    publicCopySources.includes("Machine-checked and AI-reviewed"),
    "public detail/about copy must describe machine and AI review",
  );
  assert.ok(
    !publicCopySources.includes("Verified by Human Editor") &&
      !publicCopySources.includes("Human editorial review"),
    "public detail/about copy must not claim human review for automated publishing",
  );

  console.log("ok: public verification copy uses machine and AI review wording");
}

async function checkProductionReleaseRunsPublicFetchAudit() {
  const releaseSource = await readFile(resolve(ROOT, "scripts/release-production.mjs"), "utf8");
  const packageJson = JSON.parse(await readFile(resolve(ROOT, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };

  assert.ok(
    packageJson.scripts?.["content-kitchen:post-publish-public-fetch-audit"]?.includes(
      "run-content-kitchen-post-publish-public-fetch-audit.ts",
    ),
    "package.json must expose the PR11 public fetch audit command",
  );
  assert.ok(
    releaseSource.includes("runPostPublishPublicFetchAudit") &&
      releaseSource.includes("content-kitchen:post-publish-public-fetch-audit") &&
      releaseSource.includes("published_and_audit_passed"),
    "release:production must run PR11 public fetch audit and require a passing audit outcome",
  );
  assert.ok(
    releaseSource.includes("expectedInternalLinks") &&
      releaseSource.includes("sitemapLastmod") &&
      releaseSource.includes("schemaDateModified"),
    "release:production must feed PR11 expected link, sitemap, and schema facts",
  );

  console.log("ok: production release runs PR11 public fetch audit before declaring success");
}

async function checkProductionReleaseWorkerHealthFallback() {
  const releaseSource = await readFile(resolve(ROOT, "scripts/release-production.mjs"), "utf8");

  assert.ok(
    releaseSource.includes("Worker health fetch failed through Node fetch; retrying with curl") &&
      releaseSource.includes('runForStatus("curl", ["-L", "--fail", "--max-time", "20", "-sS", url]'),
    "release:production must retry Worker health with curl when Node fetch cannot reach the Worker",
  );

  console.log("ok: production release retries Worker health with curl after Node fetch failure");
}

async function checkProductionReleaseDetailVerificationUsesRenderedText() {
  const releaseSource = await readFile(resolve(ROOT, "scripts/release-production.mjs"), "utf8");

  assert.ok(
    releaseSource.includes("function buildDetailVerificationStrings(puzzle)") &&
      releaseSource.includes('const cluePath = clues.join(" ");') &&
      releaseSource.includes("LinkedIn Pinpoint ${puzzleNumber} Answer Reasoning") &&
      !releaseSource.includes("const bodyBlocks = Array.isArray(puzzle?.articleBlocks)") &&
      !releaseSource.includes("const faqSnippet = Array.isArray(puzzle?.faqs)"),
    "release:production detail refresh wait must check rendered detail text, not raw articleBlocks or FAQ JSON strings",
  );

  console.log("ok: production release waits for rendered detail text instead of raw JSON snippets");
}

async function checkPrepublishGateRunsContentAutoRepairSafely() {
  const prepublishSource = await readFile(resolve(ROOT, "scripts/check-pinpoint-prepublish-gate.ts"), "utf8");
  const releaseSource = await readFile(resolve(ROOT, "scripts/release-production.mjs"), "utf8");
  const workerSource = await readFile(resolve(ROOT, "worker/src/index.ts"), "utf8");
  const packageJson = JSON.parse(await readFile(resolve(ROOT, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };

  assert.ok(
    packageJson.scripts?.["validate:data:auto-repair"]?.includes("validate-data-with-repair.ts") &&
      packageJson.scripts?.["pinpoint:repair-solution-narrative"]?.includes("repair-pinpoint-solution-narrative.ts"),
    "package.json must expose the data auto-repair wrapper and solution narrative repair command",
  );
  assert.ok(
    prepublishSource.includes("validate:data:auto-repair") &&
      prepublishSource.includes("NEXT_BIN") &&
      !prepublishSource.includes('await run("npm", ["run", "build"]'),
    "prepublish gate must run auto-repair validation before the local Next build",
  );
  assert.ok(
    releaseSource.includes('await run("npm", ["run", "pinpoint:prepublish-gate"]);') &&
      releaseSource.includes('await run("npm", ["run", "typecheck"], { cwd: WORKER_DIR });\n  await ensureCleanWorktree();\n\n  const sha ='),
    "release:production must stop before pushing if prepublish auto-repair changed local files",
  );
  assert.ok(
    workerSource.includes('from "../../lib/puzzles/solution-narrative-repair"') &&
      workerSource.includes("shouldRepairSolutionNarrative(detailRecord)") &&
      workerSource.includes("repairSolutionNarrative({ detail: detailRecord }).detail"),
    "Worker must run the shared solution narrative repair only when public detail JSON needs it",
  );

  const repair = repairSolutionNarrative({
    detail: {
      slug: "pinpoint-answer-999",
      puzzleNumber: 999,
      answer: "Types of printers",
      clues: ["Thermal", "Laser", "3D", "Dot matrix", "Inkjet"],
      solutionNarrative: ["Too short."],
      turningPoint: { clue: "Dot matrix" },
      clueRows: [
        {
          clue: "Thermal",
          resolvedPhraseOrMember: "Thermal printer",
          nonObviousWhy: "Thermal names one printer type.",
        },
        {
          clue: "Laser",
          resolvedPhraseOrMember: "Laser printer",
          nonObviousWhy: "Laser names one printer type.",
        },
        {
          clue: "3D",
          resolvedPhraseOrMember: "3D printer",
          nonObviousWhy: "3D names one printer type.",
        },
        {
          clue: "Dot matrix",
          resolvedPhraseOrMember: "Dot matrix printer",
          nonObviousWhy: "Dot matrix is the narrowing clue.",
        },
        {
          clue: "Inkjet",
          resolvedPhraseOrMember: "Inkjet printer",
          nonObviousWhy: "Inkjet confirms the printer family.",
        },
      ],
      solvePath: { pivot: "generic pivot" },
      wrongGuessCandidates: [{ label: "office technology" }],
    },
  });
  assert.equal(repair.narrative.length, 4, "shared solution narrative repair must produce four paragraphs");
  assert.match(repair.narrative.join(" "), /I first read Thermal and Laser/, "repair narrative should use first-person solve flow");
  assert.match(
    String(repair.detail.solvePath?.pivot || ""),
    /The answer was "Types of printers"/,
    "repair must update solvePath.pivot together with solutionNarrative",
  );
  assert.equal(
    shouldRepairSolutionNarrative({
      bodyMode: "standard",
      articleBlocks: [
        "Thermal, Laser, and 3D can look like broad technology clues until Dot matrix narrows the board into printer territory.",
      ],
      solutionNarrative: [
        "I started with Thermal and Laser because they looked like broad technology clues, then paused when 3D still allowed more than one path. Dot matrix made the direction specific enough to test as a printer family, and Inkjet gave me the last check. I went back through the list slowly instead of accepting the first broad theme, because the answer only worked if every clue named a normal printer type. That extra pass mattered: Thermal printer, Laser printer, 3D printer, Dot matrix printer, and Inkjet printer all sounded natural, so the final answer felt earned instead of guessed.",
      ],
    }),
    false,
    "shared repair gate must preserve a healthy first-person solve narrative",
  );

  console.log("ok: prepublish gate and Worker both use shared content auto-repair safely");
}

async function checkWorkerRunsPostPublishPublicAudit() {
  const workerSource = await readFile(resolve(ROOT, "worker/src/index.ts"), "utf8");

  assert.ok(
    workerSource.includes("runNewSitePublicPublishAudit") &&
      workerSource.includes("post-publish public audit failed") &&
      workerSource.includes("post-publish public audit deferred") &&
      workerSource.includes("too many subrequests") &&
      workerSource.includes("sitemap does not include the new detail URL") &&
      workerSource.includes("home page does not link to the new detail URL") &&
      workerSource.includes("archive page does not link to the new detail URL") &&
      workerSource.includes("summary API latest mismatch"),
    "Worker publish path must verify detail, sitemap, home, archive, and summary after public publish",
  );
  assert.ok(
    workerSource.includes("const publicAudit = await runPrimaryPublicAudit(pageReady)") &&
      workerSource.includes("await runPrimaryPublicAudit(pageReady);"),
    "Worker publish path must run the public audit both after new commits and no-change retry publishes",
  );

  console.log("ok: worker runs post-publish public audit for daily auto-publish");
}

async function checkAutoPublishPauseSwitch() {
  const workerSource = await readFile(resolve(ROOT, "worker/src/index.ts"), "utf8");
  const dispatchSource = await readFile(resolve(ROOT, "worker/src/routes/dispatch.ts"), "utf8");
  const wranglerSource = await readFile(resolve(ROOT, "worker/wrangler.toml"), "utf8");
  const opsSource = await readFile(resolve(ROOT, "scripts/worker-ops.mjs"), "utf8");
  const packageJson = JSON.parse(await readFile(resolve(ROOT, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };

  assert.ok(
    dispatchSource.includes('url.pathname === "/admin/auto-publish-pause"'),
    "auto-publish pause route must be exposed through the route resolver",
  );
  assert.ok(
    workerSource.includes('case "adminAutoPublishPause"') &&
      workerSource.includes("getAdminSecret(env)") &&
      workerSource.includes("setAutoPublishPauseStatus(env, paused, reason)") &&
      workerSource.includes("readOnly: true") &&
      workerSource.includes("readOnly: false"),
    "auto-publish pause route must be admin-gated and support read/update modes",
  );
  assert.ok(
    workerSource.includes('const autoPublishPause = await getAutoPublishPauseStatus(env);') &&
      workerSource.includes("Worker 定时抓取成功（自动发布暂停）") &&
      workerSource.includes('publishEnabled && !forcePublish'),
    "scheduled runs must skip publish when paused while manual force runs can still bypass it",
  );
  assert.ok(
    wranglerSource.includes('PINPOINT_AUTO_PUBLISH_PAUSED      = "false"') ||
      wranglerSource.includes('PINPOINT_AUTO_PUBLISH_PAUSED = "false"'),
    "wrangler config must expose the auto-publish pause flag with a safe default",
  );
  assert.ok(
    packageJson.scripts?.["worker:auto-publish-pause"]?.includes("auto-publish-pause") &&
      packageJson.scripts?.["worker:auto-publish-resume"]?.includes("auto-publish-resume") &&
      packageJson.scripts?.["worker:auto-publish-pause-status"]?.includes("auto-publish-pause-status"),
    "package.json must expose pause, resume, and pause-status commands",
  );
  assert.ok(
    opsSource.includes('cmd === "auto-publish-pause"') &&
      opsSource.includes('cmd === "auto-publish-resume"') &&
      opsSource.includes("/admin/auto-publish-pause") &&
      opsSource.includes('url.searchParams.set("paused", "1")') &&
      opsSource.includes('url.searchParams.set("paused", "0")'),
    "worker ops script must call the auto-publish pause endpoint",
  );

  console.log("ok: auto-publish pause switch preserves fetch while stopping publish");
}

async function checkDailyPublishStatusReport() {
  const workerSource = await readFile(resolve(ROOT, "worker/src/index.ts"), "utf8");
  const rulesDoc = await readFile(resolve(ROOT, "docs/pinpoint-auto-publish-rules-2026-05-26.md"), "utf8");

  assert.ok(
    workerSource.includes("type DailyPublishStatus") &&
      workerSource.includes("dailyPublishStatusReportNotifyKeyOf") &&
      workerSource.includes("notifyDailyPublishStatusReport") &&
      workerSource.includes("Pinpoint 每日状态"),
    "Worker must define a deduped daily publish status report",
  );
  for (const expectedStatus of [
    "published",
    "downgraded",
    "candidate",
    "blocked",
    "paused",
    "needs_review",
  ]) {
    assert.ok(workerSource.includes(expectedStatus), `daily status report must cover ${expectedStatus}`);
  }
  assert.ok(
    rulesDoc.includes("daily status report") &&
      rulesDoc.includes("published, downgraded, candidate, blocked, paused, or needs review"),
    "auto-publish rules doc must record the daily status report coverage",
  );

  console.log("ok: daily publish status report covers terminal outcomes");
}

async function checkReleaseQueueWorkerIntegration() {
  const workerModulePath = "../worker/src/index.ts";
  const workerModule = (await import(workerModulePath)) as {
    resolvePinpointReleaseDeploymentStateFromGithubStatus: (statusJson: unknown) => string;
  };

  assert.equal(
    workerModule.resolvePinpointReleaseDeploymentStateFromGithubStatus({
      statuses: [{ context: "Vercel", state: "pending" }],
    }),
    "building",
    "pending Vercel commit status should block a second production push",
  );
  assert.equal(
    workerModule.resolvePinpointReleaseDeploymentStateFromGithubStatus({
      statuses: [{ context: "Vercel", state: "success" }],
    }),
    "ready",
    "successful Vercel commit status should be eligible for a production push if budget allows",
  );
  assert.equal(
    workerModule.resolvePinpointReleaseDeploymentStateFromGithubStatus({
      statuses: [{ context: "Vercel", state: "failure" }],
    }),
    "failed",
    "failed Vercel commit status should hold review instead of pushing production",
  );
  assert.equal(
    workerModule.resolvePinpointReleaseDeploymentStateFromGithubStatus({ statuses: [] }),
    "unknown",
    "missing Vercel status should not allow an automatic production push",
  );

  const workerSource = await readFile(resolve(ROOT, "worker/src/index.ts"), "utf8");
  assert.ok(
    workerSource.includes("PINPOINT_RELEASE_QUEUE_ENABLED"),
    "release queue integration must stay behind an explicit feature flag",
  );
  assert.ok(
    workerSource.includes("decidePinpointReleaseQueueAction({") &&
      workerSource.includes("lastProductionPushAt") &&
      workerSource.includes("candidateIsCurrent"),
    "worker publish path must pass deployment state, production push budget, and candidate freshness to the queue policy",
  );
  assert.ok(
    workerSource.includes("inspectNewSiteBaseDeploymentStatus") &&
      workerSource.includes("/commits/${baseCommitSha}/status"),
    "worker publish path must read GitHub/Vercel commit status before queue decisions",
  );
  assert.ok(
    workerSource.includes("releaseQueueLastProductionPushKeyOf") &&
      workerSource.includes("PINPOINT_RELEASE_QUEUE_OVERRIDE_SECOND_PUSH"),
    "worker publish path must persist same-slug production push budget and require explicit override for a second push",
  );

  console.log("ok: worker release queue integration maps deployment status and protects production pushes");
}

async function main() {
  await checkOfficialDomainGuardrail();
  await checkProductionDetailUsesRemoteFirst();
  await checkCurrentPuzzleSkipsNonPublicLiveEntry();
  await checkPublishedSummaryRoute();
  await checkRevalidateRejectsUnpublishedOrLiveRequests();
  await checkTodayRouteShowsPublishingPlaceholder();
  await checkWorkerProxyErrorsDoNotExposeInternalUrls();
  await checkRemoteUrlAllowlistsRejectUnsafeHosts();
  await checkWorkerDetailShape();
  await checkPhraseFallbackDirection();
  await checkEvidenceContractGuardsMeaningfulV2Fields();
  checkContentContractRequiresThreeCompleteFaqs();
  await checkTypedCategoryGenerationKeepsGrammarNatural();
  checkWorkerLlmSlotsOnlyDraftNormalizesBeforeValidation();
  await checkValidateDraftDoesNotNormalizeEmptySlots();
  await checkValidateDraftDoesNotNormalizeIncompleteSlotRows();
  await checkAdminApiRateLimit();
  checkPublishEligibilityBlocksShortPublishedAsFullAnalysis();
  checkLightweightPublishFailureSummary();
  await checkPinpointEvidenceV1Guards724Mapping();
  checkReleaseOverrideDryRunSchema();
  checkIntermediateStateCommitDetection();
  await checkWorkerEnrichCommitsOnlyFinalPublicPayload();
  checkReleaseQueuePolicy();
  checkWorkerRouteDispatchResolver();
  await checkCandidateBranchDryRunRouteSafety();
  await checkReleaseQueueDryRunRouteSafety();
  await checkReleaseQueueDryRunOpsScript();
  await checkReleaseQueueObservationOpsScript();
  await checkReleaseQueueStatusCheckRouteAndOps();
  await checkCandidateBranchWorkflowAutoPromotes();
  await checkMainFailureContentRecoveryCreatesAutoPromotedCandidate();
  await checkCandidateBranchWatchdogClosesStuckBranches();
  await checkPublicVerificationCopyUsesMachineReview();
  await checkProductionReleaseRunsPublicFetchAudit();
  await checkProductionReleaseWorkerHealthFallback();
  await checkProductionReleaseDetailVerificationUsesRenderedText();
  await checkPrepublishGateRunsContentAutoRepairSafely();
  await checkWorkerRunsPostPublishPublicAudit();
  await checkAutoPublishPauseSwitch();
  await checkDailyPublishStatusReport();
  await checkReleaseQueueWorkerIntegration();
  console.log("Pinpoint guardrail regression passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
