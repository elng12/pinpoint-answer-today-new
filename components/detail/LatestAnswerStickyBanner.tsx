"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { routes } from "@/lib/paths/routes";
import type { LatestAnswerCtaPuzzle } from "@/components/detail/LatestAnswerCta";

const SCROLL_PROGRESS_TO_SHOW = 0.3;

function readDismissed(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(key: string) {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // Ignore storage failures; the close button should still hide the banner for this render.
  }
}

export function LatestAnswerStickyBanner({
  currentSlug,
  currentNumber,
  latestPuzzle,
}: {
  currentSlug: string;
  currentNumber: number;
  latestPuzzle: LatestAnswerCtaPuzzle | null;
}) {
  const isEligible = Boolean(latestPuzzle && latestPuzzle.slug !== currentSlug);
  const dismissKey = useMemo(
    () => `pinpoint_latest_answer_banner_${currentSlug}_${latestPuzzle?.slug ?? "none"}`,
    [currentSlug, latestPuzzle?.slug],
  );
  const [dismissed, setDismissed] = useState(false);
  const [hasReachedScrollPoint, setHasReachedScrollPoint] = useState(false);

  useEffect(() => {
    setHasReachedScrollPoint(false);
    if (!isEligible) {
      setDismissed(false);
      return;
    }
    setDismissed(readDismissed(dismissKey));
  }, [currentSlug, dismissKey, isEligible]);

  useEffect(() => {
    if (!isEligible || dismissed) {
      return;
    }

    function handleScroll() {
      const scrollableHeight = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = window.scrollY / scrollableHeight;
      if (progress >= SCROLL_PROGRESS_TO_SHOW) {
        setHasReachedScrollPoint(true);
      }
    }

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [dismissed, isEligible]);

  const shouldShow = isEligible && hasReachedScrollPoint && !dismissed;

  useEffect(() => {
    document.body.classList.toggle("latest-answer-sticky-visible", shouldShow);
    return () => {
      document.body.classList.remove("latest-answer-sticky-visible");
    };
  }, [shouldShow]);

  if (!shouldShow || !latestPuzzle) {
    return null;
  }

  return (
    <aside className="legacy-latest-answer-sticky" aria-label="Today's latest Pinpoint answer">
      <div className="legacy-latest-answer-sticky-copy">
        <p className="legacy-latest-answer-sticky-kicker">{`Pinpoint #${currentNumber} archive`}</p>
        <p className="legacy-latest-answer-sticky-text">
          {`Looking for today's answer? Jump to Pinpoint #${latestPuzzle.number}.`}
        </p>
      </div>
      <Link className="button-primary legacy-latest-answer-sticky-link" href={routes.detail(latestPuzzle.slug)}>
        {`View #${latestPuzzle.number}`}
      </Link>
      <button
        className="legacy-latest-answer-sticky-close"
        type="button"
        aria-label="Dismiss latest answer reminder"
        onClick={() => {
          writeDismissed(dismissKey);
          setDismissed(true);
        }}
      >
        <X aria-hidden="true" size={18} strokeWidth={2.2} />
      </button>
    </aside>
  );
}
