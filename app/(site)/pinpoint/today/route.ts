import { type NextRequest, NextResponse } from "next/server";
import { getCurrentPuzzle } from "@/lib/puzzles/data";
import { routes } from "@/lib/paths/routes";

export const dynamic = "force-dynamic";

const RETRY_AFTER_SECONDS = 120;

function buildPublishingPlaceholderHtml(puzzleNumber?: number): string {
  const title = puzzleNumber
    ? `Pinpoint #${puzzleNumber} is still publishing`
    : "Today's Pinpoint answer is still publishing";
  const heading = puzzleNumber
    ? `Pinpoint #${puzzleNumber} is still publishing`
    : "Today's Pinpoint answer is still publishing";
  const subcopy = puzzleNumber
    ? "The formal answer page is still rolling out. Refresh in a couple of minutes for the full walkthrough."
    : "The formal answer page is still rolling out. Refresh in a couple of minutes for the full walkthrough.";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f7ff;
        --card: #ffffff;
        --text: #102247;
        --muted: #5f6f91;
        --line: #d7dff0;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background:
          radial-gradient(circle at top, rgba(75, 127, 255, 0.14), transparent 38%),
          var(--bg);
        font-family: Arial, sans-serif;
        color: var(--text);
      }
      main {
        width: min(100%, 720px);
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 32px;
        box-shadow: 0 20px 60px rgba(16, 34, 71, 0.08);
      }
      p {
        margin: 0;
        line-height: 1.6;
      }
      .eyebrow {
        font-size: 12px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 12px;
      }
      h1 {
        margin: 0 0 12px;
        font-size: clamp(28px, 5vw, 40px);
        line-height: 1.15;
      }
      .copy {
        color: var(--muted);
        font-size: 16px;
      }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">Publishing</p>
      <h1>${heading}</h1>
      <p class="copy">${subcopy}</p>
    </main>
  </body>
</html>`;
}

export async function GET(request: NextRequest) {
  const formalCurrent = await getCurrentPuzzle({ allowLiveWorkerFallback: false });
  const liveCandidate = await getCurrentPuzzle({ allowLiveWorkerFallback: true });

  if (liveCandidate.slug !== formalCurrent.slug && liveCandidate.number > formalCurrent.number) {
    return new NextResponse(buildPublishingPlaceholderHtml(liveCandidate.number), {
      status: 503,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        "retry-after": String(RETRY_AFTER_SECONDS),
        "x-robots-tag": "noindex, nofollow",
      },
    });
  }

  const redirectUrl = new URL(routes.detail(formalCurrent.slug), request.url);
  return NextResponse.redirect(redirectUrl, { status: 307 });
}

export async function HEAD(request: NextRequest) {
  const response = await GET(request);
  return new NextResponse(null, {
    status: response.status,
    headers: response.headers,
  });
}
