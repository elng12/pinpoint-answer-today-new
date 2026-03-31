import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { validateEvidenceContract } from "../lib/puzzles/evidence-contract";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");

type RegistryEntry = {
  puzzleNumber: number;
  slug: string;
  publishDate: string;
  status: string;
};

function addUtcDays(isoDate: string, days: number): string {
  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

async function readLiveRegistryEntry(): Promise<RegistryEntry> {
  const raw = await readFile(resolve(ROOT, "data", "puzzles", "registry.json"), "utf8");
  const registry = JSON.parse(raw) as RegistryEntry[];
  const liveEntry = registry.find((entry) => entry.status === "live");
  assert.ok(liveEntry, "registry.json must contain one live puzzle");
  return liveEntry;
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
        "live",
        "summary route should keep the published live status",
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

async function checkProductionDetailUsesRemoteFirst() {
  const slug = "pinpoint-answer-695";
  const env = process.env as Record<string, string | undefined>;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousGithubRawBase = process.env.GITHUB_RAW_BASE;
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
  }

  console.log("ok: production detail lookups prefer remote JSON over local files");
}

async function checkCurrentPuzzleSkipsNonPublicLiveEntry() {
  const env = process.env as Record<string, string | undefined>;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousGithubRawBase = process.env.GITHUB_RAW_BASE;
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
    }) => unknown;
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
  }) as {
    questionType?: string;
    difficultyBand?: string;
    solvePath?: { breakingClue?: string };
    turningPoint?: { clue?: string };
    clueRows?: Array<{ clue?: string; resolvedPhraseOrMember?: string }>;
    faqItems?: Array<{ tiedClue?: string | null }>;
    uniquenessSignals?: { angle?: string };
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
    buildSharedFallbackFaqs: (input: {
      puzzleNumber: number;
      kind: "before" | "after";
      answer: string;
      turningPoint: string;
      connectorSummary: string;
    }) => Array<{ answer: string }>;
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
      sections?: {
        clueDetails?: Array<{ phrase?: string }>;
      };
      clueRows?: Array<{ resolvedPhraseOrMember?: string; surfaceMisread?: string }>;
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

  console.log("ok: typed-category generation keeps singular tails and hides bucket misreads from clueRows");
}

async function main() {
  await checkProductionDetailUsesRemoteFirst();
  await checkCurrentPuzzleSkipsNonPublicLiveEntry();
  await checkPublishedSummaryRoute();
  await checkRevalidateRejectsUnpublishedOrLiveRequests();
  await checkTodayRouteShowsPublishingPlaceholder();
  await checkWorkerDetailShape();
  await checkPhraseFallbackDirection();
  await checkEvidenceContractGuardsMeaningfulV2Fields();
  await checkTypedCategoryGenerationKeepsGrammarNatural();
  console.log("Pinpoint guardrail regression passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
