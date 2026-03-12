import { revalidatePath, revalidateTag } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

/**
 * On-demand ISR revalidation endpoint.
 *
 * Called by the Cloudflare Worker after writing new puzzle JSON to GitHub.
 *
 * Query params:
 *   secret  – must match REVALIDATE_SECRET env var
 *   slug    – (optional) specific puzzle slug, e.g. "pinpoint-answer-650"
 *
 * Examples:
 *   POST /api/revalidate?secret=xxx
 *   POST /api/revalidate?secret=xxx&slug=pinpoint-answer-650
 */
export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");

  const stored = (process.env.REVALIDATE_SECRET ?? "").trim();
  if (!stored || secret !== stored) {
    return NextResponse.json({
      error: "Invalid secret",
      debug: { storedLen: stored.length, receivedLen: secret?.length ?? 0 },
    }, { status: 401 });
  }

  const slug = request.nextUrl.searchParams.get("slug");

  // Always refresh shared data (registry-dependent pages)
  revalidateTag("registry");
  revalidatePath("/");
  revalidatePath("/puzzles");
  revalidatePath("/next-pinpoint-preview");

  if (slug) {
    revalidateTag(`puzzle:${slug}`);
    revalidatePath(`/linkedin-pinpoint-answers/${slug}`);
  }

  return NextResponse.json({ revalidated: true, slug: slug ?? "all", ts: Date.now() });
}
