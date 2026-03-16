import { revalidatePath, revalidateTag } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

async function pingIndexNow(urls: string[]) {
  const key = process.env.INDEXNOW_KEY;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pinpointanswertoday.app";

  if (!key) return;

  await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      host: new URL(siteUrl).hostname,
      key,
      keyLocation: `${siteUrl}/api/indexnow-key`,
      urlList: urls,
    }),
  });
}

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
  const mode = request.nextUrl.searchParams.get("mode")?.trim() ?? "";
  if (slug && !/^pinpoint-answer-\d+$/.test(slug)) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  // Always refresh shared data (registry-dependent pages)
  revalidateTag("registry");
  revalidateTag("worker-live");
  revalidatePath("/");
  revalidatePath("/puzzles");
  revalidatePath("/pinpoint/today");
  revalidatePath("/next-pinpoint-preview");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pinpointanswertoday.app";
  const urlsToIndex: string[] = [`${siteUrl}/`, `${siteUrl}/puzzles`];

  if (slug) {
    revalidateTag(`puzzle:${slug}`);
    revalidatePath(`/linkedin-pinpoint-answers/${slug}`);
    urlsToIndex.push(`${siteUrl}/linkedin-pinpoint-answers/${slug}`);
  }

  if (mode !== "live") {
    void pingIndexNow(urlsToIndex);
  }

  return NextResponse.json({ revalidated: true, slug: slug || "all", mode: mode || "default", ts: Date.now() });
}
