import { NextResponse } from "next/server";
import { getCurrentPuzzle } from "@/lib/puzzles/data";

export const dynamic = "force-dynamic";

/**
 * GET /api/puzzles/summary
 *
 * Returns the latest published live puzzle from the registry only.
 *
 * This endpoint intentionally does not surface the worker-backed live fallback,
 * so external automation can keep treating it as a publish-complete signal.
 */
export async function GET() {
  try {
    const current = await getCurrentPuzzle({ allowLiveWorkerFallback: false });

    return NextResponse.json({
      latest: {
        puzzleNumber: current.number,
        slug: current.slug,
        isoPublishedAt: `${current.isoDate}T00:00:00.000Z`,
        status: current.status,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Puzzle summary unavailable";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
