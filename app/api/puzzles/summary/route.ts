import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/puzzles/summary
 *
 * Returns the latest live puzzle entry from the registry.
 * Used by the GitHub Actions "Worker Daily Fetch" workflow to verify
 * that today's puzzle has been published and the site is up to date.
 *
 * Response shape:
 * {
 *   "latest": {
 *     "puzzleNumber": 683,
 *     "slug": "pinpoint-answer-683",
 *     "isoPublishedAt": "2026-03-14T00:00:00.000Z",
 *     "status": "live"
 *   }
 * }
 */
export async function GET() {
  const registryPath = path.resolve(process.cwd(), "data", "puzzles", "registry.json");

  let registry: Array<Record<string, unknown>>;
  try {
    const raw = await fs.readFile(registryPath, "utf8");
    registry = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Registry unavailable" }, { status: 503 });
  }

  const live = registry.find((e) => e.status === "live");
  if (!live) {
    return NextResponse.json({ error: "No live puzzle found" }, { status: 404 });
  }

  const publishDate = String(live.publishDate ?? "");
  const isoPublishedAt = publishDate
    ? `${publishDate}T00:00:00.000Z`
    : String(live.updatedAt ?? "");

  return NextResponse.json({
    latest: {
      puzzleNumber: live.puzzleNumber,
      slug: live.slug,
      isoPublishedAt,
      status: live.status,
    },
  });
}
