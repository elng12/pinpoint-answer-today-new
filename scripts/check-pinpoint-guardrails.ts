import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

      const currentWithFallback = await dataModule.getCurrentPuzzle();
      assert.equal(
        currentWithFallback.isoDate,
        unpublishedWorkerDate,
        "positive control failed: mocked worker live fallback was not picked up",
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
    }) => unknown;
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
      ],
    },
    analysis: {
      detailedBreakdown:
        "The board mixes atmosphere, transit, and landmarks, which can make the first read feel broader than it is. Golden Gate Bridge is the clue that tightens the frame enough to prove every clue belongs to one city rather than a loose travel bucket. Once that clue lands, Fog, Cable cars, Ghirardelli Square, and Alcatraz Island all read as parts of the same San Francisco collage instead of unrelated tourist references.",
    },
    summary: "Pinpoint #687 asks what links Fog, Cable cars, Ghirardelli Square, Alcatraz Island, and Golden Gate Bridge.",
  }) as {
    spoilerHints?: Record<string, string>;
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

  console.log("ok: worker publish detail payload includes spoilerHints and display");
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

async function main() {
  await checkProductionDetailUsesRemoteFirst();
  await checkPublishedSummaryRoute();
  await checkWorkerDetailShape();
  await checkPhraseFallbackDirection();
  console.log("Pinpoint guardrail regression passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
