"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { routes } from "@/lib/paths/routes";

type LatestPublishedPuzzle = {
  puzzleNumber: number;
  slug: string;
  status: string;
};

function parseLatestPublishedPuzzle(payload: unknown): LatestPublishedPuzzle | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const latest = (payload as { latest?: unknown }).latest;
  if (!latest || typeof latest !== "object") {
    return null;
  }

  const record = latest as Record<string, unknown>;
  const puzzleNumber = Number(record.puzzleNumber);
  const slug = String(record.slug || "").trim();
  const status = String(record.status || "").trim();

  if (!Number.isInteger(puzzleNumber) || puzzleNumber <= 0 || !slug || status !== "live") {
    return null;
  }

  return { puzzleNumber, slug, status };
}

export function LatestAnswerCta({ currentSlug }: { currentSlug: string }) {
  const [latestPuzzle, setLatestPuzzle] = useState<LatestPublishedPuzzle | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLatestPuzzle(null);

    async function loadLatestPublishedPuzzle() {
      try {
        const response = await fetch("/api/puzzles/summary", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          return;
        }

        const payload = parseLatestPublishedPuzzle(await response.json());
        if (!payload || payload.slug === currentSlug) {
          return;
        }

        setLatestPuzzle(payload);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setLatestPuzzle(null);
        }
      }
    }

    void loadLatestPublishedPuzzle();
    return () => controller.abort();
  }, [currentSlug]);

  if (!latestPuzzle) {
    return null;
  }

  return (
    <section className="legacy-latest-answer-shell" aria-label="Latest published Pinpoint answer">
      <p className="legacy-latest-answer-kicker">Latest published answer</p>
      <p className="legacy-latest-answer-copy">
        {`Need today's live answer instead of this archived page? Jump straight to Puzzle #${latestPuzzle.puzzleNumber}.`}
      </p>
      <Link className="button-secondary" href={routes.detail(latestPuzzle.slug)}>
        {`View Latest Answer (#${latestPuzzle.puzzleNumber})`}
      </Link>
    </section>
  );
}
