import { NextResponse } from "next/server";
import { getCurrentPuzzle } from "@/lib/puzzles/data";

export const dynamic = "force-dynamic";

/**
 * GET /api/puzzles/summary
 *
 * Returns the latest live puzzle entry visible on the site, including the
 * worker-backed live fallback that can appear before the archive JSON sync.
 */
export async function GET() {
  try {
    const current = await getCurrentPuzzle();

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
