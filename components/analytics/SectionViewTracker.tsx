"use client";

import { useEffect, useRef } from "react";
import {
  getScrollDepthPercent,
  trackClientEventWhenReady,
} from "@/lib/analytics";

type SectionViewTrackerProps = {
  eventName: string;
  eventParams?: Record<string, unknown>;
  threshold?: number;
};

export function SectionViewTracker({
  eventName,
  eventParams,
  threshold = 0.35,
}: SectionViewTrackerProps) {
  const markerRef = useRef<HTMLSpanElement | null>(null);
  const hasTrackedRef = useRef(false);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker || hasTrackedRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || hasTrackedRef.current) {
          return;
        }

        hasTrackedRef.current = true;
        trackClientEventWhenReady(eventName, {
          ...eventParams,
          scroll_depth_percent: getScrollDepthPercent(),
        });
        observer.disconnect();
      },
      { threshold },
    );

    observer.observe(marker);
    return () => observer.disconnect();
  }, [eventName, eventParams, threshold]);

  return <span ref={markerRef} aria-hidden="true" className="sr-only" />;
}
