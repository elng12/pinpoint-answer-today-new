import { revalidatePath, revalidateTag } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

/**
 * On-demand ISR revalidation endpoint.
 *
 * Called by the Cloudflare Worker after writing new puzzle JSON to GitHub.
 *
 * Auth:
 *   Authorization: Bearer <secret>
 *   x-revalidate-secret: <secret>
 *
 * Query params:
 *   slug    – (optional) specific puzzle slug, e.g. "pinpoint-answer-650"
 *
 * Examples:
 *   POST /api/revalidate
 *   x-revalidate-secret: xxx
 *
 *   POST /api/revalidate?slug=pinpoint-answer-650
 *   Authorization: Bearer xxx
 */
export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const bearerSecret = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const headerSecret = request.headers.get("x-revalidate-secret")?.trim() ?? "";
  const secret = bearerSecret || headerSecret;

  const stored = (process.env.REVALIDATE_SECRET ?? "").trim();
  if (!stored || secret !== stored) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  const slug = request.nextUrl.searchParams.get("slug")?.trim() ?? "";
  if (slug && !/^pinpoint-answer-\d+$/.test(slug)) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  // Always refresh shared data (registry-dependent pages)
  revalidateTag("registry");
  revalidatePath("/");
  revalidatePath("/puzzles");
  revalidatePath("/next-pinpoint-preview");

  if (slug) {
    revalidateTag(`puzzle:${slug}`);
    revalidatePath(`/linkedin-pinpoint-answers/${slug}`);
  }

  return NextResponse.json({ revalidated: true, slug: slug || "all", ts: Date.now() });
}
