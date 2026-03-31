const TRAFFIC_ADVICE_BODY = "[]";

export function GET() {
  return new Response(TRAFFIC_ADVICE_BODY, {
    status: 200,
    headers: {
      "Content-Type": "application/trafficadvice+json; charset=utf-8",
      "Cache-Control": "public, max-age=1800, must-revalidate",
    },
  });
}
