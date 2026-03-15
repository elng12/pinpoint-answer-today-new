import { NextResponse } from "next/server";
import {
  loadBundledWorkerFallback,
  loadCompetitorWorkerFallback,
} from "@/lib/puzzles/worker-fallback";

type WorkerRequestBody = {
  date?: unknown;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeRequestedDate(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function buildNoStoreHeaders(extra?: HeadersInit): HeadersInit {
  return {
    "Cache-Control": "no-store",
    ...extra,
  };
}

export async function POST(req: Request) {
  try {
    const expectedSecret = String(process.env.FALLBACK_WEBHOOK_SECRET || "").trim();
    const providedSecret = String(req.headers.get("x-webhook-secret") || "").trim();

    if (expectedSecret && providedSecret !== expectedSecret) {
      return new NextResponse("unauthorized", { status: 401 });
    }

    const today = new Date().toISOString().slice(0, 10);
    let requestedDate = today;

    try {
      const body = (await req.json()) as WorkerRequestBody;
      requestedDate = normalizeRequestedDate(body?.date) || today;
    } catch {
      requestedDate = today;
    }

    const localPayload = await loadBundledWorkerFallback(requestedDate);
    if (localPayload) {
      return NextResponse.json(localPayload, {
        status: 200,
        headers: buildNoStoreHeaders(),
      });
    }

    if (requestedDate !== today) {
      return NextResponse.json(
        { error: "not found", date: requestedDate },
        { status: 404, headers: buildNoStoreHeaders() },
      );
    }

    try {
      const competitorPayload = await loadCompetitorWorkerFallback();
      return NextResponse.json(competitorPayload, {
        status: 200,
        headers: buildNoStoreHeaders(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "unknown");
      return NextResponse.json(
        { error: "not ready", date: requestedDate, detail: message },
        {
          status: 503,
          headers: buildNoStoreHeaders({ "Retry-After": "300" }),
        },
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "unknown");
    return NextResponse.json(
      { error: "internal error", detail: message },
      { status: 500, headers: buildNoStoreHeaders() },
    );
  }
}
